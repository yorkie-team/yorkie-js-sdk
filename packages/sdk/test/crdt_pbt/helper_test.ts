import { assert, describe, expect, it } from 'vitest';
import { DocStatus, Indexable } from '@yorkie-js/sdk/src/document/document';
import {
  ClientsAndDocuments,
  withClientsAndDocumentsForPBT,
} from '@yorkie-js/sdk/test/crdt_pbt/helper';

describe('PBT helper', function () {
  it('cleans up clients without replacing the property error', async function ({
    task,
  }) {
    const propertyError = new Error('property failed');
    let capturedPairs: ClientsAndDocuments<Indexable> = [];

    await expect(
      withClientsAndDocumentsForPBT<Indexable>(
        2,
        (pairs) => {
          capturedPairs = pairs;
          return Promise.reject(propertyError);
        },
        task.name,
      ),
    ).rejects.toBe(propertyError);

    assert.lengthOf(capturedPairs, 2);
    for (const pair of capturedPairs) {
      assert.isFalse(pair.client.isActive());
      assert.equal(pair.document.getStatus(), DocStatus.Detached);
    }
  });
});
