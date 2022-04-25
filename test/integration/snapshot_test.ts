import { assert } from 'chai';
import { withTwoClientsAndDocuments } from '@yorkie-js-sdk/test/integration/integration_helper';

describe('Snapshot', function () {
  it('should handle snapshot', async function () {
    type TestDoc = Record<string, number> & { key: string };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      // 01. Updates 700 changes over snapshot threshold.
      for (let idx = 0; idx < 700; idx++) {
        d1.update((root) => {
          root[`${idx}`] = idx;
        });
      }
      await c1.sync();

      // 02. Makes local changes then pull a snapshot from the agent.
      d2.update((root) => {
        root['key'] = 'value';
      });
      await c2.sync();
      assert.equal(d2.getRoot()['key'], 'value');

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });
});
