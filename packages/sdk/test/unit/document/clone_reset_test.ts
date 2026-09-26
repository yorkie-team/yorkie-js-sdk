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

import { describe, it, assert, afterEach, vi } from 'vitest';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { Change } from '@yorkie-js/sdk/src/document/change/change';
import { OpSource } from '@yorkie-js/sdk/src/document/operation/operation';
import { SetOperation } from '@yorkie-js/sdk/src/document/operation/set_operation';

/**
 * `throwOnNthCall` makes `SetOperation.execute` throw on its `n`th call and
 * behave normally otherwise. A change is executed on the clone first and the
 * root second, so `n = 2` fails it after the clone took it.
 */
function throwOnNthCall(n: number) {
  let calls = 0;
  const original = SetOperation.prototype.execute;
  return vi
    .spyOn(SetOperation.prototype, 'execute')
    .mockImplementation(function (
      this: SetOperation,
      ...args: Parameters<SetOperation['execute']>
    ) {
      calls++;
      if (calls === n) {
        throw new Error('boom');
      }
      return original.apply(this, args);
    });
}

/**
 * `internals` exposes the private state under test.
 */
function internals(doc: Document<never>) {
  return doc as unknown as {
    clone?: unknown;
    localChanges: Array<Change<never>>;
  };
}

describe('Document clone reset', function () {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('drops the clone when a remote change fails partway', function () {
    const source = new Document<{ k: number }>('d');
    source.update((r) => {
      r.k = 1;
    });
    const change = internals(source as never).localChanges[0];

    const target = new Document<{ k: number }>('d');
    throwOnNthCall(2);
    assert.throws(
      () => target.applyChange(change as never, OpSource.Remote),
      'boom',
    );

    assert.isUndefined(internals(target as never).clone);
  });

  it('drops the clone when an undo fails partway', function () {
    const doc = new Document<{ k: number }>('d');
    doc.update((r) => {
      r.k = 1;
    });
    doc.update((r) => {
      r.k = 2;
    });

    throwOnNthCall(2);
    assert.throws(() => doc.history.undo(), 'boom');

    assert.isUndefined(internals(doc as never).clone);
  });

  it('drops the clone when a local change fails on the root', function () {
    const doc = new Document<{ k: number }>('d');
    doc.update((r) => {
      r.k = 1;
    });

    // The updater mutates the clone through the proxy, so the first
    // `SetOperation.execute` is the root pass.
    throwOnNthCall(1);
    assert.throws(() => {
      doc.update((r) => {
        r.k = 2;
      });
    }, 'boom');

    assert.isUndefined(internals(doc as never).clone);
    assert.equal(doc.getRoot().k, 1);
    assert.equal(doc.toSortedJSON(), '{"k":1}');
  });

  it('keeps the clone when undo is refused during an update', function () {
    const doc = new Document<{ k: number }>('d');
    doc.update((r) => {
      r.k = 1;
    });

    doc.update((r) => {
      assert.throws(() => doc.history.undo(), /not allowed during an update/);
      r.k = 2;
    });

    assert.equal(doc.getRoot().k, 2);
  });
});
