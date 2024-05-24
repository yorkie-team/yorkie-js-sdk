/*
 * Copyright 2024 The Yorkie Authors. All rights reserved.
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

import { CRDTArray } from '@yorkie-js-sdk/src/document/crdt/array';
import { CRDTTreeNode } from '@yorkie-js-sdk/src/document/crdt/tree';
import { MaxTimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { IndexTreeNode } from '@yorkie-js-sdk/src/util/index_tree';
import yorkie, { Tree, Text } from '@yorkie-js-sdk/src/yorkie';
import { timeT } from '@yorkie-js-sdk/test/helper/helper';
import { describe, it, assert } from 'vitest';

// `getNodeLength` returns the number of nodes in the given tree.
function getNodeLength(root: IndexTreeNode<CRDTTreeNode>) {
  let size = 0;

  size += root._children.length;

  if (root._children.length) {
    for (const child of root._children) {
      size += getNodeLength(child);
    }
  }

  return size;
}

describe('Garbage Collection', function () {
  it('should collect garbage', function () {
    const doc = new yorkie.Document<{
      1: number;
      2?: Array<number>;
      3: number;
    }>('test-doc');
    assert.equal(doc.toSortedJSON(), '{}');

    doc.update((root) => {
      root['1'] = 1;
      root['2'] = [1, 2, 3];
      root['3'] = 3;
    }, 'set 1, 2, 3');
    assert.equal(doc.toSortedJSON(), '{"1":1,"2":[1,2,3],"3":3}');

    doc.update((root) => {
      delete root['2'];
    }, 'deletes 2');
    assert.equal(doc.toSortedJSON(), '{"1":1,"3":3}');
    assert.equal(doc.getGarbageLen(), 4);
    assert.equal(doc.garbageCollect(MaxTimeTicket), 4);
    assert.equal(doc.getGarbageLen(), 0);
  });

  it('should not collect garbage if disabled', function () {
    const doc = new yorkie.Document<{
      1: number;
      2?: Array<number>;
      3: number;
    }>('test-doc', { disableGC: true });

    doc.update((root) => {
      root['1'] = 1;
      root['2'] = [1, 2, 3];
      root['3'] = 3;
    }, 'set 1, 2, 3');
    assert.equal(doc.toSortedJSON(), '{"1":1,"2":[1,2,3],"3":3}');

    doc.update((root) => {
      delete root['2'];
    }, 'deletes 2');
    assert.equal(doc.toSortedJSON(), '{"1":1,"3":3}');
    assert.equal(doc.getGarbageLen(), 4);
    assert.equal(doc.garbageCollect(MaxTimeTicket), 0);
    assert.equal(doc.getGarbageLen(), 4);
  });

  it('should collect garbage for big array', function () {
    const size = 10000;
    const doc = new yorkie.Document<{ 1?: Array<unknown> }>('test-doc');
    doc.update((root) => {
      root['1'] = Array.from(Array(size).keys());
    }, 'sets big array');

    doc.update((root) => {
      delete root['1'];
    }, 'deletes the array');

    assert.equal(doc.garbageCollect(MaxTimeTicket), size + 1);
  });

  it('should collect garbage for nested elements', function () {
    const doc = new yorkie.Document<{ list: Array<number> }>('test-doc');
    assert.equal(doc.toSortedJSON(), '{}');

    doc.update((root) => {
      root['list'] = [1, 2, 3];
    }, 'set 1, 2, 3');
    assert.equal(doc.toSortedJSON(), '{"list":[1,2,3]}');

    doc.update((root) => {
      delete root['list'][1];
    }, 'deletes 2');
    assert.equal(doc.toSortedJSON(), '{"list":[1,3]}');

    assert.equal(doc.getGarbageLen(), 1);
    assert.equal(doc.garbageCollect(MaxTimeTicket), 1);
    assert.equal(doc.getGarbageLen(), 0);

    const root = (doc.getRootObject().get('list') as CRDTArray)
      .getElements()
      .toTestString();
    const clone = (doc.getCloneRoot()!.get('list') as CRDTArray)
      .getElements()
      .toTestString();

    assert.equal(root, clone);
  });

  it('should collect garbage for text node', function () {
    const doc = new yorkie.Document<{ text: Text }>('test-doc');
    doc.update((root) => (root.text = new Text()));
    doc.update((root) => root.text.edit(0, 0, 'ABCD'));
    doc.update((root) => root.text.edit(0, 2, '12'));

    assert.equal(
      doc.getRoot().text.toTestString(),
      '[0:00:0:0 ][3:00:1:0 12]{2:00:1:0 AB}[2:00:1:2 CD]',
    );

    assert.equal(doc.getGarbageLen(), 1);
    doc.garbageCollect(MaxTimeTicket);
    assert.equal(doc.getGarbageLen(), 0);

    assert.equal(
      doc.getRoot().text.toTestString(),
      '[0:00:0:0 ][3:00:1:0 12][2:00:1:2 CD]',
    );

    doc.update((root) => root.text.edit(2, 4, ''));

    assert.equal(
      doc.getRoot().text.toTestString(),
      '[0:00:0:0 ][3:00:1:0 12]{2:00:1:2 CD}',
    );
  });

  it('should return correct gc count with already removed text node', function () {
    const doc = new yorkie.Document<{ k1: Text }>('test-doc');
    assert.equal(doc.toSortedJSON(), '{}');

    doc.update((root) => {
      root.k1 = new Text();
      root.k1.edit(0, 0, 'ab');
      root.k1.edit(0, 1, 'c');
    }, 'edit text k1');
    assert.equal(doc.toSortedJSON(), '{"k1":[{"val":"c"},{"val":"b"}]}');
    assert.equal(doc.getGarbageLen(), 1);

    doc.update((root) => {
      const text = root['k1'];
      text.edit(1, 2, 'd');
    }, 'deletes 2');
    assert.equal(doc.toSortedJSON(), '{"k1":[{"val":"c"},{"val":"d"}]}');
    assert.equal(doc.getGarbageLen(), 2);

    assert.equal(doc.garbageCollect(MaxTimeTicket), 2);
    assert.equal(doc.getGarbageLen(), 0);
  });

  it('should collect garbage for text node with attributes', function () {
    const doc = new yorkie.Document<{ k1: Text }>('test-doc');
    assert.equal(doc.toSortedJSON(), '{}');

    let expectedMessage =
      '{"k1":[{"attrs":{"b":"1"},"val":"Hello "},{"val":"mario"}]}';

    doc.update((root) => {
      root.k1 = new Text();
      root.k1.edit(0, 0, 'Hello world', { b: '1' });
      root.k1.edit(6, 11, 'mario');
      assert.equal(root.toJSON!(), expectedMessage);
    }, 'edit text k1');
    assert.equal(doc.toSortedJSON(), expectedMessage);
    assert.equal(doc.getGarbageLen(), 1);

    expectedMessage =
      '{"k1":[{"attrs":{"b":"1"},"val":"Hi"},{"attrs":{"b":"1"},"val":" "},{"val":"j"},{"attrs":{"b":"1"},"val":"ane"}]}';

    doc.update((root) => {
      const text = root['k1'];
      text.edit(0, 5, 'Hi', { b: '1' });
      text.edit(3, 4, 'j');
      text.edit(4, 8, 'ane', { b: '1' });
      assert.equal(root.toJSON!(), expectedMessage);
    }, 'edit text k1');
    assert.equal(doc.toSortedJSON(), expectedMessage);

    const expectedGarbageLen = 4;
    assert.equal(doc.getGarbageLen(), expectedGarbageLen);
    assert.equal(doc.garbageCollect(MaxTimeTicket), expectedGarbageLen);

    const empty = 0;
    assert.equal(doc.getGarbageLen(), empty);
  });

  it('should collect garbage for tree node', function () {
    const doc = new yorkie.Document<{ t: Tree }>('test-doc');
    assert.equal(doc.toSortedJSON(), '{}');

    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          {
            type: 'p',
            children: [
              {
                type: 'tn',
                children: [
                  { type: 'text', value: 'a' },
                  { type: 'text', value: 'b' },
                ],
              },
              { type: 'tn', children: [{ type: 'text', value: 'cd' }] },
            ],
          },
        ],
      });
    });

    doc.update((root) => {
      root.t.editByPath([0, 0, 0], [0, 0, 2], { type: 'text', value: 'gh' });
      assert.equal(root.t.toXML(), `<doc><p><tn>gh</tn><tn>cd</tn></p></doc>`);
    });

    // [text(a), text(b)]
    let nodeLengthBeforeGC = getNodeLength(
      doc.getRoot().t.getIndexTree().getRoot(),
    );
    assert.equal(doc.getGarbageLen(), 2);
    assert.equal(doc.garbageCollect(MaxTimeTicket), 2);
    assert.equal(doc.getGarbageLen(), 0);
    let nodeLengthAfterGC = getNodeLength(
      doc.getRoot().t.getIndexTree().getRoot(),
    );
    assert.equal(nodeLengthBeforeGC - nodeLengthAfterGC, 2);

    doc.update((root) => {
      root.t.editByPath([0, 0, 0], [0, 0, 2], { type: 'text', value: 'cv' });
      assert.equal(root.t.toXML(), `<doc><p><tn>cv</tn><tn>cd</tn></p></doc>`);
    });

    // [text(cd)]
    nodeLengthBeforeGC = getNodeLength(
      doc.getRoot().t.getIndexTree().getRoot(),
    );
    assert.equal(doc.getGarbageLen(), 1);
    assert.equal(doc.garbageCollect(MaxTimeTicket), 1);
    assert.equal(doc.getGarbageLen(), 0);
    nodeLengthAfterGC = getNodeLength(doc.getRoot().t.getIndexTree().getRoot());
    assert.equal(nodeLengthBeforeGC - nodeLengthAfterGC, 1);

    doc.update((root) => {
      root.t.editByPath([0], [1], {
        type: 'p',
        children: [{ type: 'tn', children: [{ type: 'text', value: 'ab' }] }],
      });
      assert.equal(root.t.toXML(), `<doc><p><tn>ab</tn></p></doc>`);
    });

    // [p, tn, tn, text(cv), text(cd)]
    nodeLengthBeforeGC = getNodeLength(
      doc.getRoot().t.getIndexTree().getRoot(),
    );
    assert.equal(doc.getGarbageLen(), 5);
    assert.equal(doc.garbageCollect(MaxTimeTicket), 5);
    assert.equal(doc.getGarbageLen(), 0);
    nodeLengthAfterGC = getNodeLength(doc.getRoot().t.getIndexTree().getRoot());
    assert.equal(nodeLengthBeforeGC - nodeLengthAfterGC, 5);
  });

  it('should return correct gc count with already removed tree node', () => {
    const doc = new yorkie.Document<{ t: Tree }>('test-doc');
    assert.equal(doc.toSortedJSON(), '{}');

    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          {
            type: 'p',
            children: [
              {
                type: 'tn',
                children: [{ type: 'text', value: 'abc' }],
              },
            ],
          },
        ],
      });
    });
    assert.equal(doc.getRoot().t.toXML(), `<doc><p><tn>abc</tn></p></doc>`);
    assert.equal(doc.getGarbageLen(), 0);

    doc.update((root) => {
      root.t.edit(3, 4, undefined);
    });
    assert.equal(doc.getRoot().t.toXML(), `<doc><p><tn>ac</tn></p></doc>`);
    assert.equal(doc.getGarbageLen(), 1);

    doc.update((root) => {
      root.t.edit(2, 4, undefined);
    });
    assert.equal(doc.getRoot().t.toXML(), `<doc><p><tn></tn></p></doc>`);
    assert.equal(doc.getGarbageLen(), 3);

    assert.equal(doc.garbageCollect(MaxTimeTicket), 3);
    assert.equal(doc.getGarbageLen(), 0);
  });

  it('should collect garbage for nested object', async () => {
    type TestDoc = { shape?: { point?: { x?: number; y?: number } } };
    const doc = new yorkie.Document<TestDoc>('test-doc');

    doc.update((root) => {
      root.shape = { point: { x: 0, y: 0 } };
      delete root.shape;
    });
    assert.equal(doc.getGarbageLen(), 4); // shape, point, x, y
    assert.equal(doc.garbageCollect(MaxTimeTicket), 4); // The number of GC nodes must also be 4.
  });
});

describe('Garbage Collection for tree', () => {
  enum OpCode {
    NoOp,
    Style,
    RemoveStyle,
    DeleteNode,
    GC,
  }

  interface Operation {
    code: OpCode;
    key: string;
    val: string;
  }

  interface Step {
    op: Operation;
    garbageLen: number;
    expectXML: string;
  }

  interface TestCase {
    desc: string;
    steps: Array<Step>;
  }

  const tests: Array<TestCase> = [
    {
      desc: 'style-style test',
      steps: [
        {
          op: { code: OpCode.Style, key: 'b', val: 't' },
          garbageLen: 0,
          expectXML: '<r><p b="t"></p></r>',
        },
        {
          op: { code: OpCode.Style, key: 'b', val: 'f' },
          garbageLen: 0,
          expectXML: '<r><p b="f"></p></r>',
        },
      ],
    },
    {
      desc: 'style-remove test',
      steps: [
        {
          op: { code: OpCode.Style, key: 'b', val: 't' },
          garbageLen: 0,
          expectXML: '<r><p b="t"></p></r>',
        },
        {
          op: { code: OpCode.RemoveStyle, key: 'b', val: '' },
          garbageLen: 1,
          expectXML: '<r><p></p></r>',
        },
      ],
    },
    {
      desc: 'remove-style test',
      steps: [
        {
          op: { code: OpCode.RemoveStyle, key: 'b', val: '' },
          garbageLen: 1,
          expectXML: '<r><p></p></r>',
        },
        {
          op: { code: OpCode.Style, key: 'b', val: 't' },
          garbageLen: 0,
          expectXML: '<r><p b="t"></p></r>',
        },
      ],
    },
    {
      desc: 'remove-remove test',
      steps: [
        {
          op: { code: OpCode.RemoveStyle, key: 'b', val: '' },
          garbageLen: 1,
          expectXML: '<r><p></p></r>',
        },
        {
          op: { code: OpCode.RemoveStyle, key: 'b', val: '' },
          garbageLen: 1,
          expectXML: '<r><p></p></r>',
        },
      ],
    },
    {
      desc: 'style-delete test',
      steps: [
        {
          op: { code: OpCode.Style, key: 'b', val: 't' },
          garbageLen: 0,
          expectXML: '<r><p b="t"></p></r>',
        },
        {
          op: { code: OpCode.DeleteNode, key: '', val: '' },
          garbageLen: 1,
          expectXML: '<r></r>',
        },
      ],
    },
    {
      desc: 'remove-delete test',
      steps: [
        {
          op: { code: OpCode.RemoveStyle, key: 'b', val: '' },
          garbageLen: 1,
          expectXML: '<r><p></p></r>',
        },
        {
          op: { code: OpCode.DeleteNode, key: 'b', val: 't' },
          garbageLen: 2,
          expectXML: '<r></r>',
        },
      ],
    },
    {
      desc: 'remove-gc-delete test',
      steps: [
        {
          op: { code: OpCode.RemoveStyle, key: 'b', val: '' },
          garbageLen: 1,
          expectXML: '<r><p></p></r>',
        },
        {
          op: { code: OpCode.GC, key: '', val: '' },
          garbageLen: 0,
          expectXML: '<r><p></p></r>',
        },
        {
          op: { code: OpCode.DeleteNode, key: 'b', val: 't' },
          garbageLen: 1,
          expectXML: '<r></r>',
        },
      ],
    },
  ];

  it.each(tests)('$desc', ({ steps }) => {
    const doc = new yorkie.Document<{ t: Tree }>('test-doc');
    assert.equal(doc.toSortedJSON(), '{}');

    doc.update((root) => {
      root.t = new Tree({
        type: 'r',
        children: [{ type: 'p', children: [] }],
      });
    });
    assert.equal(doc.getRoot().t.toXML(), '<r><p></p></r>');

    for (const {
      op: { code, key, val },
      garbageLen: garbageLen,
      expectXML: expectXML,
    } of steps) {
      doc.update((root) => {
        if (code === OpCode.RemoveStyle) {
          root.t.removeStyle(0, 1, [key]);
        } else if (code === OpCode.Style) {
          root.t.style(0, 1, { [key]: val });
        } else if (code === OpCode.DeleteNode) {
          root.t.edit(0, 2, undefined, 0);
        } else if (code === OpCode.GC) {
          doc.garbageCollect(MaxTimeTicket);
        }
      });
      assert.equal(doc.getRoot().t.toXML(), expectXML);
      assert.equal(doc.getGarbageLen(), garbageLen);
    }

    doc.garbageCollect(MaxTimeTicket);
    assert.equal(doc.getGarbageLen(), 0);
  });
});

describe('Garbage Collection for text', () => {
  enum OpCode {
    NoOp,
    Style,
    DeleteNode,
    GC,
  }

  interface Operation {
    code: OpCode;
    key: string;
    val: string;
  }

  interface Step {
    op: Operation;
    garbageLen: number;
    expectXML: string;
  }

  interface TestCase {
    desc: string;
    steps: Array<Step>;
  }

  const tests: Array<TestCase> = [
    {
      desc: 'style-style test',
      steps: [
        {
          op: { code: OpCode.Style, key: 'b', val: 't' },
          garbageLen: 0,
          expectXML: `[{"attrs":{"b":"t"},"val":"AB"}]`,
        },
        {
          op: { code: OpCode.Style, key: 'b', val: 'f' },
          garbageLen: 0,
          expectXML: `[{"attrs":{"b":"f"},"val":"AB"}]`,
        },
      ],
    },
    {
      desc: 'style-delete test',
      steps: [
        {
          op: { code: OpCode.Style, key: 'b', val: 't' },
          garbageLen: 0,
          expectXML: `[{"attrs":{"b":"t"},"val":"AB"}]`,
        },
        {
          op: { code: OpCode.DeleteNode, key: 'b', val: '' },
          garbageLen: 1,
          expectXML: `[]`,
        },
      ],
    },
  ];

  it.each(tests)('$desc', ({ steps }) => {
    const doc = new yorkie.Document<{ t: Text }>('test-doc');
    assert.equal(doc.toSortedJSON(), '{}');

    doc.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'AB');
    });
    assert.equal(doc.getRoot().t.toJSON(), `[{"val":"AB"}]`);

    for (const {
      op: { code, key, val },
      garbageLen: garbageLen,
      expectXML: expectXML,
    } of steps) {
      doc.update((root) => {
        if (code === OpCode.Style) {
          root.t.setStyle(0, 2, { [key]: val });
        } else if (code === OpCode.DeleteNode) {
          root.t.edit(0, 2, '');
        } else if (code === OpCode.GC) {
          doc.garbageCollect(timeT());
        }
      });
      assert.equal(doc.getRoot().t.toJSON(), expectXML);
      assert.equal(doc.getGarbageLen(), garbageLen);
    }

    doc.garbageCollect(MaxTimeTicket);
    assert.equal(doc.getGarbageLen(), 0);
  });
});
