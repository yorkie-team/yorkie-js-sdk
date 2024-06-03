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

import { assert, describe, test } from 'vitest';
import { TreeNode } from '@yorkie-js-sdk/src/document/crdt/tree';
import { Document } from '@yorkie-js-sdk/src/document/document';
import {
  testRPCAddr,
  toDocKey,
} from '@yorkie-js-sdk/test/integration/integration_helper';
import yorkie, { SyncMode, Tree } from '@yorkie-js-sdk/src/yorkie';
import { Indexable } from '@yorkie-js-sdk/test/helper/helper';

function parseSimpleXML(s: string): Array<string> {
  const res: Array<string> = [];
  for (let i = 0; i < s.length; i++) {
    let now = '';
    if (s[i] === '<') {
      while (i < s.length && s[i] !== '>') {
        now += s[i++];
      }
    }
    now += s[i];
    res.push(now);
  }
  return res;
}

interface TestResult {
  before: [string, string];
  after: [string, string];
}

enum RangeSelector {
  RangeUnknown,
  RangeFront,
  RangeMiddle,
  RangeBack,
  RangeAll,
  RangeOneQuarter,
  RangeThreeQuarter,
}

interface RangeType {
  from: number;
  to: number;
}

interface RangeWithMiddleType {
  from: number;
  mid: number;
  to: number;
}

interface TwoRangesType {
  ranges: [RangeWithMiddleType, RangeWithMiddleType];
  desc: string;
}

function getRange(
  ranges: TwoRangesType,
  selector: RangeSelector,
  user: number,
): RangeType {
  const selectedRange = ranges.ranges[user];

  const q1 = (selectedRange.from + selectedRange.mid + 1) >> 1; // Math.floor(x/2)
  const q3 = (selectedRange.mid + selectedRange.to) >> 1;

  switch (selector) {
    case RangeSelector.RangeFront:
      return { from: selectedRange.from, to: selectedRange.from };
    case RangeSelector.RangeMiddle:
      return { from: selectedRange.mid, to: selectedRange.mid };
    case RangeSelector.RangeBack:
      return { from: selectedRange.to, to: selectedRange.to };
    case RangeSelector.RangeAll:
      return { from: selectedRange.from, to: selectedRange.to };
    case RangeSelector.RangeOneQuarter:
      return { from: q1, to: q1 };
    case RangeSelector.RangeThreeQuarter:
      return { from: q3, to: q3 };
    default:
      return { from: -1, to: -1 };
  }
}

function makeTwoRanges(
  from1: number,
  mid1: number,
  to1: number,
  from2: number,
  mid2: number,
  to2: number,
  desc: string,
): TwoRangesType {
  const range0: RangeWithMiddleType = { from: from1, mid: mid1, to: to1 };
  const range1: RangeWithMiddleType = { from: from2, mid: mid2, to: to2 };
  return { ranges: [range0, range1], desc };
}

function getMergeRange(xml: string, interval: RangeType): RangeType {
  const content = parseSimpleXML(xml);
  let st = -1,
    ed = -1;
  for (let i = interval.from + 1; i <= interval.to; i++) {
    if (st === -1 && content[i].startsWith('</')) st = i - 1;
    if (content[i].startsWith('<') && !content[i].startsWith('</')) ed = i;
  }
  return { from: st, to: ed };
}

enum StyleOpCode {
  StyleUndefined,
  StyleRemove,
  StyleSet,
}

enum EditOpCode {
  EditUndefined,
  EditUpdate,
  MergeUpdate,
  SplitUpdate,
}

interface OperationInterface {
  run(
    doc: Document<{ t: Tree }, Indexable>,
    user: number,
    ranges: TwoRangesType,
  ): void;
  getDesc(): string;
}

class StyleOperationType implements OperationInterface {
  constructor(
    private selector: RangeSelector,
    private op: StyleOpCode,
    private key: string,
    private value: string,
    private desc: string,
  ) {}

  getDesc(): string {
    return this.desc;
  }

