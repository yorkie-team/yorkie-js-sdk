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
import { Document, Indexable } from '@yorkie-js/sdk/src/document/document';
import { Tree } from '@yorkie-js/sdk/src/yorkie';
import type { ElementNode } from '@yorkie-js/sdk/src/document/crdt/tree';
import { CRDTTree, CRDTTreeNode } from '@yorkie-js/sdk/src/document/crdt/tree';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { ChangePack as PbChangePack } from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';

/**
 * The set of nodes a tree style reaches used to depend on which of two
 * concurrent changes arrived first, because it was resolved in the receiving
 * replica's visible-index space. The two replicas then rendered different
 * documents, on live nodes, with no way back: neither side can retract a
 * style and garbage collection does not touch live nodes.
 *
 * Mirrors yorkie's pkg/document/tree_style_reached_set_test.go (yorkie#2038).
 * The scans reproduce Go's absolute counts: a port that matches them over the
 * same base tree has the same reached set, which is what keeps a JS client
 * agreeing with the snapshot the server builds.
 */

type TestDoc = Document<{ t: Tree }>;
type Batch = PbChangePack;

/**
 * `newActor` returns an empty document owned by the given actor.
 */
function newActor(actor: string): TestDoc {
  const doc: TestDoc = new Document('d');
  doc.setActor(actor);
  return doc;
}

/**
 * `grab` takes a document's pending local changes through the protobuf
 * converter and acknowledges them, so they can be replayed into other
 * documents in any order. The wire form is kept, and decoded afresh on every
 * `feed`: handing one decoded change to two documents would let the first
 * rewrite the version vector the second still has to read.
 */
function grab(doc: TestDoc): Batch {
  const pack = doc.createChangePack();
  const changes = pack.getChanges();
  const lastSeq = changes.length
    ? changes[changes.length - 1].getID().getClientSeq()
    : 0;
  const pb = converter.toChangePack(pack);
  doc.applyChangePack(
    ChangePack.create(
      pack.getDocumentKey(),
      Checkpoint.of(0n, lastSeq),
      false,
      [],
      InitialVersionVector,
    ),
  );
  return pb;
}

/**
 * `feed` applies a grabbed batch to the given document.
 */
function feed(doc: TestDoc, batch: Batch): void {
  const pack = converter.fromChangePack<Indexable>(batch);
  doc.applyChangePack(
    ChangePack.create(
      pack.getDocumentKey(),
      Checkpoint.of(0n, 0),
      false,
      pack.getChanges(),
      InitialVersionVector,
    ),
  );
}

/**
 * `seedBase` returns the batch that creates `root` under `t`, optionally
 * followed by a structural change both clients have already seen.
 */
function seedBase(root: ElementNode, pre?: (t: Tree) => void): Batch {
  const seed = newActor('000000000000000000000009');
  seed.update((r) => {
    r.t = new Tree(root);
  });
  if (pre) {
    seed.update((r) => pre(r.t));
  }
  return grab(seed);
}

const p = (value: string, attributes?: { [key: string]: string }) =>
  ({
    type: 'p',
    ...(attributes ? { attributes } : {}),
    children: [{ type: 'text', value }],
  }) as ElementNode;

/**
 * `styleScanBase` is `<r><p>ab</p><p>cd</p><p>ef</p></r>`, 12 wide inside
 * the root. `styleScanBoldBase` is the same with every paragraph bold, so a
 * removeStyle has something to take off.
 */
const styleScanBase = () =>
  seedBase({ type: 'r', children: [p('ab'), p('cd'), p('ef')] });
const styleScanBoldBase = () =>
  seedBase({
    type: 'r',
    children: [p('ab', { b: 'x' }), p('cd', { b: 'x' }), p('ef', { b: 'x' })],
  });

/**
 * `concurrentTreeChanges` generates one structural change and one style
 * change from the same base, on fixed actors.
 */
function concurrentTreeChanges(
  base: Batch,
  structural: (t: Tree) => void,
  style: (t: Tree) => void,
): [Batch, Batch] {
  const docA = newActor('000000000000000000000001');
  const docB = newActor('000000000000000000000002');
  feed(docA, base);
  feed(docB, base);
  docA.update((r) => structural(r.t));
  docB.update((r) => style(r.t));
  return [grab(docA), grab(docB)];
}

