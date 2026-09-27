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

import { assert, describe, it } from 'vitest';
import fc from 'fast-check';
import {
  assertParametersForPBT,
  ClientsAndDocuments,
  runFinalSyncForPBT,
  testPBTClientCounts,
  testTimeoutForPBT,
  withClientsAndDocumentsForPBT,
} from '@yorkie-js/sdk/test/crdt_pbt/helper';

// `null` is intentionally included as an in-scope JSON primitive.
type Primitive = number | string | boolean | null;
type ObjectDocument = Record<string, Primitive>;
type ClientIndex = number;

type ObjectMutation =
  | { kind: 'set'; key: string; value: Primitive }
  | { kind: 'delete'; key: string };

type ObjectStep =
  | (ObjectMutation & { client: ClientIndex })
  | { kind: 'sync'; client: ClientIndex };

const keyArbitrary = fc.constantFrom('a', 'b', 'c');

const primitiveArbitrary: fc.Arbitrary<Primitive> = fc.oneof(
  fc.integer({ min: -10, max: 10 }),
  fc.string({ maxLength: 5 }),
  fc.boolean(),
  fc.constant(null),
);

const mutationArbitrary: fc.Arbitrary<ObjectMutation> = fc.oneof(
  fc.record({
    kind: fc.constant<'set'>('set'),
    key: keyArbitrary,
    value: primitiveArbitrary,
  }),
  fc.record({
    kind: fc.constant<'delete'>('delete'),
    key: keyArbitrary,
  }),
);

/**
 * `objectStepArbitrary` creates an arbitrary Object operation.
 */
function objectStepArbitrary(clientCount: number): fc.Arbitrary<ObjectStep> {
  const clientArbitrary = fc.integer({ min: 0, max: clientCount - 1 });

  return fc.oneof(
    {
      arbitrary: fc
        .record({ client: clientArbitrary })
        .chain(({ client }) =>
          mutationArbitrary.map((mutation) => ({ ...mutation, client })),
        ),
      weight: 3,
    },
    {
      arbitrary: fc.record({
        kind: fc.constant<'sync'>('sync'),
        client: clientArbitrary,
      }),
      weight: 1,
    },
  );
}

/**
 * `objectTraceArbitrary` creates an operation trace for multiple clients.
 */
function objectTraceArbitrary(
  clientCount: number,
): fc.Arbitrary<Array<ObjectStep>> {
  const clientIndexes = Array.from(
    { length: clientCount },
    (_, index) => index,
  );
  const optionalGapArbitrary = fc.array(objectStepArbitrary(clientCount), {
    maxLength: 3,
  });

  // Fixed lengths preserve one mutation from every client while shrinking.
  return fc
    .record({
      clientOrder: fc.shuffledSubarray(clientIndexes, {
        minLength: clientCount,
        maxLength: clientCount,
      }),
      mutations: fc.array(mutationArbitrary, {
        minLength: clientCount,
        maxLength: clientCount,
      }),
      gaps: fc.array(optionalGapArbitrary, {
        minLength: clientCount + 1,
        maxLength: clientCount + 1,
      }),
    })
    .map(({ clientOrder, mutations, gaps }) => {
      const trace: Array<ObjectStep> = [...gaps[0]];

      for (let index = 0; index < clientCount; index++) {
        trace.push({
          ...mutations[index],
          client: clientOrder[index],
        });
        trace.push(...gaps[index + 1]);
      }

      return trace;
    });
}

/**
 * `assertDocumentsEqual` asserts that every replica has the same state.
 */
function assertDocumentsEqual(
  pairs: ClientsAndDocuments<ObjectDocument>,
): void {
  const expected = pairs[0].document.toSortedJSON();
  for (const pair of pairs.slice(1)) {
    assert.equal(pair.document.toSortedJSON(), expected);
  }
}

/**
 * `runObjectTrace` executes generated Object operations and checks convergence.
 */
async function runObjectTrace(
  pairs: ClientsAndDocuments<ObjectDocument>,
  trace: Array<ObjectStep>,
): Promise<void> {
  for (const step of trace) {
    const pair = pairs[step.client];

    if (step.kind === 'sync') {
      await pair.client.sync();
      continue;
    }

    pair.document.update((root) => {
      if (step.kind === 'set') {
        root[step.key] = step.value;
      } else {
        delete root[step.key];
      }
    });
  }

  await runFinalSyncForPBT(pairs);
  assertDocumentsEqual(pairs);
}

describe('Object property-based tests', function () {
  for (const clientCount of testPBTClientCounts) {
    it(
      `converges across ${clientCount} clients`,
      { timeout: testTimeoutForPBT(clientCount) },
      async function ({ task }) {
        await fc.assert(
          fc.asyncProperty(objectTraceArbitrary(clientCount), async (trace) => {
            await withClientsAndDocumentsForPBT<ObjectDocument>(
              clientCount,
              (pairs) => runObjectTrace(pairs, trace),
              task.name,
            );
          }),
          assertParametersForPBT(),
        );
      },
    );
  }
});
