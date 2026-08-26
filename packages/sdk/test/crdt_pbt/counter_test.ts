import { assert, describe, it } from 'vitest';
import fc from 'fast-check';
import { Counter } from '@yorkie-js/sdk/src/yorkie';
import {
  assertParametersForPBT,
  ClientsAndDocuments,
  runFinalSyncForPBT,
  testPBTClientCounts,
  testTimeoutForPBT,
  withClientsAndDocumentsForPBT,
} from '@yorkie-js/sdk/test/crdt_pbt/helper';

type CounterDocument = { counter: Counter };
type ClientIndex = number;
type CounterStep =
  | { kind: 'increase'; client: ClientIndex; delta: number }
  | { kind: 'sync'; client: ClientIndex };

const nonZeroDeltaArbitrary = fc.oneof(
  fc.integer({ min: -10, max: -1 }),
  fc.integer({ min: 1, max: 10 }),
);

const boundaryDeltaArbitrary = fc.constantFrom(
  2 ** 31 - 1,
  2 ** 31,
  2 ** 31 + 1,
  -(2 ** 31 - 1),
  -(2 ** 31),
  -(2 ** 31 + 1),
  2 ** 53 - 1,
  2 ** 53,
  -(2 ** 53 - 1),
  -(2 ** 53),
);

// Small deltas stay dominant so that shrunk counterexamples remain readable.
const deltaArbitrary = fc.oneof(
  { withCrossShrink: true },
  { arbitrary: nonZeroDeltaArbitrary, weight: 3 },
  { arbitrary: boundaryDeltaArbitrary, weight: 1 },
);

function counterStepArbitrary(clientCount: number): fc.Arbitrary<CounterStep> {
  const clientIndexArbitrary = fc.integer({
    min: 0,
    max: clientCount - 1,
  });
  return fc.oneof(
    fc.record({
      kind: fc.constant<'increase'>('increase'),
      client: clientIndexArbitrary,
      delta: deltaArbitrary,
    }),
    fc.record({
      kind: fc.constant<'sync'>('sync'),
      client: clientIndexArbitrary,
    }),
  );
}

function counterTraceArbitrary(
  clientCount: number,
): fc.Arbitrary<Array<CounterStep>> {
  const clientIndexes = Array.from(
    { length: clientCount },
    (_, index) => index,
  );
  const optionalGapArbitrary = fc.array(counterStepArbitrary(clientCount), {
    maxLength: 2,
  });

  // Fixed lengths preserve one increase from every client while shrinking.
  return fc
    .record({
      clientOrder: fc.shuffledSubarray(clientIndexes, {
        minLength: clientCount,
        maxLength: clientCount,
      }),
      deltas: fc.array(deltaArbitrary, {
        minLength: clientCount,
        maxLength: clientCount,
      }),
      gaps: fc.array(optionalGapArbitrary, {
        minLength: clientCount + 1,
        maxLength: clientCount + 1,
      }),
    })
    .map(({ clientOrder, deltas, gaps }) => {
      const trace: Array<CounterStep> = [...gaps[0]];
      for (let index = 0; index < clientCount; index++) {
        trace.push({
          kind: 'increase',
          client: clientOrder[index],
          delta: deltas[index],
        });
        trace.push(...gaps[index + 1]);
      }
      return trace;
    });
}

function expectedCounterJSON(trace: Array<CounterStep>): string {
  let sum = 0n;
  for (const step of trace) {
    if (step.kind === 'increase') {
      sum += BigInt(step.delta);
    }
  }
  return `{"counter":${BigInt.asIntN(32, sum)}}`;
}

function assertDocumentsEqual(
  pairs: ClientsAndDocuments<CounterDocument>,
  expected: string,
): void {
  for (const pair of pairs) {
    assert.equal(pair.document.toSortedJSON(), expected);
  }
}

async function runCounterTrace(
  pairs: ClientsAndDocuments<CounterDocument>,
  trace: Array<CounterStep>,
): Promise<void> {
  const [first] = pairs;
  first.document.update((root) => {
    root.counter = new Counter(0);
  });
  await runFinalSyncForPBT(pairs);
  assertDocumentsEqual(pairs, '{"counter":0}');

  for (const step of trace) {
    const pair = pairs[step.client];
    if (step.kind === 'sync') {
      await pair.client.sync();
      continue;
    }

    pair.document.update((root) => {
      root.counter.increase(step.delta);
    });
  }

  await runFinalSyncForPBT(pairs);
  assertDocumentsEqual(pairs, expectedCounterJSON(trace));
}

describe('Counter property-based tests', function () {
  for (const clientCount of testPBTClientCounts) {
    it(
      `converges across ${clientCount} clients`,
      { timeout: testTimeoutForPBT(clientCount) },
      async function ({ task }) {
        await fc.assert(
          fc.asyncProperty(
            counterTraceArbitrary(clientCount),
            async (trace) => {
              await withClientsAndDocumentsForPBT<CounterDocument>(
                clientCount,
                (pairs) => runCounterTrace(pairs, trace),
                task.name,
              );
            },
          ),
          assertParametersForPBT(),
        );
      },
    );
  }
});