  async run(
    doc: Document<{ t: Tree }, Indexable>,
    user: number,
    ranges: TwoRangesType,
  ) {
    const interval = getRange(ranges, this.selector, user);
    const { from, to } = interval;

    doc.update((root) => {
      if (this.op === StyleOpCode.StyleRemove) {
        root.t.removeStyle(from, to, [this.key]);
      } else if (this.op === StyleOpCode.StyleSet) {
        const attr: { [key: string]: any } = {};
        attr[this.key] = this.value;
        root.t.style(from, to, attr);
      }
    });
  }
}

class EditOperationType implements OperationInterface {
  constructor(
    private selector: RangeSelector,
    private op: EditOpCode,
    private content: TreeNode | undefined,
    private splitLevel: number,
    private desc: string,
  ) {}

  getDesc(): string {
    return this.desc;
  }

  async run(
    doc: Document<{ t: Tree }, Indexable>,
    user: number,
    ranges: TwoRangesType,
  ) {
    const interval = getRange(ranges, this.selector, user);
    const { from, to } = interval;

    doc.update((root) => {
      if (this.op === EditOpCode.EditUpdate) {
        root.t.edit(from, to, this.content, this.splitLevel);
      } else if (this.op === EditOpCode.MergeUpdate) {
        const mergeInterval = getMergeRange(root.t.toXML(), interval);
        const st = mergeInterval.from,
          ed = mergeInterval.to;
        if (st !== -1 && ed !== -1 && st < ed) {
          root.t.edit(st, ed, this.content, this.splitLevel);
        }
      } else if (this.op === EditOpCode.SplitUpdate) {
        assert.notEqual(0, this.splitLevel);
        assert.equal(from, to);
        root.t.edit(from, to, this.content, this.splitLevel);
      }
    });
  }
}

async function runTest(
  initialState: Tree,
  initialXML: string,
  ranges: TwoRangesType,
  op1: OperationInterface,
  op2: OperationInterface,
  desc: string,
): Promise<TestResult> {
  const docKey = `${toDocKey(desc)}-${new Date().getTime()}`;
  const c1 = new yorkie.Client(testRPCAddr);
  const c2 = new yorkie.Client(testRPCAddr);
  await c1.activate();
  await c2.activate();

  const d1 = new yorkie.Document<{ t: Tree }>(docKey);
  const d2 = new yorkie.Document<{ t: Tree }>(docKey);
  await c1.attach(d1, { syncMode: SyncMode.Manual });
  await c2.attach(d2, { syncMode: SyncMode.Manual });

  d1.update((root) => {
    root.t = initialState;
  });
  await c1.sync();
  await c2.sync();
  console.log(desc);
  assert.equal(d1.getRoot().t.toXML(), initialXML);
  assert.equal(d2.getRoot().t.toXML(), initialXML);

  op1.run(d1, 0, ranges);
  op2.run(d2, 0, ranges);

  const before1 = d1.getRoot().t.toXML();
  const before2 = d2.getRoot().t.toXML();

  // save own changes and get previous changes
  await c1.sync();
  await c2.sync();

  // get last client changes
  await c1.sync();
  await c2.sync();

  const after1 = d1.getRoot().t.toXML();
  const after2 = d2.getRoot().t.toXML();

  await c1.detach(d1);
  await c2.detach(d2);
  await c1.deactivate();
  await c2.deactivate();

  return { before: [before1, before2], after: [after1, after2] };
}

async function runTestConcurrency(
  testDesc: string,
  initialState: any,
  initialXML: any,
  rangesArr: Array<TwoRangesType>,
  op1Arr: Array<OperationInterface>,
  op2Arr: Array<OperationInterface>,
) {
  for (const ranges of rangesArr) {
    for (const op1 of op1Arr) {
      for (const op2 of op2Arr) {
        const desc = `${testDesc}-${
          ranges.desc
        }(${op1.getDesc()},${op2.getDesc()})`;

        test.concurrent(desc, async () => {
          const result = await runTest(
            initialState,
            initialXML,
            ranges,
            op1,
            op2,
            desc,
          );

          console.log(`before d1: ${result.before[0]}`);
          console.log(`before d2: ${result.before[1]}`);
          console.log(`after d1: ${result.after[0]}`);
          console.log(`after d2: ${result.after[1]}`);
          assert.equal(result.after[0], result.after[1]);
        });
      }
    }
  }
}

