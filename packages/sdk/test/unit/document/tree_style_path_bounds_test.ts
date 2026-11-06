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

  it('rejects a negative path element', () => {
    const doc = setup();
    assertInvalidArgument(() =>
      doc.update((root) => root.t.styleByPath([-1], { bold: true })),
    );
    assertInvalidArgument(() =>
      doc.update((root) => root.t.styleByPath([0, -1], { bold: true })),
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

/**
 * A path whose parent holds only text names a character offset rather than a
 * child index, so the bound is the parent's content length. The offset one
 * past the last character resolves to the parent's closing tag, which used to
 * style the parent.
 */
const initialTextXML = '<root><p>ab</p><p>cd</p></root>';

/** `setupText` builds `<root><p>ab</p><p>cd</p></root>`. */
function setupText(): Document<{ t: Tree }> {
  const doc = new Document<{ t: Tree }>('tree-style-path-bounds-text');
  doc.update((root) => {
    root.t = new Tree({
      type: 'root',
      children: [
        { type: 'p', children: [{ type: 'text', value: 'ab' }] },
        { type: 'p', children: [{ type: 'text', value: 'cd' }] },
      ],
    });
  });
  return doc;
}

describe('Tree.styleByPath with a text-only parent', () => {
  it('rejects the offset one past the last character', () => {
    const doc = setupText();
    assertInvalidArgument(() =>
      doc.update((root) => root.t.styleByPath([0, 2], { bold: true })),
    );
    assert.equal(doc.getRoot().t.toXML(), initialTextXML);
  });

  it('rejects an offset further past the last character', () => {
    const doc = setupText();
    assertInvalidArgument(() =>
      doc.update((root) => root.t.styleByPath([0, 3], { bold: true })),
    );
    assert.equal(doc.getRoot().t.toXML(), initialTextXML);
  });

  it('rejects a negative character offset', () => {
    const doc = setupText();
    assertInvalidArgument(() =>
      doc.update((root) => root.t.styleByPath([0, -1], { bold: true })),
    );
    assert.equal(doc.getRoot().t.toXML(), initialTextXML);
  });

  it('accepts an offset that names a character', () => {
    const doc = setupText();
    doc.update((root) => root.t.styleByPath([0, 0], { bold: true }));
    doc.update((root) => root.t.styleByPath([0, 1], { bold: true }));
    assert.equal(doc.getRoot().t.toXML(), initialTextXML);
  });

  it('still styles the elements themselves', () => {
    const doc = setupText();
    doc.update((root) => root.t.styleByPath([1], { bold: true }));
    assert.equal(
      doc.getRoot().t.toXML(),
      '<root><p>ab</p><p bold="true">cd</p></root>',
    );
  });
});

/**
 * Every path-taking entry point shares `IndexTree.pathToTreePos`, which only
 * bounds the upper end: a missing child stops the walk and `findTextPos`
 * compares against the content length, but a negative element passes both.
 * It used to resolve one index early instead of failing, so each entry point
 * below acted on a node the caller never named.
 */
describe('Tree path APIs with a negative path element', () => {
  it('rejects a negative element in the single-path style form', () => {
    const doc = setup();
    assertInvalidArgument(() =>
      doc.update((root) => root.t.styleByPath([0, -1], { bold: true })),
    );
    assert.equal(doc.getRoot().t.toXML(), initialXML);
  });

  it('rejects a negative element in the range style form', () => {
    const doc = setup();
    assertInvalidArgument(() =>
      doc.update((root) => root.t.styleByPath([-1], [1], { bold: true })),
    );
    assertInvalidArgument(() =>
      doc.update((root) => root.t.styleByPath([0, -1], [0, 0], { bold: true })),
    );
    assert.equal(doc.getRoot().t.toXML(), initialXML);
  });

  it('rejects a negative element in removeStyleByPath', () => {
    const doc = setup();
    doc.update((root) => root.t.styleByPath([0, 0], { bold: true }));
    const styledXML = '<root><p><t bold="true">ab</t></p><p></p></root>';
    assertInvalidArgument(() =>
      doc.update((root) => root.t.removeStyleByPath([0, -1], [0, 0], ['bold'])),
    );
    assert.equal(doc.getRoot().t.toXML(), styledXML);
  });

  it('rejects a negative element in splitByPath', () => {
    const doc = setupText();
    assertInvalidArgument(() =>
      doc.update((root) => root.t.splitByPath([0, -1])),
    );
    assert.equal(doc.getRoot().t.toXML(), initialTextXML);
  });

  it('rejects a negative element in mergeByPath', () => {
    const doc = setup();
    assertInvalidArgument(() => doc.update((root) => root.t.mergeByPath([-1])));
    assert.equal(doc.getRoot().t.toXML(), initialXML);
  });

  it('rejects a negative element in editByPath', () => {
    const doc = setupText();
    assertInvalidArgument(() =>
      doc.update((root) => root.t.editByPath([0, -1], [0, 1])),
    );
    assert.equal(doc.getRoot().t.toXML(), initialTextXML);
  });

  it('rejects a negative element in editBulkByPath', () => {
    const doc = setupText();
    assertInvalidArgument(() =>
      doc.update((root) => root.t.editBulkByPath([0, -1], [0, 1], [])),
    );
    assert.equal(doc.getRoot().t.toXML(), initialTextXML);
  });

  it('rejects a negative element in pathToIndex', () => {
    const doc = setup();
    assertInvalidArgument(() => doc.getRoot().t.pathToIndex([0, -1]));
    assertInvalidArgument(() => doc.getRoot().t.pathToIndex([-1]));
  });
});
