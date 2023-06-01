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
import { OperationInfo } from '@yorkie-js-sdk/src/document/operation/operation';

export type Indexable = Record<string, any>;

export async function waitStubCallCount(
  stub: sinon.SinonStub,
  callCount: number,
) {
  return new Promise<void>((resolve) => {
    const doLoop = () => {
      if (stub.callCount >= callCount) {
        resolve();
      }
      return false;
    };
    if (!doLoop()) {
      setTimeout(doLoop, 1000);
    }
  });
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
