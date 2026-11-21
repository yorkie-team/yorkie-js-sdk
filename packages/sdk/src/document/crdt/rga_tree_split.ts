/*
 * Copyright 2020 The Yorkie Authors. All rights reserved.
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
import { Comparator } from '@yorkie-js/sdk/src/util/comparator';
import { SplayNode, SplayTree } from '@yorkie-js/sdk/src/util/splay_tree';
import { LLRBTree } from '@yorkie-js/sdk/src/util/llrb_tree';
import {
  InitialTimeTicket,
  TimeTicket,
  TimeTicketSize,
  TimeTicketStruct,
} from '@yorkie-js/sdk/src/document/time/ticket';
import {
  VersionVector,
  ticketKnown,
} from '@yorkie-js/sdk/src/document/time/version_vector';
import { GCChild, GCPair, GCParent } from '@yorkie-js/sdk/src/document/crdt/gc';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';
import {
  DataSize,
  addDataSizes,
  subDataSize,
} from '@yorkie-js/sdk/src/util/resource';

export interface ValueChange<T> {
  actor: ActorID;
  from: number;
  to: number;
  value?: T;
}

export interface RGATreeSplitValue {
  length: number;
  substring(indexStart: number, indexEnd?: number): RGATreeSplitValue;

  /**
   * `truncate` shortens this value in place, keeping the object identity.
   *
   * A split has to keep the LEFT node's value object, because `CRDTRoot.keyOf`
   * identifies a GC pair's parent by object identity. Replacing it orphans
   * every pair already registered against it: purge is then called on an
   * object nothing references, so the tombstone survives while the ledger says
   * it was collected. The Go implementation splits in place for the same
   * reason.
   */
  truncate(offset: number): void;

  getDataSize(): DataSize;

  /**
   * `getGCPairs` returns the pairs for the tombstones this value carries, for
   * a value that has any (`CRDTTextValue`'s removed attributes).
   */
  getGCPairs?(): Array<GCPair>;

  /**
   * `skeletonValue` returns an empty value with no attributes, which a
   * collected tombstone (a skeleton) keeps in place of its content.
   */
  skeletonValue?(): RGATreeSplitValue;
}

/**
 * `RGATreeSplitPosStruct` is a structure represents the meta data of the node pos.
 * It is used to serialize and deserialize the node pos.
 */
export type RGATreeSplitPosStruct = {
  id: RGATreeSplitNodeIDStruct;
  relativeOffset: number;
};

/**
 * `RGATreeSplitNodeIDStruct` is a structure represents the meta data of the node id.
 * It is used to serialize and deserialize the node id.
 */
export type RGATreeSplitNodeIDStruct = {
  createdAt: TimeTicketStruct;
  offset: number;
};

/**
 * `RGATreeSplitNodeID` is an ID of RGATreeSplitNode.
 */
export class RGATreeSplitNodeID {
  private createdAt: TimeTicket;
  private offset: number;

  constructor(createdAt: TimeTicket, offset: number) {
    this.createdAt = createdAt;
    this.offset = offset;
  }

  /**
   * `of` creates a instance of RGATreeSplitNodeID.
   */
  public static of(createdAt: TimeTicket, offset: number): RGATreeSplitNodeID {
    return new RGATreeSplitNodeID(createdAt, offset);
  }

  /**
   * `fromStruct` creates a instance of RGATreeSplitNodeID from the struct.
   */
  public static fromStruct(
    struct: RGATreeSplitNodeIDStruct,
  ): RGATreeSplitNodeID {
    return RGATreeSplitNodeID.of(
      TimeTicket.fromStruct(struct.createdAt),
      struct.offset,
    );
  }

  /**
   * `getCreatedAt` returns the creation time of this ID.
   */
  public getCreatedAt(): TimeTicket {
    return this.createdAt;
  }

  /**
   * `getOffset` returns returns the offset of this ID.
   */
  public getOffset(): number {
    return this.offset;
  }

  /**
   * `equals` returns whether given ID equals to this ID or not.
   */
  public equals(other: RGATreeSplitNodeID): boolean {
    return (
      this.createdAt.compare(other.createdAt) === 0 &&
      this.offset === other.offset
    );
  }

  /**
   * `hasSameCreatedAt` returns whether given ID has same creation time with this ID.
   */
  public hasSameCreatedAt(other: RGATreeSplitNodeID): boolean {
    return this.createdAt.compare(other.createdAt) === 0;
  }

  /**
   * `split` creates a new ID with an offset from this ID.
   */
  public split(offset: number): RGATreeSplitNodeID {
    return new RGATreeSplitNodeID(this.createdAt, this.offset + offset);
  }

  /**
   * `toStruct` returns the structure of this node id.
   */
  public toStruct(): RGATreeSplitNodeIDStruct {
    return {
      createdAt: this.createdAt.toStruct(),
      offset: this.offset,
    };
  }

  /**
   * `toTestString` returns a String containing
   * the meta data of the node id for debugging purpose.
   */
  public toTestString(): string {
    return `${this.createdAt.toTestString()}:${this.offset}`;
  }

  /**
   * `toIDString` returns a string that can be used as an ID for this node id.
   */
  public toIDString(): string {
    return `${this.createdAt.toIDString()}:${this.offset}`;
  }
}

/**
 * `InitialRGATreeSplitNodeID` is the ID of the head node of every
 * RGATreeSplit.
 */
export const InitialRGATreeSplitNodeID = RGATreeSplitNodeID.of(
  InitialTimeTicket,
  0,
);

/**
 * `InsertOrigin` is the insertion context recorded when a node is inserted.
 *
 * `left` is the boundary the content was inserted after (the edit's `from`
 * as an absolute ID). `right` is the ID of the character that sat right after
 * the caret at insertion time, tombstones included, or `undefined` at the end
 * of the text. With only `left`, every node inserted at the same boundary is a
 * sibling ordered by timestamp, so two runs typed with the caret held in place
 * interleave. `right` records "this went before that", which keeps each run
 * contiguous (the FugueMax/YjsMod rule).
 *
 * A node without an origin (old operations, undo restores, old snapshots)
 * keeps the legacy placement rule. The IDs are shared, never mutated.
 */
export type InsertOrigin = {
  left: RGATreeSplitNodeID;
  right?: RGATreeSplitNodeID;
};

/**
 * `RGATreeSplitPos` is the position of the text inside the node.
 */
export class RGATreeSplitPos {
  private id: RGATreeSplitNodeID;
  private relativeOffset: number;

  constructor(id: RGATreeSplitNodeID, relativeOffset: number) {
    this.id = id;
    this.relativeOffset = relativeOffset;
  }

  /**
   * `of` creates a instance of RGATreeSplitPos.
   */
  public static of(
    id: RGATreeSplitNodeID,
    relativeOffset: number,
  ): RGATreeSplitPos {
    return new RGATreeSplitPos(id, relativeOffset);
  }

  /**
   * `fromStruct` creates a instance of RGATreeSplitPos from the struct.
   */
  public static fromStruct(struct: RGATreeSplitPosStruct): RGATreeSplitPos {
    const id = RGATreeSplitNodeID.fromStruct(struct.id);
    return RGATreeSplitPos.of(id, struct.relativeOffset);
  }

  /**
   * `getID` returns the ID of this RGATreeSplitPos.
   */
  public getID(): RGATreeSplitNodeID {
    return this.id;
  }

  /**
   * `getRelativeOffset` returns the relative offset of this RGATreeSplitPos.
   */
  public getRelativeOffset(): number {
    return this.relativeOffset;
  }

  /**
   * `getAbsoluteID` returns the absolute id of this RGATreeSplitPos.
   */
  public getAbsoluteID(): RGATreeSplitNodeID {
    return RGATreeSplitNodeID.of(
      this.id.getCreatedAt(),
      this.id.getOffset() + this.relativeOffset,
    );
  }

  /**
   *`toTestString` returns a String containing
   * the meta data of the position for debugging purpose.
   */
  public toTestString(): string {
    return `${this.id.toTestString()}:${this.relativeOffset}`;
  }

  /**
   * `toStruct` returns the structure of this node pos.
   */
  public toStruct(): RGATreeSplitPosStruct {
    return {
      id: this.id.toStruct(),
      relativeOffset: this.relativeOffset,
    };
  }

  /**
   * `equals` returns whether given pos equal to this pos or not.
   */
  public equals(other: RGATreeSplitPos): boolean {
    if (!this.id.equals(other.id)) {
      return false;
    }

    return this.relativeOffset === other.relativeOffset;
  }
}

export type RGATreeSplitPosRange = [RGATreeSplitPos, RGATreeSplitPos];

/**
 * `RestoreSpan` identifies a run of characters from a single original
 * insertion: the absolute-offset interval [start, end) of the insertion
 * created at `createdAt`. `value` is a deep copy of the removed content,
 * carried so that purged nodes can be recreated (GC-safe).
 */
export type RestoreSpan<T extends RGATreeSplitValue> = {
  createdAt: TimeTicket;
  start: number;
  end: number;
  value: T;
};

/**
 * `LedgerCancel` is an undo that cancelled one deletion of a node.
 */
export type LedgerCancel = {
  deletion: TimeTicket;
  cancelledAt: TimeTicket;
};

/**
 * `LedgerEntry` is one deletion of a removal ledger beside the cancel that
 * covers it, if an undo cancelled it.
 */
type LedgerEntry = {
  removal: TimeTicket;
  cancelledAt?: TimeTicket;
};

/**
 * `LedgerIndex` is the reading of a removal ledger every walk of it needs:
 * each deletion with its cancel, those entries by deletion, the deletions no
 * cancel covers, and the cancels by the deletion each one cancels -- which
 * covers the cancel of a deletion the ledger itself does not hold.
 */
type LedgerIndex = {
  entries: Array<LedgerEntry>;
  byKey: Map<string, LedgerEntry>;
  live: Array<TimeTicket>;
  cancelled: Map<string, TimeTicket>;
};

/**
 * `RGATreeSplitNode` is a node of RGATreeSplit.
 */