describe('Tree.concurrency', () => {
  describe('concurrently-edit-edit-test', async () => {
    const initialTree = new Tree({
      type: 'r',
      children: [
        { type: 'p', children: [{ type: 'text', value: 'abc' }] },
        { type: 'p', children: [{ type: 'text', value: 'def' }] },
        { type: 'p', children: [{ type: 'text', value: 'ghi' }] },
      ],
    });
    const initialXML = `<r><p>abc</p><p>def</p><p>ghi</p></r>`;

    const textNode1: TreeNode = { type: 'text', value: 'A' };
    const textNode2: TreeNode = { type: 'text', value: 'B' };
    const elementNode1: TreeNode = { type: 'b', children: [] };
    const elementNode2: TreeNode = { type: 'i', children: [] };

    const rangesArr = [
      // intersect-element: <p>abc</p><p>def</p> - <p>def</p><p>ghi</p>
      makeTwoRanges(0, 5, 10, 5, 10, 15, `intersect-element`),
      // intersect-text: ab - bc
      makeTwoRanges(1, 2, 3, 2, 3, 4, `intersect-text`),
      // contain-element: <p>abc</p><p>def</p><p>ghi</p> - <p>def</p>
      makeTwoRanges(0, 5, 15, 5, 5, 10, `contain-element`),
      // contain-text: abc - b
      makeTwoRanges(1, 2, 4, 2, 2, 3, `contain-text`),
      // contain-mixed-type: <p>abc</p><p>def</p><p>ghi</p> - def
      makeTwoRanges(0, 5, 15, 6, 7, 9, `contain-mixed-type`),
      // side-by-side-element: <p>abc</p> - <p>def</p>
      makeTwoRanges(0, 5, 5, 5, 5, 10, `side-by-side-element`),
      // side-by-side-text: a - bc
      makeTwoRanges(1, 1, 2, 2, 3, 4, `side-by-side-text`),
      // equal-element: <p>abc</p><p>def</p> - <p>abc</p><p>def</p>
      makeTwoRanges(0, 5, 10, 0, 5, 10, `equal-element`),
      // equal-text: abc - abc
      makeTwoRanges(1, 2, 4, 1, 2, 4, `equal-text`),
    ];

    const edit1Operations: Array<EditOperationType> = [
      new EditOperationType(
        RangeSelector.RangeFront,
        EditOpCode.EditUpdate,
        textNode1,
        0,
        `insertTextFront`,
      ),
      new EditOperationType(
        RangeSelector.RangeMiddle,
        EditOpCode.EditUpdate,
        textNode1,
        0,
        `insertTextMiddle`,
      ),
      new EditOperationType(
        RangeSelector.RangeBack,
        EditOpCode.EditUpdate,
        textNode1,
        0,
        `insertTextBack`,
      ),
      new EditOperationType(
        RangeSelector.RangeAll,
        EditOpCode.EditUpdate,
        textNode1,
        0,
        `replaceText`,
      ),
      new EditOperationType(
        RangeSelector.RangeFront,
        EditOpCode.EditUpdate,
        elementNode1,
        0,
        `insertElementFront`,
      ),
      new EditOperationType(
        RangeSelector.RangeMiddle,
        EditOpCode.EditUpdate,
        elementNode1,
        0,
        `insertElementMiddle`,
      ),
      new EditOperationType(
        RangeSelector.RangeBack,
        EditOpCode.EditUpdate,
        elementNode1,
        0,
        `insertElementBack`,
      ),
      new EditOperationType(
        RangeSelector.RangeAll,
        EditOpCode.EditUpdate,
        elementNode1,
        0,
        `replaceElement`,
      ),
      new EditOperationType(
        RangeSelector.RangeAll,
        EditOpCode.EditUpdate,
        undefined,
        0,
        `delete`,
      ),
      new EditOperationType(
        RangeSelector.RangeAll,
        EditOpCode.MergeUpdate,
        undefined,
        0,
        `merge`,
      ),
    ];

    const edit2Operations: Array<EditOperationType> = [
      new EditOperationType(
        RangeSelector.RangeFront,
        EditOpCode.EditUpdate,
        textNode2,
        0,
        `insertTextFront`,
      ),
      new EditOperationType(
        RangeSelector.RangeMiddle,
        EditOpCode.EditUpdate,
        textNode2,
        0,
        `insertTextMiddle`,
      ),
      new EditOperationType(
        RangeSelector.RangeBack,
        EditOpCode.EditUpdate,
        textNode2,
        0,
        `insertTextBack`,
      ),
      new EditOperationType(
        RangeSelector.RangeAll,
        EditOpCode.EditUpdate,
        textNode2,
        0,
        `replaceText`,
      ),
      new EditOperationType(
        RangeSelector.RangeFront,
        EditOpCode.EditUpdate,
        elementNode2,
        0,
        `insertElementFront`,
      ),
      new EditOperationType(
        RangeSelector.RangeMiddle,
        EditOpCode.EditUpdate,
        elementNode2,
        0,
        `insertElementMiddle`,
      ),
      new EditOperationType(
        RangeSelector.RangeBack,
        EditOpCode.EditUpdate,
        elementNode2,
        0,
        `insertElementBack`,
      ),
      new EditOperationType(
        RangeSelector.RangeAll,
        EditOpCode.EditUpdate,
        elementNode2,
        0,
        `replaceElement`,
      ),
      new EditOperationType(
        RangeSelector.RangeAll,
        EditOpCode.EditUpdate,
        undefined,
        0,
        `delete`,
      ),
      new EditOperationType(
        RangeSelector.RangeAll,
        EditOpCode.MergeUpdate,
        undefined,
        0,
        `merge`,
      ),
    ];

    await runTestConcurrency(
      'concurrently-edit-edit-test',
      initialTree,
      initialXML,
      rangesArr,
      edit1Operations,
      edit2Operations,
    );
  });

  describe('concurrently-style-style-test', async () => {
    const initialTree = new Tree({
      type: 'r',
      children: [
        { type: 'p', children: [{ type: 'text', value: 'a' }] },
        { type: 'p', children: [{ type: 'text', value: 'b' }] },
        { type: 'p', children: [{ type: 'text', value: 'c' }] },
      ],
    });
    const initialXML = `<r><p>a</p><p>b</p><p>c</p></r>`;

    const rangesArr = [
      // equal: <p>b</p> - <p>b</p>
      makeTwoRanges(3, -1, 6, 3, -1, 6, `equal`),
      // contain: <p>a</p><p>b</p><p>c</p> - <p>b</p>
      makeTwoRanges(0, -1, 9, 3, -1, 6, `contain`),
      // intersect: <p>a</p><p>b</p> - <p>b</p><p>c</p>
      makeTwoRanges(0, -1, 6, 3, -1, 9, `intersect`),
      // side-by-side: <p>a</p> - <p>b</p>
      makeTwoRanges(0, -1, 3, 3, -1, 6, `side-by-side`),
    ];

    const styleOperations: Array<StyleOperationType> = [
      new StyleOperationType(
        RangeSelector.RangeAll,
        StyleOpCode.StyleRemove,
        'bold',
        '',
        `remove-bold`,
      ),
      new StyleOperationType(
        RangeSelector.RangeAll,
        StyleOpCode.StyleSet,
        'bold',
        'aa',
        `set-bold-aa`,
      ),
      new StyleOperationType(
        RangeSelector.RangeAll,
        StyleOpCode.StyleSet,
        'bold',
        'bb',
        `set-bold-bb`,
      ),
      new StyleOperationType(
        RangeSelector.RangeAll,
        StyleOpCode.StyleRemove,
        'italic',
        '',
        `remove-italic`,
      ),
      new StyleOperationType(
        RangeSelector.RangeAll,
        StyleOpCode.StyleSet,
        'italic',
        'aa',
        `set-italic-aa`,
      ),
      new StyleOperationType(
        RangeSelector.RangeAll,
        StyleOpCode.StyleSet,
        'italic',
        'bb',
        `set-italic-bb`,
      ),
    ];

    // Define range & style operations
    await runTestConcurrency(
      'concurrently-style-style-test',
      initialTree,
      initialXML,
      rangesArr,
      styleOperations,
      styleOperations,
    );
  });

  describe('concurrently-edit-style-test', async () => {
    const initialTree = new Tree({
      type: 'r',
      children: [
        {
          type: 'p',
          children: [{ type: 'text', value: 'a' }],
          attributes: { color: 'red' },
        },
        {
          type: 'p',
          children: [{ type: 'text', value: 'b' }],
          attributes: { color: 'red' },
        },
        {
          type: 'p',
          children: [{ type: 'text', value: 'c' }],
          attributes: { color: 'red' },
        },
      ],
    });
    const initialXML = `<r><p color="red">a</p><p color="red">b</p><p color="red">c</p></r>`;
    const content: TreeNode = {
      type: 'p',
      children: [{ type: 'text', value: 'd' }],
      attributes: { italic: 'true', color: 'blue' },
    };

    const rangesArr = [
      // equal: <p>b</p> - <p>b</p>
      makeTwoRanges(3, 3, 6, 3, -1, 6, `equal`),
      // equal multiple: <p>a</p><p>b</p><p>c</p> - <p>a</p><p>b</p><p>c</p>
      makeTwoRanges(0, 3, 9, 0, 3, 9, `equal multiple`),
      // A contains B: <p>a</p><p>b</p><p>c</p> - <p>b</p>
      makeTwoRanges(0, 3, 9, 3, -1, 6, `A contains B`),
      // B contains A: <p>b</p> - <p>a</p><p>b</p><p>c</p>
      makeTwoRanges(3, 3, 6, 0, -1, 9, `B contains A`),
      // intersect: <p>a</p><p>b</p> - <p>b</p><p>c</p>
      makeTwoRanges(0, 3, 6, 3, -1, 9, `intersect`),
      // A -> B: <p>a</p> - <p>b</p>
      makeTwoRanges(0, 3, 3, 3, -1, 6, `A -> B`),
      // B -> A: <p>b</p> - <p>a</p>
      makeTwoRanges(3, 3, 6, 0, -1, 3, `B -> A`),
    ];

    const editOperations: Array<EditOperationType> = [
      new EditOperationType(
        RangeSelector.RangeFront,
        EditOpCode.EditUpdate,
        content,
        0,
        'insertFront',
      ),
      new EditOperationType(
        RangeSelector.RangeMiddle,
        EditOpCode.EditUpdate,
        content,
        0,
        'insertMiddle',
      ),
      new EditOperationType(
        RangeSelector.RangeBack,
        EditOpCode.EditUpdate,
        content,
        0,
        'insertBack',
      ),
      new EditOperationType(
        RangeSelector.RangeAll,
        EditOpCode.EditUpdate,
        undefined,
        0,
        'delete',
      ),
      new EditOperationType(
        RangeSelector.RangeAll,
        EditOpCode.EditUpdate,
        content,
        0,
        'replace',
      ),
      new EditOperationType(
        RangeSelector.RangeAll,
        EditOpCode.MergeUpdate,
        undefined,
        0,
        'merge',
      ),
    ];

    const styleOperations: Array<StyleOperationType> = [
      new StyleOperationType(
        RangeSelector.RangeAll,
        StyleOpCode.StyleRemove,
        'color',
        '',
        'remove-color',
      ),
      new StyleOperationType(
        RangeSelector.RangeAll,
        StyleOpCode.StyleSet,
        'bold',
        'aa',
        'set-bold-aa',
      ),
    ];

    await runTestConcurrency(
      'concurrently-edit-style-test',
      initialTree,
      initialXML,
      rangesArr,
      editOperations,
      styleOperations,
    );
  });

  describe.skip('concurrently-split-split-test', async () => {
    const initialTree = new Tree({
      type: 'r',
      children: [
        {
          type: 'p',
          children: [
            {
              type: 'p',
              children: [
                {
                  type: 'p',
                  children: [
                    { type: 'p', children: [{ type: 'text', value: 'abcd' }] },
                    { type: 'p', children: [{ type: 'text', value: 'efgh' }] },
                  ],
                },
                { type: 'p', children: [{ type: 'text', value: 'ijkl' }] },
              ],
            },
          ],
        },
      ],
    });
    const initialXML = `<r><p><p><p><p>abcd</p><p>efgh</p></p><p>ijkl</p></p></p></r>`;

    const rangesArr = [
      // equal-single-element: <p>abcd</p>
      makeTwoRanges(3, 6, 9, 3, 6, 9, `equal-single`),
      // equal-multiple-element: <p>abcd</p><p>efgh</p>
      makeTwoRanges(3, 9, 15, 3, 9, 15, `equal-multiple`),
      // A contains B same level: <p>abcd</p><p>efgh</p> - <p>efgh</p>
      makeTwoRanges(3, 9, 15, 9, 12, 15, `A contains B same level`),
      // A contains B multiple level: <p><p>abcd</p><p>efgh</p></p><p>ijkl</p> - <p>efgh</p>
      makeTwoRanges(2, 16, 22, 9, 12, 15, `A contains B multiple level`),
      // side by side
      makeTwoRanges(3, 6, 9, 9, 12, 15, `B is next to A`),
    ];

    const splitOperations: Array<EditOperationType> = [
      new EditOperationType(
        RangeSelector.RangeFront,
        EditOpCode.SplitUpdate,
        undefined,
        1,
        `split-front-1`,
      ),
      new EditOperationType(
        RangeSelector.RangeOneQuarter,
        EditOpCode.SplitUpdate,
        undefined,
        1,
        `split-one-quarter-1`,
      ),
      new EditOperationType(
        RangeSelector.RangeThreeQuarter,
        EditOpCode.SplitUpdate,
        undefined,
        1,
        `split-three-quarter-1`,
      ),
      new EditOperationType(
        RangeSelector.RangeBack,
        EditOpCode.SplitUpdate,
        undefined,
        1,
        `split-back-1`,
      ),
      new EditOperationType(
        RangeSelector.RangeFront,
        EditOpCode.SplitUpdate,
        undefined,
        2,
        `split-front-2`,
      ),
      new EditOperationType(
        RangeSelector.RangeOneQuarter,
        EditOpCode.SplitUpdate,
        undefined,
        2,
        `split-one-quarter-2`,
      ),
      new EditOperationType(
        RangeSelector.RangeThreeQuarter,
        EditOpCode.SplitUpdate,
        undefined,
        2,
        `split-three-quarter-2`,
      ),
      new EditOperationType(
        RangeSelector.RangeBack,
        EditOpCode.SplitUpdate,
        undefined,
        2,
        `split-back-2`,
      ),
    ];

    await runTestConcurrency(
      'concurrently-split-split-test',
      initialTree,
      initialXML,
      rangesArr,
      splitOperations,
      splitOperations,
    );
  });

  describe.skip('concurrently-split-edit-test', async () => {
    const initialTree = new Tree({
      type: 'r',
      children: [
        {
          type: 'p',
          children: [
            {
              type: 'p',
              children: [
                {
                  type: 'p',
                  children: [{ type: 'text', value: 'abcd' }],
                  attributes: { italic: 'a' },
                },
                {
                  type: 'p',
                  children: [{ type: 'text', value: 'efgh' }],
                  attributes: { italic: 'a' },
                },
              ],
            },
            {
              type: 'p',
              children: [{ type: 'text', value: 'ijkl' }],
              attributes: { italic: 'a' },
            },
          ],
        },
      ],
    });
    const initialXML = `<r><p><p><p italic="a">abcd</p><p italic="a">efgh</p></p><p italic="a">ijkl</p></p></r>`;
    const content: TreeNode = { type: 'i', children: [] };

    const rangesArr = [
      // equal: <p>ab'cd</p>
      makeTwoRanges(2, 5, 8, 2, 5, 8, `equal`),
      // A contains B: <p>ab'cd</p> - bc
      makeTwoRanges(2, 5, 8, 4, 5, 6, `A contains B`),
      // B contains A: <p>ab'cd</p> - <p>abcd</p><p>efgh</p>
      makeTwoRanges(2, 5, 8, 2, 8, 14, `B contains A`),
      // left node(text): <p>ab'cd</p> - ab
      makeTwoRanges(2, 5, 8, 3, 4, 5, `left node(text)`),
      // right node(text): <p>ab'cd</p> - cd
      makeTwoRanges(2, 5, 8, 5, 6, 7, `right node(text)`),
      // left node(element): <p>abcd</p>'<p>efgh</p> - <p>abcd</p>
      makeTwoRanges(2, 8, 14, 2, 5, 8, `left node(element)`),
      // right node(element): <p>abcd</p>'<p>efgh</p> - <p>efgh</p>
      makeTwoRanges(2, 8, 14, 8, 11, 14, `right node(element)`),
      // A -> B: <p>ab'cd</p> - <p>efgh</p>
      makeTwoRanges(2, 5, 8, 8, 11, 14, `A -> B`),
      // B -> A: <p>ef'gh</p> - <p>abcd</p>
      makeTwoRanges(8, 11, 14, 2, 5, 8, `B -> A`),
    ];

    const splitOperations: Array<EditOperationType> = [
      new EditOperationType(
        RangeSelector.RangeMiddle,
        EditOpCode.SplitUpdate,
        undefined,
        1,
        `split-1`,
      ),
      new EditOperationType(
        RangeSelector.RangeMiddle,
        EditOpCode.SplitUpdate,
        undefined,
        2,
        `split-2`,
      ),
    ];

    const editOperations: Array<OperationInterface> = [
      new EditOperationType(
        RangeSelector.RangeFront,
        EditOpCode.EditUpdate,
        content,
        0,
        `insertFront`,
      ),
      new EditOperationType(
        RangeSelector.RangeMiddle,
        EditOpCode.EditUpdate,
        content,
        0,
        `insertMiddle`,
      ),
      new EditOperationType(
        RangeSelector.RangeBack,
        EditOpCode.EditUpdate,
        content,
        0,
        `insertBack`,
      ),
      new EditOperationType(
        RangeSelector.RangeAll,
        EditOpCode.EditUpdate,
        content,
        0,
        `replace`,
      ),
      new EditOperationType(
        RangeSelector.RangeAll,
        EditOpCode.EditUpdate,
        undefined,
        0,
        `delete`,
      ),
      new EditOperationType(
        RangeSelector.RangeAll,
        EditOpCode.MergeUpdate,
        undefined,
        0,
        `merge`,
      ),
      new StyleOperationType(
        RangeSelector.RangeAll,
        StyleOpCode.StyleSet,
        'bold',
        'aa',
        `style`,
      ),
      new StyleOperationType(
        RangeSelector.RangeAll,
        StyleOpCode.StyleRemove,
        'italic',
        '',
        `remove-style`,
      ),
    ];

    await runTestConcurrency(
      'concurrently-split-edit-test',
      initialTree,
      initialXML,
      rangesArr,
      splitOperations,
      editOperations,
    );
  });
});