/**
 * `replayInto` applies the batches in the given order onto a fresh replica
 * of the base and hands the replica back.
 */
function replayInto(base: Batch, ...batches: Array<Batch>): TestDoc {
  const doc = newActor('00000000000000000000000a');
  feed(doc, base);
  for (const batch of batches) {
    feed(doc, batch);
  }
  return doc;
}

type ReplayResult = { xml: string; size: string; err: string };

/**
 * `replayOrder` reports everything two delivery orders have to agree on: the
 * rendered document and both halves of the size ledger. A style that lands on
 * a tombstone shows up only in the second.
 */
function replayOrder(base: Batch, ...batches: Array<Batch>): ReplayResult {
  try {
    const doc = replayInto(base, ...batches);
    return {
      xml: doc.getRoot().t.toXML(),
      size: `${JSON.stringify(doc.getDocSize())} gcLen=${doc.getGarbageLen()}`,
      err: '',
    };
  } catch (err) {
    return { xml: '', size: '', err: String(err) };
  }
}

describe('Tree style reached set', () => {
  // A concurrent split of the paragraph a style covers. The style range ran
  // past the paragraph's end before the split existed, so it styles the
  // paragraph; the split then has to carry that onto both halves, whichever
  // change the replica applies first.
  it('styles both halves of a concurrently split paragraph', () => {
    const base = styleScanBase();
    const [pA, pB] = concurrentTreeChanges(
      base,
      (t) => t.edit(6, 6, undefined, 1),
      (t) => t.style(5, 8, { b: 'x' }),
    );
    const ab = replayOrder(base, pA, pB);
    const ba = replayOrder(base, pB, pA);
    assert.equal(
      ba.xml,
      '<r><p>ab</p><p b="x">c</p><p b="x">d</p><p>ef</p></r>',
    );
    assert.deepEqual(ab, ba, 'split-then-style diverges');
  });

  // A concurrent merge of the two paragraphs a style spans. The style covered
  // the first paragraph's End token and the second's Start token, so both
  // carry it -- the second as a tombstone, which only the ledger shows.
  it('styles both paragraphs a concurrent merge joins', () => {
    const base = styleScanBase();
    const [pA, pB] = concurrentTreeChanges(
      base,
      (t) => t.edit(1, 5),
      (t) => t.style(1, 6, { b: 'x' }),
    );
    const ab = replayOrder(base, pA, pB);
    const ba = replayOrder(base, pB, pA);
    assert.equal(ba.xml, '<r><p b="x">cd</p><p>ef</p></r>');
    assert.deepEqual(ab, ba, 'merge-then-style diverges');
  });

  // The mirror: the merge removes the opening tag of the paragraph the style
  // range STARTS inside, so its children move into the paragraph before it.
  // The style covered only the paragraph it named, which the merge turns
  // into a tombstone, so nothing renders as styled.
  it('does not style the merge target a range start moved into', () => {
    const base = styleScanBase();
    const [pA, pB] = concurrentTreeChanges(
      base,
      (t) => t.edit(1, 5),
      (t) => t.style(6, 8, { b: 'x' }),
    );
    const ab = replayOrder(base, pA, pB);
    const ba = replayOrder(base, pB, pA);
    assert.equal(ba.xml, '<r><p>cd</p><p>ef</p></r>');
    assert.deepEqual(ab, ba, 'merge-then-style styles the merge target');
  });

  it('does not clear the merge target a range start moved into', () => {
    const base = styleScanBoldBase();
    const [pA, pB] = concurrentTreeChanges(
      base,
      (t) => t.edit(1, 5),
      (t) => t.removeStyle(6, 8, ['b']),
    );
    const ab = replayOrder(base, pA, pB);
    const ba = replayOrder(base, pB, pA);
    assert.equal(ba.xml, '<r><p b="x">cd</p><p b="x">ef</p></r>');
    assert.deepEqual(ab, ba, 'merge-then-remove-style clears the target');
  });

  it('clears both halves of a concurrently split paragraph', () => {
    const base = styleScanBoldBase();
    const [pA, pB] = concurrentTreeChanges(
      base,
      (t) => t.edit(6, 6, undefined, 1),
      (t) => t.removeStyle(5, 8, ['b']),
    );
    const ab = replayOrder(base, pA, pB);
    const ba = replayOrder(base, pB, pA);
    assert.equal(
      ba.xml,
      '<r><p b="x">ab</p><p>c</p><p>d</p><p b="x">ef</p></r>',
    );
    assert.deepEqual(ab, ba, 'split-then-remove-style diverges');
  });
});