export class RGATreeSplitNode<T extends RGATreeSplitValue>
  extends SplayNode<T>
  implements GCChild
{
  private id: RGATreeSplitNodeID;
  private removedAt?: TimeTicket;
  // The removal ledger. `dels` are the deletions that removed this node
  // while it was live in the deleter's view; `cancels` are the deletions undo
  // cancelled. `removedAt` is the latest uncancelled deletion. `!ledgered`
  // means the ledger is just `removedAt`.
  private ledgered = false;
  private dels?: Array<TimeTicket>;
  private cancels?: Array<LedgerCancel>;
  // The reading of the ledger above, kept because a ledger grows a pair per
  // delete-and-undo cycle and rebuilding it on every walk makes churning one
  // quadratic. Every write of the ledger either drops it or updates it.
  private index?: LedgerIndex;

  private prev?: RGATreeSplitNode<T>;
  private next?: RGATreeSplitNode<T>;
  private insPrev?: RGATreeSplitNode<T>;
  private insNext?: RGATreeSplitNode<T>;
  private origin?: InsertOrigin;
  // `skelLen > 0` marks a skeleton: a tombstone whose garbage collection has
  // run. Instead of being unlinked, the node drops its content and attributes
  // and keeps what placement reads -- its ID range [offset, offset+skelLen),
  // its origin and its place in the chain -- so insertion origins that name
  // it, and the windows `integrate` scans, resolve the same on replicas that
  // collected it and on replicas that did not (the Yjs GC-struct approach).
  private skelLen = 0;

  constructor(id: RGATreeSplitNodeID, value?: T, removedAt?: TimeTicket) {
    super(value!);
    this.id = id;
    this.removedAt = removedAt;
  }

  /**
   * `create` creates a instance of RGATreeSplitNode.
   */
  public static create<T extends RGATreeSplitValue>(
    id: RGATreeSplitNodeID,
    value?: T,
  ): RGATreeSplitNode<T> {
    return new RGATreeSplitNode(id, value);
  }

  /**
   * `createComparator` creates a function to compare two RGATreeSplitNodeID.
   */
  public static createComparator(): Comparator<RGATreeSplitNodeID> {
    return (p1: RGATreeSplitNodeID, p2: RGATreeSplitNodeID): number => {
      const compare = p1.getCreatedAt().compare(p2.getCreatedAt());
      if (compare !== 0) {
        return compare;
      }

      if (p1.getOffset() > p2.getOffset()) {
        return 1;
      } else if (p1.getOffset() < p2.getOffset()) {
        return -1;
      }
      return 0;
    };
  }

  /**
   * `getID` returns the ID of this RGATreeSplitNode.
   */
  public getID(): RGATreeSplitNodeID {
    return this.id;
  }

  /**
   * `getCreatedAt` returns creation time of the Id of RGATreeSplitNode.
   */
  public getCreatedAt(): TimeTicket {
    return this.id.getCreatedAt();
  }

  /**
   * `getLength` returns the length of this node.
   */
  public getLength(): number {
    if (this.removedAt) {
      return 0;
    }
    return this.getContentLength();
  }

  /**
   * `getContentLength` returns the length of this value.
   */
  public getContentLength(): number {
    if (this.skelLen > 0) {
      return this.skelLen;
    }
    return (this.value && this.value.length) || 0;
  }

  /**
   * `isSkeleton` tells whether this node is a collected tombstone kept only
   * for its position.
   */
  public isSkeleton(): boolean {
    return this.skelLen > 0;
  }

  /**
   * `getSkeletonLength` returns the length of the ID range a skeleton
   * covers, or 0.
   */
  public getSkeletonLength(): number {
    return this.skelLen;
  }

  /**
   * `toSkeleton` turns this node into a skeleton covering `length`
   * positions, with the given empty value. Every skeleton shares one
   * stand-in removal time: nothing reads it (removal, style, restore and GC
   * all branch on the skeleton first), so a snapshot needs no removed_at for
   * it and a replica that loads one holds the state of the one that
   * collected it. The removal ledger goes with it.
   */
  public toSkeleton(length: number, value: T): void {
    this.skelLen = length;
    this.value = value;
    this.setRemovedAt(InitialTimeTicket);
  }

  /**
   * `refill` turns a skeleton back into a node with the given content, in
   * place (undo of a collected deletion). It is left live; the caller
   * records the removal ledger it needs.
   */
  public refill(value: T): void {
    this.skelLen = 0;
    this.value = value;
    this.setRemovedAt(undefined);
  }

  /**
   * `growSkeleton` extends a skeleton by the range of the next piece of the
   * same insertion, which it absorbs.
   */
  public growSkeleton(length: number): void {
    this.skelLen += length;
  }

  /**
   * `getOrigin` returns the insertion origin of this node, if any.
   */
  public getOrigin(): InsertOrigin | undefined {
    return this.origin;
  }

  /**
   * `setOrigin` sets the insertion origin. It is only called on a node that
   * was just created (local or remote insert, snapshot decoding).
   */
  public setOrigin(origin?: InsertOrigin): void {
    this.origin = origin;
  }

  /**
   * `getPrev` returns a previous node of this node.
   */
  public getPrev(): RGATreeSplitNode<T> | undefined {
    return this.prev;
  }

  /**
   * `getNext` returns a next node of this node.
   */
  public getNext(): RGATreeSplitNode<T> | undefined {
    return this.next;
  }

  /**
   * `getInsPrev` returns a previous node of this node insertion.
   */
  public getInsPrev(): RGATreeSplitNode<T> | undefined {
    return this.insPrev;
  }

  /**
   * `getInsNext` returns a next node of this node insertion.
   */
  public getInsNext(): RGATreeSplitNode<T> | undefined {
    return this.insNext;
  }

  /**
   * `getInsPrevID` returns a ID of previous node insertion.
   */
  public getInsPrevID(): RGATreeSplitNodeID {
    return this.insPrev!.getID();
  }

  /**
   * `setPrev` sets previous node of this node.
   */
  public setPrev(node?: RGATreeSplitNode<T>): void {
    this.prev = node;
    if (node) {
      node.next = this;
    }
  }

  /**
   * `setNext` sets next node of this node.
   */
  public setNext(node?: RGATreeSplitNode<T>): void {
    this.next = node;
    if (node) {
      node.prev = this;
    }
  }

  /**
   * `setInsPrev` sets previous node of this node insertion.
   */
  public setInsPrev(node?: RGATreeSplitNode<T>): void {
    this.insPrev = node;
    if (node) {
      node.insNext = this;
    }
  }

  /**
   * `setInsNext` sets next node of this node insertion.
   */
  public setInsNext(node?: RGATreeSplitNode<T>): void {
    this.insNext = node;
    if (node) {
      node.insPrev = this;
    }
  }

  /**
   * `hasNext` checks if next node exists.
   */
  public hasNext(): boolean {
    return !!this.next;
  }

  /**
   * `hasInsPrev` checks if previous insertion node exists.
   */
  public hasInsPrev(): boolean {
    return !!this.insPrev;
  }

  /**
   * `isRemoved` checks if removed time exists.
   */
  public isRemoved(): boolean {
    return !!this.removedAt;
  }

  /**
   * `getRemovedAt` returns the remove time of this node.
   */
  public getRemovedAt(): TimeTicket | undefined {
    return this.removedAt;
  }

  /**
   * `split` creates a new split node of the given offset.
   */
  public split(offset: number): RGATreeSplitNode<T> {
    if (this.skelLen > 0) {
      // Skeleton values are empty and never mutated, so both halves share
      // one, and there is no ledger to copy.
      const node = new RGATreeSplitNode(
        this.id.split(offset),
        this.value,
        this.removedAt,
      );
      node.skelLen = this.skelLen - offset;
      this.skelLen = offset;
      if (this.origin) {
        node.origin = { left: node.id, right: this.origin.right };
      }
      return node;
    }
    const node = new RGATreeSplitNode(
      this.id.split(offset),
      this.splitValue(offset),
      this.removedAt,
    );
    node.copyLedger(this);
    // NOTE: The back piece is part of the same insertion, so it keeps the
    // right origin. Its left origin is its own ID, which
    // `findFloorNodePreferToLeft` resolves to the front piece through
    // `insPrev`: the back piece hangs off the last character before it.
    if (this.origin) {
      node.origin = { left: node.id, right: this.origin.right };
    }
    return node;
  }

  private copyLedger(other: RGATreeSplitNode<T>): void {
    this.ledgered = other.ledgered;
    this.dels = other.dels?.slice();
    this.cancels = other.cancels?.slice();
    this.index = undefined;
  }

  /**
   * `getLedger` returns the removal ledger: whether there is one, the
   * deletions and the cancels.
   */
  public getLedger(): [boolean, Array<TimeTicket>, Array<LedgerCancel>] {
    return [this.ledgered, this.dels ?? [], this.cancels ?? []];
  }

  /**
   * `hasCancels` tells whether the ledger holds a cancel, the only thing
   * `pruneStable` can drop.
   */
  public hasCancels(): boolean {
    return !!this.cancels?.length;
  }

  /**
   * `removals` returns the deletions in the ledger without building one: a
   * node without a ledger was removed by `removedAt` alone, if at all.
   */
  private removals(): Array<TimeTicket> {
    if (this.ledgered) {
      return this.dels ?? [];
    }
    return this.removedAt ? [this.removedAt] : [];
  }

  private ledger(): Array<TimeTicket> {
    if (!this.ledgered) {
      this.ledgered = true;
      this.dels = this.removedAt ? [this.removedAt] : [];
      this.index = undefined;
    }
    return this.dels!;
  }

  /**
   * `ledgerIndex` reads the ledger into the form every walk of it wants, and
   * keeps that reading until the ledger is written again. A deletion is
   * cancelled at most once (`cancelRemoval` and `setRemovalEvents` both pair
   * one to one), so a cancel is indexed by the deletion it cancels.
   *
   * Every walk of the ledger takes this index rather than scanning the
   * cancels per deletion: the ledger of a decoded node is as long as whoever
   * sent it made it, and a scan per deletion would make reading one quadratic
   * in that length.
   */
  private ledgerIndex(): LedgerIndex {
    if (!this.index) {
      const cancelled = new Map<string, TimeTicket>();
      for (const c of this.cancels ?? []) {
        cancelled.set(c.deletion.toIDString(), c.cancelledAt);
      }
      const entries: Array<LedgerEntry> = [];
      const byKey = new Map<string, LedgerEntry>();
      const live: Array<TimeTicket> = [];
      for (const d of this.removals()) {
        const key = d.toIDString();
        if (byKey.has(key)) {
          continue;
        }
        const entry: LedgerEntry = {
          removal: d,
          cancelledAt: cancelled.get(key),
        };
        entries.push(entry);
        byKey.set(key, entry);
        if (!entry.cancelledAt) {
          live.push(d);
        }
      }
      this.index = { entries, byKey, live, cancelled };
    }
    return this.index;
  }

  private recompute(): void {
    let latest: TimeTicket | undefined;
    for (const d of this.ledgerIndex().live) {
      if (!latest || d.after(latest)) {
        latest = d;
      }
    }
    this.removedAt = latest;
  }

  /**
   * `recordRemoval` adds a deletion to the ledger. A node's first removal is
   * just `removedAt`; the ledger is built only when a second removal or a
   * cancel needs it.
   */
  public recordRemoval(removedAt: TimeTicket): void {
    if (!this.ledgered && !this.removedAt) {
      this.removedAt = removedAt;
      this.index = undefined;
      return;
    }
    this.ledger();
    // An actor removes a piece only while it is live in its view, so it never
    // holds two uncancelled removals; a change whose vector leaves out its own
    // earlier removal is not honest, and recording it would break the pairing
    // `removal_events` relies on and grow the ledger.
    const mine = this.uncancelledRemovalBy(removedAt.getActorID());
    if (mine && !mine.equals(removedAt)) {
      return;
    }
    const index = this.ledgerIndex();
    const key = removedAt.toIDString();
    if (!mine && !index.byKey.has(key)) {
      this.dels!.push(removedAt);
      const entry: LedgerEntry = { removal: removedAt };
      index.entries.push(entry);
      index.byKey.set(key, entry);
      index.live.push(removedAt);
    }
    this.recompute();
  }

  /**
   * `cancelRemoval` cancels one deletion (an undo of it). Returns whether the
   * node is live afterwards.
   */
  public cancelRemoval(deletion: TimeTicket, at: TimeTicket): boolean {
    this.ledger();
    this.cancels = this.cancels ?? [];
    const index = this.ledgerIndex();
    const key = deletion.toIDString();
    if (!index.cancelled.has(key)) {
      this.cancels.push({ deletion, cancelledAt: at });
      index.cancelled.set(key, at);
      const entry = index.byKey.get(key);
      if (entry) {
        entry.cancelledAt = at;
        const live = index.live.findIndex((d) => d.equals(deletion));
        if (live !== -1) {
          index.live.splice(live, 1);
        }
      }
    }
    this.recompute();
    return !this.removedAt;
  }

  /**
   * `pruneStable` drops each removal whose cancel is known to every replica,
   * with that cancel. A change that arrives later knows both, so the pair
   * never decides `isRemovedInView` again, and dropping it keeps an
   * undo-heavy text from carrying every removal it ever had. A removal is
   * older than its cancel by the same actor, so the cancel being known is
   * enough. What is left is the default ledger once `removedAt` alone says
   * it.
   */
  public pruneStable(vector: VersionVector): void {
    const cancels: Array<LedgerCancel> = [];
    const dropped = new Set<string>();
    for (const c of this.cancels ?? []) {
      if (!vector.afterOrEqual(c.cancelledAt)) {
        cancels.push(c);
        continue;
      }
      dropped.add(c.deletion.toIDString());
    }
    let dels = this.dels;
    if (dropped.size && dels) {
      dels = dels.filter((d) => !dropped.has(d.toIDString()));
    }
    this.dels = dels;
    this.cancels = cancels;
    this.index = undefined;
    if (
      !cancels.length &&
      (!dels?.length ||
        (dels.length === 1 &&
          !!this.removedAt &&
          dels[0].equals(this.removedAt)))
    ) {
      this.ledgered = false;
      this.dels = undefined;
      this.cancels = undefined;
    }
  }

  /**
   * `uncancelledRemovalBy` returns the removal by `actor` no undo cancelled,
   * if any.
   */
  public uncancelledRemovalBy(actor: ActorID): TimeTicket | undefined {
    for (const d of this.ledgerIndex().live) {
      if (d.getActorID() === actor) {
        return d;
      }
    }
    return;
  }

  /**
   * `heldFromPurge` tells whether GC must keep this tombstone under `vector`,
   * the versions every replica has seen. A node removed by two or more
   * deletions no undo cancelled stays: an undo of one of them must find it
   * still held by the others, and a purged node could not say so. A node
   * whose ledger is not yet stable stays too: every deletion and every cancel
   * in it must be known to all replicas, so any change that arrives after the
   * purge already knew them, and a node a restore recreates with only the
   * removal it cancels answers `isRemovedInView` as the full ledger would.
   * Once that holds and a single removal is left, a restore that finds the
   * piece gone can only be cancelling that removal, and recreates it.
   */
  public heldFromPurge(vector: VersionVector): boolean {
    if (!this.ledgered) {
      return false;
    }
    // A cancelled deletion is older than its cancel by the same actor, so a
    // stable cancel makes it stable too; an uncancelled one is `removedAt`,
    // which GC checks first, or one of two that keep the node anyway.
    const n = this.ledgerIndex().live.length;
    for (const c of this.cancels ?? []) {
      if (!vector.afterOrEqual(c.cancelledAt)) {
        return true;
      }
    }
    return n >= 2;
  }

  /**
   * `isRemovedInView` tells whether the node was removed in the view of the
   * given version vector: a deletion it knew that no undo it knew cancelled.
   */
  public isRemovedInView(vector: VersionVector): boolean {
    // A skeleton's removal was stable everywhere when it was collected; its
    // stand-in removal time is in no vector, so it is answered here.
    if (this.skelLen > 0) {
      return true;
    }
    for (const { removal, cancelledAt } of this.ledgerIndex().entries) {
      if (!ticketKnown(vector, removal)) {
        continue;
      }
      if (cancelledAt && ticketKnown(vector, cancelledAt)) {
        continue;
      }
      return true;
    }
    return false;
  }

  /**
   * `getRemovalEvents` returns the ledger as one list: every removal and
   * every cancel's ticket except `removedAt`, in ticket order. Empty when
   * `removedAt` says it all. An actor's events alternate in ticket order --
   * it removes a piece only while the piece is live in its view, and its
   * undo cancels its one uncancelled removal -- so `setRemovalEvents` can
   * tell them apart by place.
   */
  public getRemovalEvents(): Array<TimeTicket> {
    if (!this.ledgered) {
      return [];
    }
    const events: Array<TimeTicket> = [];
    for (const d of this.dels ?? []) {
      if (!this.removedAt || !d.equals(this.removedAt)) {
        events.push(d);
      }
    }
    for (const c of this.cancels ?? []) {
      events.push(c.cancelledAt);
    }
    return events.sort((a, b) => a.compare(b));
  }

  /**
   * `setRemovalEvents` rebuilds the ledger from `removedAt` and the events
   * `getRemovalEvents` returned: per actor, in ticket order, a removal then
   * the cancel of it. It throws on a repeated ticket, which would pair a
   * cancel with a removal that is not older, and when the result does not
   * reproduce `removedAt`, and leaves the node as it was.
   */
  public setRemovalEvents(events: Array<TimeTicket>): void {
    if (!events.length) {
      return;
    }
    const removedAt = this.removedAt;
    const all = events.slice();
    if (removedAt) {
      all.push(removedAt);
    }
    all.sort((a, b) => a.compare(b));
    for (let i = 1; i < all.length; i++) {
      if (all[i].equals(all[i - 1])) {
        throw new YorkieError(
          Code.ErrInvalidArgument,
          'removal events repeat a ticket',
        );
      }
    }

    const dels: Array<TimeTicket> = [];
    const cancels: Array<LedgerCancel> = [];
    const open = new Map<ActorID, TimeTicket>();
    for (const t of all) {
      const d = open.get(t.getActorID());
      if (d) {
        cancels.push({ deletion: d, cancelledAt: t });
        open.delete(t.getActorID());
        continue;
      }
      dels.push(t);
      open.set(t.getActorID(), t);
    }

    this.ledgered = true;
    this.dels = dels;
    this.cancels = cancels;
    this.index = undefined;
    this.recompute();
    if (
      !removedAt !== !this.removedAt ||
      (removedAt && !removedAt.equals(this.removedAt!))
    ) {
      this.removedAt = removedAt;
      this.ledgered = false;
      this.dels = undefined;
      this.cancels = undefined;
      this.index = undefined;
      throw new YorkieError(
        Code.ErrInvalidArgument,
        'removal events do not reproduce removed_at',
      );
    }
  }

  /**
   * `canDelete` checks if node is able to delete.
   */
  public canRemove(
    editedAt: TimeTicket,
    creationKnown: boolean,
    tombstoneKnown: boolean,
  ): boolean {
    // NOTE(hackerwins): Skip if the node's creation was not visible to this
    // operation.
    if (!creationKnown) {
      return false;
    }

    // A skeleton's removal was causally stable when it was collected, so no
    // later deletion can be one it has not seen. Its stand-in removal time is
    // not in any vector, so without this a remote deletion would read it as
    // live and record a removal on it. This matches a purged node, which a
    // deletion over it no longer finds.
    if (this.skelLen > 0) {
      return false;
    }

    if (!this.removedAt) {
      return true;
    }

    // NOTE(hackerwins): Overwrite only if prior tombstone was not known
    // (concurrent or unseen) and newer. This enables LWW for concurrent deletions.
    if (!tombstoneKnown && editedAt?.after(this.removedAt)) {
      return true;
    }
    return false;
  }

  /**
   * `canStyle` checks if node is able to set style.
   *
   * The only question is whether the styling change knew this node existed.
   * It deliberately does NOT ask whether the node has since been removed, and
   * that is a convergence requirement rather than a preference: a style is
   * applied unconditionally on the replica that issues it — the node is live
   * there, or the range would not have reached it — and can never be
   * retracted afterwards. Every other replica has to apply it too.
   *
   * Any rule that reads `removedAt` is delivery-order dependent, because
   * `removedAt` is last-writer-wins and MUTABLE: `canRemove` lets a removal
   * the node has not seen overwrite it, while a style is evaluated once, when
   * it arrives. Two clients deleting the same run concurrently plus a third
   * styling over it is enough to make replicas disagree, and no single stored
   * ticket fixes it — the replica cannot know which of the concurrent
   * removals the styler had seen. The predicate has to not depend on removal
   * state at all.
   *
   * The cost is that a style covers text the same client had already deleted,
   * invisibly, so undoing the style and then the deletion brings the text back
   * without the attributes it carried. That is the price of the replicas
   * agreeing.
   */
  public canStyle(versionVector?: VersionVector): boolean {
    if (this.skelLen > 0) {
      // Collected: there is no value to style, as a purged node had none.
      return false;
    }
    return ticketKnown(versionVector, this.getCreatedAt());
  }

  /**
   * `setRemovedAt` sets the remove time of this node. It drops the ledger.
   */
  public setRemovedAt(removedAt?: TimeTicket): void {
    this.removedAt = removedAt;
    this.ledgered = false;
    this.dels = undefined;
    this.cancels = undefined;
    this.index = undefined;
  }

  /**
   * `createRange` creates ranges of RGATreeSplitPos.
   */
  public createPosRange(): RGATreeSplitPosRange {
    return [
      RGATreeSplitPos.of(this.id, 0),
      RGATreeSplitPos.of(this.id, this.getLength()),
    ];
  }

  /**
   * `getData` returns the data of this node.
   */
  public getDataSize(): DataSize {
    const dataSize = this.value.getDataSize();

    if (this.id) {
      dataSize.meta += TimeTicketSize;
    }

    if (this.removedAt) {
      dataSize.meta += TimeTicketSize;
    }

    return dataSize;
  }

  /**
   * `deepcopy` returns a new instance of this RGATreeSplitNode without structural info.
   */
  public deepcopy(): RGATreeSplitNode<T> {
    // The value has to be copied, not shared. `Document.ensureClone` builds
    // the clone from the root, and every operation is applied to both; a
    // shared value means the clone's split or style mutates the root as a
    // side effect, and the root's own application then sees an already-mutated
    // value. Go has always copied here.
    const node = new RGATreeSplitNode(
      this.id,
      this.value.substring(0, this.value.length) as T,
      this.removedAt,
    );
    node.copyLedger(this);
    node.origin = this.origin;
    node.skelLen = this.skelLen;
    return node;
  }

  /**
   * `toTestString` returns a String containing
   * the meta data of the node for debugging purpose.
   */
  public toTestString(): string {
    if (this.skelLen > 0) {
      return `${this.id.toTestString()} skel(${this.skelLen})`;
    }
    return `${this.id.toTestString()} ${this.value ? this.value : ''}`;
  }

  private splitValue(offset: number): T {
    // Take the right part first -- `substring` deep-copies the attributes --
    // then shorten this value IN PLACE rather than replacing it, so the GC
    // pairs registered against it keep pointing at a live object.
    const right = this.value.substring(offset, this.value.length) as T;
    this.value.truncate(offset);
    return right;
  }

  /**
   * `toIDString` returns a string that can be used as an ID for this position.
   */
  public toIDString(): string {
    return this.id.toIDString();
  }
}

