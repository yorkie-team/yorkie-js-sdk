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
    presences: Map<string, unknown>;
    changeID: { getActorID(): string };
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

  // Pins the known gap the clone reset does not close, so a change in this
  // contract is a deliberate one: a failed `update` records nothing, so the
  // prefix that reached the root is local-only state and the next change
  // reuses the failed change's ID. Making the prefix pushable is its own
  // design issue; see
  // docs/tasks/active/20260926-apply-change-clone-divergence-todo.md.
  it('records nothing for a local change that fails on the root', function () {
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

    // The prefix is in the root and stays there, unqueued.
    assert.equal(doc.toSortedJSON(), '{"a":1}');
    assert.isEmpty(internals(doc as never).localChanges);
    assert.isFalse(doc.history.canUndo());

    doc.update((r) => {
      r.c = 3;
    });
    const changes = internals(doc as never).localChanges;
    assert.equal(changes.length, 1);
    assert.equal(changes[0].getID().getClientSeq(), 1);
  });

  // Pins the other half of that contract: `Change.execute` applies the
  // presence change only after every operation has succeeded, so a change
  // that throws partway carries its presence no further than its operations.
  it('applies no presence for a local change that fails on the root', function () {
    const doc = new Document<{ a: number; b: number }, { cursor: number }>('d');
    const actorID = internals(doc as never).changeID.getActorID();

    // The updater mutates the clone through the proxy, so both
    // `SetOperation.execute` calls are the root pass: `a` lands, `b` throws.
    throwOnNthCall(2);
    assert.throws(() => {
      doc.update((r, p) => {
        p.set({ cursor: 1 });
        r.a = 1;
        r.b = 2;
      });
    }, 'boom');

    assert.equal(doc.toSortedJSON(), '{"a":1}');
    assert.isUndefined(internals(doc as never).clone);
    assert.isEmpty(internals(doc as never).localChanges);
    assert.isFalse(internals(doc as never).presences.has(actorID));

    // The same update without a throwing operation does record the presence,
    // so the assertion above is about the failure and not about presence
    // never reaching `presences` on this document.
    doc.update((r, p) => {
      p.set({ cursor: 2 });
      r.b = 2;
    });
    assert.deepEqual(internals(doc as never).presences.get(actorID), {
      cursor: 2,
    });
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
