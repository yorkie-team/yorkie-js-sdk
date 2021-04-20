import yorkie from '../../src/yorkie';
import { Client } from '../../src/core/client';
import { DocumentReplica, Indexable } from '../../src/document/document';

const __karma__ = (global as any).__karma__;
export const testRPCAddr =
  __karma__.config.testRPCAddr || 'http://localhost:8080';
export const testCollection = 'test-col';

export async function withTwoClientsAndDocuments<T = Indexable>(
  callback: (
    c1: Client,
    d1: DocumentReplica<T>,
    c2: Client,
    d2: DocumentReplica<T>,
  ) => Promise<void>,
  title: string,
): Promise<void> {
  const client1 = yorkie.createClient(testRPCAddr);
  const client2 = yorkie.createClient(testRPCAddr);
  await client1.activate();
  await client2.activate();

  const docKey = `${title}-${new Date().getTime()}`;
  const doc1 = yorkie.createDocument<T>(testCollection, docKey);
  const doc2 = yorkie.createDocument<T>(testCollection, docKey);

  await client1.attach(doc1, true);
  await client2.attach(doc2, true);

  await callback(client1, doc1, client2, doc2);

  await client1.detach(doc1);
  await client2.detach(doc2);

  await client1.deactivate();
  await client2.deactivate();
}
