/*
 * Copyright 2026 The Yorkie Authors. All rights reserved.
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

import { describe, it, assert } from 'vitest';
import { maxVectorOf } from '@yorkie-js/sdk/test/helper/helper';

import { Document } from '@yorkie-js/sdk/src/document/document';
import { Tree } from '@yorkie-js/sdk/src/yorkie';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import {
  CRDTTree,
  CRDTTreeNode,
  CRDTTreeNodeID,
} from '@yorkie-js/sdk/src/document/crdt/tree';
import { TimeTicket } from '@yorkie-js/sdk/src/document/time/ticket';

/**
 * The JS half of the ordering harness for `CRDTTree.recreateFromSpan`
 * (yorkie#2008, item 1b). This is a port of the Go test
 * `TestTreeRestoreAgreesOnTheTombstoneTicketAcrossDeliveryOrders`
 * (yorkie@464e3ced, pkg/document/tree_restore_ticket_test.go), and it exists
 * so the two SDKs make the SAME decision on the same history. Two SDKs that
 * decide differently diverge against each other, which is worse than the bug
 * being fixed in neither.
 *
 * The defect, now fixed. `recreateFromSpan` used to resolve a restored node's
 * parent by IDENTITY and never by LIVENESS: a parent that had been TOMBSTONED
 * since the node was purged still accepted it, so the node was recreated LIVE
 * under a tombstone and registered in `nodeMapByID`. The next collection
 * unlinked the parent and touched none of its children, leaving the node live,
 * registered, and reachable from nothing. "Registered implies reachable" was
 * broken, and that is what produced the #2008 crash. It is now recreated
 * ALREADY TOMBSTONED, stamped with the PARENT's `removedAt`.
 *
 * What this measures, and what it deliberately does NOT. Comparing
 * `toXML()` proves nothing here: it is identical in every delivery order
 * under every candidate, which is exactly why this survived so long. So the
 * assertions read the restored node's removedAt TICKET, off `nodeMapByID`
 * rather than off a tree walk — the orphan is a childless leaf that no
 * traversal can name, and a boolean `isRemoved` compares equal across two
 * replicas holding different tickets. `removedAt` feeds `canDelete`, so two
 * replicas disagreeing on it collect on different passes.
 *
 * On the ticket: the PARENT's `removedAt` is what the removal already wrote
 * onto every sibling it swept, so the restored node rejoins them carrying what
 * it would have carried had it never been purged. The alternative -- the
 * restoring operation's own ticket -- was built and measured on the Go side
 * and produces three different answers across these six orders. The closing
 * comment records the pre-fix baseline this test was written against.
 */

const docKey = 'tree-restore-ticket';

type TreeDoc = { t: Tree };
type Replica = Document<TreeDoc>;
type Changes = ReturnType<
  ReturnType<Replica['createChangePack']>['getChanges']
>;

// The actors. Numbered to match the Go harness so a failure can be read
// against it line for line: A authors and undoes, B removes <p> at the LOW
// ticket, C removes <p> concurrently at the HIGHER one, and the six
// permutation observers take 10..15. Disjoint ids matter — two replicas
// sharing an actor id would make their changes causally ordered instead of
// concurrent, and the scenario would quietly measure nothing.
const actorAuthorA = 1;
const actorRemoverB = 2;
const actorRemoverC = 5;
const actorObserverBase = 10;

/** `actorOf` renders an actor number as a 24-hex-digit actor id. */
function actorOf(n: number): string {
  return `0000000000000000000000${String(n).padStart(2, '0')}`;
}

/**
 * `newReplica` returns a document with a distinct actor id, so the replicas
 * here are genuinely distinct peers and the changes they produce are
 * genuinely concurrent.
 */
function newReplica(n: number): Replica {
  const doc = new Document<TreeDoc>(docKey);
  doc.setActor(actorOf(n));
  return doc;
}

/**
 * `recordChanges` drains a replica's pending local changes so they can be
 * REPLAYED into several observers in different orders. Mirrors the Go
 * harness's `recordChanges`, including its emptiness check: a step that
 * silently produced nothing — an undo that found no entry, say — would make
 * every delivery order trivially agree and the test would pass while
 * measuring nothing.
 *
 * The self-ack drops exactly the drained changes from the sender's queue, so
 * a later `recordChanges` on the same replica does not re-send them.
 */
