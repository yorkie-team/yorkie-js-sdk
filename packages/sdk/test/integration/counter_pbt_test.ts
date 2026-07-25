import { assert, describe, it } from 'vitest';
import fc from 'fast-check';
import { Counter } from '@yorkie-js/sdk/src/yorkie';
import {
  runTwoClientFinalSync,
  TwoClientsAndDocuments,
  withTwoClientsAndDocumentsForPBT,
} from '@yorkie-js/sdk/test/integration/pbt_helper';

type CounterDocument = { counter: Counter };
type ClientIndex = 0 | 1;
type CounterStep =
  | { kind: 'increase'; client: ClientIndex; delta: number }
  | { kind: 'sync'; client: ClientIndex };

const clientIndexArbitrary = fc.constantFrom<ClientIndex>(0, 1);
const nonZeroDeltaArbitrary = fc.oneof(
  fc.integer({ min: -10, max: -1 }),
  fc.integer({ min: 1, max: 10 }),
);
const counterStepArbitrary: fc.Arbitrary<CounterStep> = fc.oneof(
  fc.record({
    kind: fc.constant<'increase'>('increase'),
    client: clientIndexArbitrary,
    delta: nonZeroDeltaArbitrary,
  }),
  fc.record({
    kind: fc.constant<'sync'>('sync'),
    client: clientIndexArbitrary,
  }),
);
const shortStepListArbitrary = fc.array(counterStepArbitrary, {
  maxLength: 2,
});

// Keep one increase from each client even when fast-check shrinks the trace.
const counterTraceArbitrary: fc.Arbitrary<Array<CounterStep>> = fc
  .record({
    firstClient: clientIndexArbitrary,
    firstDelta: nonZeroDeltaArbitrary,
    secondDelta: nonZeroDeltaArbitrary,
    before: shortStepListArbitrary,
    between: shortStepListArbitrary,
    after: shortStepListArbitrary,
  })
  .map(({ firstClient, firstDelta, secondDelta, before, between, after }) => {
    const secondClient: ClientIndex = firstClient === 0 ? 1 : 0;
    return [
      ...before,
      { kind: 'increase', client: firstClient, delta: firstDelta } as const,
      ...between,
      {
        kind: 'increase',
        client: secondClient,
        delta: secondDelta,
      } as const,
      ...after,
    ];
  });

async function runCounterTrace(
  pairs: TwoClientsAndDocuments<CounterDocument>,
  trace: Array<CounterStep>,
): Promise<void> {
  const [first] = pairs;
  first.document.update((root) => {
    root.counter = new Counter(0);
  });
  await pairs[0].client.sync();
  await pairs[1].client.sync();
  assert.equal(
    pairs[0].document.toSortedJSON(),
    pairs[1].document.toSortedJSON(),
  );

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

  await runTwoClientFinalSync(pairs);
  assert.equal(
    pairs[0].document.toSortedJSON(),
    pairs[1].document.toSortedJSON(),
  );
}

describe('Counter property-based tests', function () {
  it('converges after generated increases and syncs', async function ({
    task,
  }) {
    await fc.assert(
      fc.asyncProperty(counterTraceArbitrary, async (trace) => {
        await withTwoClientsAndDocumentsForPBT<CounterDocument>(
          (pairs) => runCounterTrace(pairs, trace),
          task.name,
        );
      }),
      { numRuns: 20 },
    );
  });
});
