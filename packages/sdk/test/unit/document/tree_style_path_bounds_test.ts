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

import { Document } from '@yorkie-js/sdk/src/document/document';
import { Tree } from '@yorkie-js/sdk/src/yorkie';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';

/**
 * The single-path form of `styleByPath` derives a one-index-wide range around
 * the path, so the path has to name an existing node. `pathToTreePos` is
 * laxer — it accepts the offset one past the parent's last child, because
 * that is where an insertion goes — and that offset is the parent's closing
 * tag, which used to make the style land on the parent instead of failing.
 */
const initialXML = '<root><p><t>ab</t></p><p></p></root>';

/** `setup` builds `<root><p><t>ab</t></p><p></p></root>`. */
function setup(): Document<{ t: Tree }> {
  const doc = new Document<{ t: Tree }>('tree-style-path-bounds');
  doc.update((root) => {
    root.t = new Tree({
      type: 'root',
      children: [
        {
          type: 'p',
          children: [{ type: 't', children: [{ type: 'text', value: 'ab' }] }],
        },
        { type: 'p', children: [] },
      ],
    });
  });
  return doc;
}

/** `assertInvalidArgument` asserts `fn` throws `ErrInvalidArgument`. */
function assertInvalidArgument(fn: () => void) {
  try {
    fn();
  } catch (err) {
    assert.instanceOf(err, YorkieError);
    assert.equal((err as YorkieError).code, Code.ErrInvalidArgument);
    return;
  }
  assert.fail('expected ErrInvalidArgument');
}

describe('Tree.styleByPath with a path that names no node', () => {
  it('styles the node at an existing path', () => {
    const doc = setup();
    doc.update((root) => root.t.styleByPath([0, 0], { bold: true }));
    assert.equal(
      doc.getRoot().t.toXML(),
      '<root><p><t bold="true">ab</t></p><p></p></root>',
    );
  });

  it('styles the element at a top-level path', () => {
    const doc = setup();
    doc.update((root) => root.t.styleByPath([1], { bold: true }));
    assert.equal(
      doc.getRoot().t.toXML(),
      '<root><p><t>ab</t></p><p bold="true"></p></root>',
    );
  });

  it('rejects the first child path of an empty element', () => {
    const doc = setup();
    assertInvalidArgument(() =>
      doc.update((root) => root.t.styleByPath([1, 0], { bold: true })),
    );
    assert.equal(doc.getRoot().t.toXML(), initialXML);
  });

  it('rejects the path one past the last child', () => {
    const doc = setup();
    assertInvalidArgument(() =>
      doc.update((root) => root.t.styleByPath([0, 1], { bold: true })),
    );
    assert.equal(doc.getRoot().t.toXML(), initialXML);
  });

  it('rejects the top-level path one past the last element', () => {
    const doc = setup();
    assertInvalidArgument(() =>
      doc.update((root) => root.t.styleByPath([2], { bold: true })),
    );
    assert.equal(doc.getRoot().t.toXML(), initialXML);
  });

  it('keeps rejecting paths further out of range', () => {
    const doc = setup();
    assertInvalidArgument(() =>
      doc.update((root) => root.t.styleByPath([1, 5], { bold: true })),
    );
    assertInvalidArgument(() =>
      doc.update((root) => root.t.styleByPath([0, 3], { bold: true })),
    );
    assert.equal(doc.getRoot().t.toXML(), initialXML);
  });

  it('leaves the range form alone', () => {
    const doc = setup();
    doc.update((root) => root.t.styleByPath([0], [1], { bold: true }));
    assert.equal(
      doc.getRoot().t.toXML(),
      '<root><p bold="true"><t bold="true">ab</t></p><p></p></root>',
    );
  });
});