/**
 * `ScanResult` is what a scan reports. Two orders agreeing says nothing about
 * WHICH nodes they agreed on -- styling every node, or none, converges
 * perfectly -- so the scan also counts what was reached, and how many pairs
 * could not be replayed at all.
 */
type ScanResult = {
  pairs: number;
  rendered: number;
  tombstoneOnly: number;
  errored: number;
  styledNodes: number;
  styledPairs: number;
};

/**
 * `scanDivergences` replays every (structural change, style range) pair in
 * both orders and reports what the two orders did. The style ranges are every
 * [from, to] inside the root, which is `width` wide.
 */
function scanDivergences(
  base: Batch,
  structural: Array<(t: Tree) => void>,
  style: (t: Tree, from: number, to: number) => void,
  countStyled: (xml: string) => number,
  width = 12,
): ScanResult {
  const scan: ScanResult = {
    pairs: 0,
    rendered: 0,
    tombstoneOnly: 0,
    errored: 0,
    styledNodes: 0,
    styledPairs: 0,
  };
  for (const edit of structural) {
    for (let from = 0; from <= width; from++) {
      for (let to = from; to <= width; to++) {
        scan.pairs++;
        const [pA, pB] = concurrentTreeChanges(base, edit, (t) =>
          style(t, from, to),
        );
        const ab = replayOrder(base, pA, pB);
        const ba = replayOrder(base, pB, pA);
        if (ab.err || ba.err) {
          assert.equal(ab.err, ba.err);
          scan.errored++;
        } else if (ab.xml !== ba.xml) {
          scan.rendered++;
        } else if (ab.size !== ba.size) {
          scan.tombstoneOnly++;
        }
        if (!ab.err) {
          const styled = countStyled(ab.xml);
          scan.styledNodes += styled;
          if (styled > 0) scan.styledPairs++;
        }
      }
    }
  }
  return scan;
}

/**
 * `scanTimeout` is the per-test budget an exhaustive scan gets. CI caps
 * `testTimeout` at 5s, and a scan replays thousands of pairs twice each --
 * tens of seconds once coverage instrumentation is in the way. The scan
 * bodies are synchronous, so the cap cannot interrupt one: it only turns a
 * scan that already finished, and passed, into a failure. Locally the config
 * sets no limit and this keeps it that way.
 */
const scanTimeout = process.env.CI === 'true' ? 180_000 : Infinity;

const countOf = (needle: string) => (xml: string) =>
  xml.split(needle).length - 1;
const styleRange = (t: Tree, from: number, to: number) =>
  t.style(from, to, { b: 'x' });
const removeStyleRange = (t: Tree, from: number, to: number) =>
  t.removeStyle(from, to, ['b']);

const splits = Array.from(
  { length: 11 },
  (_, i) => (t: Tree) => t.edit(i + 1, i + 1, undefined, 1),
);
const merges: Array<(t: Tree) => void> = [];
for (let from = 0; from <= 12; from++) {
  for (let to = from + 1; to <= 12; to++) {
    merges.push((t: Tree) => t.edit(from, to));
  }
}

/**
 * The exhaustive scans, with yorkie's absolute counts. Every split position
 * against every style range is closed on both the rendered document and the
 * ledger. Every deletion range against every style range is closed on the
 * rendered document; what remains are attributes on TOMBSTONES, bounded as a
 * ratchet (the version-vector-filtered index space that would close it has
 * to land on the server and here together).
 */
