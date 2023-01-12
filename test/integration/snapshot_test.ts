import { assert } from 'chai';
import { withTwoClientsAndDocuments } from '@yorkie-js-sdk/test/integration/integration_helper';
import { Text } from '@yorkie-js-sdk/src/yorkie';

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

  it('should handle snapshot for text object', async function () {
    await withTwoClientsAndDocuments<{ k1: Text }>(async (c1, d1, c2, d2) => {
      for (let idx = 0; idx < 700; idx++) {
        d1.update((root) => {
          root.k1 = new Text();
        }, 'set new doc by c1');
      }
      await c1.sync();
      await c2.sync();

      // 01. Updates 700 changes over snapshot threshold by c1.
      for (let idx = 0; idx < 700; idx++) {
        d1.update((root) => {
          root.k1.edit(idx, idx, 'x');
        });
      }

      // 02. Makes local change by c2.
      d2.update((root) => {
        root.k1.edit(0, 0, 'o');
      });

      await c1.sync();
      await c2.sync();
      await c1.sync();

      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });

  it('should handle snapshot for text with attributes', async function () {
    await withTwoClientsAndDocuments<{ k1: Text }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.k1 = new Text();
        root.k1.edit(0, 0, 'a');
      }, 'set new doc by c1');
      await c1.sync();
      await c2.sync();

      // 01. Updates 700 changes over snapshot threshold by c1.
      for (let idx = 0; idx < 700; idx++) {
        d1.update((root) => {
          root.k1.setStyle(0, 1, { bold: 'true' });
        });
      }
      await c1.sync();
      await c2.sync();

      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });
});
