/*
 * Copyright 2023 The Yorkie Authors. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ActorID } from '@yorkie-js/sdk/src/document/time/actor_id';
import { TimeTicket } from '@yorkie-js/sdk/src/document/time/ticket';
import { VersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import {
  CRDTTree,
  CRDTTreeNode,
  CRDTTreeNodeID,
  CRDTTreePos,
  TreeRestoreSpan,
  replaceTreeNodeID,
  toXML,
} from '@yorkie-js/sdk/src/document/crdt/tree';
import { RestoreMode } from '@yorkie-js/sdk/src/document/operation/edit_operation';
import {
  Operation,
  OpInfo,
  ExecutionResult,
  OpSource,
} from '@yorkie-js/sdk/src/document/operation/operation';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';
import { traverseAll } from '@yorkie-js/sdk/src/util/index_tree';
import { addDataSizes } from '@yorkie-js/sdk/src/util/resource';

/**
 * `cloneAndDropPreTombstoned` deep-copies `node` and drops descendants
 * whose ID is in `preTombstoned` — i.e., descendants that were already
 * tombstoned before this edit ran. Those descendants represent the
 * user's earlier delete intent and must not be resurrected by undoing
 * this edit.
 *
 * For nodes kept in the clone, `removedAt` is cleared so the redo
 * re-inserts them as live.
 */
function cloneAndDropPreTombstoned(
  node: CRDTTreeNode,
  preTombstoned: Set<string>,
): CRDTTreeNode {
  const clone = node.deepcopy();
  filterChildren(clone, preTombstoned);
  // Post-order: clear tombstone on every survivor and recompute size from
  // its (already-resized) children. The deepcopy carried the original
  // node's size; after `filterChildren` dropped descendants, that size
  // is stale and must be recomputed bottom-up. Element nodes derive size
  // from children's `paddedSize`; text nodes use their value length.
  traverseAll(clone, (n) => {
    n.removedAt = undefined;
    // NOTE: The attribute tombstones are deliberately kept. They record real
    // `removeStyle` intent, and the reinserted node has to keep rejecting the
    // same stale styles the original rejects. They survive the wire intact
    // (`fromRHT` decodes `isRemoved` verbatim, and `clearTombstones` clears
    // only the node tombstone), so sender and receiver hold the same RHT, and
    // `CRDTTree.edit` books each one into gc on both sides.
    if (n.isText) {
      n.visibleSize = n.value.length;
      n.totalSize = n.value.length;
      return;
    }
    let size = 0;
    for (const child of n._children) size += child.paddedSize();
    n.visibleSize = size;
    n.totalSize = size;
  });
  return clone;
}

/**
 * `filterChildren` walks `node._children` and drops descendants whose
 * IDs are in `preTombstoned`. Used by `cloneAndDropPreTombstoned` to
 * keep only nodes that this edit actually transitioned from visible
 * to tombstoned.
 */
function filterChildren(node: CRDTTreeNode, preTombstoned: Set<string>): void {
  const all = node._children;
  if (!all) return;
  const kept: Array<CRDTTreeNode> = [];
  for (const child of all) {
    if (preTombstoned.has(child.id.toIDString())) {
      // Already tombstoned before this edit — drop from reverseOp.
      continue;
    }
    filterChildren(child, preTombstoned);
    kept.push(child);
  }
  node._children = kept;
}

/**
 * `mergedAwayIDs` returns the ids of the elements a merge removed, innermost
 * first -- the order a split re-creating them issues tickets in, since it
 * splits from the innermost level out.
 *
 * `mergedNodes` is the merge-boundary set `CRDTTree.edit` reports, NOT every
 * node the edit tombstoned: the split reversing the merge re-creates exactly
 * one element per boundary it crossed, so anything else in the removed set --
 * a whole element deleted inside the range, a cascade-deleted descendant, a
 * node already tombstoned -- would shift the positional pairing with the
 * split's tickets and bind an unrelated element to one of them.
 */
function mergedAwayIDs(
  mergedNodes: Array<CRDTTreeNode>,
): Array<CRDTTreeNodeID> {
  const depth = (node: CRDTTreeNode) => {
    let d = 0;
    for (let n = node.parent; n; n = n.parent) d++;
    return d;
  };
  return mergedNodes
    .filter((node) => !node.isText)
    .map((node) => ({ node, depth: depth(node) }))
    .sort((a, b) => b.depth - a.depth)
    .map(({ node }) => node.id);
}

/**
 * `TreeEditOperation` is an operation representing Tree editing.
 */
export class TreeEditOperation extends Operation {
  private fromPos: CRDTTreePos;
  private toPos: CRDTTreePos;
  private contents: Array<CRDTTreeNode> | undefined;
  private splitLevel: number;
  private isUndoOp?: boolean;
  private fromIdx?: number;
  private toIdx?: number;
  private lastFromIdx?: number;
  private lastToIdx?: number;
  private insertedContentSize?: number;
  /**
   * `executedRanges` is what the identity-preserving restore/retombstone path
   * changed the last time it ran: one `[from, to, insertedSize]` per node that
   * left or came back, in the order it did, each measured against the tree as
   * it stood at that moment. Only that path sets it; every other edit reports
   * its single range through `normalizePos`/`getContentSize`.
   */
  private executedRanges?: Array<[number, number, number]>;

