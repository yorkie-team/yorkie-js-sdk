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

import { describe, it, assert } from 'vitest';
import { ElementRHT } from '@yorkie-js/sdk/src/document/crdt/element_rht';
import { Primitive } from '@yorkie-js/sdk/src/document/crdt/primitive';
import { CRDTObject } from '@yorkie-js/sdk/src/document/crdt/object';
import {
  InitialTimeTicket,
  TimeTicket,
} from '@yorkie-js/sdk/src/document/time/ticket';

describe('ElementRHT', function () {
  it('should not produce duplicate keys on concurrent set with earlier timestamp', function () {
    // Simulate two clients concurrently setting the same key.
    // Client A sets "color" at T2 (lamport=2, actorID="actorA")
    // Client B sets "color" at T1 (lamport=1, actorID="actorB") — arrives later
    const rht = ElementRHT.create();

    const ticketA = TimeTicket.of(2n, 0, 'actorA');
    const valueA = Primitive.of('red', ticketA);

    // Client A sets "color" = "red" at T2
    rht.set('color', valueA, ticketA);

    const ticketB = TimeTicket.of(1n, 0, 'actorB');
    const valueB = Primitive.of('blue', ticketB);

    // Client B's operation arrives with earlier timestamp T1
    // This should NOT create duplicate "color" keys
    rht.set('color', valueB, ticketB);

    // Verify: CRDTObject.getKeys() should not have duplicates
    const obj = new CRDTObject(InitialTimeTicket, rht);
    const keys = obj.getKeys();
    assert.deepEqual(
      keys,
      ['color'],
      'getKeys() should not return duplicate keys',
    );

    // The winning value should be from Client A (later timestamp)
    const winner = obj.get('color') as Primitive;
    assert.equal(winner.toJSON(), '"red"');
  });

  it('should handle multiple concurrent sets on the same key', function () {
    const rht = ElementRHT.create();

    // Set initial value at T3
    const ticket1 = TimeTicket.of(3n, 0, 'actor1');
    const value1 = Primitive.of('first', ticket1);
    rht.set('key', value1, ticket1);

    // Late-arriving operation at T1
    const ticket2 = TimeTicket.of(1n, 0, 'actor2');
    const value2 = Primitive.of('second', ticket2);
    rht.set('key', value2, ticket2);

    // Another late-arriving operation at T2
    const ticket3 = TimeTicket.of(2n, 0, 'actor3');
    const value3 = Primitive.of('third', ticket3);
    rht.set('key', value3, ticket3);

    const obj = new CRDTObject(InitialTimeTicket, rht);
    const keys = obj.getKeys();
    assert.deepEqual(keys, ['key'], 'should have exactly one "key" entry');

    // Winner should still be the one with the latest timestamp (T3)
    const winner = obj.get('key') as Primitive;
    assert.equal(winner.toJSON(), '"first"');
  });

  it('should remove a losing value when the occupant is a tombstone', function () {
    const rht = ElementRHT.create();

    const winnerTicket = TimeTicket.of(6n, 0, 'actorA');
    const winner = Primitive.of('v2', winnerTicket);
    rht.set('key', winner, winnerTicket);

    const removedAt = TimeTicket.of(7n, 0, 'actorA');
    rht.delete(winnerTicket, removedAt);
    assert.isTrue(winner.isRemoved());

    const loserTicket = TimeTicket.of(5n, 0, 'actorB');
    const loser = Primitive.of('v3', loserTicket);
    rht.set('key', loser, loserTicket);

    assert.isTrue(loser.isRemoved(), 'the losing value should be removed');
    assert.isUndefined(rht.get('key'));

    const obj = new CRDTObject(InitialTimeTicket, rht);
    assert.deepEqual(obj.getKeys(), []);
    assert.equal(obj.toSortedJSON(), '{}');
  });
});