describe('Tree style reached set scans', () => {
  it(
    'converges split x style',
    () => {
      const scan = scanDivergences(
        styleScanBase(),
        splits,
        styleRange,
        countOf('b="x"'),
      );
      assert.deepEqual(scan, {
        pairs: 1001,
        rendered: 0,
        tombstoneOnly: 0,
        errored: 0,
        styledPairs: 759,
        styledNodes: 1862,
      });
    },
    scanTimeout,
  );

  it(
    'converges split x remove-style',
    () => {
      const scan = scanDivergences(
        styleScanBoldBase(),
        splits,
        removeStyleRange,
        countOf('<p>'),
      );
      assert.deepEqual(scan, {
        pairs: 1001,
        rendered: 0,
        tombstoneOnly: 0,
        errored: 0,
        styledPairs: 759,
        styledNodes: 1862,
      });
    },
    scanTimeout,
  );

  it(
    'converges merge x style on the rendered document',
    () => {
      const scan = scanDivergences(
        styleScanBase(),
        merges,
        styleRange,
        countOf('b="x"'),
      );
      const { tombstoneOnly, ...rest } = scan;
      assert.deepEqual(rest, {
        pairs: 7098,
        rendered: 0,
        errored: 0,
        styledPairs: 4254,
        styledNodes: 6302,
      });
      assert.isAtMost(tombstoneOnly, 1292, 'regressed on tombstone attributes');
    },
    scanTimeout,
  );

  it(
    'converges merge x remove-style on the rendered document',
    () => {
      const scan = scanDivergences(
        styleScanBoldBase(),
        merges,
        removeStyleRange,
        countOf('<p>'),
      );
      const { tombstoneOnly, ...rest } = scan;
      assert.deepEqual(rest, {
        pairs: 7098,
        rendered: 0,
        errored: 0,
        styledPairs: 4254,
        styledNodes: 6302,
      });
      assert.isAtMost(tombstoneOnly, 1292, 'regressed on tombstone attributes');
    },
    scanTimeout,
  );
});

/**
 * `liveAttrDescs` renders the attribute entries of every live element under
 * the root as sorted descriptors. `withTicket` adds the entry's update
 * ticket, which carries the identity two replicas can disagree on while
 * still rendering the same.
 */
function liveAttrDescs(doc: TestDoc, withTicket: boolean): Array<string> {
  const tree = doc.getRootObject().get('t') as unknown as CRDTTree;
  const descs: Array<string> = [];
  const walk = (node: CRDTTreeNode) => {
    for (const child of node.children) {
      if (child.isText) continue;
      for (const entry of child.attrs ?? []) {
        let desc =
          `${child.type} ${entry.getKey()}=${JSON.stringify(entry.getValue())}` +
          ` removed=${entry.isRemoved()}`;
        if (withTicket) {
          desc += ` updatedAt=${entry.getUpdatedAt().toIDString()}`;
        }
        descs.push(desc);
      }
      walk(child);
    }
  };
  walk(tree.getRoot());
  return descs.sort();
}

type ConvergenceCase = {
  name: string;
  base: ElementNode;
  pre?: (t: Tree) => void;
  a: (t: Tree) => void;
  b: (t: Tree) => void;
  want: string;
  wantAttrs?: Array<string>;
};

const twoParagraphs: ElementNode = {
  type: 'r',
  children: [p('ab'), p('cd')],
};
const threeParagraphs: ElementNode = {
  type: 'r',
  children: [p('ab'), p('cd'), p('ef')],
};
const bold = { bold: 'x' };

/**
 * The merge cases of yorkie's test/complex suite, reproduced without a
 * server. They pin what a style may NOT reach -- the interloper a merge moved
 * next to the range end, the descendants of one -- and the reached-set
 * resolution is what they consume. Mirrors yorkie's
 * TestStyleReachedSetMatchesComplexSuite.
 */