  /**
   * `splitSize` is the visible-index size the boundaries THIS execution's
   * forward `edit` opened: two tokens per element it split, zero for a split
   * with no visible effect. A split creates boundaries rather than inserting
   * nodes, so `insertedContentSize` above never sees them; reconciliation
   * needs both, and reads their sum through `getContentSize`.
   */
  private splitSize?: number;
  /**
   * `redoSplitLevel` is set on boundary-deletion undo ops that were generated
   * to reverse a split. When this op executes (as undo), `toReverseOperation`
   * uses this value to generate a proper split op for redo, rather than
   * re-inserting the raw tombstoned boundary nodes as content.
   */
  private redoSplitLevel?: number;
  // Identity-preserving Tree undo/redo (mirrors EditOperation): a reverse op
  // carries the deleted nodes' spans and a mode. `restore` revives
  // `restoreSpans` and re-removes `retombstoneSpans`; `retombstone` (the redo)
  // does the opposite. Nodes are revived/removed by original identity, never
  // copy-reinserted, so concurrent undos converge. Empty/undefined for
  // ordinary edits and for the copy-reinsert reverse of merge/split edits.
  /**
   * `splitTickets` carries the tickets the originating replica issued for the
   * nodes an element split creates, in issue order. A replica applying the
   * operation consumes them instead of reconstructing them, so neither side
   * depends on the other's allocation staying in step. Empty for a change
   * written before the field existed, which falls back to the reconstruction.
   */
  private splitTickets: Array<TimeTicket> = [];
  /**
   * `replacedIDs` is set on a split that re-creates elements a merge removed
   * -- the redo of a split, or the undo of a merge. It names those elements,
   * innermost first, in the order the split mints their replacements. The
   * replacements get new ids (see `setSplitTickets`), so whoever runs this
   * split re-points every recorded operation at them. Local to the replica
   * that recorded it; never encoded.
   */
  private replacedIDs: Array<CRDTTreeNodeID> = [];
  /**
   * `consumedSplitTickets` is how many of `splitTickets` the current
   * execution has handed to the tree — fewer than `splitLevel` when the
   * split loop ran out of ancestors, and zero before it starts. Doubles as
   * the index reported to `splitTicketConsumedHandler`.
   */
  private consumedSplitTickets = 0;
  /**
   * `splitRecreatedIDs` is what the last execution's split re-created, as
   * `[removed element, its replacement]` pairs. See `getSplitRecreatedIDs`.
   */
  private splitRecreatedIDs: Array<[CRDTTreeNodeID, CRDTTreeNodeID]> = [];
  /**
   * `splitTicketConsumedHandler` is notified as each recorded split ticket is
   * handed to the tree, with its index in `splitTickets`. A split stops as
   * soon as it runs out of ancestors, so how many elements it really mints is
   * only knowable from inside the split — and re-pointing anything at a
   * ticket the split never consumed would leave it naming a node that was
   * never created. Undo/redo registers a handler here so the re-pointing
   * happens per minted element, while the operations that follow in the same
   * change are still waiting to run. Local to the replica that registered it;
   * never encoded, and never copied to another operation.
   */
  private splitTicketConsumedHandler?: (index: number) => void;
  private restoreSpans?: Array<TreeRestoreSpan>;
  private restoreMode?: RestoreMode;
  private retombstoneSpans?: Array<TreeRestoreSpan>;

  constructor(
    parentCreatedAt: TimeTicket,
    fromPos: CRDTTreePos,
    toPos: CRDTTreePos,
    contents: Array<CRDTTreeNode> | undefined,
    splitLevel: number,
    executedAt: TimeTicket,
    isUndoOp?: boolean,
    fromIdx?: number,
    toIdx?: number,
    restoreSpans?: Array<TreeRestoreSpan>,
    restoreMode?: RestoreMode,
    retombstoneSpans?: Array<TreeRestoreSpan>,
  ) {
    super(parentCreatedAt, executedAt);
    this.fromPos = fromPos;
    this.toPos = toPos;
    this.contents = contents;
    this.splitLevel = splitLevel;
    this.isUndoOp = isUndoOp;
    this.fromIdx = fromIdx;
    this.toIdx = toIdx;
    this.restoreSpans = restoreSpans;
    this.restoreMode = restoreMode;
    this.retombstoneSpans = retombstoneSpans;
  }

  /**
   * `create` creates a new instance of EditOperation.
   */
  public static create(
    parentCreatedAt: TimeTicket,
    fromPos: CRDTTreePos,
    toPos: CRDTTreePos,
    contents: Array<CRDTTreeNode> | undefined,
    splitLevel: number,
    executedAt: TimeTicket,
    isUndoOp?: boolean,
    fromIdx?: number,
    toIdx?: number,
    restoreSpans?: Array<TreeRestoreSpan>,
    restoreMode?: RestoreMode,
    retombstoneSpans?: Array<TreeRestoreSpan>,
  ): TreeEditOperation {
    return new TreeEditOperation(
      parentCreatedAt,
      fromPos,
      toPos,
      contents,
      splitLevel,
      executedAt,
      isUndoOp,
      fromIdx,
      toIdx,
      restoreSpans,
      restoreMode,
      retombstoneSpans,
    );
  }

