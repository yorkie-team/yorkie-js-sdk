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
import { CRDTTree, CRDTTreeNode } from '@yorkie-js/sdk/src/document/crdt/tree';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { maxVectorOf } from '@yorkie-js/sdk/test/helper/helper';

const ACTOR1 = '000000000000000000000001';
const ACTOR2 = '000000000000000000000002';

type TestDoc = Document<{ t: Tree }>;

/**
 * `treeShape` renders the tree with every node's ID, tombstones included,
 * so two replicas that only agree on XML still count as diverged.
 */
function treeShape(doc: TestDoc): string {
  const walk = (node: CRDTTreeNode): string => {
    const removed = node.isRemoved ? 'x' : '';
    if (node.isText) {
      return `${node.id.toIDString()}${removed}"${node.value}"`;
    }
    const children = node.allChildren.map(walk).join(',');
    return `${node.type}#${node.id.toIDString()}${removed}[${children}]`;
  };
  return walk((doc.getRootObject().get('t') as unknown as CRDTTree).getRoot());
}

/**
 * `exchange` hands each replica's pending changes to the other through the
 * protobuf converter, without a server.
 */
function exchange(d1: TestDoc, d2: TestDoc): void {
  const p1 = converter.fromChangePack<Indexable>(
    converter.toChangePack(d1.createChangePack()),
  );
  const p2 = converter.fromChangePack<Indexable>(
    converter.toChangePack(d2.createChangePack()),
  );
  const deliver = (to: TestDoc, p: typeof p1) =>
    to.applyChangePack(
      ChangePack.create(
        p.getDocumentKey(),
        Checkpoint.of(0n, 0),
        false,
        p.getChanges(),
        InitialVersionVector,
      ),
    );
  deliver(d2, p1);
  deliver(d1, p2);
  const ack = (d: TestDoc, p: typeof p1) => {
    const cs = p.getChanges();
    const lastSeq = cs.length ? cs[cs.length - 1].getID().getClientSeq() : 0;
    d.applyChangePack(
      ChangePack.create(
        p.getDocumentKey(),
        Checkpoint.of(0n, lastSeq),
        false,
        [],
        InitialVersionVector,
      ),
    );
  };
  ack(d1, p1);
  ack(d2, p2);
}

/**
 * `replicas` returns two synced replicas holding `<p>` with the given spans.
 * With `flip` the first replica gets the higher actor ID, so its ticket
 * wins ties.
 */
function replicas(spans: Array<string>, flip = false): [TestDoc, TestDoc] {
  const d1: TestDoc = new Document('doc');
  const d2: TestDoc = new Document('doc');
  d1.setActor(flip ? ACTOR2 : ACTOR1);
  d2.setActor(flip ? ACTOR1 : ACTOR2);
  d1.update((r) => {
    r.t = new Tree({
      type: 'doc',
      children: [
        {
          type: 'p',
          children: spans.map((value) => ({
            type: 'span',
            children: [{ type: 'text', value }],
          })),
        },
      ],
    });
  });
  exchange(d1, d2);
  return [d1, d2];
}

type Op = (t: Tree) => void;

const splitSpanAt0AndDropLeft: Op = (t) => {
  t.editByPath([0, 1, 0], [0, 1, 0], undefined, 1); // split the span at 0
  t.editByPath([0, 1], [0, 2]); // drop the empty left piece
};

const enterAtSpanStart: Op = (t) => {
  t.editByPath([0, 1, 0], [0, 1, 0], undefined, 1); // split the span at 0
  t.splitByPath([0, 2]); // split the paragraph after it
  t.editByPath([0, 1], [0, 2]); // drop the empty left piece
};