function recordChanges(from: Replica, what: string): Changes {
  const pack = from.createChangePack();
  const changes = pack.getChanges();
  assert.isNotEmpty(changes, `${what} produced no change to deliver`);

  const lastSeq = changes[changes.length - 1].getID().getClientSeq();
  from.applyChangePack(
    ChangePack.create(
      pack.getDocumentKey(),
      Checkpoint.of(0n, lastSeq),
      false,
      [],
      InitialVersionVector,
    ),
  );
  return changes;
}

/**
 * `deliverInOrder` delivers recorded changes to a replica. The neutral
 * checkpoint (clientSeq 0) keeps the receiver's own pending local changes,
 * and `InitialVersionVector` keeps garbage collection out of the delivery —
 * collection is driven explicitly by `collect` so each scenario controls when
 * a tombstone becomes a purge.
 */
function deliverInOrder(to: Replica, changes: Changes): void {
  to.applyChangePack(
    ChangePack.create(
      docKey,
      Checkpoint.of(0n, 0),
      false,
      changes,
      InitialVersionVector,
    ),
  );
}

/** `treeOf` reaches the CRDT tree under key "t" of a replica's real root. */
function treeOf(doc: Replica): CRDTTree {
  return doc.getRootObject().get('t') as unknown as CRDTTree;
}

/**
 * `nodeByID` answers the question `nodeMapByID` answers, which is NOT the
 * question a traversal answers.
 *
 * Every assertion about a restored node has to survive the node becoming
 * unreachable — that is the defect. A tree walk loses exactly the nodes worth
 * looking at, because the orphan is a childless leaf hanging off a detached
 * subtree. `findFloorNode` is the JS analogue of the Go test's
 * `NodeMapByID.Floor`, and it is what the production position lookup uses, so
 * reading through it measures what the SDK would actually find. It only
 * matches on `createdAt`, so the offset has to be checked here.
 */
function nodeByID(doc: Replica, id: CRDTTreeNodeID): CRDTTreeNode | undefined {
  const node = treeOf(doc).findFloorNode(id);
  if (!node || !node.id.equals(id)) {
    return undefined;
  }
  return node;
}

/**
 * `tombstoneOf` renders a node's liveness as the TICKET it carries, not as a
 * boolean. Two replicas can both report `isRemoved === true` while holding
 * different `removedAt`, and `canDelete` compares the ticket, so the
 * difference decides which replica purges the node on which pass. The three
 * answers are deliberately distinct strings so a failure message says which
 * of "never recreated", "recreated live" and "recreated tombstoned at T"
 * actually happened.
 */
function tombstoneOf(doc: Replica, id: CRDTTreeNodeID): string {
  const node = nodeByID(doc, id);
  if (!node) {
    return 'absent';
  }
  if (!node.removedAt) {
    return 'live';
  }
  return node.removedAt.toTestString();
}

/** `census` returns every node a replica holds that is reachable right now. */
function census(doc: Replica): Array<CRDTTreeNode> {
  const nodes: Array<CRDTTreeNode> = [];
  treeOf(doc)
    .getIndexTree()
    .traverseAll((node) => nodes.push(node));
  return nodes;
}

/**
 * `reachableCount` counts the nodes actually hanging off the root, tombstones
 * included. Compared against `getNodeSize()` (the `nodeMapByID` population),
 * a mismatch means a registered node has no path to the root — the invariant
 * the #2008 crash came from.
 */
function reachableCount(doc: Replica): number {
  return census(doc).length;
}

/**
 * `orphanProblems` pins the property every position lookup depends on: every
 * node registered in `nodeMapByID` is reachable from the root.
 *
 * Two independent signals, because either can fire alone. The counts catch
 * any mismatch, including an orphan invisible to every traversal. The census
 * — taken while the nodes were still reachable — names the culprits.
 *
 * It RETURNS its findings rather than throwing, for the same reason the Go
 * harness uses testify's non-fatal `assert`: one run has to report every
 * divergence, not just the first one it trips on.
 */