  /**
   * `reissueContentIDs` gives every node this operation inserts a fresh
   * identity.
   *
   * A reverse operation that reverses a deletion by re-inserting a copy of the
   * removed nodes carries their original ids, so executing it would put two
   * nodes under one id — the ambiguity that makes a position anchored there
   * resolve differently on different replicas. Undo already re-identifies a
   * restored value elsewhere: `ArraySet` and `Add` both take the fresh ticket
   * in `executeUndoRedo`. This is the tree's counterpart, called from the same
   * place so the ids come from the change the undo creates.
   *
   * A restore-mode reverse is left alone: it revives nodes under their
   * original identity by design, which is what makes concurrent undos of one
   * deletion converge rather than duplicate.
   *
   * Returns the `[old, new]` pairs it minted, so the caller can re-point
   * whatever else was recorded against the old ids — the same reconciliation
   * a split's re-created elements need (`getReplacedIDs`).
   */
  public reissueContentIDs(
    issueTimeTicket: () => TimeTicket,
  ): Array<[CRDTTreeNodeID, CRDTTreeNodeID]> {
    const reissued: Array<[CRDTTreeNodeID, CRDTTreeNodeID]> = [];
    if (!this.contents || this.restoreMode) {
      return reissued;
    }

    // The tickets taken here start at `executedAt.delimiter + 1` and run one
    // per node, while `execute` simulates the tickets an element split
    // consumes starting at `executedAt.delimiter + contents.length + 1`. The
    // two ranges overlap as soon as content has descendants, so this only
    // holds while no content-bearing reverse splits — which is every reverse
    // `toReverseOperation` builds, all of them `splitLevel: 0`.
    if (this.splitLevel !== 0) {
      throw new YorkieError(
        Code.ErrRefused,
        `cannot reissue content ids on a splitting edit`,
      );
    }

    for (const content of this.contents) {
      traverseAll(content, (node) => {
        const prev = node.id;
        node.id = CRDTTreeNodeID.of(issueTimeTicket(), 0);
        reissued.push([prev, node.id]);
        // A fresh identity has to be fresh in every field that names a node.
        // The copy came from `deepcopy`, which carries the split chain and the
        // merge lineage of the node it copied: left in place they would splice
        // this node into a chain it never belonged to, and `purge` relinking
        // that chain would unlink the real tombstone from it.
        node.insPrevID = undefined;
        node.insNextID = undefined;
        node.mergedFrom = undefined;
        node.mergedAt = undefined;
        node.mergedAtApproximated = undefined;
        node.mergedInto = undefined;
      });
    }

    return reissued;
  }

  /**
   * `getSplitTickets` returns the tickets issued for the nodes an element
   * split created, in issue order.
   */
  public getSplitTickets(): Array<TimeTicket> {
    return this.splitTickets;
  }

  /**
   * `getReplacedIDs` returns the ids of the elements this split re-creates,
   * innermost first. Empty unless it is the redo of a split or the undo of a
   * merge.
   */
  public getReplacedIDs(): Array<CRDTTreeNodeID> {
    return this.replacedIDs;
  }

  /**
   * `reconcileNodeID` points this operation at `curr` wherever it named
   * `prev`: its range, and the restore spans an identity-preserving undo
   * carries. See `TreeStyleOperation.reconcileNodeID`.
   */
  public reconcileNodeID(prev: CRDTTreeNodeID, curr: CRDTTreeNodeID): void {
    this.fromPos = this.fromPos.replaceNodeID(prev, curr);
    this.toPos = this.toPos.replaceNodeID(prev, curr);

    const replace = (id?: CRDTTreeNodeID) =>
      id && replaceTreeNodeID(id, prev, curr);
    // `span.id` too, not just the anchors: it is the identity `restore` and
    // `retombstone` look the node up by, and the one they RECREATE the node
    // under when garbage collection has purged it (`CRDTTree.restore`). Left
    // naming the element the split has just re-minted under a new ticket, an
    // identity restore would revive nothing and recreate a duplicate under
    // the stale id.
    const reconcileSpans = (spans?: Array<TreeRestoreSpan>) =>
      spans?.map((span) => ({
        ...span,
        id: replace(span.id)!,
        parentID: replace(span.parentID),
        leftSiblingID: replace(span.leftSiblingID),
        rightSiblingID: replace(span.rightSiblingID),
      }));
    this.restoreSpans = reconcileSpans(this.restoreSpans);
    this.retombstoneSpans = reconcileSpans(this.retombstoneSpans);
    this.replacedIDs = this.replacedIDs.map((id) => replace(id)!);
  }

  /**
   * `onSplitTicketConsumed` registers `handler`, called with the index of
   * each recorded split ticket as the split takes it — i.e. once per element
   * the split really mints, and never for a level it stopped short of. The
   * operation is executed twice per undo/redo (clone, then root), so the
   * handler is called twice for the same index and has to be idempotent.
   * Pass nothing to clear it once both executions are done: the handler
   * closes over the undo/redo entry, which the operation must not keep alive
   * -- and must never re-point again from a later execution. See
   * `splitTicketConsumedHandler`.
   */
  public onSplitTicketConsumed(handler?: (index: number) => void): void {
    this.splitTicketConsumedHandler = handler;
  }