describe('Tree style reached set matches the complex suite', () => {
  const cases: Array<ConvergenceCase> = [
    {
      name: 'covering-merged-content',
      base: twoParagraphs,
      a: (t) => t.edit(0, 4),
      b: (t) => t.style(4, 8, bold),
      want: '<r><p bold="x">cd</p></r>',
    },
    {
      name: 'across-chained-merge',
      base: threeParagraphs,
      a: (t) => {
        t.edit(7, 9);
        t.edit(3, 5);
      },
      b: (t) => {
        t.edit(12, 12, { type: 'p', children: [] });
        t.style(0, 9, bold);
      },
      want: '<r><p bold="x">abcdef</p><p></p></r>',
    },
    {
      // The interloper inserted at the merged anchor stays UNSTYLED.
      name: 'after-moved-anchor',
      base: twoParagraphs,
      a: (t) => t.edit(0, 5),
      b: (t) => {
        t.edit(8, 8, { type: 'p', children: [] });
        t.style(0, 6, bold);
      },
      want: '<r><p></p>cd</r>',
    },
    {
      name: 'covers-own-insert-into-merged-range',
      base: twoParagraphs,
      a: (t) => t.edit(0, 5),
      b: (t) => {
        t.edit(5, 5, { type: 'b', children: [] });
        t.style(0, 8, bold);
      },
      want: '<r><b bold="x"></b>cd</r>',
    },
    {
      name: 'sibling-before-tombstone',
      base: {
        type: 'r',
        children: [{ type: 'b', children: [] }, p('ab'), p('cd')],
      },
      a: (t) => t.edit(2, 7),
      b: (t) => t.style(0, 8, bold),
      want: '<r><b bold="x"></b>cd</r>',
    },
    {
      name: 'skips-interloper-descendants',
      base: twoParagraphs,
      a: (t) => t.edit(0, 5),
      b: (t) => {
        t.edit(8, 8, { type: 'p', children: [] });
        t.edit(9, 9, { type: 'b', children: [] });
        t.style(0, 6, bold);
      },
      want: '<r><p><b></b></p>cd</r>',
    },
    {
      // The range ends inside the merged-away paragraph, so the interloper
      // the merge pulls next to that anchor stays out of the reached set.
      name: 'across-merged-anchor',
      base: twoParagraphs,
      a: (t) => t.edit(0, 5),
      b: (t) => {
        t.edit(8, 8, { type: 'p', children: [] });
        t.style(0, 5, bold);
      },
      want: '<r><p></p>cd</r>',
      wantAttrs: [],
    },
    {
      // The same range as a removeStyle, which must not leave an attribute
      // container behind on the interloper either.
      name: 'remove-style-across-merged-anchor',
      base: twoParagraphs,
      a: (t) => t.edit(0, 5),
      b: (t) => {
        t.edit(8, 8, { type: 'p', children: [] });
        t.removeStyle(0, 5, ['bold']);
      },
      want: '<r><p></p>cd</r>',
      wantAttrs: [],
    },
    {
      name: 'remove-style-after-moved-anchor',
      base: twoParagraphs,
      a: (t) => t.edit(0, 5),
      b: (t) => {
        t.edit(8, 8, { type: 'p', children: [] });
        t.removeStyle(0, 6, ['bold']);
      },
      want: '<r><p></p>cd</r>',
      wantAttrs: [],
    },
    {
      // <i> arrived in <p> through a merge both clients have seen, so a range
      // covering it still reaches it when a second merge lifts it into the
      // root.
      name: 'covers-earlier-merged-child',
      base: {
        type: 'r',
        children: [
          p('ab'),
          { type: 's', children: [{ type: 'i', children: [] }] },
        ],
      },
      pre: (t) => t.edit(3, 5),
      a: (t) => t.edit(0, 1),
      b: (t) => t.style(0, 5, bold),
      want: '<r>ab<i bold="x"></i></r>',
      wantAttrs: ['i bold="x" removed=false'],
    },
    {
      // The merge collapses the range, and the recovery hands back exactly
      // the writer's own insert -- which the range ended inside, so it is
      // styled.
      name: 'style-from-side-moved-anchor',
      base: twoParagraphs,
      a: (t) => t.edit(0, 5),
      b: (t) => {
        t.edit(8, 8, { type: 'p', children: [] });
        t.style(6, 9, bold);
      },
      want: '<r><p bold="x"></p>cd</r>',
      wantAttrs: ['p bold="x" removed=false'],
    },
    {
      // The removal entry that arbitrates a later setAttr must land on the
      // surviving <p> in both orders, with one identity.
      name: 'remove-style-from-side-moved-anchor',
      base: twoParagraphs,
      a: (t) => t.edit(0, 5),
      b: (t) => {
        t.edit(8, 8, { type: 'p', children: [] });
        t.removeStyle(6, 9, ['bold']);
      },
      want: '<r><p></p>cd</r>',
      wantAttrs: ['p bold="" removed=true'],
    },
    {
      // Both anchors sit inside the merged paragraph, so the resolved range
      // moves with the merge and stays ordered -- the recovery must not
      // widen it onto the writer's insert.
      name: 'style-from-side-ordered-range',
      base: twoParagraphs,
      a: (t) => t.edit(0, 5),
      b: (t) => {
        t.edit(8, 8, { type: 'p', children: [] });
        t.style(6, 7, bold);
      },
      want: '<r><p></p>cd</r>',
      wantAttrs: [],
    },
  ];

  for (const tc of cases) {
    it(tc.name, () => {
      const base = seedBase(tc.base, tc.pre);
      const [pA, pB] = concurrentTreeChanges(base, tc.a, tc.b);
      const abDoc = replayInto(base, pA, pB);
      const baDoc = replayInto(base, pB, pA);
      const abXML = abDoc.getRoot().t.toXML();
      const baXML = baDoc.getRoot().t.toXML();
      assert.equal(baXML, tc.want);
      if (tc.wantAttrs) {
        // toXML shows neither an empty attribute container nor a removal
        // tombstone, so these are read off the CRDT directly, with the entry
        // tickets included for the order comparison.
        assert.deepEqual(liveAttrDescs(baDoc, false), tc.wantAttrs);
        assert.deepEqual(
          liveAttrDescs(abDoc, true),
          liveAttrDescs(baDoc, true),
          'the two orders hold different attribute entries on live nodes',
        );
      }
      assert.equal(abXML, baXML, 'the two delivery orders render differently');
    });
  }
});

