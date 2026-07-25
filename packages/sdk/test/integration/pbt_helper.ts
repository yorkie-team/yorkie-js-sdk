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

export type TwoClientsAndDocuments<
  T,
  P extends Indexable = Indexable,
> = readonly [ClientAndDocument<T, P>, ClientAndDocument<T, P>];

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

export async function withTwoClientsAndDocumentsForPBT<
  T,
  P extends Indexable = Indexable,
>(
  callback: (pairs: TwoClientsAndDocuments<T, P>) => Promise<void>,
  title: string,
): Promise<void> {
  const client1 = new yorkie.Client({ rpcAddr: testRPCAddr });
  const client2 = new yorkie.Client({ rpcAddr: testRPCAddr });
  // Leave room for the UUID suffix in the compact document keys used by tests.
  const docKey = `${toDocKey(title).substring(0, 80)}-${client1.getKey()}`;
  const doc1 = new yorkie.Document<T, P>(docKey);
  const doc2 = new yorkie.Document<T, P>(docKey);
  const pairs = [
    { client: client1, document: doc1 },
    { client: client2, document: doc2 },
  ] as const;

  let operationFailed = false;
  let operationError: unknown;

  try {
    await client1.activate();
    await client2.activate();
    await client1.attach(doc1, { syncMode: SyncMode.Manual });
    await client2.attach(doc2, { syncMode: SyncMode.Manual });
    await callback(pairs);
  } catch (error) {
    operationFailed = true;
    operationError = error;
  }

  // Clean up both pairs independently without replacing a property failure.
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

export async function runTwoClientFinalSync<T, P extends Indexable = Indexable>(
  pairs: TwoClientsAndDocuments<T, P>,
): Promise<void> {
  // The last sync lets the first client receive changes uploaded by the second.
  await pairs[0].client.sync();
  await pairs[1].client.sync();
  await pairs[0].client.sync();
}
