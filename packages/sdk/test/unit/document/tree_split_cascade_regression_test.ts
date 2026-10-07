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

// Regression scenarios for the split-sibling cascade of a deleted element
// (§4.1 of yorkie's docs/design/concurrent-merge-split.md). Each one loses text that
// nobody deleted if the cascade also runs when the delete lost the LWW of
// the element -- a tempting extra step for #1408, left out on purpose.

import { describe, it, assert } from 'vitest';
import { Document, Indexable } from '@yorkie-js/sdk/src/document/document';
import { Tree } from '@yorkie-js/sdk/src/yorkie';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';

type Doc = Document<{ t: Tree }>;
type Pack = ReturnType<typeof converter.fromChangePack<Indexable>>;

/**
 * `Replica` wraps a Document and hands out its pending changes once, so a
 * test can deliver them to other replicas in any causal order.
 */
class Replica {
  public doc: Doc;

  /**
   * `constructor` creates a replica with the given actor number.
   */
  constructor(actorNo: number) {
    this.doc = new Document('doc');
    this.doc.setActor(actorNo.toString(16).padStart(24, '0'));
  }

  /**
   * `flush` takes the pending changes through protobuf, as on the wire, and
   * acks them.
   */
  public flush(): Pack {
    const pack = converter.fromChangePack<Indexable>(
      converter.toChangePack(this.doc.createChangePack()),
    );
    const changes = pack.getChanges();
    const lastSeq = changes.length
      ? changes[changes.length - 1].getID().getClientSeq()
      : 0;
    this.doc.applyChangePack(
      ChangePack.create(
        pack.getDocumentKey(),
        Checkpoint.of(0n, lastSeq),
        false,
        [],
        InitialVersionVector,
      ),
    );
    return pack;
  }