function orphanProblems(
  doc: Replica,
  before: Array<CRDTTreeNode>,
  label: string,
): Array<string> {
  const problems: Array<string> = [];
  const tree = treeOf(doc);
  const registered = tree.getNodeSize();
  const reachable = reachableCount(doc);
  if (registered !== reachable) {
    problems.push(
      `${label}: nodeMapByID holds ${registered} nodes but only ` +
        `${reachable} are reachable from the root (xml=${tree.toXML()})`,
    );
  }

  const root = tree.getIndexTree().getRoot();
  const orphans: Array<string> = [];
  for (const node of before) {
    const held = tree.findFloorNode(node.id);
    if (held !== node || !held.id.equals(node.id)) {
      continue; // purged, or the map answers this id with someone else.
    }
    let cur: CRDTTreeNode | undefined = node;
    let found = false;
    while (cur) {
      if (cur === root) {
        found = true;
        break;
      }
      cur = cur.parent;
    }
    if (!found) {
      orphans.push(`${node.id.toTestString()} (removed=${!!node.removedAt})`);
    }
  }
  orphans.sort();
  if (orphans.length) {
    problems.push(
      `${label}: these nodes are still registered but no longer reachable ` +
        `from the root: ${orphans.join(', ')}`,
    );
  }
  return problems;
}

/**
 * `firstTicket` reads the executedAt of the first operation in a recorded
 * change slice, so the fixture can ASSERT the causal facts it depends on
 * instead of assuming them. A scenario built on "these two concurrent
 * removals carry different tickets and this one wins" measures nothing if the
 * assumption is wrong, and it would fail in a way that looks like the defect.
 */
function firstTicket(changes: Changes, what: string): TimeTicket {
  for (const change of changes) {
    for (const op of change.getOperations()) {
      return op.getExecutedAt();
    }
  }
  throw new Error(`${what} carried no operation to read a ticket from`);
}

/**
 * `ticketFixture` is one logical history with THREE concurrent changes,
 * recorded so every delivery order replays identical changes:
 *
 *   removeLow  -- B removes <p>
 *   removeHigh -- C removes <p>, concurrently, with a HIGHER ticket
 *   restore    -- A undoes its own earlier removal of "bc", concurrently
 *
 * All three are produced from the same collected setup state and none of the
 * three authors has seen either of the others, so a replica may legitimately
 * receive them in any of the six orders and a CRDT owes the same result for
 * all six.
 */
type TicketFixture = {
  setup: Changes;
  removeLow: Changes;
  removeHigh: Changes;
  restore: Changes;
  lowAt: TimeTicket;
  highAt: TimeTicket;
  /** The restored text node, named BEFORE the purge erased it. */
  textID: CRDTTreeNodeID;
  /** The <p> above it, whose tombstone the restore reads. */
  parentID: CRDTTreeNodeID;
  /**
   * The never-purged siblings "a" and "d". They are the sharpest witness in
   * the whole test: the removal that swept <p> wrote its ticket onto them,
   * so the restored node — which was purged out from between them and then
   * brought back — has to rejoin them carrying the SAME ticket.
   */
  siblingIDs: Array<CRDTTreeNodeID>;
  actors: Array<string>;
};

/** `buildTree` writes <r><p>abcd</p></r> under key "t". */
function buildTree(doc: Replica): void {
  doc.update((root) => {
    root.t = new Tree({
      type: 'r',
      children: [{ type: 'p', children: [{ type: 'text', value: 'abcd' }] }],
    });
  });
}