  /**
   * `getSplitRecreatedIDs` returns the `[removed element, its replacement]`
   * pairs the LAST execution's split produced — the elements a merge had
   * taken away and that this split re-created under new ids. Reset at every
   * execution, so after a change has been applied it describes the root pass.
   *
   * Unlike `replacedIDs` this is derived from the tree the split ran on, not
   * from the reverse op this replica recorded, so it is available for a PEER's
   * split too: the operation on the wire says which tickets the split minted,
   * never what they replace.
   */
  public getSplitRecreatedIDs(): Array<[CRDTTreeNodeID, CRDTTreeNodeID]> {
    return this.splitRecreatedIDs;
  }

  /**
   * `getConsumedSplitTicketCount` returns how many of the recorded split
   * tickets the LAST execution handed to the tree — how many elements that
   * execution really minted. Fewer than `splitLevel` when the split loop ran
   * out of ancestors, and zero when this operation never ran.
   *
   * The count is reset at the start of every execution, so after an undo/redo
   * has applied the change it describes the root pass, not the clone pass
   * that ran first. The two can disagree: the clone and the root are separate
   * trees, and a remote change applied between the clone's last sync and now
   * can leave the split with a different number of ancestors to cross. The
   * handler above fires per execution and cannot tell which; anything that
   * must reflect what the ROOT tree actually minted has to check this after
   * the fact.
   */
  public getConsumedSplitTicketCount(): number {
    return this.consumedSplitTickets;
  }

  /**
   * `setSplitTickets` records the tickets issued for the nodes an element
   * split created. The originating replica calls this after executing the
   * edit, so every other replica can use them instead of reconstructing them.
   */
  public setSplitTickets(tickets: Array<TimeTicket>): void {
    this.splitTickets = tickets;
  }

  /**
   * `setActor` sets the given actor to this operation and to the tickets its
   * split issued.
   *
   * A document edited before `client.attach` runs under the initial actor, and
   * `Document.setActor` re-stamps every pending local change once the real
   * actor arrives. The base implementation rewrites `executedAt` alone, which
   * would leave the split tickets recorded at edit time naming the old actor:
   * they are issued from the change's own context, so every reader -- the
   * decoder's `fromSplitTickets`, and any replica reasoning about which change
   * minted a node -- expects them to carry the change's actor. Re-stamp them
   * here. The lamport and the delimiters are untouched, so their order (and
   * the identities the split mints) is unchanged.
   */
  public setActor(actorID: ActorID): void {
    super.setActor(actorID);
    this.splitTickets = this.splitTickets.map((ticket) =>
      ticket.setActor(actorID),
    );
  }

  /**
   * `getRestoreSpans` returns the identity-preserving restore payload, if any.
   */
  public getRestoreSpans(): Array<TreeRestoreSpan> | undefined {
    return this.restoreSpans;
  }

  /**
   * `getRestoreMode` returns the identity-preserving mode of this op.
   */
  public getRestoreMode(): RestoreMode | undefined {
    return this.restoreMode;
  }

  /**
   * `getRetombstoneSpans` returns the companion span set, if any.
   */
  public getRetombstoneSpans(): Array<TreeRestoreSpan> | undefined {
    return this.retombstoneSpans;
  }