  /**
   * `receive` applies another replica's changes.
   */
  public receive(pack: Pack): void {
    this.doc.applyChangePack(
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
   * `edit` runs one local update on the tree.
   */
  public edit(fn: (t: Tree) => void): void {
    this.doc.update((r) => fn(r.t));
  }

  /**
   * `xml` returns the tree as XML.
   */
  public xml(): string {
    return this.doc.getRoot().t.toXML();
  }
}

/**
 * `start` returns n synced replicas holding
 * <p><span>abc</span><span>de</span></p><p><span>fg</span></p>.
 */
function start(n: number): Array<Replica> {
  const rs = Array.from({ length: n }, (_, i) => new Replica(i + 1));
  rs[0].doc.update((r) => {
    r.t = new Tree({
      type: 'doc',
      children: [
        {
          type: 'p',
          children: [
            { type: 'span', children: [{ type: 'text', value: 'abc' }] },
            { type: 'span', children: [{ type: 'text', value: 'de' }] },
          ],
        },
        {
          type: 'p',
          children: [
            { type: 'span', children: [{ type: 'text', value: 'fg' }] },
          ],
        },
      ],
    });
  });
  const init = rs[0].flush();
  rs.slice(1).forEach((r) => r.receive(init));
  return rs;
}

const visibleText = (xml: string): string => xml.replace(/<[^>]*>/g, '');

// The editor's Enter right before a styled run.
const enterAtSpanStart = (t: Tree): void => {
  t.editByPath([0, 1, 0], [0, 1, 0], undefined, 1);
  t.splitByPath([0, 2]);
  t.editByPath([0, 1], [0, 2]);
};
const splitAt0DropLeft = (t: Tree): void => {
  t.editByPath([0, 1, 0], [0, 1, 0], undefined, 1);
  t.editByPath([0, 1], [0, 2]);
};

describe('split-sibling cascade keeps text the deleter did not delete', () => {
  // r1 deletes the styled span and undoes it; r2 (newer ticket) presses
  // Enter right before it. Both replicas keep "de" (they differ by an empty
  // <span>). Cascading on a lost LWW would let r1's delete tombstone r2's
  // split product holding "de" with r1's ticket; r1's undo restores only
  // what r1 knew, so "de" would stay under a tombstoned <span> on r2.
  for (const [name, op] of [
    ['Enter at span start', enterAtSpanStart],
    ['split at 0 + drop left', splitAt0DropLeft],
  ] as const) {
    it(`delete span + undo vs ${name}: "de" stays visible on both`, () => {
      const [r1, r2] = start(2);
      r1.edit((t) => t.editByPath([0, 1], [0, 2]));
      r1.doc.history.undo();
      r2.edit(op);
      const p1 = r1.flush();
      const p2 = r2.flush();
      r2.receive(p1);
      r1.receive(p2);
      assert.include(visibleText(r1.xml()), 'de', 'r1 lost "de"');
      assert.include(visibleText(r2.xml()), 'de', 'r2 lost "de"');
    });
  }

  // r1 does the #1408 shape; r2 (newer ticket) does the same and types "y"
  // at the start of its new span. Nobody deletes "de" or "y". Cascading on a
  // lost LWW would tombstone r2's product with "y" in it on r2 as well. r1
  // does not show "y": on r1, r2's product is split off a span r1 has
  // already deleted, so it is born tombstoned. That is not the cascade.
  it('Enter + type vs Enter: the typed "y" survives on the typist replica', () => {
    const [r1, r2] = start(2);
    r1.edit(splitAt0DropLeft);
    r2.edit((t) => {
      splitAt0DropLeft(t);
      t.editByPath([0, 1, 0], [0, 1, 0], { type: 'text', value: 'y' });
    });
    const p1 = r1.flush();
    const p2 = r2.flush();
    r2.receive(p1);
    r1.receive(p2);
    assert.include(visibleText(r1.xml()), 'de', `r1: ${r1.xml()}`);
    assert.include(visibleText(r2.xml()), 'yde', `r2: ${r2.xml()}`);
  });

  // No undo. r1 splits the second span in the middle with level 2 (Enter in
  // the middle of a styled run): <p>abc,d</p><p>e</p>. r2, concurrently,
  // deletes "c" and "d" across the span boundary, merging the second span
  // into the first. r3 has seen r1 and does the #1408 shape on the "d"
  // span. Nobody deleted "e" and every replica keeps it. Cascading on a lost
  // LWW would let the merge-turned-delete on r3 run through the whole chain,
  // including r1's level-2 product in the next paragraph that holds "e".
  it('Enter (level 2) vs cross-span merge vs split-at-0+drop: "e" survives', () => {
    for (const rev of [false, true]) {
      const [r1, r2, r3] = start(3);
      r1.edit((t) => t.editByPath([0, 1, 1], [0, 1, 1], undefined, 2));
      const p1 = r1.flush();
      r2.edit((t) => t.editByPath([0, 0, 2], [0, 1, 1]));
      const p2 = r2.flush();
      r3.receive(p1);
      r3.edit(splitAt0DropLeft);
      const p3 = r3.flush();
      if (rev) {
        r1.receive(p3);
        r1.receive(p2);
      } else {
        r1.receive(p2);
        r1.receive(p3);
      }
      r2.receive(p1);
      r2.receive(p3);
      r3.receive(p2);
      for (const [i, r] of [r1, r2, r3].entries()) {
        assert.include(
          visibleText(r.xml()),
          'e',
          `r${i + 1} (rev=${rev}) lost "e": ${r.xml()}`,
        );
      }
    }
  });

  // Same family, convergence: the replicas agree; cascading on a lost LWW
  // would leave r2 without "e".
  it('delete span + undo vs split-at-0+drop vs split-in-middle+drop: converge', () => {
    const [r1, r2, r3] = start(3);
    r1.edit((t) => t.editByPath([0, 1], [0, 2]));
    r1.doc.history.undo();
    const p1 = r1.flush();
    r2.edit(splitAt0DropLeft);
    const p2 = r2.flush();
    r3.receive(p1);
    r3.edit((t) => {
      t.editByPath([0, 1, 1], [0, 1, 1], undefined, 1);
      t.editByPath([0, 1], [0, 2]);
    });
    const p3 = r3.flush();
    r1.receive(p2);
    r1.receive(p3);
    r2.receive(p1);
    r2.receive(p3);
    r3.receive(p2);
    assert.equal(r2.xml(), r1.xml(), 'r2 diverged from r1');
    assert.equal(r3.xml(), r1.xml(), 'r3 diverged from r1');
  });
});
