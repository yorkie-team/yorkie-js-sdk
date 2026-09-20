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
import { posT, timeT } from '@yorkie-js/sdk/test/helper/helper';
import { CRDTTree, CRDTTreeNode } from '@yorkie-js/sdk/src/document/crdt/tree';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';

/**
 * `toTreePos` walks up from a removed node until it finds one that is still
 * alive, dereferencing `parent` on every hop. `purge` unlinks a node by
 * clearing its own parent link and touches none of its children, so a chain
 * that ends in a purged node runs the walk off the top of the tree.
 *
 * This drives the state directly rather than through an undo, on purpose. The
 * restore path that used to produce it no longer can — `recreateFromSpan` now
 * refuses to place a node live under a tombstone — so a test that reached the
 * guard through a document-level history would stop reaching it and start
 * passing without exercising anything. The guard is defence in depth and
 * outlives the one sequence that was known to need it, so it is pinned here at
 * the level it lives at.
 *
 * Mirrors the Go test of the same name so the two SDKs fail the same way on
 * the same shape. See yorkie#2008.
 */
describe('toTreePos', function () {
  /**
   * `buildHelloTree` builds <r><p>hello</p></r>.
   */
  function buildHelloTree(): CRDTTree {
    const tree = new CRDTTree(new CRDTTreeNode(posT(), 'r'), timeT());
    tree.editT([0, 0], [new CRDTTreeNode(posT(), 'p')], 0, timeT(), timeT);
    tree.editT(
      [1, 1],
      [new CRDTTreeNode(posT(), 'text', 'hello')],
      0,
      timeT(),
      timeT,
    );
    assert.equal(tree.toXML(), /*html*/ `<r><p>hello</p></r>`);
    return tree;
  }

  it('rejects a chain ending in a purged node', function () {
    const tree = buildHelloTree();
    const p = tree.getRoot().children[0];
    const text = p.children[0];

    // Remove the whole <p>, tombstoning it and its text.
    tree.editT([0, 7], undefined, 0, timeT(), timeT);
    assert.equal(tree.toXML(), /*html*/ `<r></r>`);
    assert.isTrue(p.isRemoved);
    assert.isTrue(text.isRemoved);

    // Purge <p> while its text child is still around. Purge clears the purged
    // node's own parent link and touches none of its children, so the text
    // node keeps pointing at a <p> that no longer hangs off the root.
    tree.purge(p);
    assert.isUndefined(p.parent, 'purge unlinks the node it purges');
    assert.isDefined(text.parent, 'but leaves its children pointing at it');

    // Resolving a position anchored at the text node now walks
    // text -> <p> -> undefined. Before the guard this dereferenced undefined
    // and threw a TypeError from deep inside the walk.
    assert.throws(
      () => tree.toIndex(text, text),
      YorkieError,
      /node not found/,
    );
    try {
      tree.toIndex(text, text);
      assert.fail('expected the walk to be refused');
    } catch (err) {
      assert.equal((err as YorkieError).code, Code.ErrInvalidArgument);
    }
  });

  it('still resolves through a removed parent that has a live ancestor', function () {
    const tree = buildHelloTree();
    const p = tree.getRoot().children[0];
    const text = p.children[0];

    tree.editT([0, 7], undefined, 0, timeT(), timeT);
    assert.isTrue(text.isRemoved);

    // Nothing is purged, so the walk from the removed text node reaches the
    // live root and resolves normally.
    assert.isAtLeast(tree.toIndex(text, text), 0);
  });
});