const cases: Array<{
  name: string;
  spans: Array<string>;
  // Run on the second replica and synced before the race.
  setup?: Op;
  a: Op;
  b: Op;
  // Expected converged XML; omitted means any, as long as both agree.
  want?: string;
  // One replica may keep a concurrent split product as an empty span that
  // the other tombstoned (#1408, not fixed here). Text must still agree.
  emptySpanResidue?: boolean;
  // Tombstones may sit in a different order on each side (a merge against
  // a split; main does the same). Compare shapes after GC only.
  tombstoneOrder?: boolean;
}> = [
  {
    name: 'same-boundary split at 0 + drop left piece on both sides (#1408)',
    spans: ['abc', 'de'],
    a: splitSpanAt0AndDropLeft,
    b: splitSpanAt0AndDropLeft,
    want: '<doc><p><span>abc</span><span>de</span></p></doc>',
    emptySpanResidue: true,
  },
  {
    name: 'Enter at the start of a styled run on both sides (#1408)',
    spans: ['abc', 'de'],
    a: enterAtSpanStart,
    b: enterAtSpanStart,
    want: '<doc><p><span>abc</span></p><p></p><p><span>de</span></p></doc>',
    emptySpanResidue: true,
  },
  {
    name: 'Enter on one side, split only on the other',
    spans: ['abc', 'de'],
    a: enterAtSpanStart,
    b: (t) => {
      t.editByPath([0, 1, 0], [0, 1, 0], undefined, 1);
      t.splitByPath([0, 2]);
    },
  },
  {
    name: 'split at 0 + drop left piece against a plain split at 0',
    spans: ['abc', 'de'],
    a: splitSpanAt0AndDropLeft,
    b: (t) => t.editByPath([0, 1, 0], [0, 1, 0], undefined, 1),
  },
  {
    name: 'split at different offsets + drop left piece on both sides',
    spans: ['abc', 'defg'],
    a: (t) => {
      t.editByPath([0, 1, 1], [0, 1, 1], undefined, 1);
      t.editByPath([0, 1], [0, 2]);
    },
    b: (t) => {
      t.editByPath([0, 1, 3], [0, 1, 3], undefined, 1);
      t.editByPath([0, 1], [0, 2]);
    },
    emptySpanResidue: true,
  },
  {
    name: 'split + drop left piece against deleting the whole span',
    spans: ['abc', 'de'],
    a: (t) => {
      t.editByPath([0, 1, 1], [0, 1, 1], undefined, 1);
      t.editByPath([0, 1], [0, 2]);
    },
    b: (t) => t.editByPath([0, 1], [0, 2]),
    want: '<doc><p><span>abc</span></p></doc>',
    emptySpanResidue: true,
  },
  {
    // <span>ab</span><span>cd</span>, the second a split product. One side
    // merges it back and deletes the whole; the other splits "cd". "d" was
    // inside what the deleter deleted.
    name: 'merge the split sibling back and delete, against splitting it',
    spans: ['abcd'],
    setup: (t) => t.editByPath([0, 0, 2], [0, 0, 2], undefined, 1),
    a: (t) => {
      t.editByPath([0, 0, 2], [0, 1, 0]);
      t.editByPath([0, 0], [0, 1]);
    },
    b: (t) => t.editByPath([0, 1, 1], [0, 1, 1], undefined, 1),
    want: '<doc><p></p></doc>',
    tombstoneOrder: true,
  },
  {
    // One side deletes "ab"; the other presses Enter at the start of "cd",
    // which nobody deleted.
    name: 'delete an element against Enter at the start of its split sibling',
    spans: ['abcd'],
    setup: (t) => t.editByPath([0, 0, 2], [0, 0, 2], undefined, 1),
    a: (t) => t.editByPath([0, 0], [0, 1]),
    b: (t) => {
      t.editByPath([0, 1, 0], [0, 1, 0], undefined, 1);
      t.editByPath([0, 1], [0, 2]);
    },
    want: '<doc><p><span>cd</span></p></doc>',
  },
  {
    // One side deletes both halves; the other splits "cd" and deletes "c".
    // The deleter's delete of "cd" may lose the LWW.
    name: 'delete an element and its split sibling, against splitting and deleting that sibling',
    spans: ['abcd'],
    setup: (t) => t.editByPath([0, 0, 2], [0, 0, 2], undefined, 1),
    a: (t) => t.editByPath([0, 0], [0, 2]),
    b: (t) => {
      t.editByPath([0, 1, 1], [0, 1, 1], undefined, 1);
      t.editByPath([0, 1], [0, 2]);
    },
    want: '<doc><p></p></doc>',
  },
  {
    // <span>ab</span><span>cd</span>, the second a split product the
    // second replica made beforehand. That replica splits each half again
    // while the other deletes the first half; "cd" was never in its range.
    name: 'cascade stops at a split sibling the deleter already knew',
    spans: ['abcd'],
    setup: (t) => t.editByPath([0, 0, 2], [0, 0, 2], undefined, 1),
    a: (t) => t.editByPath([0, 0], [0, 1]),
    b: (t) => {
      t.editByPath([0, 1, 1], [0, 1, 1], undefined, 1);
      t.editByPath([0, 0, 1], [0, 0, 1], undefined, 1);
    },
    want: '<doc><p><span>c</span><span>d</span></p></doc>',
  },
];

// Each case runs in both role assignments and with both actor orders, so
// either side's ticket wins the LWW once.
const EMPTY = '<span></span>';
const countEmpty = (xml: string): number => xml.split(EMPTY).length - 1;

describe('Tree split-sibling cascade of a deleted element', () => {
  for (const tc of cases) {
    for (const swap of [false, true]) {
      for (const flip of [false, true]) {
        it(`${tc.name} (swap=${swap}, flip=${flip})`, () => {
          const [d1, d2] = replicas(tc.spans, flip);
          if (tc.setup) {
            d2.update((r) => tc.setup!(r.t));
            exchange(d1, d2);
          }
          d1.update((r) => (swap ? tc.b : tc.a)(r.t));
          d2.update((r) => (swap ? tc.a : tc.b)(r.t));
          exchange(d1, d2);

          let x1 = d1.getRoot().t.toXML();
          let x2 = d2.getRoot().t.toXML();
          const residue = x1 !== x2;
          if (residue) {
            assert.isTrue(!!tc.emptySpanResidue, `XML diverged:\n${x1}\n${x2}`);
            // Exactly one empty span more on one side; nothing else.
            const [n1, n2] = [countEmpty(x1), countEmpty(x2)];
            assert.equal(
              Math.abs(n1 - n2),
              1,
              `not one empty span:\n${x1}\n${x2}`,
            );
            const keep = Math.min(n1, n2);
            const drop = (x: string, n: number) => {
              for (let i = 0; i < n - keep; i++) x = x.replace(EMPTY, '');
              return x;
            };
            x1 = drop(x1, n1);
            x2 = drop(x2, n2);
            assert.equal(x1, x2, 'diverged beyond an empty span');
          } else if (!tc.tombstoneOrder) {
            assert.equal(treeShape(d1), treeShape(d2), 'shape diverged');
          }
          if (tc.want) {
            assert.equal(x1.split(EMPTY).join(''), tc.want);
          }

          // Every tombstone the race left is collectable on both sides, and
          // what remains still agrees.
          const vv = maxVectorOf([ACTOR1, ACTOR2]);
          d1.garbageCollect(vv);
          d2.garbageCollect(vv);
          assert.equal(d1.getGarbageLen(), 0, 'garbage left on d1');
          assert.equal(d2.getGarbageLen(), 0, 'garbage left on d2');
          if (!residue) {
            assert.equal(
              treeShape(d1),
              treeShape(d2),
              'shape diverged after gc',
            );
          }
        });
      }
    }
  }
});