/**
 * `RGATreeSplit` is a block-based list with improved index-based lookup in RGA.
 * The difference from RGATreeList is that it has data on a block basis to
 * reduce the size of CRDT metadata. When an edit occurs on a block,
 * the block is split.
 *
 */
export class RGATreeSplit<T extends RGATreeSplitValue> implements GCParent {
  private head: RGATreeSplitNode<T>;
  private treeByIndex: SplayTree<T>;
  private treeByID: LLRBTree<RGATreeSplitNodeID, RGATreeSplitNode<T>>;

  /**
   * `pendingGCPairs` buffers GC pairs for garbage that no `remove()` call
   * produced: nodes created already-tombstoned by splitting a removed node,
   * and attribute tombstones duplicated by a value copy (a split, or
   * `restore` recreating a purged piece; see `bookCopiedAttrTombstones`).
   * Either would otherwise never be registered for GC. Callers that split or
   * restore nodes (`edit`, `CRDTText.setStyle`, `CRDTText.removeStyle`,
   * `restore`) drain this buffer into their returned GC pairs.
   */
  private pendingGCPairs: Array<GCPair>;
  // The empty value every skeleton shares. Built lazily.
  private skelValue?: T;

  /**
   * `cancelled` holds the nodes whose ledger has a cancel, the only ones
   * `pruneLedgers` can drop anything from. Undefined until first needed: a
   * tree decoded from a snapshot or deep-copied fills it with one scan.
   */
  private cancelled?: Set<RGATreeSplitNode<T>>;

