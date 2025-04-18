import { assert } from 'vitest';
import yorkie, { SyncMode } from '@yorkie-js/sdk/src/yorkie';
import { Client } from '@yorkie-js/sdk/src/client/client';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { Indexable } from '@yorkie-js/sdk/test/helper/helper';
import { execSync } from 'child_process';

export const testRPCAddr = process.env.TEST_RPC_ADDR || 'http://127.0.0.1:8080';
export const testAPIID = process.env.TEST_API_ID || 'admin';
export const testAPIPW = process.env.TEST_API_PW || 'admin';
function isYorkieContainerRunning() {
  if (process.env.CI === 'true') {
    return true;
  }

  try {
    const result = execSync(
      'docker ps --filter "name=^/yorkie$" --format "{{.Names}}"',
      {
        stdio: 'pipe',
      },
    );
    return result && result.toString().trim() !== '';
  } catch (error) {
    return false;
  }
}
export const webhookAddr = isYorkieContainerRunning() && 'host.docker.internal';

export function toDocKey(title: string): string {
  return title
    .substring(0, 120)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');
}

export async function withTwoClientsAndDocuments<
  T,
  P extends Indexable = Indexable,
>(
  callback: (
    c1: Client,
    d1: Document<T, P>,
    c2: Client,
    d2: Document<T, P>,
  ) => Promise<void>,
  title: string,
  syncMode: SyncMode = SyncMode.Manual,
): Promise<void> {
  const client1 = new yorkie.Client({ rpcAddr: testRPCAddr });
  const client2 = new yorkie.Client({ rpcAddr: testRPCAddr });
  await client1.activate();
  await client2.activate();

  const docKey = `${toDocKey(title)}-${new Date().getTime()}`;
  const doc1 = new yorkie.Document<T, P>(docKey);
  const doc2 = new yorkie.Document<T, P>(docKey);

  await client1.attach(doc1, { syncMode });
  await client2.attach(doc2, { syncMode });

  await callback(client1, doc1, client2, doc2);

  await client1.detach(doc1);
  await client2.detach(doc2);

  await client1.deactivate();
  await client2.deactivate();
}

export function assertUndoRedo<T, P extends Indexable>(
  doc: Document<T, P>,
  states: Array<string>,
) {
  for (let i = 0; i < states.length - 1; i++) {
    doc.history.undo();
    assert.equal(
      states[states.length - 2 - i],
      doc.toSortedJSON(),
      `undo 1-${i}`,
    );
  }

  for (let i = 0; i < states.length - 1; i++) {
    doc.history.redo();
    assert.equal(states[i + 1], doc.toSortedJSON(), `redo${i}`);
  }

  for (let i = 0; i < states.length - 1; i++) {
    doc.history.undo();
    assert.equal(
      states[states.length - 2 - i],
      doc.toSortedJSON(),
      `undo 2-${i}`,
    );
  }
}
