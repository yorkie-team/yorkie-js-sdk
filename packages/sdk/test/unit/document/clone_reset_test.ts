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
import {
  Document,
  DocEvent,
  DocEventType,
  LocalChangeEvent,
} from '@yorkie-js/sdk/src/document/document';
import { OpInfo } from '@yorkie-js/sdk/src/document/operation/operation';
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

  it('queues the prefix a failed local change left on the root', function () {
    const doc = new Document<{ a: number; b: number; c: number }>('d');

    // The updater mutates the clone through the proxy, so both
    // `SetOperation.execute` calls are the root pass: `a` lands, `b` throws.
    throwOnNthCall(2);
    assert.throws(() => {
      doc.update((r) => {
        r.a = 1;
        r.b = 2;
      });
    }, 'boom');

    assert.equal(doc.toSortedJSON(), '{"a":1}');

    const changes = internals(doc as never).localChanges;
    assert.equal(changes.length, 1);
    assert.equal(changes[0].getOperations().length, 1);
    assert.equal(changes[0].getID().getClientSeq(), 1);

    // The next change must not reuse the ID the landed prefix already spent.
    doc.update((r) => {
      r.c = 3;
    });
    assert.equal(changes.length, 2);
    assert.equal(changes[1].getID().getClientSeq(), 2);
    assert.equal(doc.toSortedJSON(), '{"a":1,"c":3}');
  });

  it('publishes the prefix a failed local change left on the root', function () {
    const doc = new Document<{ a: number; b: number }>('d');
    const events: Array<DocEvent<never>> = [];
    doc.subscribe((event) => {
      events.push(event as DocEvent<never>);
    });

    throwOnNthCall(2);
    assert.throws(() => {
      doc.update((r) => {
        r.a = 1;
        r.b = 2;
      });
    }, 'boom');

    assert.equal(events.length, 1);
    const event = events[0];
    assert.equal(event.type, DocEventType.LocalChange);
    assert.equal(
      (event as LocalChangeEvent<OpInfo, never>).value.operations.length,
      1,
    );
    assert.equal((event as LocalChangeEvent<OpInfo, never>).value.clientSeq, 1);
  });

  it('undoes the prefix a failed local change left on the root', function () {
    const doc = new Document<{ a: number; b: number; c: number }>('d');

    throwOnNthCall(2);
    assert.throws(() => {
      doc.update((r) => {
        r.a = 1;
        r.b = 2;
      });
    }, 'boom');

    assert.equal(doc.toSortedJSON(), '{"a":1}');
    assert.isTrue(doc.history.canUndo());

    // The undo must revert the landed prefix, not the change before it.
    doc.history.undo();
    assert.equal(doc.toSortedJSON(), '{}');
    assert.isTrue(doc.history.canRedo());

    doc.history.redo();
    assert.equal(doc.toSortedJSON(), '{"a":1}');
  });

  it('clears the redo stack when a local change lands partway', function () {
    const doc = new Document<{ a: number; b: number; c: number }>('d');
    doc.update((r) => {
      r.a = 1;
    });
    doc.history.undo();
    assert.isTrue(doc.history.canRedo());

    throwOnNthCall(2);
    assert.throws(() => {
      doc.update((r) => {
        r.b = 2;
        r.c = 3;
      });
    }, 'boom');

    assert.isFalse(doc.history.canRedo());
  });

  it('reuses the change ID when nothing of a local change landed', function () {
    const doc = new Document<{ a: number; b: number }>('d');

    throwOnNthCall(1);
    assert.throws(() => {
      doc.update((r) => {
        r.a = 1;
      });
    }, 'boom');

    assert.isEmpty(internals(doc as never).localChanges);

    doc.update((r) => {
      r.b = 2;
    });
    const changes = internals(doc as never).localChanges;
    assert.equal(changes.length, 1);
    assert.equal(changes[0].getID().getClientSeq(), 1);
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