  /**
   * `trackCancelled` records that the ledger of `node` has a cancel.
   */
  private trackCancelled(node: RGATreeSplitNode<T>): void {
    if (!this.cancelled) {
      this.scanCancelled();
    }
    this.cancelled!.add(node);
  }

  private scanCancelled(): void {
    this.cancelled = new Set();
    for (let node: RGATreeSplitNode<T> | undefined = this.head; node; ) {
      if (node.hasCancels()) {
        this.cancelled.add(node);
      }
      node = node.getNext();
    }
  }

  /**
   * `hasCancelledRemovals` reports whether any node's ledger holds a cancel.
   */
  public hasCancelledRemovals(): boolean {
    if (!this.cancelled) {
      this.scanCancelled();
    }
    return this.cancelled!.size > 0;
  }

  /**
   * `pruneLedgers` drops, from every node's ledger, the removals whose
   * cancels the given vector covers (see `RGATreeSplitNode.pruneStable`). It
   * returns how many nodes still hold a cancel.
   */
  public pruneLedgers(vector: VersionVector): number {
    if (!this.cancelled) {
      this.scanCancelled();
    }
    for (const node of this.cancelled!) {
      node.pruneStable(vector);
      if (!node.hasCancels()) {
        this.cancelled!.delete(node);
      }
    }
    return this.cancelled!.size;
  }

  constructor() {
    this.head = RGATreeSplitNode.create(InitialRGATreeSplitNodeID);
    this.treeByIndex = new SplayTree();
    this.treeByID = new LLRBTree(RGATreeSplitNode.createComparator());
    this.pendingGCPairs = [];

    this.treeByIndex.insert(this.head);
    this.treeByID.put(this.head.getID(), this.head);
  }

  /**
   * `create` creates a instance RGATreeSplit.
   */
  public static create<T extends RGATreeSplitValue>(): RGATreeSplit<T> {
    return new RGATreeSplit();
  }

  /**
   * `edit` does following steps
   * 1. split nodes with from and to
   * 2. delete between from and to
   * 3. insert a new node
   * 4. add removed node
   * @param range - range of RGATreeSplitNode
   * @param editedAt - edited time
   * @param value - value
   * @returns `[RGATreeSplitPos, Array<GCPair>, DataSize, Array<ValueChange<T>>, Array<T>]`
   */
  public edit(
    range: RGATreeSplitPosRange,
    editedAt: TimeTicket,
    value?: T,
    versionVector?: VersionVector,
    origin?: InsertOrigin,
  ): [
    RGATreeSplitPos,
    Array<GCPair>,
    DataSize,
    Array<ValueChange<T>>,
    Array<T>,
    Array<RestoreSpan<T>>,
  ] {
    const diff = { data: 0, meta: 0 };

    // 01. split nodes with from and to
    const [toLeft, diffTo, toRight] = this.findNodeWithSplit(
      range[1],
      editedAt,
    );
    const [fromLeft, diffFrom, fromRight] = this.findNodeWithSplit(
      range[0],
      editedAt,
    );

    addDataSizes(diff, diffTo, diffFrom);

    // 02. delete between from and to
    const nodesToDelete = this.findBetween(fromRight, toRight);
    const [changes, removedNodes, alreadyRemovedIDs] = this.deleteNodes(
      nodesToDelete,
      editedAt,
      versionVector,
    );

    const caretID = toRight ? toRight.getID() : toLeft.getID();
    let caretPos = RGATreeSplitPos.of(caretID, 0);

    // 03. insert a new node
    if (value) {
      // NOTE: Without an origin the node goes after `fromLeft` (legacy RGA
      // rule). With one, it goes after `fromLeft` when nothing sits between
      // its left and right origins (every local insert, and every remote
      // insert without a concurrent one at the same spot), and otherwise
      // where `integrate` places it.
      let prevNode = fromLeft;
      if (origin && !this.isUncontested(fromLeft, fromRight, origin)) {
        const [dest, diffIntegrate] = this.integrate(
          origin,
          editedAt.getActorID(),
        );
        addDataSizes(diff, diffIntegrate);
        if (dest) {
          prevNode = dest;
        }
      }

      const idx = this.posToIndex(prevNode.createPosRange()[1], true);

      const newNode = RGATreeSplitNode.create(
        RGATreeSplitNodeID.of(editedAt, 0),
        value,
      );
      newNode.setOrigin(origin);
      const inserted = this.insertAfter(prevNode, newNode);
      addDataSizes(diff, inserted.getDataSize());

      if (changes.length && changes[changes.length - 1].from === idx) {
        changes[changes.length - 1].value = value;
      } else {
        changes.push({
          actor: editedAt.getActorID(),
          from: idx,
          to: idx,
          value,
        });
      }

      caretPos = RGATreeSplitPos.of(
        inserted.getID(),
        inserted.getContentLength(),
      );
    }

    // 04. add removed node
    const pairs: Array<GCPair> = [];
    const removedValues: Array<T> = [];
    const removedSpans: Array<RestoreSpan<T>> = []; // NEW
    for (const [id, removedNode] of removedNodes) {
      // NOTE: Nodes that were already tombstoned keep their existing GC
      // pair (the pair reads `removedAt` from the node at collection
      // time); re-registering would toggle the pair off and leak the node.
      if (!alreadyRemovedIDs.has(id)) {
        pairs.push({ parent: this, child: removedNode });
      }
      removedValues.push(removedNode.getValue());
      // NEW: capture split-invariant character identities. substring(0)
      // deep-copies the value so later splits of the tombstone cannot
      // mutate the captured content.
      removedSpans.push({
        createdAt: removedNode.getCreatedAt(),
        start: removedNode.getID().getOffset(),
        end: removedNode.getID().getOffset() + removedNode.getContentLength(),
        value: removedNode.getValue().substring(0) as T,
      });
    }

    pairs.push(...this.drainPendingGCPairs());

    return [caretPos, pairs, diff, changes, removedValues, removedSpans];
  }

