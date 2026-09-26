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
  DocEventType,
  type DocEvent,
} from '@yorkie-js/sdk/src/document/document';
import { Text } from '@yorkie-js/sdk/src/yorkie';
import { Change } from '@yorkie-js/sdk/src/document/change/change';
import { OpSource } from '@yorkie-js/sdk/src/document/operation/operation';
import { EditOperation } from '@yorkie-js/sdk/src/document/operation/edit_operation';
import { SetOperation } from '@yorkie-js/sdk/src/document/operation/set_operation';

/**
 * `throwOnNthCall` makes the given prototype method throw on its `n`th call
 * and behave normally otherwise. `Change.execute` applies operations one at a
 * time without rolling back, so this is how a change that fails partway — the
 * root keeping the operations before the throw — is reproduced deterministically.
 */
function throwOnNthCall(
  proto: { execute: (...args: Array<never>) => unknown },
  n: number,
) {
  let calls = 0;
  const original = proto.execute;
  return vi.spyOn(proto, 'execute').mockImplementation(function (
    this: unknown,
    ...args: Array<never>
  ) {
    calls++;
    if (calls === n) {
      throw new Error('boom');
    }
    return original.apply(this, args);
  });
}

/**
 * `internals` exposes the private state the partial-apply path maintains.
 */
function internals(doc: Document<never>) {
  return doc as unknown as {
    clone?: unknown;
    localChanges: Array<Change<never>>;
  };
}

describe('partially applied change', function () {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records the executed prefix of a failed local change', function () {
    const doc = new Document<{ t: Text }>('d');
    doc.update((r) => {
      r.t = new Text();
      r.t.edit(0, 0, 'ab');
    });

    const events: Array<DocEvent<never>> = [];
    doc.subscribe((event) => {
      events.push(event as DocEvent<never>);
    });

    const before = internals(doc as never).localChanges.length;
    const seqBefore = doc.getChangeID().getClientSeq();

    // The second edit throws while executing against the root; the first has
    // already mutated it. (Edits reach the clone through the proxy, not
    // through `EditOperation.execute`, so call 2 is the root's second op.)
    throwOnNthCall(EditOperation.prototype as never, 2);
    assert.throws(() => {
      doc.update((r) => {
        r.t.edit(2, 2, 'X');
        r.t.edit(3, 3, 'Y');
      });
    }, 'boom');

    // The clone, which applied more than the root did, is dropped. Asserted
    // first: `getRoot` below rebuilds it.
    assert.isUndefined(internals(doc as never).clone);
    // The root kept the prefix...
    assert.equal(doc.getRoot().t.toString(), 'abX');
    // ...so the prefix is recorded for the peers. The failing operation is
    // not in it: telling peers to apply in full an operation this replica
    // only applied part of is the worse divergence of the two.
    const recorded = internals(doc as never).localChanges;
    assert.equal(recorded.length, before + 1);
    assert.equal(recorded[recorded.length - 1].getOperations().length, 1);
    // ...the clientSeq this change consumed is not reissued...
    assert.isAbove(doc.getChangeID().getClientSeq(), seqBefore);
    // ...and subscribers hear about the mutation the document took.
    const local = events.filter((e) => e.type === DocEventType.LocalChange);
    assert.equal(local.length, 1);
  });

  it('records the executed prefix of a failed undo', function () {
    const doc = new Document<{ k: number }>('d');
    doc.update((r) => {
      r.k = 1;
    });
    doc.update((r) => {
      r.k = 2;
    });

    const before = internals(doc as never).localChanges.length;
    const seqBefore = doc.getChangeID().getClientSeq();

    // Call 1 is the clone, call 2 the root: the undo fails after the clone
    // took it, which is exactly the state `update` records a prefix for.
    throwOnNthCall(SetOperation.prototype as never, 2);
    assert.throws(() => doc.history.undo(), 'boom');

    assert.equal(internals(doc as never).localChanges.length, before + 1);
    assert.isAbove(doc.getChangeID().getClientSeq(), seqBefore);
    assert.isUndefined(internals(doc as never).clone);
  });

  it('drops the clone when a remote change fails partway', function () {
    const source = new Document<{ k: number }>('d');
    source.update((r) => {
      r.k = 1;
    });
    const change = internals(source as never).localChanges[0];

    const target = new Document<{ k: number }>('d');
    // Call 1 is the clone, call 2 the root.
    throwOnNthCall(SetOperation.prototype as never, 2);
    assert.throws(
      () => target.applyChange(change as never, OpSource.Remote),
      'boom',
    );

    assert.isUndefined(internals(target as never).clone);
    // The root took a prefix of the change, so the clock moved with it.
    assert.isTrue(
      target.getChangeID().getLamport() >= change.getID().getLamport(),
    );
  });

  it('publishes what a failed remote change applied', function () {
    const source = new Document<{ a: number; b: number }>('d');
    source.update((r) => {
      r.a = 1;
      r.b = 2;
    });
    const change = internals(source as never).localChanges[0];

    const target = new Document<{ a: number; b: number }>('d');
    const events: Array<DocEvent<never>> = [];
    target.subscribe((event) => {
      events.push(event as DocEvent<never>);
    });

    // Calls 1-2 are the clone's two operations, 3-4 the root's: the root
    // takes the first and throws on the second.
    throwOnNthCall(SetOperation.prototype as never, 4);
    assert.throws(
      () => target.applyChange(change as never, OpSource.Remote),
      'boom',
    );

    // The root moved, so subscribers that mirror the document from events
    // hear about exactly the operation it took.
    const remote = events.filter((e) => e.type === DocEventType.RemoteChange);
    assert.equal(remote.length, 1);
    assert.equal((remote[0] as any).value.operations.length, 1);
  });

  it('leaves the clocks alone when only the clone was touched', function () {
    const source = new Document<{ k: number }>('d');
    source.update((r) => {
      r.k = 1;
    });
    const change = internals(source as never).localChanges[0];

    const target = new Document<{ k: number }>('d');
    const lamportBefore = target.getChangeID().getLamport();

    // Call 1 is the clone: the root never sees the change at all, so the
    // version vector must not claim this replica applied it.
    throwOnNthCall(SetOperation.prototype as never, 1);
    assert.throws(
      () => target.applyChange(change as never, OpSource.Remote),
      'boom',
    );

    assert.equal(target.getChangeID().getLamport(), lamportBefore);
  });
});