function newTicketFixture(): TicketFixture {
  const a = newReplica(actorAuthorA);
  const b = newReplica(actorRemoverB);
  const c = newReplica(actorRemoverC);

  // Every actor that will ever hold this document has to be in the vector,
  // observers included: a collection pass only purges what the whole cluster
  // is past, so a missing actor would silently turn every collect() here into
  // a no-op and the fixture would never reach the purged state the recreate
  // path needs.
  const actors = [actorAuthorA, actorRemoverB, actorRemoverC].map(actorOf);
  for (let i = 0; i < 6; i++) {
    actors.push(actorOf(actorObserverBase + i));
  }

  buildTree(a);
  a.update((root) => root.t.edit(2, 4), 'remove bc');
  assert.equal(a.getRoot().t.toXML(), '<r><p>ad</p></r>');

  let textID: CRDTTreeNodeID | undefined;
  let parentID: CRDTTreeNodeID | undefined;
  const siblingIDs: Array<CRDTTreeNodeID> = [];
  for (const node of census(a)) {
    if (node.isText && node.value === 'bc') {
      textID = node.id;
    } else if (node.isText && (node.value === 'a' || node.value === 'd')) {
      siblingIDs.push(node.id);
    } else if (node.type === 'p') {
      parentID = node.id;
    }
  }
  assert.isDefined(textID, 'the tombstoned "bc" should be nameable pre-purge');
  assert.isDefined(parentID, 'the enclosing <p> should be nameable');
  assert.equal(siblingIDs.length, 2, 'both never-purged siblings are named');

  const setup = recordChanges(a, 'the setup edits');

  // B and C both need the setup collected, so "bc" is PURGED on them too.
  // Otherwise their removal would merely tombstone it and A's restore would
  // take the un-tombstone path instead of the recreate path under test.
  deliverInOrder(b, setup);
  deliverInOrder(c, setup);
  for (const doc of [a, b, c]) {
    doc.garbageCollect(maxVectorOf(actors));
  }
  assert.equal(b.getRoot().t.toXML(), '<r><p>ad</p></r>');
  assert.equal(c.getRoot().t.toXML(), '<r><p>ad</p></r>');
  assert.isUndefined(
    nodeByID(a, textID!),
    'the removed text must be PURGED, not merely tombstoned — otherwise the ' +
      'undo takes the un-tombstone path and never reaches recreateFromSpan',
  );

  // Neither remover has seen the other, so the two removals are concurrent
  // and LWW decides which tombstone survives on every replica.
  b.update((root) => root.t.edit(0, 4), 'remove p');
  const removeLow = recordChanges(b, "b's removal of <p>");
  c.update((root) => root.t.edit(0, 4), 'remove p');
  const removeHigh = recordChanges(c, "c's concurrent removal of <p>");

  a.history.undo();
  const restore = recordChanges(a, "a's undo of its own text removal");

  const lowAt = firstTicket(removeLow, "b's removal");
  const highAt = firstTicket(removeHigh, "c's removal");

  return {
    setup,
    removeLow,
    removeHigh,
    restore,
    lowAt,
    highAt,
    textID: textID!,
    parentID: parentID!,
    siblingIDs,
    actors,
  };
}

/**
 * `observer` returns a replica holding the collected setup, ready to receive
 * the three concurrent changes in a chosen order.
 */
function observer(f: TicketFixture, n: number): Replica {
  const doc = newReplica(n);
  deliverInOrder(doc, f.setup);
  doc.garbageCollect(maxVectorOf(f.actors));
  assert.equal(doc.getRoot().t.toXML(), '<r><p>ad</p></r>');
  return doc;
}

// The six delivery orders of the three concurrent changes, as indices into
// the step list. Written out rather than generated: six lines that can be read
// against the scenario beat a permutation generator whose output has to be
// trusted.
const ticketOrders: Array<[number, number, number]> = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

