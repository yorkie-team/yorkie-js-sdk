import fc from 'fast-check';
import yorkie, { SyncMode } from '@yorkie-js/sdk/src/yorkie';
import { Client } from '@yorkie-js/sdk/src/client/client';
import {
  DocStatus,
  Document,
  Indexable,
} from '@yorkie-js/sdk/src/document/document';
import {
  testRPCAddr,
  toDocKey,
} from '@yorkie-js/sdk/test/integration/integration_helper';

function parseInteger(
  name: string,
  value: string | undefined,
): number | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer: ${value}`);
  }
  return parsed;
}

function parsePositiveInteger(
  name: string,
  value: string | undefined,
): number | undefined {
  const parsed = parseInteger(name, value);
  if (parsed !== undefined && parsed < 1) {
    throw new Error(`${name} must be a positive integer: ${value}`);
  }
  return parsed;
}

// The pinned seed keeps local and CI runs identical; `TEST_PBT_*` overrides
// are for replaying a failure or exploring wider combinations.
export const testPBTSeed =
  parseInteger('TEST_PBT_SEED', process.env.TEST_PBT_SEED) ?? 0x5eed;
export const testPBTNumRuns =
  parsePositiveInteger('TEST_PBT_NUM_RUNS', process.env.TEST_PBT_NUM_RUNS) ??
  20;
export const testPBTClientCounts = (process.env.TEST_PBT_CLIENT_COUNTS ?? '2,3')
  .split(',')
  .map((count) => {
    const parsed = parsePositiveInteger('TEST_PBT_CLIENT_COUNTS', count.trim());
    if (parsed === undefined || parsed < 2) {
      throw new Error(
        `TEST_PBT_CLIENT_COUNTS entries must be integers >= 2: ${count}`,
      );
    }
    return parsed;
  });

export function assertParametersForPBT<T>(): fc.Parameters<T> {
  return { numRuns: testPBTNumRuns, seed: testPBTSeed };
}

/**
 * `testTimeoutForPBT` scales the per-test timeout with the run count since
 * widened PBT runs can exceed the 5s CI `testTimeout`.
 */
export function testTimeoutForPBT(clientCount: number): number {
  if (process.env.CI !== 'true') {
    return Infinity;
  }
  return Math.max(10_000, testPBTNumRuns * clientCount * 500);
}

export interface ClientAndDocument<T, P extends Indexable = Indexable> {
  client: Client;
  document: Document<T, P>;
}

export type ClientsAndDocuments<
  T,
  P extends Indexable = Indexable,
> = ReadonlyArray<ClientAndDocument<T, P>>;

function assertValidClientCount(clientCount: number): void {
  if (!Number.isInteger(clientCount) || clientCount < 2) {
    throw new Error('PBT requires at least two clients');
  }
}

async function cleanupClientAndDocument<T, P extends Indexable>(
  pair: ClientAndDocument<T, P>,
): Promise<Array<unknown>> {
  const errors: Array<unknown> = [];

  if (
    pair.client.isActive() &&
    pair.document.getStatus() === DocStatus.Attached
  ) {
    try {
      await pair.client.detach(pair.document);
    } catch (error) {
      errors.push(error);
    }
  }

  if (pair.client.isActive()) {
    try {
      await pair.client.deactivate();
    } catch (error) {
      errors.push(error);
    }
  }

  return errors;
}

export async function withClientsAndDocumentsForPBT<
  T,
  P extends Indexable = Indexable,
>(
  clientCount: number,
  callback: (pairs: ClientsAndDocuments<T, P>) => Promise<void>,
  title: string,
): Promise<void> {
  assertValidClientCount(clientCount);

  const clients = Array.from(
    { length: clientCount },
    () => new yorkie.Client({ rpcAddr: testRPCAddr }),
  );
  // Leave room for the UUID suffix in the compact document keys used by tests.
  const docKey = `${toDocKey(title).substring(0, 80)}-${clients[0].getKey()}`;
  const pairs: ClientsAndDocuments<T, P> = clients.map((client) => ({
    client,
    document: new yorkie.Document<T, P>(docKey),
  }));

  let operationFailed = false;
  let operationError: unknown;

  try {
    for (const pair of pairs) {
      await pair.client.activate();
      await pair.client.attach(pair.document, {
        syncMode: SyncMode.Manual,
      });
    }
    await callback(pairs);
  } catch (error) {
    operationFailed = true;
    operationError = error;
  }

  // Clean up all pairs independently without replacing a property failure.
  const cleanupErrors = (
    await Promise.all(pairs.map(cleanupClientAndDocument))
  ).flat();

  if (operationFailed) {
    throw operationError;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      'failed to clean up clients and documents',
    );
  }
}

export async function runFinalSyncForPBT<T, P extends Indexable = Indexable>(
  pairs: ClientsAndDocuments<T, P>,
): Promise<void> {
  assertValidClientCount(pairs.length);

  for (const pair of pairs) {
    await pair.client.sync();
  }

  // The last client receives all preceding changes during the first pass.
  for (const pair of pairs.slice(0, -1)) {
    await pair.client.sync();
  }
}