  /**
   * `execute` executes this operation on the given `CRDTRoot`.
   */
  public execute(
    root: CRDTRoot,
    _: OpSource,
    versionVector?: VersionVector,
  ): ExecutionResult {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
    if (!parentObject) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `fail to find ${this.getParentCreatedAt()}`,
      );
    }
    if (!(parentObject instanceof CRDTTree)) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `fail to execute, only Tree can execute edit`,
      );
    }
    const editedAt = this.getExecutedAt();
    const tree = parentObject as CRDTTree;

    // Identity-preserving restore/retombstone path (mirrors EditOperation).
    // `restoreMode` selects direction; an undo ('restore') revives
    // restoreSpans and re-removes retombstoneSpans, the redo ('retombstone')
    // does the opposite. Nodes move by identity, never copy-reinsert.
    if (this.restoreSpans || this.retombstoneSpans) {
      const isRetombstone = this.restoreMode === 'retombstone';
      const toRestore =
        (isRetombstone ? this.retombstoneSpans : this.restoreSpans) ?? [];
      const toRetombstone =
        (isRetombstone ? this.restoreSpans : this.retombstoneSpans) ?? [];

      const diff = { data: 0, meta: 0 };
      // 1. Re-remove (retombstone) by identity. Isolating a straddling piece
      // splits it (live-split overhead accounted to `diff`).
      const [retombstonePairs, retombstoneDiff, retombstoneChanges] =
        tree.retombstone(toRetombstone, editedAt);
      addDataSizes(diff, retombstoneDiff);
      for (const pair of retombstonePairs) {
        root.registerGCPair(pair);
      }
      // 2. Revive (restore) by identity. Isolating a range out of a straddling
      // piece can split off born-removed remainders as pending GC pairs;
      // register them FIRST so a split-born un-tombstoned target is walked
      // gc->live correctly by the unregister below (mirrors the Text path).
      // Un-tombstoned nodes move gc->live via unregisterGCPair (after removedAt
      // is cleared, which restore does); recreated nodes are brand new, so add
      // their size to live, plus any live-split overhead.
      const [
        untombstoned,
        recreated,
        restorePairs,
        restoreDiff,
        restoreChanges,
      ] = tree.restore(toRestore, editedAt);
      for (const pair of restorePairs) {
        root.registerGCPair(pair);
      }
      for (const node of untombstoned) {
        root.unregisterGCPair({ parent: tree, child: node });
      }
      addDataSizes(diff, restoreDiff);
      for (const node of recreated) {
        addDataSizes(diff, node.getDataSize());
      }
      root.acc(diff);

      // One opInfo per node that left or came back, in the order it did, so
      // an editor can apply them one after another like any other edit. It is
      // empty when nothing visible changed (e.g. everything stays under a
      // removed ancestor); the change still propagates, since
      // Document.executeUndoRedo gates on executed operations, not opInfos.
      const path = root.createPath(this.getParentCreatedAt());
      const edits = [...retombstoneChanges, ...restoreChanges];
      const opInfos: Array<OpInfo> = edits.map(
        ({ change: { from, to, value, fromPath, toPath } }) =>
          ({
            type: 'tree-edit',
            path,
            from,
            to,
            value,
            splitLevel: 0,
            fromPath,
            toPath,
          }) as OpInfo,
      );
      // Where this execution actually landed, for the undo stack. The stored
      // `fromIdx`/`toIdx` describe the forward edit this op reverses and never
      // move (the nodes are addressed by identity), so they would shift the
      // pending entries by a range this op never touched.
      this.executedRanges = edits.map(({ change, insertedSize }) => [
        change.from,
        change.to,
        insertedSize,
      ]);

      return {
        opInfos,
        // Reverse keeps the same span sets and flips the direction.
        reverseOp: TreeEditOperation.create(
          this.getParentCreatedAt(),
          this.fromPos,
          this.toPos,
          undefined,
          0,
          undefined!, // executedAt assigned at (re)undo time
          true,
          this.fromIdx,
          this.toIdx,
          this.restoreSpans,
          isRetombstone ? 'restore' : 'retombstone',
          this.retombstoneSpans,
        ),
      };
    }

    // For undo ops: convert stored integer indices to CRDTTreePos. These are
    // the document's own indexes, not the caller's: reconciliation and the
    // edits since can move one inside a surrogate pair, so they resolve
    // without the pair check that guards caller-supplied indexes.
    if (
      this.isUndoOp &&
      this.fromIdx !== undefined &&
      this.toIdx !== undefined
    ) {
      this.fromPos = tree.findPosUnchecked(this.fromIdx);
      if (this.fromIdx === this.toIdx) {
        this.toPos = this.fromPos;
      } else {
        this.toPos = tree.findPosUnchecked(this.toIdx);
      }
    }

    // The tree drops content that reuses an ID it already holds, and reports
    // the size of what it accepted. The reverse operation and the undo stack
    // both read that size rather than the content this operation carried: a
    // range covering content the tree refused would delete a neighbour on
    // redo. The delimiter simulation below stays on the original count, since
    // the server simulates it the same way.
    const [
      changes,
      pairs,
      diff,
      removedNodes,
      preEditFromIdx,
      mergeLevel,
      preTombstoned,
      removedSpans,
      insertedSpans,
      insertedContentSize,
      splitSize,
      mergedNodes,
      splitRecreatedIDs,
    ] = tree.edit(
      [this.fromPos, this.toPos],
      this.contents?.map((content) => content.deepcopy()),
      this.splitLevel,
      editedAt,
      /**
       * TODO(sejongk): When splitting element nodes, a new nodeID is assigned with a different timeTicket.
       * In the same change context, the timeTickets share the same lamport and actorID but have different delimiters,
       * incremented by one for each.
       * Therefore, it is possible to simulate later timeTickets using `editedAt` and the length of `contents`.
       * This logic might be unclear; consider refactoring for multi-level concurrent editing in the Tree implementation.
       */
      // Splitting an element creates nodes that need tickets. The originating
      // replica issued them and carries them here, so this hands them back in
      // the same order. A change written before the field existed carries
      // none, and falls back to reconstructing them from `executedAt` and the
      // number of top-level contents — a reconstruction that is wrong as soon
      // as content has descendants, since each of those consumed a ticket too.
      (() => {
        let delimiter = editedAt.getDelimiter();
        if (this.contents !== undefined) {
          delimiter += this.contents.length;
        }
        this.consumedSplitTickets = 0;
        const issueTimeTicket = () => {
          if (this.consumedSplitTickets < this.splitTickets.length) {
            const index = this.consumedSplitTickets++;
            // Reported as the ticket leaves, not after the split returns:
            // the caller re-points the rest of the change at the element
            // this ticket identifies, and that has to be in place before
            // those operations run. `splitElement` always inserts the node
            // it clones under the ticket it took, so a consumed ticket is
            // an element that exists.
            this.splitTicketConsumedHandler?.(index);
            return this.splitTickets[index];
          }

          return TimeTicket.of(
            editedAt.getLamport(),
            ++delimiter,
            editedAt.getActorID(),
          );
        };
        return issueTimeTicket;
      })(),
      versionVector,
    );

    // Store pre-edit from index (computed inside edit() after text-node splits
    // but before deletions). Derive toIdx from removed nodes' visible sizes.
    this.lastFromIdx = preEditFromIdx;
    // For toIdx: fromIdx + total visible tokens of removed nodes
    const removedSize = removedNodes.reduce(
      (sum, node) => sum + node.paddedSize(),
      0,
    );
    this.lastToIdx = preEditFromIdx + removedSize;
    this.insertedContentSize = insertedContentSize;
    this.splitSize = splitSize;
    this.splitRecreatedIDs = splitRecreatedIDs;

    // Create reverse op for undo
    let reverseOp: Operation | undefined;
    const isPureSplit =
      this.splitLevel > 0 &&
      !this.contents?.length &&
      removedNodes.length === 0;
    if (this.splitLevel === 0) {
      reverseOp = this.toReverseOperation(
        tree,
        removedNodes,
        preEditFromIdx,
        preTombstoned,
        mergeLevel,
        removedSpans,
        insertedSpans,
        mergedNodes,
      );
    } else if (isPureSplit) {
      reverseOp = this.toSplitReverseOperation(tree, preEditFromIdx, splitSize);
    }

    root.acc(diff);

    for (const pair of pairs) {
      root.registerGCPair(pair);
    }

    return {
      opInfos: changes.map(
        ({ from, to, value, splitLevel, fromPath, toPath }) => {
          return {
            type: 'tree-edit',
            path: root.createPath(this.getParentCreatedAt()),
            from,
            to,
            value,
            splitLevel,
            fromPath,
            toPath,
          } as OpInfo;
        },
      ),
      reverseOp,
    };
  }

  /**
   * `toReverseOperation` creates the reverse operation for undo.
   *
   * The reverse op stores both CRDTTreePos (for initial use) and integer
   * indices (for reconciliation adjustment when remote edits arrive).
   * At undo execution time, the integer indices take precedence and are
   * converted to CRDTTreePos via tree.findPosUnchecked().
   *
   * @param tree - The CRDTTree after the edit has been applied
   * @param removedNodes - Nodes that were removed by this edit
   * @param preEditFromIdx - The from index captured BEFORE the edit
   */
  private toReverseOperation(
    tree: CRDTTree,
    removedNodes: Array<CRDTTreeNode>,
    preEditFromIdx: number,
    preTombstoned: Set<string>,
    mergeLevel?: number,
    removedSpans?: Array<TreeRestoreSpan>,
    insertedSpans?: Array<TreeRestoreSpan>,
    mergedNodes: Array<CRDTTreeNode> = [],
  ): Operation | undefined {
    // Identity-preserving reverse: reverse an edit by reviving the nodes it
    // removed (restoreSpans) AND re-removing the nodes it inserted
    // (retombstoneSpans), both by ORIGINAL identity instead of copy-reinsert.
    // edit() only fills these spans when the edit was merge/split-free
    // (spansComplete), so this never fires for the merge/split cases below; the
    // redoSplitLevel guard keeps a split's own boundary-deletion undo on the
    // re-split path (its deletion would otherwise fill removedSpans here).
    const hasRemoved = !!removedSpans && removedSpans.length > 0;
    const hasInserted = !!insertedSpans && insertedSpans.length > 0;
    if (this.redoSplitLevel === undefined && (hasRemoved || hasInserted)) {
      return TreeEditOperation.create(
        this.getParentCreatedAt(),
        this.fromPos,
        this.toPos,
        undefined,
        0,
        undefined!, // executedAt assigned at undo time
        true,
        preEditFromIdx,
        preEditFromIdx,
        removedSpans ?? [],
        'restore',
        insertedSpans ?? [],
      );
    }

    // Special case: this op is a boundary-deletion that was the undo of a
    // split. Its redo should re-split, not re-insert the tombstoned boundary
    // nodes as raw content.
    if (this.redoSplitLevel !== undefined && this.redoSplitLevel > 0) {
      // After the boundary deletion has been applied, the merged position is
      // preEditFromIdx. We re-split there.
      const splitRedoFromPos = tree.findPosUnchecked(preEditFromIdx);
      const splitRedoOp = TreeEditOperation.create(
        this.getParentCreatedAt(),
        splitRedoFromPos,
        splitRedoFromPos,
        undefined, // no inserted content
        this.redoSplitLevel,
        undefined!, // executedAt assigned at redo time
        true, // isUndoOp (treated as undo/redo op)
        preEditFromIdx,
        preEditFromIdx,
      );
      splitRedoOp.replacedIDs = mergedAwayIDs(mergedNodes);
      return splitRedoOp;
    }

    // Cross-boundary merge: the reverse is a split, not content re-insertion.
    // A merge deletes element boundaries (e.g., </p><p>), moving children
    // into the target. The undo re-creates those boundaries via split.
    if (mergeLevel && mergeLevel > 0) {
      const splitFromPos = tree.findPosUnchecked(preEditFromIdx);
      const splitUndoOp = TreeEditOperation.create(
        this.getParentCreatedAt(),
        splitFromPos,
        splitFromPos,
        undefined, // no inserted content — split creates boundaries
        mergeLevel, // splitLevel = number of merged boundaries
        undefined!, // executedAt assigned at undo time
        true, // isUndoOp
        preEditFromIdx,
        preEditFromIdx,
      );
      splitUndoOp.replacedIDs = mergedAwayIDs(mergedNodes);
      return splitUndoOp;
    }

    // Inserted content size in tree index tokens, measured before the edit:
    // these nodes are now in the tree, and one inserted under a concurrently
    // removed parent is tombstoned on the way in, which shrinks the size read
    // back here. The guard below relies on that pre-edit size to recognize an
    // edit that had no effect. What it counts is the content the tree
    // accepted, not the content this operation carried — a reverse range
    // covering a dropped copy would delete a neighbour on redo.
    const insertedContentSize = this.insertedContentSize ?? 0;

    // Guard: if the positions exceed the post-edit tree size,
    // the edit was a no-op (e.g., concurrent parent deletion where inserted
    // content was tombstoned). Skip reverse op.
    const maxNeededIdx = preEditFromIdx + insertedContentSize;
    if (maxNeededIdx > tree.getSize()) {
      return undefined;
    }

    // Filter to top-level removed nodes (whose parent is NOT also removed).
    // Also exclude nodes that were already tombstoned before this edit ran:
    // those represent the user's earlier delete intent and must not be
    // resurrected by a parent-level undo, even at the root of `topLevelRemoved`.
    const topLevelRemoved = removedNodes.filter(
      (node) =>
        !preTombstoned.has(node.id.toIDString()) &&
        (!node.parent || !removedNodes.includes(node.parent)),
    );

    // Deep copy for re-insertion on undo, but drop descendants that
    // were already tombstoned before this edit. Without this filter,
    // undoing a parent delete would resurrect the user's earlier
    // independent deletes — causing accumulation across undo/redo
    // cycles in nested-edit scenarios.
    const reverseContents =
      topLevelRemoved.length > 0
        ? topLevelRemoved.map((n) =>
            cloneAndDropPreTombstoned(n, preTombstoned),
          )
        : undefined;

    // Compute CRDTTreePos for the reverse range on the post-edit tree with
    // the pre-edit from index. The reverse is built for remote changes too,
    // from indexes on this replica's tree, so it skips the pair check:
    // refusing one would refuse a remote change the caller never controlled.
    const reverseFromPos = tree.findPosUnchecked(preEditFromIdx);

    let reverseToPos: CRDTTreePos;
    if (insertedContentSize > 0) {
      reverseToPos = tree.findPosUnchecked(
        preEditFromIdx + insertedContentSize,
      );
    } else {
      reverseToPos = reverseFromPos;
    }

    // Integer indices for the reverse op (used by reconciliation)
    const reverseFromIdx = preEditFromIdx;
    const reverseToIdx = preEditFromIdx + insertedContentSize;

    return TreeEditOperation.create(
      this.getParentCreatedAt(),
      reverseFromPos,
      reverseToPos,
      reverseContents,
      0, // splitLevel always 0
      undefined!, // executedAt set during undo
      true, // isUndoOp
      reverseFromIdx,
      reverseToIdx,
    );
  }

  /**
   * `toSplitReverseOperation` creates the reverse operation for a split edit.
   *
   * A split creates element boundaries (close + open tags). The reverse
   * is a boundary deletion: a splitLevel=0 edit that removes those tokens,
   * merging the split elements back together.
   *
   * `boundarySize` is how many tokens the split actually opened, not
   * 2 * splitLevel, which is only how many it asked for: the split loop stops
   * when it runs out of ancestors to split, and a level the tree has no room
   * for would size this range over tokens the split never opened. The undo
   * then deletes live content past its own boundary and merges elements the
   * split never separated.
   *
   * @param tree - The CRDTTree after the split has been applied
   * @param preEditFromIdx - The from index captured BEFORE the split
   * @param boundarySize - The visible-index size the split opened
   */
  private toSplitReverseOperation(
    tree: CRDTTree,
    preEditFromIdx: number,
    boundarySize: number,
  ): Operation | undefined {
    // The split had no visible effect — a concurrent deletion tombstoned the
    // element it split, so its boundary occupies no visible index, or there
    // was no ancestor left to split at all. Nothing for an undo to merge.
    if (boundarySize === 0) {
      return undefined;
    }

    const reverseFromIdx = preEditFromIdx;
    const reverseToIdx = preEditFromIdx + boundarySize;

    // Belt and braces against a range that runs off the end of the tree:
    // deleting it would take out live content to the right of the boundary.
    if (reverseToIdx > tree.getSize()) {
      return undefined;
    }

    const reverseFromPos = tree.findPosUnchecked(reverseFromIdx);
    const reverseToPos = tree.findPosUnchecked(reverseToIdx);

    const boundaryDeletionOp = TreeEditOperation.create(
      this.getParentCreatedAt(),
      reverseFromPos,
      reverseToPos,
      undefined, // no content — this is a deletion
      0, // splitLevel=0: boundary deletion
      undefined!, // executedAt assigned at undo time
      true, // isUndoOp
      reverseFromIdx,
      reverseToIdx,
    );
    // Tag this op so that its own reverse (the redo) is regenerated as a
    // proper split rather than a raw node re-insertion.
    boundaryDeletionOp.redoSplitLevel = this.splitLevel;
    return boundaryDeletionOp;
  }

  /**
   * `normalizePos` returns the visible-index range of this operation.
   * For undo ops, returns the stored (possibly reconciled) indices.
   * For forward ops, returns the pre-edit indices captured during execute().
   */
  public normalizePos(): [number, number] {
    if (
      this.isUndoOp &&
      this.fromIdx !== undefined &&
      this.toIdx !== undefined
    ) {
      return [this.fromIdx, this.toIdx];
    }

    if (this.lastFromIdx !== undefined && this.lastToIdx !== undefined) {
      return [this.lastFromIdx, this.lastToIdx];
    }

    // Fallback: no indices available
    return [0, 0];
  }

  /**
   * `reconcileOperation` adjusts this undo operation's integer indices
   * when a remote edit modifies the same tree. Uses the same 6-case
   * overlap logic as EditOperation.reconcileOperation for Text.
   */
  public reconcileOperation(
    remoteFrom: number,
    remoteTo: number,
    contentLen: number,
  ): void {
    if (!this.isUndoOp) {
      return;
    }
    // Identity-addressed restore/retombstone ops locate their nodes by
    // TreeNodeID, not by index, so index reconciliation must not touch them
    // (mirrors EditOperation for Text).
    if (this.restoreSpans || this.retombstoneSpans) {
      return;
    }
    if (this.fromIdx === undefined || this.toIdx === undefined) {
      return;
    }
    if (remoteFrom > remoteTo) {
      return;
    }

    const remoteRangeLen = remoteTo - remoteFrom;
    const localFrom = this.fromIdx;
    const localTo = this.toIdx;

    const apply = (na: number, nb: number) => {
      this.fromIdx = Math.max(0, na);
      this.toIdx = Math.max(0, nb);
    };

    // Case 1: Remote edit is to the left of undo range
    // [--remote--]  [--undo--]
    if (remoteTo <= localFrom) {
      apply(
        localFrom - remoteRangeLen + contentLen,
        localTo - remoteRangeLen + contentLen,
      );
      return;
    }

    // Case 2: Remote edit is to the right of undo range
    // [--undo--]  [--remote--]
    if (localTo <= remoteFrom) {
      return;
    }

    // Case 3: Undo range is contained within remote range
    // [-------remote-------]
    //      [--undo--]
    if (
      remoteFrom <= localFrom &&
      localTo <= remoteTo &&
      remoteFrom !== remoteTo
    ) {
      apply(remoteFrom, remoteFrom);
      return;
    }

    // Case 4: Remote range is contained within undo range
    //      [--remote--]
    // [---------undo---------]
    if (
      localFrom <= remoteFrom &&
      remoteTo <= localTo &&
      localFrom !== localTo
    ) {
      apply(localFrom, localTo - remoteRangeLen + contentLen);
      return;
    }

    // Case 5: Remote range overlaps the start of undo range
    // [---remote---]
    //      [---undo---]
    if (remoteFrom < localFrom && localFrom < remoteTo && remoteTo < localTo) {
      apply(remoteFrom, remoteFrom + (localTo - remoteTo));
      return;
    }

    // Case 6: Remote range overlaps the end of undo range
    //      [---remote---]
    // [---undo---]
    if (localFrom < remoteFrom && remoteFrom < localTo && localTo < remoteTo) {
      apply(localFrom, remoteFrom);
      return;
    }
  }

  /**
   * `getContentSize` returns the total visible size of this operation's
   * content (for reconciliation).
   *
   * Once the operation has run, this is the size the tree accepted: content
   * whose ID was already in the tree is dropped, and the undo stack shifts its
   * stored indices by this size, so counting the dropped copy would move every
   * index in the stack past content that was never inserted.
   */
  public getContentSize(): number {
    if (this.insertedContentSize !== undefined) {
      return this.insertedContentSize + (this.splitSize ?? 0);
    }
    if (!this.contents) return 0;
    return this.contents.reduce((sum, node) => sum + node.paddedSize(), 0);
  }

  /**
   * `getExecutedRanges` returns the visible ranges this execution replaced,
   * each with the size it inserted there, in the order they applied — what the
   * undo stack has to be reconciled against.
   *
   * An identity-preserving restore/retombstone reports one entry per node that
   * came back or left, measured as it happened; every other edit reports its
   * single normalized range.
   */
  public getExecutedRanges(): Array<[number, number, number]> {
    if (this.executedRanges) {
      return this.executedRanges;
    }

    const [from, to] = this.normalizePos();
    return [[from, to, this.getContentSize()]];
  }

  /**
   * `getEffectedCreatedAt` returns the creation time of the effected element.
   */
  public getEffectedCreatedAt(): TimeTicket {
    return this.getParentCreatedAt();
  }

  /**
   * `toTestString` returns a string containing the meta data.
   */
  public toTestString(): string {
    const parent = this.getParentCreatedAt().toTestString();
    const fromPos = `${this.fromPos
      .getLeftSiblingID()
      .getCreatedAt()
      .toTestString()}/${this.fromPos.getLeftSiblingID().getOffset()}`;
    const toPos = `${this.toPos
      .getLeftSiblingID()
      .getCreatedAt()
      .toTestString()}/${this.toPos.getLeftSiblingID().getOffset()}`;
    const contents = this.contents || [];
    return `${parent}.EDIT(${fromPos},${toPos},${contents
      .map((v) => toXML(v))
      .join('')})`;
  }

  /**
   * `getFromPos` returns the start point of the editing range.
   */
  public getFromPos(): CRDTTreePos {
    return this.fromPos;
  }

  /**
   * `getToPos` returns the end point of the editing range.
   */
  public getToPos(): CRDTTreePos {
    return this.toPos;
  }

  /**
   * `getContent` returns the content of Edit.
   */
  public getContents(): Array<CRDTTreeNode> | undefined {
    return this.contents;
  }

  /**
   * `getSplitLevel` returns the split level of Edit.
   */
  public getSplitLevel(): number {
    return this.splitLevel;
  }
}