  /**
   * `restore` re-establishes the characters described by `spans` under
   * their ORIGINAL identities. For each span, per overlapping region:
   *   - live piece exists       → skip (idempotent; another undo restored it)
   *   - tombstoned piece exists → cancel the undoing actor's own removal; the
   *                               piece revives unless another removal holds
   *                               it
   *   - no piece exists (GC'd)  → recreate a node with the original ID
   *
   * Returns [untombstonedNodes, recreatedNodes, changes, liveDiff,
   * pendingGCPairs]. `changes` describes the revived content as insertions
   * (ascending index) so editor bindings and remote sync can be driven
   * the same way as a normal edit.
   *
   * The caller must, in order: (1) register every pair in `pendingGCPairs`
   * — fragments `splitNode` buffered while isolating a target range out of
   * a larger tombstoned piece, and attribute tombstones copied into split or
   * recreated values (see `drainPendingGCPairs`);
   * (2) unregister GC pairs for `untombstonedNodes`. Registering first is
   * required for `untombstonedNodes` entries whose node was itself one of
   * those split-born fragments (a target isolated from the interior of a
   * tombstone) — such a node was never registered under its own id, so
   * step (1) creates the entry that step (2) then correctly walks from gc
   * back to live; entries that remain tombstoned (siblings of the
   * restored target) simply stay registered. Finally, `root.acc(liveDiff)`
   * accounts the size of any nodes recreated from scratch (the GC'd-away
   * case), which `splitNode`'s buffering does not cover.
   */
  public restore(
    spans: Array<RestoreSpan<T>>,
    executedAt: TimeTicket,
    fallbackAnchor?: RGATreeSplitPos,
  ): [
    Array<RGATreeSplitNode<T>>,
    Array<RGATreeSplitNode<T>>,
    Array<ValueChange<T>>,
    DataSize,
    Array<GCPair>,
  ] {
    const untombstoned: Array<RGATreeSplitNode<T>> = [];
    const recreated: Array<RGATreeSplitNode<T>> = [];
    const liveDiff = { data: 0, meta: 0 };

    // The last node placed at the current cursor (un-tombstoned or recreated),
    // in document order. When a recreated fragment has no surviving same-
    // insertion anchor, chaining after this keeps a multi-fragment run in
    // left-to-right order instead of each fragment prepending at the same fixed
    // fallback anchor — which would rebuild the run reversed. Spans arrive in
    // document order, so this is always the recreated fragment's left neighbour.
    let chainAnchor: RGATreeSplitNode<T> | undefined;
    for (const span of spans) {
      const pieces = this.findPiecesOverlapping(
        span.createdAt,
        span.start,
        span.end,
      );

      let cursor = span.start;
      let pieceIdx = 0;
      while (cursor < span.end) {
        const piece = pieces[pieceIdx];
        const pieceStart = piece ? piece.getID().getOffset() : Infinity;
        const pieceEnd = piece
          ? pieceStart + piece.getContentLength()
          : Infinity;

        if (piece && pieceStart <= cursor) {
          // Covered by an existing piece.
          const overlapEnd = Math.min(pieceEnd, span.end);
          if (piece.isSkeleton()) {
            // A collected tombstone: its content is gone, as a purged node's
            // was. Refill it from the span in its original slot, with the
            // stand-in removal and cancel a recreated piece gets (see the gap
            // case below for why).
            const [target] = this.isolateRange(piece, cursor, overlapEnd);
            const value = span.value.substring(
              cursor - span.start,
              overlapEnd - span.start,
            ) as T;
            target.refill(value);
            const stable = TimeTicket.of(0n, 0, executedAt.getActorID());
            target.recordRemoval(stable);
            target.cancelRemoval(stable, executedAt);
            this.trackCancelled(target);
            this.bookCopiedAttrTombstones(value);
            addDataSizes(liveDiff, target.getDataSize());
            this.treeByIndex.splayNode(target);
            recreated.push(target);
            chainAnchor = target;
          } else if (piece.isRemoved()) {
            const [target] = this.isolateRange(piece, cursor, overlapEnd);
            // An undo reverses its own actor's change, so the removal it
            // cancels is the one uncancelled removal by that actor: one actor
            // cannot remove a piece already removed in its view. No other
            // removal holds it if there is none.
            let live = false;
            const d = target.uncancelledRemovalBy(executedAt.getActorID());
            if (d) {
              live = target.cancelRemoval(d, executedAt);
              this.trackCancelled(target);
            }
            if (live) {
              // Repair splay weights on the path to root (length 0 → len).
              this.treeByIndex.splayNode(target);
              untombstoned.push(target);
            }
            chainAnchor = target;
          } else {
            chainAnchor = piece;
          }
          cursor = overlapEnd;
          if (overlapEnd >= pieceEnd) {
            pieceIdx++;
          }
        } else {
          // Gap: recreate [cursor, gapEnd) with its original ID. A purged
          // piece had a single uncancelled removal, stable on every replica
          // (see `heldFromPurge`), so this restore can only be cancelling that
          // one.
          const gapEnd = Math.min(pieceStart, span.end);
          const value = span.value.substring(
            cursor - span.start,
            gapEnd - span.start,
          ) as T;
          const newNode = RGATreeSplitNode.create(
            RGATreeSplitNodeID.of(span.createdAt, cursor),
            value,
          );
          // The purged removal was known to every replica before the purge,
          // so every change that can arrive later knows it. A stand-in removal
          // by the same actor at lamport 0, which every such change's vector
          // covers, keeps that answer for `isRemovedInView`, with this cancel.
          // The pair is dropped once the cancel is known everywhere
          // (`pruneStable`); until then snapshots carry it, as Go records the
          // same.
          const stable = TimeTicket.of(0n, 0, executedAt.getActorID());
          newNode.recordRemoval(stable);
          newNode.cancelRemoval(stable, executedAt);
          this.trackCancelled(newNode);
          // `substring` deep-copied the span's attributes, tombstones
          // included, exactly as a split does. Book them here for the same
          // reason `splitNode` does -- see `bookCopiedAttrTombstones`. The
          // buffer is drained below into this call's returned pairs.
          this.bookCopiedAttrTombstones(value);
          addDataSizes(liveDiff, newNode.getDataSize());
          const prev = this.findRestoreAnchor(
            span.createdAt,
            cursor,
            gapEnd,
            executedAt,
            fallbackAnchor,
            chainAnchor,
          );
          this.insertAfter(prev, newNode);
          // `insertAfter` only maintains the physical prev/next chain. Relink
          // the separate insertion chain (`insPrev`/`insNext`) too, the same
          // way `splitNode` does, so a recreated interior fragment is not
          // skipped by the surviving same-insertion neighbours. Otherwise a
          // later edit whose boundary lands on this fragment resolves through
          // a stale insertion pointer in `findFloorNodePreferToLeft` and
          // miscomputes its offset (yorkie-team/yorkie-js-sdk#1327).
          //
          // The neighbours are the nearest surviving pieces, not just the
          // ones covering the adjacent offsets: with the piece before the gap
          // purged too, the one before that would keep pointing past the new
          // fragment, and purging it later would hand the piece after the gap
          // an `insPrev` that skips the fragment.
          if (cursor > 0) {
            const prevID = RGATreeSplitNodeID.of(span.createdAt, cursor - 1);
            const insPrev = this.treeByID.floorEntry(prevID);
            if (insPrev && insPrev.key.hasSameCreatedAt(prevID)) {
              newNode.setInsPrev(insPrev.value);
            }
          }
          const nextID = RGATreeSplitNodeID.of(span.createdAt, gapEnd);
          const insNext = this.treeByID.ceilingEntry(nextID);
          if (insNext && insNext.key.hasSameCreatedAt(nextID)) {
            newNode.setInsNext(insNext.value);
          }
          recreated.push(newNode);
          chainAnchor = newNode;
          cursor = gapEnd;
        }
      }
    }

    const pendingGCPairs = this.drainPendingGCPairs();

    // Revived nodes are now live; report each as an insertion at its final
    // index. Ascending order keeps the indices valid when applied in
    // sequence (each earlier insertion is already present).
    const changes: Array<ValueChange<T>> = [];
    for (const node of [...untombstoned, ...recreated]) {
      const [from] = this.findIndexesFromRange(node.createPosRange());
      changes.push({
        actor: executedAt.getActorID(),
        from,
        to: from,
        value: node.getValue(),
      });
    }
    changes.sort((a, b) => a.from - b.from);

    return [untombstoned, recreated, changes, liveDiff, pendingGCPairs];
  }

  /**
   * `retombstone` re-deletes the characters described by `spans` (redo of
   * an identity-preserving undo). Only pieces live in the redo's view are
   * affected: a piece removed in that view, or purged, is skipped
   * (idempotent), and a piece removed here by a deletion the redo never saw
   * records the redo without being re-tombstoned.
   *
   * Returns [pairs, changes, diff, recorded]: GCPairs for the newly
   * tombstoned nodes and the born-dead remainders the splits left behind,
   * the removed regions as deletions so editor bindings and remote sync can
   * be driven the same way as a normal edit, the metadata-size overhead from
   * splitting the (live) pieces to isolate the target range, and the pieces
   * the removal was recorded on, which the reverse has to name. The caller
   * must `root.acc(diff)` before registering `pairs`, mirroring how a normal
   * edit's boundary splits are accounted before its resulting tombstones are
   * registered. Indices are captured before each removal, so applying them
   * in emission order stays consistent.
   */
  public retombstone(
    spans: Array<RestoreSpan<T>>,
    executedAt: TimeTicket,
    versionVector?: VersionVector,
  ): [Array<GCPair>, Array<ValueChange<T>>, DataSize, Array<RestoreSpan<T>>] {
    const pairs: Array<GCPair> = [];
    const changes: Array<ValueChange<T>> = [];
    const diff = { data: 0, meta: 0 };
    // The pieces the removal was recorded on, which the reverse names: a
    // restore never reaches a piece that holds no removal by its actor.
    const recorded: Array<RestoreSpan<T>> = [];
    const record = (span: RestoreSpan<T>, target: RGATreeSplitNode<T>) => {
      const start = target.getID().getOffset();
      const end = start + target.getContentLength();
      recorded.push({
        createdAt: span.createdAt,
        start,
        end,
        value: span.value.substring(start - span.start, end - span.start) as T,
      });
    };

    for (const span of spans) {
      const pieces = this.findPiecesOverlapping(
        span.createdAt,
        span.start,
        span.end,
      );
      for (const piece of pieces) {
        if (piece.isSkeleton()) {
          // Collected, as a purged piece was absent: nothing to re-delete.
          continue;
        }
        if (piece.isRemoved()) {
          // A piece live in the redo's view but removed here by a deletion
          // the redo never saw still records the redo's deletion, so a later
          // undo of that other deletion keeps it removed.
          if (
            versionVector &&
            versionVector.size() &&
            !piece.isRemovedInView(versionVector)
          ) {
            const pieceStart = piece.getID().getOffset();
            const pieceEnd = pieceStart + piece.getContentLength();
            const [target] = this.isolateRange(
              piece,
              Math.max(pieceStart, span.start),
              Math.min(pieceEnd, span.end),
            );
            target.recordRemoval(executedAt);
            record(span, target);
          }
          continue;
        }
        // A piece live here but removed in the redo's view (by a deletion
        // whose undo the redo never saw) is left alone, as the redoing
        // replica left it: like a deletion, a redo removes only what was
        // live in its view.
        if (
          versionVector &&
          versionVector.size() &&
          piece.isRemovedInView(versionVector)
        ) {
          continue;
        }
        const pieceStart = piece.getID().getOffset();
        const pieceEnd = pieceStart + piece.getContentLength();
        const [target, splitDiff] = this.isolateRange(
          piece,
          Math.max(pieceStart, span.start),
          Math.min(pieceEnd, span.end),
        );
        // `piece` was live, so the split overhead belongs to the live
        // bucket, same as a normal edit's boundary splits.
        addDataSizes(diff, splitDiff);
        // Capture the visible range while `target` is still live.
        const [from, to] = this.findIndexesFromRange(target.createPosRange());
        target.recordRemoval(executedAt);
        record(span, target);
        this.treeByIndex.splayNode(target);
        pairs.push({ parent: this, child: target });
        if (from < to) {
          changes.push({ actor: executedAt.getActorID(), from, to });
        }
      }
    }

    // Isolating a range inside an already-tombstoned piece buffers born-dead
    // remainders, and a split books the attribute tombstones it copies. Hand
    // them to the caller with the rest: unregistered, they would never be
    // purged and their size would stay uncharged.
    pairs.push(...this.drainPendingGCPairs());

    return [pairs, changes, diff, recorded];
  }

  /**
   * `refreshSpans` re-snapshots `spans` against the content they address as it
   * stands now, returning an equivalent span set (same insertion identities,
   * same overall intervals) whose values carry the current attributes. A span
   * is captured when the edit it reverses runs, so attributes applied to the
   * run afterwards — a peer's style, which `canStyle` admits even on a
   * tombstone — are missing from it; a replica that purged the run would then
   * recreate it with the stale snapshot while a replica that still holds the
   * tombstone revives the live attributes, and the two diverge.
   *
   * Regions covered by a surviving piece (live or tombstoned) are taken from
   * that piece, so a span crossing several pieces splits into one span per
   * piece. Regions with no surviving piece keep the original snapshot — it is
   * all this replica knows about them. Read-only: the copies it makes are
   * payload, never inserted, so they book no attribute tombstones.
   */
  public refreshSpans(spans: Array<RestoreSpan<T>>): Array<RestoreSpan<T>> {
    const refreshed: Array<RestoreSpan<T>> = [];
    const fromSnapshot = (span: RestoreSpan<T>, start: number, end: number) =>
      refreshed.push({
        createdAt: span.createdAt,
        start,
        end,
        value: span.value.substring(start - span.start, end - span.start) as T,
      });

    for (const span of spans) {
      const pieces = this.findPiecesOverlapping(
        span.createdAt,
        span.start,
        span.end,
      );
      let cursor = span.start;
      for (const piece of pieces) {
        if (piece.isSkeleton()) {
          // No content left: the snapshot fills it, as it did a purged gap.
          continue;
        }
        const pieceStart = piece.getID().getOffset();
        const start = Math.max(pieceStart, cursor);
        const end = Math.min(pieceStart + piece.getContentLength(), span.end);
        if (end <= start) {
          continue;
        }
        if (start > cursor) {
          fromSnapshot(span, cursor, start);
        }
        refreshed.push({
          createdAt: span.createdAt,
          start,
          end,
          value: piece
            .getValue()
            .substring(start - pieceStart, end - pieceStart) as T,
        });
        cursor = end;
      }
      if (cursor < span.end) {
        fromSnapshot(span, cursor, span.end);
      }
    }

    return refreshed;
  }