// A backwards range reaches nothing through the index form, which rejects it
// up front; the path form now does the same instead of resolving it into a
// range the boundary elements would have to judge.
describe('Tree style by path', () => {
  it('rejects a backwards range', () => {
    const doc = newActor('000000000000000000000001');
    doc.update((r) => {
      r.t = new Tree({ type: 'r', children: [p('ab'), p('cd')] });
    });
    assert.throws(
      () => doc.update((r) => r.t.styleByPath([1, 0], [0, 1], { b: 'x' })),
      'from should be less than or equal to to',
    );
    assert.throws(
      () => doc.update((r) => r.t.removeStyleByPath([1, 0], [0, 1], ['b'])),
      'from should be less than or equal to to',
    );
    doc.update((r) => r.t.styleByPath([0, 0], [1, 0], { b: 'x' }));
    assert.equal(
      doc.getRoot().t.toXML(),
      '<r><p b="x">ab</p><p b="x">cd</p></r>',
    );
  });
});

/**
 * A level-2 split of the paragraph just BEFORE a style range. yorkie's
 * complex suite covers this pair (`concurrently-split-edit-test`, `A -> B`,
 * `split-2`) and the scans above do not: they split one level of a flat
 * base. The style covered only `<p>efgh</p>`; the split carries the right
 * half of `<p>abcd</p>` into a new parent, so the traversal starting right
 * after `<p>abcd</p>` now passes that half's End token. The range never ran
 * past `<p>abcd</p>`'s end, so neither half may be styled.
 */
