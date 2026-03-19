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
});
