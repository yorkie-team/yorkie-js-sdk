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
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { OpSource } from '@yorkie-js/sdk/src/document/operation/operation';
import { SetOperation } from '@yorkie-js/sdk/src/document/operation/set_operation';
import {
  ChangeApplyError,
  Code,
  YorkieError,
} from '@yorkie-js/sdk/src/util/error';

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
        throw new SyntaxError('boom');
      }
      return original.apply(this, args);
    });
}

/**
 * `localChangesOf` returns the changes the given document has minted.
 */
function localChangesOf(doc: Document<never>): Array<Change<never>> {
  return (doc as unknown as { localChanges: Array<Change<never>> })
    .localChanges;
}

/**
 * `changeOf` returns a change setting `k` on a document keyed `d`.
 */
function changeOf(): Change<never> {
  const source = new Document<{ k: number }>('d');
  source.update((r) => {
    r.k = 1;
  });
  return localChangesOf(source as never)[0];
}

describe('ChangeApplyError', function () {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('names the document, the change and the operation', function () {
    const change = changeOf();
    const target = new Document<{ k: number }>('d');

    throwOnNthCall(2);
    let err: unknown;
    try {
      target.applyChange(change as never, OpSource.Remote);
    } catch (e) {
      err = e;
    }

    const op = change.getOperations()[0];
    assert.instanceOf(err, ChangeApplyError);
    const applyErr = err as ChangeApplyError;
    assert.equal(applyErr.code, Code.ErrChangeApplyFailed);
    assert.equal(applyErr.docKey, 'd');
    assert.equal(applyErr.changeID, change.getID().toTestString());
    assert.equal(applyErr.opIndex, 0);
    assert.equal(
      applyErr.operation,
      `SetOperation on ${op.getParentCreatedAt().toTestString()}`,
    );
    assert.instanceOf(applyErr.cause, SyntaxError);
    assert.include(applyErr.message, 'of document "d"');
    assert.include(applyErr.message, 'boom');
  });

  it('never carries the operation payload into the message', function () {
    const change = changeOf();
    const target = new Document<{ k: number }>('d');

    throwOnNthCall(2);
    let err: unknown;
    try {
      target.applyChange(change as never, OpSource.Remote);
    } catch (e) {
      err = e;
    }

    // `toTestString` serializes the value that was set — plaintext document
    // content. Neither the named operation nor the message may repeat it.
    const serialized = change.getOperations()[0].toTestString();
    assert.include(serialized, 'k');
    assert.notInclude((err as ChangeApplyError).operation!, serialized);
    assert.notInclude((err as ChangeApplyError).message, serialized);
    assert.notInclude((err as ChangeApplyError).message, '.SET.');
  });

  it('keeps the original error reachable as the cause', function () {
    const change = changeOf();
    const target = new Document<{ k: number }>('d');

    // The clone takes the change first, so this fails the clone pass rather
    // than the root pass; both name the operation and both drop the clone.
    throwOnNthCall(1);
    let err: unknown;
    try {
      target.applyChange(change as never, OpSource.Remote);
    } catch (e) {
      err = e;
    }

    assert.instanceOf(err, ChangeApplyError);
    assert.equal((err as ChangeApplyError).cause instanceof SyntaxError, true);
    assert.equal((err as ChangeApplyError).docKey, 'd');
    assert.equal((err as ChangeApplyError).opIndex, 0);
  });

  it('leaves the error of a local update untouched', function () {
    const target = new Document<{ k: number }>('d');
    vi.spyOn(SetOperation.prototype, 'execute').mockImplementation(() => {
      throw new YorkieError(Code.ErrInvalidArgument, 'nope');
    });

    let err: unknown;
    try {
      target.update((r) => {
        r.k = 1;
      });
    } catch (e) {
      err = e;
    }

    // The caller of `update` asked for this failure and matches on the code
    // the operation threw; the pull path's redelivery story does not apply.
    assert.notInstanceOf(err, ChangeApplyError);
    assert.instanceOf(err, YorkieError);
    assert.equal((err as YorkieError).code, Code.ErrInvalidArgument);

    // The root took only a prefix of the change while the clone took all of
    // it, so the clone must be dropped and rebuilt from the root.
    assert.equal(
      (target as unknown as { clone?: unknown }).clone,
      undefined,
      'the diverged clone is dropped',
    );
  });

  it('leaves the error of a local or undo/redo replay untouched', function () {
    const change = changeOf();

    for (const source of [OpSource.Local, OpSource.UndoRedo]) {
      const target = new Document<{ k: number }>('d');
      const internals = target as unknown as {
        root: never;
        presences: never;
      };
      vi.spyOn(SetOperation.prototype, 'execute').mockImplementation(() => {
        throw new YorkieError(Code.ErrInvalidType, 'nope');
      });

      let err: unknown;
      try {
        change.execute(internals.root, internals.presences, source);
      } catch (e) {
        err = e;
      }

      assert.notInstanceOf(err, ChangeApplyError, source);
      assert.equal((err as YorkieError).code, Code.ErrInvalidType, source);
      vi.restoreAllMocks();
    }
  });

  it('names the change alone when no single operation failed', function () {
    const err = new ChangeApplyError({
      docKey: 'd',
      changeID: 'c',
      cause: new Error('boom'),
    });

    assert.equal(err.message, 'failed to apply change c of document "d": boom');
    assert.equal(err.opIndex, undefined);
    assert.equal(err.operation, undefined);

    // Re-naming with the key it already carries is a no-op.
    assert.equal(err.withDocKey('d'), err);
    assert.notEqual(err.withDocKey('other'), err);
    assert.equal(err.withDocKey('other').changeID, 'c');
  });

  it('reports the stuck checkpoint when a pack cannot be applied', function () {
    const change = changeOf();
    const target = new Document<{ k: number }>('d');
    const pack = new ChangePack<never>(
      'd',
      Checkpoint.of(1n, 0),
      false,
      [change],
      InitialVersionVector,
    );

    const errors: Array<string> = [];
    vi.spyOn(console, 'error').mockImplementation((...args: Array<unknown>) => {
      errors.push(args.join(' '));
    });
    throwOnNthCall(2);

    assert.throws(() => target.applyChangePack(pack), ChangeApplyError);

    // The checkpoint has not advanced, so the server redelivers this pack.
    assert.equal(target.getCheckpoint().getServerSeq(), 0n);
    assert.equal(
      errors.some((line) => line.includes('redeliver')),
      true,
    );
  });
});
