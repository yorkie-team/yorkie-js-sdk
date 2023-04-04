import yorkie from '@yorkie-js-sdk/src/yorkie';
import { Client } from '@yorkie-js-sdk/src/client/client';
import { Document } from '@yorkie-js-sdk/src/document/document';

const __karma__ = (global as any).__karma__;
export const testRPCAddr =
  __karma__?.config?.testRPCAddr || 'http://localhost:8080';

export function toDocKey(title: string): string {
  return title
    .substring(0, 120)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');
}

export async function withTwoClientsAndDocuments<T>(
  callback: (
    c1: Client,
    d1: Document<T>,
    c2: Client,
    d2: Document<T>,
  ) => Promise<void>,
  title: string,
): Promise<void> {
  const client1 = new yorkie.Client(testRPCAddr);
  const client2 = new yorkie.Client(testRPCAddr);
  await client1.activate();
  await client2.activate();

  const docKey = `${toDocKey(title)}-${new Date().getTime()}`;
  const doc1 = new yorkie.Document<T>(docKey);
  const doc2 = new yorkie.Document<T>(docKey);

  await client1.attach(doc1, true);
  await client2.attach(doc2, true);

  await callback(client1, doc1, client2, doc2);

  await client1.detach(doc1);
  await client2.detach(doc2);

  await client1.deactivate();
  await client2.deactivate();
}