describe('tree restore tombstone ticket across delivery orders', () => {
  it('stamps the restored node with the winning removal ticket in all six orders', () => {
    const f = newTicketFixture();
    const steps: Array<{ name: string; changes: Changes }> = [
      { name: 'removeLow', changes: f.removeLow },
      { name: 'removeHigh', changes: f.removeHigh },
      { name: 'restore', changes: f.restore },
    ];

    // The premise of the whole scenario. If the tickets came out the other way
    // round, the "later removal overwrites the parent's tombstone" step never
    // happens and the test would quietly measure nothing.
    assert.isTrue(
      f.highAt.after(f.lowAt),
      `the fixture needs c's removal to win the LWW race: low=${f.lowAt.toTestString()} high=${f.highAt.toTestString()}`,
    );

    const outcomes: Array<{
      label: string;
      doc: Replica;
      before: Array<CRDTTreeNode>;
      restored: string;
      parent: string;
      siblings: Array<string>;
      xml: string;
      registered: number;
      reachable: number;
    }> = [];

    for (let i = 0; i < ticketOrders.length; i++) {
      const order = ticketOrders[i];
      const label = order.map((idx) => steps[idx].name).join('->');
      const doc = observer(f, actorObserverBase + i);
      for (const idx of order) {
        deliverInOrder(doc, steps[idx].changes);
      }

      outcomes.push({
        label,
        doc,
        before: census(doc),
        restored: tombstoneOf(doc, f.textID),
        parent: tombstoneOf(doc, f.parentID),
        siblings: f.siblingIDs.map((id) => tombstoneOf(doc, id)),
        xml: treeOf(doc).toXML(),
        registered: treeOf(doc).getNodeSize(),
        reachable: reachableCount(doc),
      });
    }

    // The whole table, emitted unconditionally. Reading what a candidate
    // actually does with the ticket is the cheapest instrument there is, and
    // the assertions below only name the one order they trip on.
    //
    // It goes to stdout directly rather than through console.log because this
    // package's vitest config swallows console output (`onConsoleLog` returns
    // false), and it is repeated in every failure message below so the table
    // survives whatever the runner decides to show.
    const table = [
      '',
      `removals: low=${f.lowAt.toTestString()} high=${f.highAt.toTestString()}`,
      `  ${'order'.padEnd(34)} ${'restored'.padEnd(12)} ${'parent'.padEnd(
        12,
      )} ${'siblings'.padEnd(26)} ${'reg/reach'.padEnd(10)} xml`,
      ...outcomes.map(
        (o) =>
          `  ${o.label.padEnd(34)} ${o.restored.padEnd(12)} ${o.parent.padEnd(
            12,
          )} ${o.siblings.join(',').padEnd(26)} ${`${o.registered}/${
            o.reachable
          }`.padEnd(10)} ${o.xml}`,
      ),
      '',
    ].join('\n');
    process.stdout.write(table);

    const high = f.highAt.toTestString();

    // Findings are COLLECTED, not thrown, and reported as one failure at the
    // end. The Go harness uses testify's non-fatal `assert` and therefore
    // reports every divergence in a single run; a `vitest` assert throws on
    // the first one, which would hide the post-collection orphan behind the
    // ticket mismatch that precedes it. The whole point of this file is the
    // table, so the report has to be complete.
    const problems: Array<string> = [];
    const eq = (actual: string, expected: string, msg: string) => {
      if (actual !== expected) {
        problems.push(`${msg}: got ${actual}, want ${expected}`);
      }
    };

    for (const o of outcomes) {
      // The parent first. Its tombstone is pure LWW with no restore involved,
      // so a divergence here would mean the FIXTURE is what broke, and the
      // next finding's result could not be trusted.
      eq(
        o.parent,
        high,
        `[${o.label}] the parent <p> should settle on the winning removal ` +
          `ticket by plain LWW`,
      );

      // The question this file exists to answer.
      eq(
        o.restored,
        high,
        `[${o.label}] the RESTORED node's tombstone ticket should be the ` +
          `winning removal's (low=${f.lowAt.toTestString()})`,
      );

      // The sibling finding, and the sharpest one: "a" and "d" were never
      // purged, so the removal that swept <p> wrote its ticket straight onto
      // them. The restored node has to carry what it would have carried had
      // it never been purged, which is exactly that ticket.
      for (let s = 0; s < o.siblings.length; s++) {
        eq(
          o.restored,
          o.siblings[s],
          `[${o.label}] the restored node should agree with its never-purged ` +
            `sibling ${f.siblingIDs[s].toTestString()}`,
        );
      }
    }

    // Every order has to land on the same answer, stated directly rather than
    // inferred from the per-order equalities above, so a candidate that is
    // uniformly wrong is still reported as non-divergent.
    const ref = outcomes[0];
    for (const o of outcomes.slice(1)) {
      eq(
        o.restored,
        ref.restored,
        `the restored node's ticket diverged between delivery orders ` +
          `([${ref.label}] vs [${o.label}])`,
      );
      eq(
        o.xml,
        ref.xml,
        `content diverged between delivery orders ` +
          `([${ref.label}] vs [${o.label}])`,
      );
    }

    // Collection is where a divergent removedAt turns into a divergent
    // document: canDelete compares the ticket, so two replicas holding
    // different tickets purge on different passes. It is also where a node
    // recreated live under a tombstone becomes unreachable-but-registered.
    for (const o of outcomes) {
      o.doc.garbageCollect(maxVectorOf(f.actors));
    }

    const after: Array<string> = [];
    for (const o of outcomes) {
      problems.push(
        ...orphanProblems(o.doc, o.before, `[${o.label}] after collection`),
      );
      eq(
        String(o.doc.getGarbageLen()),
        '0',
        `[${o.label}] everything is causally stable, so collection must drain`,
      );
      eq(
        JSON.stringify(o.doc.getDocSize().gc),
        JSON.stringify({ data: 0, meta: 0 }),
        `[${o.label}] GC accounting must telescope to zero after collection`,
      );
      after.push(
        `  ${o.label.padEnd(34)} restored=${tombstoneOf(o.doc, f.textID).padEnd(
          12,
        )} reg/reach=${treeOf(o.doc).getNodeSize()}/${reachableCount(
          o.doc,
        )} size=${JSON.stringify(o.doc.getDocSize())}`,
      );
    }
    for (const o of outcomes.slice(1)) {
      eq(
        tombstoneOf(o.doc, f.textID),
        tombstoneOf(ref.doc, f.textID),
        `[${o.label}] the restored node's fate diverged after collection`,
      );
      eq(
        JSON.stringify(o.doc.getDocSize()),
        JSON.stringify(ref.doc.getDocSize()),
        `[${o.label}] docSize diverged from [${ref.label}] after collection`,
      );
    }

    const afterTable = ['after collection:', ...after, ''].join('\n');
    process.stdout.write(afterTable);

    if (problems.length) {
      assert.fail(
        `${problems.length} finding(s):\n` +
          problems.map((p) => `  - ${p}`).join('\n') +
          `\n${table}${afterTable}`,
      );
    }
  });
});