  /**
   * `findPiecesOverlapping` collects existing nodes (live or tombstoned)
   * belonging to the insertion `createdAt` that overlap the absolute-offset
   * interval [start, end), in ascending offset order. Works by descending
   * floorEntry probes over treeByID.
   */
  private findPiecesOverlapping(
    createdAt: TimeTicket,
    start: number,
    end: number,
  ): Array<RGATreeSplitNode<T>> {
    const pieces: Array<RGATreeSplitNode<T>> = [];
    let probe = end - 1;

    while (probe >= 0) {
      const key = RGATreeSplitNodeID.of(createdAt, probe);
      const entry = this.treeByID.floorEntry(key);
      if (!entry || !entry.key.hasSameCreatedAt(key)) {
        break;
      }
      const node = entry.value;
      const nodeStart = node.getID().getOffset();
      const nodeEnd = nodeStart + node.getContentLength();
      if (nodeEnd <= start) {
        break;
      }
      if (nodeStart < end && nodeEnd > start) {
        pieces.push(node);
      }
      if (nodeStart <= start) {
        break;
      }
      probe = nodeStart - 1;
    }

    return pieces.reverse();
  }

  /**
   * `findPieceCovering` returns the node of insertion `createdAt` whose
   * absolute-offset range covers `offset`, if present.
   */
  private findPieceCovering(
    createdAt: TimeTicket,
    offset: number,
  ): RGATreeSplitNode<T> | undefined {
    const key = RGATreeSplitNodeID.of(createdAt, offset);
    const entry = this.treeByID.floorEntry(key);
    if (!entry || !entry.key.hasSameCreatedAt(key)) {
      return;
    }
    const node = entry.value;
    const nodeStart = node.getID().getOffset();
    const nodeEnd = nodeStart + node.getContentLength();
    if (nodeStart <= offset && offset < nodeEnd) {
      return node;
    }
    return;
  }

  /**
   * `findRestoreAnchor` returns the physical node to insert a recreated
   * fragment [gapStart, gapEnd) of insertion `createdAt` AFTER.
   *
   * Resolution ladder (all rules key on op-carried data + ID lookups only):
   *  (a) a piece covering gapEnd exists → directly before it
   *      (originally-adjacent successor; exact original slot)
   *  (b) nearest surviving piece of the same insertion left of gapStart
   *      → directly after it
   *  (c) nearest surviving piece of the same insertion at or after gapEnd
   *      → directly before it
   *  (d) chain anchor: the previously placed fragment of this same restore
   *      (document order) → after it, so a purged multi-fragment run is
   *      rebuilt left-to-right rather than reversed
   *  (e) the operation's fallback anchor (refined) — same exposure as the
   *      current implementation's fromPos; see design-doc caveat
   *  (f) head (deterministic last resort)
   */
  private findRestoreAnchor(
    createdAt: TimeTicket,
    gapStart: number,
    gapEnd: number,
    executedAt: TimeTicket,
    fallbackAnchor?: RGATreeSplitPos,
    chainAnchor?: RGATreeSplitNode<T>,
  ): RGATreeSplitNode<T> {
    const succ = this.findPieceCovering(createdAt, gapEnd);
    if (succ) {
      return succ.getPrev()!;
    }

    if (gapStart > 0) {
      const key = RGATreeSplitNodeID.of(createdAt, gapStart - 1);
      const entry = this.treeByID.floorEntry(key);
      if (entry && entry.key.hasSameCreatedAt(key)) {
        return entry.value;
      }
    }

    // The nearest surviving piece of the insertion after the gap, not the
    // rightmost one: anchoring before a later piece would place the gap after
    // the pieces in between, and a deletion that later spans from the gap to
    // one of them would run from its start to the end of the text.
    const afterKey = RGATreeSplitNodeID.of(createdAt, gapEnd);
    const after = this.treeByID.ceilingEntry(afterKey);
    if (after && after.key.hasSameCreatedAt(afterKey)) {
      return after.value.getPrev()!;
    }

    // (d) No surviving piece of this insertion anchors the fragment. When the
    // whole run was purged, every fragment lands here; anchoring after the
    // fragment placed just before it (document order) keeps the run forward.
    if (chainAnchor) {
      return chainAnchor;
    }

    if (fallbackAnchor) {
      try {
        const refined = this.refinePos(fallbackAnchor);
        const [left] = this.findNodeWithSplit(refined, executedAt);
        return left;
      } catch {
        // anchor fully purged — fall through to (e)
      }
    }

    return this.head;
  }

  /**
   * `isolateRange` splits `piece` so that a node exactly covering the
   * absolute-offset interval [from, to) exists, and returns it along with
   * the net metadata-size overhead the split(s) introduced.
   *
   * When `piece` is live, this overhead is a normal live-bucket cost (same
   * as any other boundary split) and the caller should `root.acc` it.
   * When `piece` is tombstoned, `splitNode` itself buffers the overhead of
   * any born-removed fragment via `pendingGCPairs` (see `drainPendingGCPairs`),
   * so the returned diff is zero in that case — the caller must still
   * drain and register those pairs.
   *
   * Requires: pieceStart <= from < to <= pieceEnd.
   */
  private isolateRange(
    piece: RGATreeSplitNode<T>,
    from: number,
    to: number,
  ): [RGATreeSplitNode<T>, DataSize] {
    const diff = { data: 0, meta: 0 };
    let node = piece;
    const nodeStart = node.getID().getOffset();
    if (from > nodeStart) {
      const [right, splitDiff] = this.splitNode(node, from - nodeStart);
      addDataSizes(diff, splitDiff);
      node = right as RGATreeSplitNode<T>;
    }
    const newStart = node.getID().getOffset();
    if (to < newStart + node.getContentLength()) {
      const [, splitDiff] = this.splitNode(node, to - newStart);
      addDataSizes(diff, splitDiff);
    }
    return [node, diff];
  }

  /**
   * `indexToPos` finds RGATreeSplitPos of given offset.
   */
  public indexToPos(idx: number): RGATreeSplitPos {
    const [node, offset] = this.treeByIndex.findForText(idx);
    const splitNode = node as RGATreeSplitNode<T>;
    return RGATreeSplitPos.of(splitNode.getID(), offset);
  }

  /**
   * `findIndexesFromRange` finds indexes based on range.
   */
  public findIndexesFromRange(range: RGATreeSplitPosRange): [number, number] {
    const [fromPos, toPos] = range;
    return [this.posToIndex(fromPos, false), this.posToIndex(toPos, true)];
  }

