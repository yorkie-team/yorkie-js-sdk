import { describe, it, assert } from 'vitest';
import yorkie from '@yorkie-js/sdk/src/yorkie';
import {
  testRPCAddr,
  toDocKey,
  withTwoClientsAndDocuments,
} from '@yorkie-js/sdk/test/integration/integration_helper';
import { SyncMode } from '@yorkie-js/sdk/src/client/client';

describe('Revision', function () {
  it('Can create a revision and list revisions', async function ({ task }) {
    type TestDoc = { k1: string; k2?: string };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<TestDoc>(docKey);

    const client = new yorkie.Client({ rpcAddr: testRPCAddr });
    await client.activate();
    await client.attach(doc, { syncMode: SyncMode.Manual });

    // 01. Make initial changes
    doc.update((r) => (r.k1 = 'v1'), 'add k1');
    await client.sync();

    // 02. Create a revision
    const rev = await client.createRevision(doc, 'v1.0', 'First revision');
    assert.isNotNull(rev);
    assert.equal(rev.label, 'v1.0');
    assert.equal(rev.description, 'First revision');

    // 03. Make more changes
    doc.update((r) => (r.k2 = 'v2'), 'add k2');
    await client.sync();

    // 04. Create another revision
    const rev2 = await client.createRevision(doc, 'v2.0', 'Second revision');
    assert.isNotNull(rev2);
    assert.equal(rev2.label, 'v2.0');

    // 05. List all revisions
    const revisions = await client.listRevisions(doc);
    assert.isTrue(revisions.length >= 2);
    // Revisions should be in reverse chronological order (newest first)
    assert.equal(revisions[0].label, 'v2.0');
    assert.equal(revisions[1].label, 'v1.0');

    await client.detach(doc);
    await client.deactivate();
  });

  it('Should handle revision pagination', async function ({ task }) {
    type TestDoc = { count: number };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<TestDoc>(docKey);

    const client = new yorkie.Client({ rpcAddr: testRPCAddr });
    await client.activate();
    await client.attach(doc, { syncMode: SyncMode.Manual });

    // Create multiple revisions
    for (let i = 1; i <= 5; i++) {
      doc.update((root) => (root.count = i));
      await client.sync();
      await client.createRevision(doc, `v${i}.0`, `Revision ${i}`);
    }

    // List with pagination
    const firstPage = await client.listRevisions(doc, { pageSize: 3 });
    assert.equal(firstPage.length, 3);

    const secondPage = await client.listRevisions(doc, {
      pageSize: 3,
      offset: 3,
    });
    assert.equal(secondPage.length, 2);

    await client.detach(doc);
    await client.deactivate();
  });

  it('Can restore to a revision', async function ({ task }) {
    type TestDoc = { k1: string; k2?: string };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<TestDoc>(docKey);

    const client = new yorkie.Client({ rpcAddr: testRPCAddr });
    await client.activate();
    await client.attach(doc, { syncMode: SyncMode.Manual });

    // 01. Create initial state
    doc.update((root) => {
      root.k1 = 'v1';
      root.k2 = 'v2';
    }, 'initial state');
    await client.sync();

    // 02. Create a revision of the initial state
    const revision = await client.createRevision(doc, 'v1.0', 'Initial state');
    assert.isNotNull(revision);

    // 03. Make more changes
    doc.update((root) => {
      root.k1 = 'modified';
      root.k2 = 'v3';
    }, 'modify document');
    await client.sync();

    // 04. Verify the document was modified
    assert.equal(doc.toSortedJSON(), '{"k1":"modified","k2":"v3"}');

    // 05. Restore to the revision
    await client.restoreRevision(doc, revision.id);

    // 06. Sync to get the restored state
    await client.sync();

    // 07. Verify the document was restored to the initial state
    assert.equal(doc.toSortedJSON(), '{"k1":"v1","k2":"v2"}');

    await client.detach(doc);
    await client.deactivate();
  });

  it('Should propagate restore to other clients', async function ({ task }) {
    type TestDoc = { k1: string; k2?: string };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      // 01. Client1 creates initial state
      d1.update((root) => {
        root.k1 = 'v1';
        root.k2 = 'v2';
      }, 'initial state');
      await c1.sync();
      await c2.sync();

      // 02. Verify both clients have the same state
      assert.equal(d1.toSortedJSON(), '{"k1":"v1","k2":"v2"}');
      assert.equal(d2.toSortedJSON(), '{"k1":"v1","k2":"v2"}');

      // 03. Client1 creates a revision
      const revision = await c1.createRevision(d1, 'v1.0', 'Initial state');
      assert.isNotNull(revision);

      // 04. Client1 makes changes
      d1.update((root) => {
        root.k1 = 'modified';
        root.k2 = 'v3';
      }, 'modify document');
      await c1.sync();
      await c2.sync();

      // 05. Verify both clients have the modified state
      assert.equal(d1.toSortedJSON(), '{"k1":"modified","k2":"v3"}');
      assert.equal(d2.toSortedJSON(), '{"k1":"modified","k2":"v3"}');

      // 06. Client1 restores to the revision
      await c1.restoreRevision(d1, revision.id);
      await c1.sync();

      // 07. Client2 syncs to receive the restore
      await c2.sync();

      // 08. Verify both clients have been restored to the initial state
      assert.equal(d1.toSortedJSON(), '{"k1":"v1","k2":"v2"}');
      assert.equal(d2.toSortedJSON(), '{"k1":"v1","k2":"v2"}');
    }, task.name);
  });
});
