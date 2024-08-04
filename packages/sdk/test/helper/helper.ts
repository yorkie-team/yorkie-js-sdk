/*
 * Copyright 2020 The Yorkie Authors. All rights reserved.
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

import { assert } from 'chai';

import yorkie, { Tree, ElementNode } from '@yorkie-js-sdk/src/yorkie';
import { IndexTree } from '@yorkie-js-sdk/src/util/index_tree';
import {
  CRDTTreeNode,
  CRDTTreeNodeID,
} from '@yorkie-js-sdk/src/document/crdt/tree';
import {
  OperationInfo,
  Operation,
} from '@yorkie-js-sdk/src/document/operation/operation';
import {
  InitialTimeTicket as ITT,
  TimeTicket,
} from '@yorkie-js-sdk/src/document/time/ticket';
import { HistoryOperation } from '@yorkie-js-sdk/src/document/history';
import { ChangeContext } from '@yorkie-js-sdk/src/document/change/context';
import { InitialChangeID } from '@yorkie-js-sdk/src/document/change/change_id';
import { CRDTRoot } from '@yorkie-js-sdk/src/document/crdt/root';
import { CRDTObject } from '@yorkie-js-sdk/src/document/crdt/object';
import { ElementRHT } from '@yorkie-js-sdk/src/document/crdt/element_rht';

export type Indexable = Record<string, any>;

/**
 * EventCollector provides a utility to collect and manage events.
 * It can be used in tests to wait for events to be collected.
 */
export class EventCollector<E = string> {
  private events: Array<E>;

  constructor() {
    this.events = [];
  }

  public add(event: E) {
    this.events.push(event);
  }

  /**
   * `waitAndVerifyNthEvent` waits for the nth event to occur and then
   * verifies whether the event matches the expected event.
   */
  public waitAndVerifyNthEvent(count: number, event: E) {
    return new Promise<void>((resolve, reject) => {
      const doLoop = () => {
        if (this.events.length >= count) {
          if (deepEqual(this.events[count - 1], event)) {
            resolve();
          } else {
            reject(
              new Error(`event is not equal ${count}-
                expected: ${JSON.stringify(event)},
                actual: ${JSON.stringify(this.events[count - 1])}`),
            );
          }
          return;
        }
        setTimeout(doLoop, 0);
      };
      doLoop();
    });
  }

  /**
   * `waitFor` waits for the specified event to be collected.
   *
   * Note(chacha912): Before calling `waitFor`, it's recommended to use `reset` to clear the events array.
   * If the event was previously present in the events array, it may not be accurately detected.
   */
  public waitFor(event: E) {
    return new Promise<void>((resolve) => {
      const doLoop = () => {
        if (this.events.some((e) => deepEqual(e, event))) {
          resolve();
          return;
        }
        setTimeout(doLoop, 0);
      };
      doLoop();
    });
  }

  public reset() {
    this.events = [];
  }

  public getLength() {
    return this.events.length;
  }
}

export function deepSort(target: any): any {
  if (Array.isArray(target)) {
    return target.map(deepSort).sort(compareFunction);
  }
  if (typeof target === 'object') {
    return Object.keys(target)
      .sort()
      .reduce((result, key) => {
        result[key] = deepSort(target[key]);
        return result;
      }, {} as Record<string, any>);
  }
  return target;
}

function deepEqual(actual: any, expected: any) {
  if (actual === expected) {
    return true;
  }

  if (
    typeof actual !== 'object' ||
    actual === null ||
    typeof expected !== 'object' ||
    expected === null
  ) {
    return false;
  }

  const keysA = Object.keys(actual);
  const keysB = Object.keys(expected);

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (const key of keysA) {
    if (!keysB.includes(key) || !deepEqual(actual[key], expected[key])) {
      return false;
    }
  }

  return true;
}

function compareFunction(a: any, b: any): number {
  if (
    typeof a === 'object' &&
    typeof b === 'object' &&
    a !== null &&
    b !== null
  ) {
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    const len = Math.min(aKeys.length, bKeys.length);
    for (let i = 0; i < len; i++) {
      const key = aKeys[i];
      const result = compareFunction(a[key], b[key]);
      if (result !== 0) {
        return result;
      }
    }
    return aKeys.length - bKeys.length;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

export async function assertThrowsAsync(
  fn: any,
  errType: any,
  message?: string,
) {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  let errFn = () => {};
  try {
    await fn();
  } catch (e) {
    errFn = () => {
      throw e;
    };
  } finally {
    assert.throws(errFn, errType, message);
  }
}

/**
 * TextView emulates an external editor like CodeMirror to test whether change
 * events are delivered properly.
 */
export class TextView {
  private value: string;

  constructor() {
    this.value = '';
  }

  public applyOperations(
    operations: Array<OperationInfo>,
    enableLog = false,
  ): void {
    const oldValue = this.value;
    const changeLogs = [];
    for (const op of operations) {
      if (op.type === 'edit') {
        this.value = [
          this.value.substring(0, op.from),
          op.value?.content,
          this.value.substring(op.to),
        ].join('');
        changeLogs.push(
          `{f:${op.from}, t:${op.to}, c:${op.value?.content || ''}}`,
        );
      }
    }

    if (enableLog) {
      console.log(
        `apply: ${oldValue}->${this.value} [${changeLogs.join(',')}]`,
      );
    }
  }

  public toString(): string {
    return this.value;
  }
}

/**
 * `buildIndexTree` builds an index tree from the given element node.
 */
export function buildIndexTree(node: ElementNode): IndexTree<CRDTTreeNode> {
  const doc = new yorkie.Document<{ t: Tree }>('test');
  doc.update((root) => {
    root.t = new Tree(node);
  });
  return doc.getRoot().t.getIndexTree();
}

export function toStringHistoryOp<P extends Indexable>(
  op: HistoryOperation<P>,
): string {
  return op instanceof Operation ? op.toTestString() : JSON.stringify(op);
}

/**
 * `idT` is a dummy CRDTTreeNodeID for testing.
 */
export const idT = CRDTTreeNodeID.of(ITT, 0);

/**
 * `dummyContext` is a helper context that is used for testing.
 */
export const dummyContext = ChangeContext.create(
  InitialChangeID,
  new CRDTRoot(new CRDTObject(ITT, ElementRHT.create())),
  {},
);

/**
 * `posT` is a helper function that issues a new CRDTTreeNodeID.
 */
export function posT(offset = 0): CRDTTreeNodeID {
  return CRDTTreeNodeID.of(dummyContext.issueTimeTicket(), offset);
}

/**
 * `timeT` is a helper function that issues a new TimeTicket.
 */
export function timeT(): TimeTicket {
  return dummyContext.issueTimeTicket();
}