// Baseline measured on this branch with NO fix applied to `recreateFromSpan`,
// so the next reader can tell a real regression from the known red. 25
// findings. The two removals come out as low=4:02:0 and high=4:05:0, and the
// PARENT lands on 4:05:0 in all six orders — LWW settles the parent by itself,
// so a finding on the parent would mean the fixture broke, not the restore
// path. The never-purged siblings "a" and "d" also land on 4:05:0 in all six.
// The restored node does not:
//
//	order                             JS (this file)   Go main   Go fix
//	removeLow->removeHigh->restore    live             live      4:1:AF
//	removeLow->restore->removeHigh    4:05:0 (high)    4:1:AF    4:1:AF
//	removeHigh->removeLow->restore    live             live      4:1:AF
//	removeHigh->restore->removeLow    4:02:0 (low)     4:1:AC    4:1:AF
//	restore->removeLow->removeHigh    4:05:0 (high)    4:1:AF    4:1:AF
//	restore->removeHigh->removeLow    4:05:0 (high)    4:1:AF    4:1:AF
//
// Three different answers across six orders, and the JS column is order-for-
// order identical to the Go `main` column of
// pkg/document/tree_restore_ticket_test.go (4:1:AC is Go's low, 4:1:AF its
// high) — the same defect, decided the same way, in both SDKs.
//
// After collection the two orders where the restore arrives LAST orphan:
// registered=2, reachable=1, with the recreated node 1:01:4/1 (removed=false)
// still answered by nodeMapByID and hanging off a purged <p>, while the
// replica goes on charging live{data:4,meta:120} for content nothing can
// reach. The other four orders settle at 1/1 with live{data:0,meta:96}. That
// is a docSize divergence across delivery orders on top of the reachability
// break, and it matches the Go baseline's numbers exactly.
//
// The Go file's closing comment records the same table under the two
// candidates, including the rejected `executedAt` variant that produces three
// different tickets and breaks ranks with the never-purged siblings in 3 of 6
// orders. That is the measurement this port must not silently contradict.