describe('Tree style reached set across a level-2 split before the range', () => {
  const italic = { italic: 'a' };
  const nested = (): ElementNode => ({
    type: 'r',
    children: [
      {
        type: 'p',
        children: [
          { type: 'p', children: [p('abcd', italic), p('efgh', italic)] },
          p('ijkl', italic),
        ],
      },
    ],
  });

  it('styles only the paragraph the range covered', () => {
    const base = seedBase(nested());
    const [pA, pB] = concurrentTreeChanges(
      base,
      (t) => t.edit(5, 5, undefined, 2),
      (t) => t.style(8, 14, { bold: 'aa' }),
    );
    const ab = replayOrder(base, pA, pB);
    const ba = replayOrder(base, pB, pA);
    assert.equal(
      ba.xml,
      '<r><p><p><p italic="a">ab</p></p><p><p italic="a">cd</p>' +
        '<p bold="aa" italic="a">efgh</p></p><p italic="a">ijkl</p></p></r>',
    );
    assert.deepEqual(ab, ba, 'split-then-style diverges');
  });

  it('clears only the paragraph the range covered', () => {
    const base = seedBase(nested());
    const [pA, pB] = concurrentTreeChanges(
      base,
      (t) => t.edit(5, 5, undefined, 2),
      (t) => t.removeStyle(8, 14, ['italic']),
    );
    const ab = replayOrder(base, pA, pB);
    const ba = replayOrder(base, pB, pA);
    assert.equal(
      ba.xml,
      '<r><p><p><p italic="a">ab</p></p><p><p italic="a">cd</p>' +
        '<p>efgh</p></p><p italic="a">ijkl</p></p></r>',
    );
    assert.deepEqual(ab, ba, 'split-then-remove-style diverges');
  });
});

/**
 * `nestedScanBase` is `<r><p><p><p>abcd</p><p>efgh</p></p><p>ijkl</p></p></r>`,
 * 22 wide inside the root, every paragraph carrying `attrs`. The flat scans
 * split one level of a flat tree, so a split never moves a half into a new
 * parent there; this base is where a level-2 split does.
 */
const nestedScanBase = (attrs?: { [key: string]: string }) => {
  const para = (
    ...children: Array<ElementNode | { type: 'text'; value: string }>
  ) =>
    ({
      type: 'p',
      ...(attrs ? { attributes: attrs } : {}),
      children,
    }) as ElementNode;
  const text = (value: string) => ({ type: 'text' as const, value });
  return seedBase({
    type: 'r',
    children: [
      para(para(para(text('abcd')), para(text('efgh'))), para(text('ijkl'))),
    ],
  });
};

const nestedSplits: Array<(t: Tree) => void> = [];
for (let level = 1; level <= 2; level++) {
  for (let at = 1; at <= 21; at++) {
    nestedSplits.push((t: Tree) => t.edit(at, at, undefined, level));
  }
}

/**
 * Every level-1 and level-2 split of a nested tree against every style range:
 * 42 x 276 pairs, with yorkie's counts (yorkie#2070). This family is NOT
 * closed and the rendered count is a ratchet: 241 pairs still diverge, most
 * of them a split of the element the range end is declared in, before that
 * position -- an open rule tracked in yorkie's design doc, to land in both
 * SDKs together.
 */
describe('Tree style reached set nested scans', () => {
  it(
    'bounds nested split x style',
    () => {
      const scan = scanDivergences(
        nestedScanBase(),
        nestedSplits,
        styleRange,
        countOf('b="x"'),
        22,
      );
      const { rendered, ...rest } = scan;
      assert.deepEqual(rest, {
        pairs: 11592,
        tombstoneOnly: 0,
        errored: 0,
        styledPairs: 9318,
        styledNodes: 33208,
      });
      assert.isAtMost(rendered, 241, 'regressed in the rendered document');
    },
    scanTimeout,
  );

  it(
    'bounds nested split x remove-style',
    () => {
      const scan = scanDivergences(
        nestedScanBase({ b: 'x' }),
        nestedSplits,
        removeStyleRange,
        countOf('<p>'),
        22,
      );
      const { rendered, ...rest } = scan;
      assert.deepEqual(rest, {
        pairs: 11592,
        tombstoneOnly: 0,
        errored: 0,
        styledPairs: 9318,
        styledNodes: 33208,
      });
      assert.isAtMost(rendered, 241, 'regressed in the rendered document');
    },
    scanTimeout,
  );
});
