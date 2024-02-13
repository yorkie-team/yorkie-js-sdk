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

import { assert, describe, it } from 'vitest';
import { TreeNode } from '@yorkie-js-sdk/src/document/crdt/tree';
import { Document } from '@yorkie-js-sdk/src/document/document';
import { withTwoClientsAndDocuments } from '@yorkie-js-sdk/test/integration/integration_helper';
import { Tree } from '@yorkie-js-sdk/src/yorkie';
import { Indexable } from '@yorkie-js-sdk/test/helper/helper';

function parseSimpleXML(s: string): Array<string> {
  const res: Array<string> = [];
  for (let i = 0; i < s.length; i++) {
    let now = '';
    if (s[i] === '<') {
      while (i < s.length && s[i] !== '>') {
        now += s[i++];
      }
      now += s[i];
    } else {
      now += s[i];
    }
    res.push(now);
  }
  return res;
}

class TestResult {
  constructor(public flag: boolean, public resultDesc: string) {}
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
        // TODO: removeStyle
      } else if (this.op === StyleOpCode.StyleSet) {
        // TODO: style
      }
    });
  }
}

class EditOperationType implements OperationInterface {
  constructor(
    private selector: RangeSelector,
    private op: EditOpCode,
    private content: TreeNode,
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

describe('Tree.concurrency', () => {
  function RunTestConcurrency(
    testDesc: string,
    initialState: any,
    initialXML: any,
    rangesArr: Array<TwoRangesType>,
    opArr1: Array<OperationInterface>,
    opArr2: Array<OperationInterface>,
  ) {
    const getTestResult = async function (
      ranges: TwoRangesType,
      op1: OperationInterface,
      op2: OperationInterface,
    ) {
      return await withTwoClientsAndDocuments<{ t: Tree }>(
        async (c1, d1, c2, d2) => {
          d1.update((root) => {
            root.t = initialState;
          });
          await c1.sync();
          await c2.sync();
          assert.equal(d1.getRoot().t.toXML(), /*html*/ initialXML);
          assert.equal(d2.getRoot().t.toXML(), /*html*/ initialXML);

          op1.run(d1, 0, ranges);
          op2.run(d2, 1, ranges);
        },
        testDesc,
      );
    };

    rangesArr.forEach((ranges) => {
      opArr1.forEach((op1) => {
        opArr2.forEach((op2) => {
          const testResult = getTestResult(ranges, op1, op2);
          it.skipIf(testResult)('', () => {
            // Do sth
          });
        });
      });
    });
  }
  describe('concurrently-edit-edit', () => {
    const initialTree = new Tree({
      type: 'r',
      children: [
        { type: 'p', children: [{ type: 'text', value: 'abc' }] },
        { type: 'p', children: [{ type: 'text', value: 'edf' }] },
        { type: 'p', children: [{ type: 'text', value: 'ghi' }] },
      ],
    });
    const initialXML = `<root><p>abc</p><p>def</p><p>ghi</p></root>`;

    // Define range & edit operations
    // RunTestConcurrency();
  });
  describe('concurrently-style-style', () => {
    const initialTree = new Tree({
      type: 'r',
      children: [
        { type: 'p', children: [{ type: 'text', value: 'a' }] },
        { type: 'p', children: [{ type: 'text', value: 'b' }] },
        { type: 'p', children: [{ type: 'text', value: 'c' }] },
      ],
    });
    const initialXML = `<root><p>a</p><p>b</p><p>c</p></root>`;

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
    RunTestConcurrency(
      '',
      initialTree,
      initialXML,
      rangesArr,
      styleOperations,
      styleOperations,
    );
  });
  describe('concurrently-edit-style', () => {
    const initialTree = new Tree({
      type: 'r',
      children: [
        { type: 'p', children: [{ type: 'text', value: 'a' }] },
        { type: 'p', children: [{ type: 'text', value: 'b' }] },
        { type: 'p', children: [{ type: 'text', value: 'c' }] },
      ],
    });
    const initialXML = `<root><p>a</p><p>b</p><p>c</p></root>`;

    // Define range & edit,style operations
    // RunTestConcurrency();
  });
});
