/*
 * Copyright 2025 The Yorkie Authors. All rights reserved.
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

import { describe, it, assert } from 'vitest';
import { InitialTimeTicket } from '@yorkie-js/sdk/src/document/time/ticket';
import { InitialChangeID } from '@yorkie-js/sdk/src/document/change/change_id';
import { ChangeContext } from '@yorkie-js/sdk/src/document/change/context';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import { CRDTObject } from '@yorkie-js/sdk/src/document/crdt/object';
import { ElementRHT } from '@yorkie-js/sdk/src/document/crdt/element_rht';
import {
  CounterType,
  CRDTCounter,
} from '@yorkie-js/sdk/src/document/crdt/counter';
import { Primitive } from '@yorkie-js/sdk/src/document/crdt/primitive';
import { IncreaseOperation } from '@yorkie-js/sdk/src/document/operation/increase_operation';
import { MinInt64 } from '@yorkie-js/sdk/src/util/number';

describe('IncreaseOperation', function () {
  it('builds a reverse operation for a MinInt64 operand without throwing', function () {
    // NOTE(chacha912): The operand comes off the wire, so a peer can send
    // MinInt64. Negating it lands on 2^63, one past the int64 range the
    // Primitive constructor rejects, and a remote change that throws is
    // redelivered by the server forever. The negation wraps the way int64
    // arithmetic does instead, so the change applies on every client.
    const root = new CRDTRoot(
      new CRDTObject(InitialTimeTicket, ElementRHT.create()),
    );
    const cc = ChangeContext.create(InitialChangeID, root, {});
    const ticket = cc.issueTimeTicket();
    const counter = CRDTCounter.create(CounterType.Long, 0n, ticket);
    root.getObject().set('counter', counter, ticket);
    root.registerElement(counter, root.getObject());

    const op = IncreaseOperation.create(
      counter.getCreatedAt(),
      Primitive.of(MinInt64, InitialTimeTicket),
    );

    const result = op.execute(root);

    assert.equal(counter.getValue(), MinInt64);
    const reverseOp = result.reverseOp as IncreaseOperation;
    assert.equal(
      (reverseOp.getValue() as Primitive).getValue(),
      MinInt64,
      'negating MinInt64 wraps back to MinInt64, as it does in int64',
    );
  });

  it('ignores a malformed increase on a dedup counter instead of throwing', function () {
    // NOTE(chacha912): Both the actor and the operand come off the wire. A
    // dedup counter accepts only an increment by one from a named actor, and
    // throwing on anything else would wedge every client that receives the
    // change, since the server redelivers a change that fails to apply.
    const root = new CRDTRoot(
      new CRDTObject(InitialTimeTicket, ElementRHT.create()),
    );
    const cc = ChangeContext.create(InitialChangeID, root, {});
    const ticket = cc.issueTimeTicket();
    const counter = CRDTCounter.create(CounterType.IntDedup, 0, ticket);
    root.getObject().set('counter', counter, ticket);
    root.registerElement(counter, root.getObject());

    // No actor, and an operand a dedup counter does not accept.
    for (const [value, actor] of [
      [1, undefined],
      [7, 'actor-1'],
    ] as Array<[number, string | undefined]>) {
      const op = IncreaseOperation.create(
        counter.getCreatedAt(),
        Primitive.of(value, InitialTimeTicket),
        undefined,
        actor,
      );

      const result = op.execute(root);

      assert.deepEqual(result.opInfos, []);
      assert.equal(counter.getValue(), 0);
    }

    // A well-formed one still applies.
    IncreaseOperation.create(
      counter.getCreatedAt(),
      Primitive.of(1, InitialTimeTicket),
      undefined,
      'actor-1',
    ).execute(root);
    assert.equal(counter.getValue(), 1);
  });

  it('applies a non-finite operand as no change instead of throwing', function () {
    // NOTE(chacha912): `BigInt(NaN)` and `BigInt(Infinity)` throw a
    // RangeError, and the operand is wire-supplied, so a peer could stall
    // every client with one Double payload.
    const root = new CRDTRoot(
      new CRDTObject(InitialTimeTicket, ElementRHT.create()),
    );
    const cc = ChangeContext.create(InitialChangeID, root, {});
    const ticket = cc.issueTimeTicket();
    const counter = CRDTCounter.create(CounterType.Int, 5, ticket);
    root.getObject().set('counter', counter, ticket);
    root.registerElement(counter, root.getObject());

    for (const value of [NaN, Infinity, -Infinity]) {
      const op = IncreaseOperation.create(
        counter.getCreatedAt(),
        Primitive.of(value, InitialTimeTicket),
      );

      assert.doesNotThrow(() => op.execute(root));
      assert.equal(counter.getValue(), 5);
    }
  });
});
