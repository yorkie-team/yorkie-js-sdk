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
import { Tree } from '@yorkie-js/sdk/src/document/json/tree';
import { Text } from '@yorkie-js/sdk/src/document/json/text';

/**
 * The Go SDK's `Style` takes `map[string]string` and stores the value it is
 * given; this SDK JSON-encodes it. That split is #2003, and it has two halves.
 *
 * Reading: a Go-authored `color="red"` arrives here as the three characters
 * `red`, which is not a JSON document. Parsing it unguarded threw SyntaxError
 * out of `applyChangePack` BEFORE the checkpoint advanced, so the server
 * redelivered the same change forever and the document could never be opened.
 * Snapshot load did not throw -- the raw bytes go straight into the RHT -- so
 * a client could attach successfully and then die on first render.
 *
 * Sizing: `RHTNode` charges `(len(key) + len(value)) * 2` in both SDKs, but
 * this one counted the JSON quotes AND used UTF-16 units where Go uses UTF-8
 * bytes. The gap did not even have a consistent sign -- `color="red"` made JS
 * 4 bytes heavier, `color="빨강"` made it 4 bytes lighter -- and the document
 * size limit is enforced client-side against each SDK's own accounting.
 */

/** `styleRaw` writes an attribute the way a Go peer does: value stored raw. */
function styleRawOnTree(d: Document<{ t: Tree }>, key: string, raw: string) {
  const crdt = (d as any).root.getObject().get('t');
  const p = crdt.getRoot().children[0];
  p.setAttrs({ [key]: raw }, (d as any).changeID.createTimeTicket(0));
}

function styleRawOnText(d: Document<{ k: Text }>, key: string, raw: string) {
  const crdt = (d as any).root.getObject().get('k');
  for (const node of (crdt as any).rgaTreeSplit) {
    if (!node.isRemoved() && node.getValue().length) {
      node
        .getValue()
        .setAttr(key, raw, (d as any).changeID.createTimeTicket(0));
      return;
    }
  }
  throw new Error('no live text node');
}

describe('an attribute written by a peer that stores values raw', () => {
  it('does not throw when a tree carrying it is read', () => {
    const d = new Document<{ t: Tree }>('test-doc');
    d.update((r) => {
      r.t = new Tree({
        type: 'doc',
        children: [{ type: 'p', children: [{ type: 'text', value: 'ab' }] }],
      });
    });
    styleRawOnTree(d, 'color', 'red');

    const crdt = (d as any).root.getObject().get('t');
    assert.equal(crdt.toXML(), '<doc><p color="red">ab</p></doc>');
    assert.doesNotThrow(() => d.toJSON());
    assert.doesNotThrow(() => d.toSortedJSON());
  });

  it('does not throw when a text carrying it is read', () => {
    const d = new Document<{ k: Text }>('test-doc');
    d.update((r) => {
      r.k = new Text();
      r.k.edit(0, 0, 'abcdefghij');
    });
    styleRawOnText(d, 'color', 'red');

    assert.doesNotThrow(() => d.toJSON());
    assert.doesNotThrow(() => d.toSortedJSON());
    assert.include(d.toSortedJSON(), '"color":"red"');
  });

  it('reads back as the string the peer wrote, not as a dropped key', () => {
    const d = new Document<{ t: Tree }>('test-doc');
    d.update((r) => {
      r.t = new Tree({
        type: 'doc',
        children: [{ type: 'p', children: [{ type: 'text', value: 'ab' }] }],
      });
    });
    styleRawOnTree(d, 'color', 'red');

    const node = (d.getRoot().t as any).toJSInfoForTest?.() ?? undefined;
    void node;
    assert.include((d as any).root.getObject().get('t').toXML(), 'color="red"');
  });
});

describe('attribute sizing', () => {
  const sizeOfStyled = (attrs: Record<string, unknown>) => {
    const d = new Document<{ t: Tree }>('test-doc');
    d.update((r) => {
      r.t = new Tree({
        type: 'doc',
        children: [{ type: 'p', children: [{ type: 'text', value: 'abc' }] }],
      });
    });
    const before = d.getDocSize().live.data;
    d.update((r) => r.t.styleByPath([0], [1], attrs));
    return d.getDocSize().live.data - before;
  };

  /**
   * The numbers on the right are what the Go SDK charges for the same
   * attribute: `(len(key) + len(value)) * 2` over UTF-8 bytes of the raw
   * value. #2003 reports Go 16 and JS 20 for `bold="true"`; they now agree.
   */
  it('charges the logical value in UTF-8 bytes, matching the server', () => {
    assert.equal(sizeOfStyled({ bold: 'true' }), 16, 'bold=true');
    assert.equal(sizeOfStyled({ color: 'red' }), 16, 'color=red');
    // Non-ASCII is where the old UTF-16 count reversed the sign of the gap.
    assert.equal(sizeOfStyled({ color: '빨강' }), 22, 'color=빨강');
    // A non-string keeps its JSON form on the wire, which is what Go would
    // hold as a string, so both charge the same.
    assert.equal(sizeOfStyled({ bold: true }), 16, 'bold=true (boolean)');
    assert.equal(sizeOfStyled({ size: 12 }), 12, 'size=12 (number)');
  });

  /** The typed attribute API has to keep working exactly as before. */
  it('still reads typed values back with their types', () => {
    const d = new Document<{ t: Tree }>('test-doc');
    d.update((r) => {
      r.t = new Tree({
        type: 'doc',
        children: [{ type: 'p', children: [{ type: 'text', value: 'abc' }] }],
      });
      r.t.styleByPath([0], [1], { bold: true, size: 12, name: '1' });
    });

    const json = d.toSortedJSON();
    assert.include(json, '"bold":true', 'boolean stays a boolean');
    assert.include(json, '"size":12', 'number stays a number');
    assert.include(
      json,
      '"name":"1"',
      'a string that looks like a number stays a string',
    );
  });
});
