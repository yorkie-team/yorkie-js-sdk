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
import { JSONArray } from '@yorkie-js/sdk/src/document/json/array';
import {
  assertParametersForPBT,
  ClientsAndDocuments,
  runFinalSyncForPBT,
  testPBTClientCounts,
  testTimeoutForPBT,
  withClientsAndDocumentsForPBT,
} from '@yorkie-js/sdk/test/crdt_pbt/helper';

type ArrayDocument = { list: JSONArray<string> };
type ClientIndex = number;

// Pushed values are assigned while the trace runs, not generated, so every
// value stays unique even after fast-check shrinks the trace.
type ArrayMutation =
  | { kind: 'push' }
  // `position` is reduced modulo the replica's current length at run time,
  // because the generator cannot know which elements a replica will hold.
  | { kind: 'delete'; position: number };

type ArrayStep =
  | (ArrayMutation & { client: ClientIndex })
  | { kind: 'sync'; client: ClientIndex };

const mutationArbitrary: fc.Arbitrary<ArrayMutation> = fc.oneof(
  { arbitrary: fc.constant<ArrayMutation>({ kind: 'push' }), weight: 2 },
  {
    arbitrary: fc.record({
      kind: fc.constant<'delete'>('delete'),
      position: fc.nat({ max: 15 }),
    }),
    weight: 1,
  },
);

/**
 * `arrayStepArbitrary` creates an arbitrary Array operation.
 */
function arrayStepArbitrary(clientCount: number): fc.Arbitrary<ArrayStep> {
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
 * `arrayTraceArbitrary` creates an operation trace for multiple clients.
 */
function arrayTraceArbitrary(
  clientCount: number,
): fc.Arbitrary<Array<ArrayStep>> {
  const clientIndexes = Array.from(
    { length: clientCount },
    (_, index) => index,
  );
  const optionalGapArbitrary = fc.array(arrayStepArbitrary(clientCount), {
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
      const trace: Array<ArrayStep> = [...gaps[0]];

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
 * `TraceLog` records what the trace did, independently of the CRDT.
 */
interface TraceLog {
  pushedByClient: Array<Array<string>>;
  deleted: Set<string>;
}

/**
 * `readList` returns the array of the given replica as plain values.
 */
function readList(
  pairs: ClientsAndDocuments<ArrayDocument>,
  index: number,
): Array<string> {
  const json = JSON.parse(pairs[index].document.toSortedJSON()) as {
    list: Array<string>;
  };
  return json.list;
}

/**
 * `assertDocumentsEqual` asserts that every replica has the same state.
 */
function assertDocumentsEqual(pairs: ClientsAndDocuments<ArrayDocument>): void {
  const expected = pairs[0].document.toSortedJSON();
  for (const pair of pairs.slice(1)) {
    assert.equal(pair.document.toSortedJSON(), expected);
  }
}

/**
 * `assertTraceProperties` checks what can be derived from the trace alone,
 * so a replica set that converges to the same wrong state still fails.
 */
function assertTraceProperties(list: Array<string>, log: TraceLog): void {
  // Every value is unique, so the surviving elements are exactly the pushed
  // values that were never deleted.
  const expected = log.pushedByClient
    .flat()
    .filter((value) => !log.deleted.has(value))
    .sort();
  assert.deepEqual([...list].sort(), expected, 'surviving elements');

  // `push` anchors after the local tail, which is at or after every element
  // the client pushed before, so a client's own pushes keep their order.
  for (const pushed of log.pushedByClient) {
    const positions = pushed
      .filter((value) => !log.deleted.has(value))
      .map((value) => list.indexOf(value));
    const sorted = [...positions].sort((a, b) => a - b);
    assert.deepEqual(positions, sorted, 'order of pushes by one client');
  }
}

/**
 * `runArrayTrace` executes generated Array operations and checks convergence.
 */
async function runArrayTrace(
  pairs: ClientsAndDocuments<ArrayDocument>,
  trace: Array<ArrayStep>,
): Promise<void> {
  // One client creates the array and everyone syncs before the trace starts.
  // If every client created `list` concurrently, the root assignment would be
  // resolved last-writer-wins and the losing clients' pushes would vanish.
  pairs[0].document.update((root) => {
    root.list = [] as unknown as JSONArray<string>;
  });
  await runFinalSyncForPBT(pairs);

  const log: TraceLog = {
    pushedByClient: pairs.map(() => []),
    deleted: new Set(),
  };

  for (const step of trace) {
    const pair = pairs[step.client];

    if (step.kind === 'sync') {
      await pair.client.sync();
      continue;
    }

    if (step.kind === 'push') {
      const value = `c${step.client}-${log.pushedByClient[step.client].length}`;
      log.pushedByClient[step.client].push(value);
      pair.document.update((root) => {
        root.list.push(value);
      });
      continue;
    }

    pair.document.update((root) => {
      const length = root.list.length;
      if (length === 0) {
        return;
      }
      const index = step.position % length;
      log.deleted.add(root.list[index] as string);
      root.list.delete!(index);
    });
  }

  await runFinalSyncForPBT(pairs);
  assertDocumentsEqual(pairs);
  assertTraceProperties(readList(pairs, 0), log);
}

describe('Array property-based tests', function () {
  for (const clientCount of testPBTClientCounts) {
    it(
      `converges across ${clientCount} clients`,
      { timeout: testTimeoutForPBT(clientCount) },
      async function ({ task }) {
        await fc.assert(
          fc.asyncProperty(arrayTraceArbitrary(clientCount), async (trace) => {
            await withClientsAndDocumentsForPBT<ArrayDocument>(
              clientCount,
              (pairs) => runArrayTrace(pairs, trace),
              task.name,
            );
          }),
          assertParametersForPBT(),
        );
      },
    );
  }
});