  /**
   * `posToIndex` converts the given position to index.
   */
  public posToIndex(pos: RGATreeSplitPos, preferToLeft: boolean): number {
    const absoluteID = pos.getAbsoluteID();
    const node = preferToLeft
      ? this.findFloorNodePreferToLeft(absoluteID)
      : this.findFloorNode(absoluteID);
    if (!node) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `the node of the given id should be found: ${absoluteID.toTestString()}`,
      );
    }
    const index = this.treeByIndex.indexOf(node!);
    const offset = node!.isRemoved()
      ? 0
      : absoluteID.getOffset() - node!.getID().getOffset();
    return index + offset;
  }

  /**
   * `findNode` finds node of given id.
   */
  public findNode(id: RGATreeSplitNodeID): RGATreeSplitNode<T> {
    return this.findFloorNode(id)!;
  }

  /**
   * `length` returns size of RGATreeSplit.
   */
  public get length(): number {
    return this.treeByIndex.length;
  }

  /**
   * `getTreeByIndex` returns the tree by index for debugging purpose.
   */
  public getTreeByIndex(): SplayTree<T> {
    return this.treeByIndex;
  }

  /**
   * `getTreeByID` returns the tree by ID for debugging purpose.
   */
  public getTreeByID(): LLRBTree<RGATreeSplitNodeID, RGATreeSplitNode<T>> {
    return this.treeByID;
  }

  /**
   * `toString` returns the string encoding of this RGATreeSplit.
   */
  public toString(): string {
    const str = [];

    for (const node of this) {
      if (!node.isRemoved()) {
        str.push(node.getValue());
      }
    }

    return str.join('');
  }

  // eslint-disable-next-line jsdoc/require-jsdoc
  public *[Symbol.iterator](): IterableIterator<RGATreeSplitNode<T>> {
    let node = this.head.getNext();
    while (node) {
      yield node;
      node = node.getNext();
    }
  }

  /**
   * `getHead` returns head of RGATreeSplitNode.
   */
  public getHead(): RGATreeSplitNode<T> {
    return this.head;
  }

  /**
   * `deepcopy` copies itself deeply.
   */
  public deepcopy(): RGATreeSplit<T> {
    const clone = new RGATreeSplit<T>();

    let node = this.head.getNext();

    let prev = clone.head;
    let current;
    while (node) {
      current = clone.insertAfter(prev, node.deepcopy());
      if (node.hasInsPrev()) {
        const insPrevNode = clone.findNode(node.getInsPrevID());
        current.setInsPrev(insPrevNode);
      }

      prev = current;
      node = node.getNext();
    }

    return clone;
  }

  /**
   * `normalizePos` converts a local position `(id, rel)` into a single
   * absolute offset measured from the head `(0:0)` of the physical chain.
   *
   * The offset is the live length of every node before the floor node of
   * `id`, plus `rel`. It used to be summed over the `prev` chain; it is now
   * read from `treeByIndex`, which holds the same sum: every node on the
   * chain is in it, in chain order, weighted by its live length (a tombstone
   * stays in with weight zero; only `purge` takes a node out, and `purge`
   * unlinks it from the chain and from `treeByID` too). Every Edit execution
   * calls this, so a linear walk here makes typing a document quadratic.
   *
   * This is a one-to-one port of the Go implementation (yorkie#2107), and the
   * result is the chain walk's result for every input, including a floor
   * lookup that lands on an earlier piece: `rel` is added in the id space of
   * the floor node, not resolved through `getAbsoluteID`. Resolution stays
   * the same on purpose - `Document.applyChangeInternal` reconciles the undo
   * stacks against these offsets, so they must agree with what every other
   * replica, Go included, computes.
   */
  public normalizePos(pos: RGATreeSplitPos): RGATreeSplitPos {
    const node = this.findFloorNode(pos.getID());
    if (!node) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `the node of the given id should be found: ${pos.getID().toTestString()}`,
      );
    }

    // A node `findFloorNode` returns is always in `treeByIndex` (see above),
    // so `indexOf` cannot answer -1 here. Go rejects it the same way.
    const index = this.treeByIndex.indexOf(node);
    if (index < 0) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `the node of the given id should be indexed: ${pos.getID().toTestString()}`,
      );
    }

    return RGATreeSplitPos.of(
      this.head.getID(),
      index + pos.getRelativeOffset(),
    );
  }

  /**
   * `refinePos` remaps the given pos to the current split chain.
   *
   * - Traverses the physical `next` chain (not `insNext`).
   * - Counts only live characters: removed nodes are treated as length 0.
   * - If the given offset exceeds the length of the current node,
   *   it moves forward through `next` nodes, subtracting lengths,
   *   until the offset fits in a live node.
   * - If it runs out of nodes, it snaps to the end of the last node.
   *
   * Example:
   *   Before split: ["12345"](1:2:0), pos = (1:2:0, rel=5)
   *   After split : ["1"](1:2:0) - ["23"](1:2:1) - ["45"](1:2:3)
   *   refinePos(pos) -> (1:2:3, rel=2)
   *
   * Example:
   *   ["12"](1:2:0, live) and pos = (1:2:0, rel=4)
   *   refinePos(pos) -> points two chars after "12",
   *   i.e. advances into following nodes, skipping removed ones.
   */
  public refinePos(pos: RGATreeSplitPos): RGATreeSplitPos {
    let node = this.findFloorNode(pos.getID());
    if (!node) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `the node of the given id should be found: ${pos.getID().toTestString()}`,
      );
    }

    let offsetInPart = pos.getRelativeOffset();
    let partLen = node.getContentLength();

    while (offsetInPart > partLen) {
      offsetInPart -= partLen;
      const next: RGATreeSplitNode<T> | undefined = node!.getNext();

      if (!next) {
        return RGATreeSplitPos.of(node.getID(), partLen);
      }

      node = next;
      partLen = node.getLength();
    }

    return RGATreeSplitPos.of(node.getID(), offsetInPart);
  }

  /**
   * `toTestString` returns a String containing the meta data of the node
   * for debugging purpose.
   */
  public toTestString(): string {
    const result = [];

    let node: RGATreeSplitNode<T> | undefined = this.head;
    while (node) {
      if (node.isRemoved()) {
        result.push(`{${node.toTestString()}}`);
      } else {
        result.push(`[${node.toTestString()}]`);
      }

      node = node.getNext();
    }

    return result.join('');
  }

  /**
   * `rightOriginOf` returns the right origin for an insert at the given
   * boundary: the ID of the character right after it, tombstones included,
   * or `undefined` at the end of the text. It must be the immediate next
   * character. Skipping a tombstone would put a node the author already knew
   * inside the window `integrate` scans, and replicas would diverge.
   */
  public rightOriginOf(
    left: RGATreeSplitNodeID,
  ): RGATreeSplitNodeID | undefined {
    const node = this.findFloorNodePreferToLeft(left);
    const rel = left.getOffset() - node.getID().getOffset();
    if (rel > 0 && rel < node.getContentLength()) {
      return RGATreeSplitNodeID.of(node.getCreatedAt(), left.getOffset());
    }
    return node.getNext()?.getID();
  }

  /**
   * `isUncontested` reports whether the node the legacy rule found ends
   * exactly at the left origin and is followed by the right origin. Then
   * nothing sits between the origins, `integrate` would return `left` too,
   * and the tree lookups can be skipped. It only compares fields.
   */
  private isUncontested(
    left: RGATreeSplitNode<T>,
    right: RGATreeSplitNode<T> | undefined,
    origin: InsertOrigin,
  ): boolean {
    const leftID = left.getID();
    if (
      !leftID.hasSameCreatedAt(origin.left) ||
      leftID.getOffset() + left.getContentLength() !== origin.left.getOffset()
    ) {
      return false;
    }
    if (!right || !origin.right) {
      return !right && !origin.right;
    }
    return right.getID().equals(origin.right);
  }

  /**
   * `findOriginRight` returns the node starting at the given right origin,
   * splitting the node that holds it if needed. It returns `undefined` when
   * the character is no longer in the chain (purged by GC).
   */
  private findOriginRight(
    id: RGATreeSplitNodeID,
    diff?: DataSize,
  ): RGATreeSplitNode<T> | undefined {
    const node = this.findFloorNode(id);
    if (!node) {
      return;
    }
    const rel = id.getOffset() - node.getID().getOffset();
    if (rel === 0) {
      return node;
    }
    if (!diff || rel < 0 || rel >= node.getContentLength()) {
      return;
    }
    const [split, splitDiff] = this.splitNode(node, rel);
    addDataSizes(diff, splitDiff);
    return split;
  }

  /**
   * `integrate` finds the node a new node with the given origin goes after,
   * when other nodes sit between its origins (FugueMax/YjsMod). Only the
   * nodes between `left` and `right` can be concurrent with the new node, so
   * only they are scanned:
   *  - a sibling (same left origin) whose right origin is before ours may
   *    still precede us, so keep scanning without moving the destination;
   *  - a sibling with the same right origin is a true tie, broken by actor;
   *  - a sibling whose right origin is after ours precedes us;
   *  - a node hanging off a node already scanned moves with its parent, so a
   *    run typed by one user is never split by another;
   *  - a node hanging off something before `left` ends the scan.
   *
   * It returns `undefined` when the right origin was purged by GC; the caller
   * then falls back to the legacy placement.
   */
  private integrate(
    origin: InsertOrigin,
    actor: ActorID,
  ): [RGATreeSplitNode<T> | undefined, DataSize] {
    const diff = { data: 0, meta: 0 };
    const left = this.findFloorNodePreferToLeft(origin.left);
    let right: RGATreeSplitNode<T> | undefined;
    if (origin.right) {
      right = this.findOriginRight(origin.right, diff);
      if (!right) {
        return [undefined, diff];
      }
    }
    if (left.getNext() === right) {
      return [left, diff];
    }

    // Rank every node in the window so right origins can be compared.
    const rank = new Map<RGATreeSplitNode<T>, number>();
    let n = left.getNext();
    while (n && n !== right) {
      rank.set(n, rank.size);
      n = n.getNext();
    }
    const rightRank = rank.size;
    const rankOf = (id?: RGATreeSplitNodeID): number => {
      if (!id) {
        return right ? Infinity : rightRank;
      }
      const node = this.findOriginRight(id);
      if (!node) {
        return Infinity;
      }
      if (node === right) {
        return rightRank;
      }
      return rank.get(node) ?? Infinity;
    };

    const scanned = new Set<RGATreeSplitNode<T>>();
    let dest = left;
    let prev = left;
    let scanning = false;
    for (let o = left.getNext(); ; o = o.getNext()) {
      if (!scanning) {
        dest = prev;
      }
      if (!o || o === right) {
        break;
      }
      prev = o;

      const oOrigin = o.getOrigin();
      if (!oOrigin) {
        break;
      }
      const oLeft = this.findFloorNode(oOrigin.left)
        ? this.findFloorNodePreferToLeft(oOrigin.left)
        : undefined;
      if (oLeft === left) {
        const cmp = rankOf(oOrigin.right) - rightRank;
        if (cmp < 0) {
          scanning = true;
        } else if (cmp === 0) {
          if (actor < o.getCreatedAt().getActorID()) {
            return [dest, diff];
          }
          scanning = false;
        } else {
          scanning = false;
        }
        scanned.add(o);
        continue;
      }
      if (!oLeft || !scanned.has(oLeft)) {
        break;
      }
      scanned.add(o);
    }
    return [dest, diff];
  }

  /**
   * `insertAfter` inserts the given node after the given previous node.
   */
  public insertAfter(
    prevNode: RGATreeSplitNode<T>,
    newNode: RGATreeSplitNode<T>,
  ): RGATreeSplitNode<T> {
    const next = prevNode.getNext();
    newNode.setPrev(prevNode);
    if (next) {
      next.setPrev(newNode);
    }

    this.treeByID.put(newNode.getID(), newNode);
    this.treeByIndex.insertAfter(prevNode, newNode);

    return newNode;
  }

  /**
   * `findNodeWithSplit` splits and return nodes of the given position.
   */
  public findNodeWithSplit(
    pos: RGATreeSplitPos,
    editedAt: TimeTicket,
  ): [RGATreeSplitNode<T>, DataSize, RGATreeSplitNode<T>] {
    const absoluteID = pos.getAbsoluteID();
    let node = this.findFloorNodePreferToLeft(absoluteID);
    const relativeOffset = absoluteID.getOffset() - node.getID().getOffset();

    const [, diff] = this.splitNode(node, relativeOffset);

    while (node.hasNext() && node.getNext()!.getCreatedAt().after(editedAt)) {
      node = node.getNext()!;
    }

    return [node, diff, node.getNext()!];
  }

  private findFloorNodePreferToLeft(
    id: RGATreeSplitNodeID,
  ): RGATreeSplitNode<T> {
    let node = this.findFloorNode(id);
    if (!node) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `the node of the given id should be found: ${id.toTestString()}`,
      );
    }

    if (id.getOffset() > 0 && node!.getID().getOffset() == id.getOffset()) {
      // NOTE: InsPrev may not be present due to GC.
      if (!node!.hasInsPrev()) {
        return node!;
      }
      node = node!.getInsPrev();
    }

    return node!;
  }

  private findFloorNode(
    id: RGATreeSplitNodeID,
  ): RGATreeSplitNode<T> | undefined {
    const entry = this.treeByID.floorEntry(id);
    if (!entry) {
      return;
    }

    if (!entry.key.equals(id) && !entry.key.hasSameCreatedAt(id)) {
      return;
    }

    return entry.value;
  }

  /**
   * `findBetween` returns nodes between fromNode and toNode.
   */
  public findBetween(
    fromNode: RGATreeSplitNode<T>,
    toNode: RGATreeSplitNode<T>,
  ): Array<RGATreeSplitNode<T>> {
    const nodes = [];

    let current: RGATreeSplitNode<T> | undefined = fromNode;
    while (current && current !== toNode) {
      nodes.push(current);
      current = current.getNext();
    }

    return nodes;
  }

  private splitNode(
    node: RGATreeSplitNode<T>,
    offset: number,
  ): [RGATreeSplitNode<T> | undefined, DataSize] {
    const diff = { data: 0, meta: 0 };

    // A negative offset is as out of range as one past the end, and is
    // rejected the same way. `findNodeWithSplit` derives the offset by
    // subtracting the node's own offset from the position's, so a position
    // resolved through an `insPrev` link into a node of a HIGHER offset --
    // which only a forged link can produce, since every link points at an
    // earlier piece of the same insertion -- arrives here negative. `split`
    // would not notice: `substring`/`truncate` clamp a negative to zero, which
    // empties the live node and inserts a duplicate of it under a rolled-back
    // id, diverging this replica from the others in silence.
    if (offset < 0 || offset > node.getContentLength()) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `offset should be between 0 and the length of the node`,
      );
    }

    if (offset === 0) {
      return [node, diff];
    } else if (offset === node.getContentLength()) {
      return [node.getNext(), diff];
    }

    if (node.isSkeleton()) {
      // A skeleton holds no value and is not in the GC registry: its
      // remainder is a skeleton too and needs neither size accounting nor a
      // GC pair.
      const splitNode = node.split(offset);
      this.treeByIndex.updateWeight(splitNode);
      this.insertAfter(node, splitNode);
      const insNext = node.getInsNext();
      if (insNext) {
        insNext.setInsPrev(splitNode);
      }
      splitNode.setInsPrev(node);
      return [splitNode, diff];
    }

    const prvSize = node.getDataSize();

    const splitNode = node.split(offset);
    if (splitNode.hasCancels()) {
      this.cancelled?.add(splitNode);
    }
    this.treeByIndex.updateWeight(splitNode);
    this.insertAfter(node, splitNode);

    const insNext = node.getInsNext();
    if (insNext) {
      insNext.setInsPrev(splitNode);
    }
    splitNode.setInsPrev(node);

    // NOTE(hackerwins): Calculate data size after node splitting:
    // Take the sum of the two split nodes(left and right) minus the size of
    // the original node. This calculates the net metadata overhead added by
    // the split operation.
    addDataSizes(diff, node.getDataSize(), splitNode.getDataSize());
    subDataSize(diff, prvSize);

    // A split deep-copies the value's attributes, so every tombstone among
    // them is duplicated under the new node.
    this.bookCopiedAttrTombstones(splitNode.getValue());

    // NOTE: A piece split off an already-tombstoned node inherits
    // `removedAt` without going through `remove()`, so no GC pair is
    // created for it in the normal deletion path. Buffer one here so it
    // can be purged; otherwise it stays in the list forever. The piece
    // was never live, so the net-new size created by the split goes
    // straight to docSize.gc when the pair is registered; report a zero
    // diff to the caller (which accounts diffs to docSize.live).
    if (splitNode.isRemoved()) {
      this.pendingGCPairs.push({
        parent: this,
        child: splitNode,
        gcOnlySize: diff,
      });
      return [splitNode, { data: 0, meta: 0 }];
    }

    return [splitNode, diff];
  }

  /**
   * `bookCopiedAttrTombstones` registers the attribute tombstones a freshly
   * copied value has just duplicated. `CRDTTextValue.substring` -- which both
   * `splitNode` and `restore`'s recreate path go through -- deep-copies the
   * whole RHT, tombstones included; it has to, or a piece would resolve a
   * concurrent style differently from a replica that never split or never lost
   * it. Each copy is a fresh piece of garbage under a new parent with no
   * registration of its own: the original's pair names the original's parent,
   * so without this the copy sits in the RHT forever, uncounted and
   * unpurgeable. The copy was never in `docSize.live` -- `getDataSize` excludes
   * removed attributes -- so `gcOnlySize` charges it to gc alone, and `purge`
   * subtracts the same size back out.
   */
  private bookCopiedAttrTombstones(value: T): void {
    this.pendingGCPairs.push(...(value.getGCPairs?.() ?? []));
  }

  /**
   * `drainPendingGCPairs` returns the GC pairs buffered in `pendingGCPairs`
   * and clears the buffer.
   */
  public drainPendingGCPairs(): Array<GCPair> {
    const pairs = this.pendingGCPairs;
    this.pendingGCPairs = [];
    return pairs;
  }

  private deleteNodes(
    candidates: Array<RGATreeSplitNode<T>>,
    editedAt: TimeTicket,
    vector?: VersionVector,
  ): [Array<ValueChange<T>>, Map<string, RGATreeSplitNode<T>>, Set<string>] {
    if (!candidates.length) {
      return [[], new Map(), new Set()];
    }

    const isLocal = vector === undefined || vector.size() === 0;

    // 01. Collect nodes to remove and keep.
    const nodesToRemove: Array<RGATreeSplitNode<T>> = [];
    const nodesToKeep: Array<RGATreeSplitNode<T> | undefined> = [];
    const [leftEdge, rightEdge] = this.findEdgesOfCandidates(candidates);
    nodesToKeep.push(leftEdge);
    for (const node of candidates) {
      // A skeleton's removal was stable everywhere when it was collected,
      // and a purged node is not there to remove: leave it alone.
      if (node.isSkeleton()) {
        nodesToKeep.push(node);
        continue;
      }
      let creationKnown = false;
      if (isLocal) {
        creationKnown = true;
      } else {
        const createdAtVV = vector?.get(node.getCreatedAt().getActorID());
        if (createdAtVV && createdAtVV >= node.getCreatedAt().getLamport()) {
          creationKnown = true;
        }
      }

      let tombstoneKnown = false;
      if (node.getRemovedAt()) {
        const removedAtVV = vector?.get(node.getRemovedAt()!.getActorID());
        if (isLocal) {
          tombstoneKnown = true;
        } else if (
          removedAtVV &&
          removedAtVV >= node.getRemovedAt()!.getLamport()
        ) {
          tombstoneKnown = true;
        }
      }

      // Once a tombstone can be cancelled by an undo, "the deleter knew the
      // node" is not enough -- the node has to have been LIVE in the
      // deleter's view. A node the deleter saw removed and an undo revived
      // here has to survive the deletion on every replica.
      const liveInView = isLocal
        ? !node.isRemoved()
        : creationKnown && !node.isRemovedInView(vector!);
      if (
        liveInView &&
        node.canRemove(editedAt, creationKnown, tombstoneKnown)
      ) {
        nodesToRemove.push(node);
      } else {
        // A node this deletion saw live but someone else removed
        // concurrently records the deletion all the same. Otherwise an undo
        // of the other deletion revives it on replicas that applied the two
        // in one order and not in the other.
        if (!isLocal && liveInView && node.isRemoved()) {
          node.recordRemoval(editedAt);
        }
        nodesToKeep.push(node);
      }
    }
    nodesToKeep.push(rightEdge);

    // 02. Create value changes with previous indexes before deletion.
    const changes = this.makeChanges(nodesToKeep, editedAt);

    // 03. Mark tombstones for removal. Nodes that were already removed
    // (concurrent LWW overwrite of an existing tombstone) are tracked
    // separately: they already have a registered GC pair, and registering
    // a second one would toggle-unregister the first.
    const removedNodes = new Map();
    const alreadyRemovedIDs = new Set<string>();
    for (const node of nodesToRemove) {
      const id = node.getID().toIDString();
      if (node.isRemoved()) {
        alreadyRemovedIDs.add(id);
      }
      removedNodes.set(id, node);
      node.recordRemoval(editedAt);
    }

    // 04. Clear the index tree of the given deletion boundaries.
    this.deleteIndexNodes(nodesToKeep);

    return [changes, removedNodes, alreadyRemovedIDs];
  }

  /**
   * `findEdgesOfCandidates` finds the edges outside `candidates`,
   * (which has not already been deleted, or be undefined but not yet implemented)
   * right edge is undefined means `candidates` contains the end of text.
   */
  private findEdgesOfCandidates(
    candidates: Array<RGATreeSplitNode<T>>,
  ): [RGATreeSplitNode<T>, RGATreeSplitNode<T> | undefined] {
    return [
      candidates[0].getPrev()!,
      candidates[candidates.length - 1].getNext(),
    ];
  }

  private makeChanges(
    boundaries: Array<RGATreeSplitNode<T> | undefined>,
    editedAt: TimeTicket,
  ): Array<ValueChange<T>> {
    const changes: Array<ValueChange<T>> = [];
    let fromIdx: number, toIdx: number;

    for (let i = 0; i < boundaries.length - 1; i++) {
      const leftBoundary = boundaries[i];
      const rightBoundary = boundaries[i + 1];

      if (leftBoundary!.getNext() == rightBoundary) {
        continue;
      }

      [fromIdx] = this.findIndexesFromRange(
        leftBoundary!.getNext()!.createPosRange(),
      );
      if (rightBoundary) {
        [, toIdx] = this.findIndexesFromRange(
          rightBoundary.getPrev()!.createPosRange(),
        );
      } else {
        toIdx = this.treeByIndex.length;
      }

      if (fromIdx < toIdx) {
        changes.push({
          actor: editedAt.getActorID(),
          from: fromIdx,
          to: toIdx,
        });
      }
    }

    return changes.reverse();
  }

  /**
   * `deleteIndexNodes` clears the index nodes of the given deletion boundaries.
   * The boundaries mean the nodes that will not be deleted in the range.
   */
  private deleteIndexNodes(
    boundaries: Array<RGATreeSplitNode<T> | undefined>,
  ): void {
    for (let i = 0; i < boundaries.length - 1; i++) {
      const leftBoundary = boundaries[i];
      const rightBoundary = boundaries[i + 1];
      // If there is no node to delete between boundaries, do notting.
      if (leftBoundary!.getNext() != rightBoundary) {
        this.treeByIndex.deleteRange(leftBoundary!, rightBoundary);
      }
    }
  }

  /**
   * `purgeBarrierAt` implements `GCParent.purgeBarrierAt`. `findNodeWithSplit` skips forward
   * while the next node was created after the incoming edit, so a tombstone
   * whose createdAt precedes the edit stops that walk. Unlinking it hands the
   * next node the stopping decision, which is only the same decision once
   * that node is causally stable.
   */
  public purgeBarrierAt(child: GCChild): TimeTicket | undefined {
    if (!(child instanceof RGATreeSplitNode)) {
      return;
    }
    return child.getNext()?.getCreatedAt();
  }

  /**
   * `purge` collects the given tombstone. The node stays in the chain as a
   * skeleton: insertion origins name nodes by ID, and `integrate` scans "the
   * nodes between the two origins", so both have to look the same on a
   * replica that collected this tombstone and on one that did not. Only the
   * content and attributes go; attribute GC pairs keep pointing at the old
   * value, so they still purge. The caller reads the node's size before.
   */
  public purge(node: RGATreeSplitNode<T>): void {
    if (node.isSkeleton()) {
      return;
    }
    this.cancelled?.delete(node);
    node.toSkeleton(node.getContentLength(), this.skeletonValue(node));
    this.mergeSkeletons(node);
  }

  /**
   * `skeletonValue` returns the empty value skeletons share.
   */
  private skeletonValue(node: RGATreeSplitNode<T>): T {
    if (!this.skelValue) {
      const v = node.getValue();
      this.skelValue = (
        v.skeletonValue ? v.skeletonValue() : v.substring(0, 0)
      ) as T;
    }
    return this.skelValue;
  }

  /**
   * `mergeSkeletons` folds a skeleton into adjacent skeletons that continue
   * the same insertion (same createdAt, contiguous offsets, adjacent in the
   * chain). How an insertion is split into pieces already differs between
   * replicas, so placement cannot depend on it; the merged node keeps the
   * leftmost piece's ID and origin, and a later lookup inside it splits it
   * again.
   */
  private mergeSkeletons(node: RGATreeSplitNode<T>): void {
    const prev = node.getPrev();
    if (prev && this.canMergeSkeletons(prev, node)) {
      this.absorbSkeleton(prev, node);
      node = prev;
    }
    const next = node.getNext();
    if (next && this.canMergeSkeletons(node, next)) {
      this.absorbSkeleton(node, next);
    }
  }

  private canMergeSkeletons(
    a: RGATreeSplitNode<T>,
    b: RGATreeSplitNode<T>,
  ): boolean {
    return (
      a.isSkeleton() &&
      b.isSkeleton() &&
      a.getNext() === b &&
      b.getInsPrev() === a &&
      a.getID().hasSameCreatedAt(b.getID()) &&
      a.getID().getOffset() + a.getSkeletonLength() === b.getID().getOffset()
    );
  }

  /**
   * `absorbSkeleton` merges `b` (`a`'s next) into `a`.
   */
  private absorbSkeleton(a: RGATreeSplitNode<T>, b: RGATreeSplitNode<T>): void {
    a.growSkeleton(b.getSkeletonLength());
    this.unlink(b);
  }

  /**
   * `unlink` takes the given node out of the chain and both trees.
   */
  private unlink(node: RGATreeSplitNode<T>): void {
    this.cancelled?.delete(node);
    this.treeByIndex.delete(node);
    this.treeByID.remove(node.getID());

    const prev = node.getPrev();
    const next = node.getNext();
    const insPrev = node.getInsPrev();
    const insNext = node.getInsNext();

    if (prev) {
      prev.setNext(next);
    }
    if (next) {
      next.setPrev(prev);
    }

    node.setPrev(undefined);
    node.setNext(undefined);

    if (insPrev) {
      insPrev.setInsNext(insNext);
    }

    if (insNext) {
      insNext.setInsPrev(insPrev);
    }

    node.setInsPrev(undefined);
    node.setInsNext(undefined);
  }
}
