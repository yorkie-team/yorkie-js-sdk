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
