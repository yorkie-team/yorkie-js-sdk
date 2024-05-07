import { describe, it, assert } from 'vitest';
import { JSONObject, Client, SyncMode } from '@yorkie-js-sdk/src/yorkie';
import { Document } from '@yorkie-js-sdk/src/document/document';
import {
  withTwoClientsAndDocuments,
  assertUndoRedo,
  toDocKey,
  testRPCAddr,
} from '@yorkie-js-sdk/test/integration/integration_helper';
import { toStringHistoryOp } from '@yorkie-js-sdk/test/helper/helper';
import { YorkieError } from '@yorkie-js-sdk/src/util/error';

describe('Object', function () {
  it('valid key test', function () {
    const doc = new Document<any>('test-doc');

    assert.throws(() => {
      doc.update((root) => {
        root['.'] = 'dot';
      });
    }, YorkieError);

    assert.throws(() => {
      doc.update((root) => {
        root['$...hello'] = 'world';
      });
    }, YorkieError);

    assert.throws(() => {
      doc.update((root) => {
        root[''] = { '.': 'dot' };
      });
    }, YorkieError);
  });

  it('should apply updates inside nested map', function () {
    const doc = new Document<{
      k1: { 'k1-1'?: string; 'k1-2'?: string };
      k2: Array<string | { 'k2-5': string }>;
    }>('test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root['k1'] = { 'k1-1': 'v1' };
      root['k1']['k1-2'] = 'v2';
    }, 'set {"k1-1":"v1","k1-2":"v2":}');
    assert.equal('{"k1":{"k1-1":"v1","k1-2":"v2"}}', doc.toSortedJSON());

    doc.update((root) => {
      root['k1']['k1-2'] = 'v3';
    }, 'set {"k1-2":"v3"}');
    assert.equal('{"k1":{"k1-1":"v1","k1-2":"v3"}}', doc.toSortedJSON());

    doc.update((root) => {
      root['k2'] = ['1', '2'];
      root['k2'].push('3');
    }, 'set ["1","2","3"]');
    assert.equal(
      '{"k1":{"k1-1":"v1","k1-2":"v3"},"k2":["1","2","3"]}',
      doc.toSortedJSON(),
    );

    assert.throws(() => {
      doc.update((root) => {
        root['k2'].push('4');
        throw new Error('dummy error');
      }, 'push "4"');
    }, 'dummy error');
    assert.equal(
      '{"k1":{"k1-1":"v1","k1-2":"v3"},"k2":["1","2","3"]}',
      doc.toSortedJSON(),
    );

    doc.update((root) => {
      root['k2'].push('4');
    }, 'push "4"');
    assert.equal(
      '{"k1":{"k1-1":"v1","k1-2":"v3"},"k2":["1","2","3","4"]}',
      doc.toSortedJSON(),
    );

    doc.update((root) => {
      root['k2'].push({ 'k2-5': 'v4' });
    }, 'push "{k2-5: 4}"');
    assert.equal(
      '{"k1":{"k1-1":"v1","k1-2":"v3"},"k2":["1","2","3","4",{"k2-5":"v4"}]}',
      doc.toSortedJSON(),
    );

    // TODO(Hyemmie): test assertUndoRedo after implementing array's reverse operation
  });

  it('should handle delete operations', function () {
    const doc = new Document<{
      k1: { 'k1-1'?: string; 'k1-2': string; 'k1-3'?: string };
    }>('test-doc');
    const states: Array<string> = [];
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root['k1'] = { 'k1-1': 'v1', 'k1-2': 'v2' };
    }, 'set {"k1":{"k1-1":"v1","k1-2":"v2"}}');
    assert.equal('{"k1":{"k1-1":"v1","k1-2":"v2"}}', doc.toSortedJSON());
    states.push(doc.toSortedJSON());

    doc.update((root) => {
      delete root['k1']['k1-1'];
      root['k1']['k1-3'] = 'v4';
    }, 'set {"k1":{"k1-2":"v2"}}');
    assert.equal('{"k1":{"k1-2":"v2","k1-3":"v4"}}', doc.toSortedJSON());
    states.push(doc.toSortedJSON());

    assertUndoRedo(doc, states);
  });

  it('should support toJS and toJSON methods', function () {
    const doc = new Document<{
      content: JSONObject<{ a: number; b: number; c: number }>;
    }>('test-doc');
    doc.update((root) => {
      root.content = { a: 1, b: 2, c: 3 };
    }, 'set a, b, c');
    assert.equal(doc.toSortedJSON(), '{"content":{"a":1,"b":2,"c":3}}');

    const root = doc.getRoot();
    assert.equal(root.toJSON!(), '{"content":{"a":1,"b":2,"c":3}}');
    assert.deepEqual(root.toJS!(), { content: { a: 1, b: 2, c: 3 } });
    assert.equal(root.content.toJSON!(), '{"a":1,"b":2,"c":3}');
    assert.deepEqual(root.content.toJS!(), { a: 1, b: 2, c: 3 });
  });

  it('Object.keys, Object.values and Object.entries test', function () {
    const doc = new Document<{
      content: { a: number; b: number; c: number };
    }>('test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root.content = { a: 1, b: 2, c: 3 };
    }, 'set a, b, c');
    assert.equal('{"content":{"a":1,"b":2,"c":3}}', doc.toSortedJSON());

    const content = doc.getRoot().content;
    assert.equal('a,b,c', Object.keys(content).join(','));
    assert.equal('1,2,3', Object.values(content).join(','));
    assert.equal('a,1,b,2,c,3', Object.entries(content).join(','));
  });

  it('Can handle concurrent set/delete operations', async function ({ task }) {
    await withTwoClientsAndDocuments<{
      k1: string;
      k2: string;
      k3?: string;
      k4: string;
    }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root['k1'] = 'v1';
      });
      d2.update((root) => {
        root['k1'] = 'v2';
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root['k2'] = '3';
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root['k2'] = 'v2';
      });
      d2.update((root) => {
        root['k2'] = 'v3';
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root['k3'] = 'v4';
      });
      d2.update((root) => {
        root['k4'] = 'v5';
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        delete root['k3'];
      });
      d2.update((root) => {
        root['k3'] = 'v6';
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  it('Returns undefined when looking up an element that doesnt exist', function () {
    const doc = new Document<{
      shapes: {
        [key: string]: { color: string; point: { x: number; y: number } };
      };
    }>('test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root.shapes = {
        circle: { color: 'black', point: { x: 0, y: 0 } },
      };
    });
    assert.equal(
      '{"shapes":{"circle":{"color":"black","point":{"x":0,"y":0}}}}',
      doc.toSortedJSON(),
    );

    doc.update((root) => {
      delete root.shapes.circle;
    });
    assert.equal('{"shapes":{}}', doc.toSortedJSON());
    assert.isUndefined(doc.getRoot().shapes.circle);
    assert.isUndefined(doc.getRoot().shapes.circle?.color);
    assert.isUndefined(doc.getRoot().shapes.circle?.point);
    assert.isUndefined(doc.getRoot().shapes.circle?.point?.x);
  });

  describe('Undo/Redo', function () {
    it('can get proper reverse operations', function () {
      const doc = new Document<{
        shape: { color: string };
      }>('test-doc');

      doc.update((root) => {
        root.shape = { color: 'black' };
      });
      assert.equal(doc.toSortedJSON(), '{"shape":{"color":"black"}}');
      assert.deepEqual(
        doc.getUndoStackForTest().at(-1)?.map(toStringHistoryOp),
        ['0:00:0.REMOVE.1:00:1'],
      );

      doc.history.undo();
      assert.equal(doc.toSortedJSON(), `{}`);
      assert.deepEqual(
        doc.getRedoStackForTest().at(-1)?.map(toStringHistoryOp),
        ['0:00:0.SET.shape={"color":"black"}'],
      );

      doc.history.redo();
      assert.equal(doc.toSortedJSON(), '{"shape":{"color":"black"}}');
      doc.update((root) => {
        root.shape.color = 'red';
      });
      assert.equal(doc.toSortedJSON(), '{"shape":{"color":"red"}}');
      assert.deepEqual(
        doc.getUndoStackForTest().at(-1)?.map(toStringHistoryOp),
        ['1:00:1.SET.color="black"'],
      );

      doc.history.undo();
      assert.equal(doc.toSortedJSON(), '{"shape":{"color":"black"}}');
      assert.deepEqual(
        doc.getRedoStackForTest().at(-1)?.map(toStringHistoryOp),
        ['1:00:1.SET.color="red"'],
      );

      doc.history.redo();
      assert.equal(doc.toSortedJSON(), '{"shape":{"color":"red"}}');
    });

    it('Can undo/redo work properly for simple object', function () {
      const doc = new Document<{
        a: number;
      }>('test-doc');
      assert.equal(doc.toSortedJSON(), '{}');
      assert.equal(doc.history.canUndo(), false);
      assert.equal(doc.history.canRedo(), false);

      doc.update((root) => {
        root.a = 1;
      });
      assert.equal(doc.toSortedJSON(), '{"a":1}');
      assert.equal(doc.history.canUndo(), true);
      assert.equal(doc.history.canRedo(), false);

      doc.update((root) => {
        root.a = 2;
      });
      assert.equal(doc.toSortedJSON(), '{"a":2}');
      assert.equal(doc.history.canUndo(), true);
      assert.equal(doc.history.canRedo(), false);

      doc.history.undo();
      assert.equal(doc.toSortedJSON(), '{"a":1}');
      assert.equal(doc.history.canUndo(), true);
      assert.equal(doc.history.canRedo(), true);

      doc.history.redo();
      assert.equal(doc.toSortedJSON(), '{"a":2}');
      assert.equal(doc.history.canUndo(), true);
      assert.equal(doc.history.canRedo(), false);

      doc.history.undo();
      assert.equal(doc.toSortedJSON(), '{"a":1}');
      assert.equal(doc.history.canUndo(), true);
      assert.equal(doc.history.canRedo(), true);

      doc.history.undo();
      assert.equal(doc.toSortedJSON(), '{}');
      assert.equal(doc.history.canUndo(), false);
      assert.equal(doc.history.canRedo(), true);
    });

    it('Can undo/redo work properly for nested object', function () {
      const doc = new Document<{
        shape: { point: { x: number; y: number }; color: string };
        a: number;
      }>('test-doc');
      const states: Array<string> = [];
      states.push(doc.toSortedJSON());
      assert.equal(doc.toSortedJSON(), '{}');

      doc.update((root) => {
        root.shape = { point: { x: 0, y: 0 }, color: 'red' };
        root.a = 0;
      });
      states.push(doc.toSortedJSON());
      assert.equal(
        doc.toSortedJSON(),
        '{"a":0,"shape":{"color":"red","point":{"x":0,"y":0}}}',
      );

      doc.update((root) => {
        root.shape.point = { x: 1, y: 1 };
        root.shape.color = 'blue';
      });
      states.push(doc.toSortedJSON());
      assert.equal(
        doc.toSortedJSON(),
        '{"a":0,"shape":{"color":"blue","point":{"x":1,"y":1}}}',
      );

      doc.update((root) => {
        root.a = 1;
        root.a = 2;
      });
      states.push(doc.toSortedJSON());
      assert.equal(
        doc.toSortedJSON(),
        '{"a":2,"shape":{"color":"blue","point":{"x":1,"y":1}}}',
      );

      assertUndoRedo(doc, states);
    });

    it(`Should ensure convergence of peer's document after undoing nested objects`, async function ({
      task,
    }) {
      // Test scenario:
      // c1: set shape.point to {x: 0, y: 0}
      // c1: set shape.point to {x: 1, y: 1}
      // c1: undo
      interface TestDoc {
        shape?: { point: { x: number; y: number } };
      }
      const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
      const doc1 = new Document<TestDoc>(docKey);
      const doc2 = new Document<TestDoc>(docKey);

      const client1 = new Client(testRPCAddr);
      const client2 = new Client(testRPCAddr);
      await client1.activate();
      await client2.activate();

      await client1.attach(doc1, { syncMode: SyncMode.Manual });
      doc1.update((root) => {
        root.shape = { point: { x: 0, y: 0 } };
      });
      await client1.sync();
      assert.equal(doc1.toSortedJSON(), '{"shape":{"point":{"x":0,"y":0}}}');

      await client2.attach(doc2, { syncMode: SyncMode.Manual });
      assert.equal(doc2.toSortedJSON(), '{"shape":{"point":{"x":0,"y":0}}}');

      doc1.update((root) => {
        root.shape!.point = { x: 1, y: 1 };
      });
      await client1.sync();
      await client2.sync();
      assert.equal(doc1.toSortedJSON(), '{"shape":{"point":{"x":1,"y":1}}}');
      assert.equal(doc2.toSortedJSON(), '{"shape":{"point":{"x":1,"y":1}}}');

      doc1.history.undo();
      assert.equal(doc1.toSortedJSON(), '{"shape":{"point":{"x":0,"y":0}}}');
      await client1.sync();
      await client2.sync();
      assert.equal(doc2.toSortedJSON(), '{"shape":{"point":{"x":0,"y":0}}}');
    });

    it(`Should handle reverse set operation for elements that other peers deleted`, async function ({
      task,
    }) {
      // Test scenario:
      // c1: set shape.color to 'red'
      // c2: delete shape
      // c1: undo(no changes as the shape was deleted)
      interface TestDoc {
        shape?: { color: string };
      }
      const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
      const doc1 = new Document<TestDoc>(docKey);
      const doc2 = new Document<TestDoc>(docKey);

      const client1 = new Client(testRPCAddr);
      const client2 = new Client(testRPCAddr);
      await client1.activate();
      await client2.activate();

      await client1.attach(doc1, { syncMode: SyncMode.Manual });
      doc1.update((root) => {
        root.shape = { color: 'black' };
      }, 'init doc');
      await client1.sync();
      assert.equal(doc1.toSortedJSON(), '{"shape":{"color":"black"}}');

      await client2.attach(doc2, { syncMode: SyncMode.Manual });
      assert.equal(doc2.toSortedJSON(), '{"shape":{"color":"black"}}');

      doc1.update((root) => {
        root.shape!.color = 'red';
      }, 'set red');
      await client1.sync();
      await client2.sync();
      doc2.update((root) => {
        delete root.shape;
      }, 'delete shape');
      await client2.sync();
      await client1.sync();
      assert.equal(doc1.toSortedJSON(), '{}');
      assert.equal(doc2.toSortedJSON(), '{}');

      // c2 deleted the shape, so the reverse operation cannot be applied
      doc1.history.undo();
      assert.equal(doc1.toSortedJSON(), '{}');
      assert.equal(doc1.getRedoStackForTest().length, 0);
      assert.equal(doc1.history.canRedo(), false);
    });

    it(`Should handle reverse set operation for elements (nested objects) that other peers deleted`, async function ({
      task,
    }) {
      // Test scenario:
      // c1: create shape
      // c1: set shape.circle.point to { x: 1, y: 1 }
      // c2: delete shape
      // c1: undo(no changes as the shape was deleted)
      interface TestDoc {
        shape?: { circle: { point: { x: number; y: number } } };
      }
      const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
      const doc1 = new Document<TestDoc>(docKey);
      const doc2 = new Document<TestDoc>(docKey);

      const client1 = new Client(testRPCAddr);
      const client2 = new Client(testRPCAddr);
      await client1.activate();
      await client2.activate();

      await client1.attach(doc1, { syncMode: SyncMode.Manual });
      doc1.update((root) => {
        root.shape = { circle: { point: { x: 0, y: 0 } } };
      });
      await client1.sync();
      assert.equal(
        doc1.toSortedJSON(),
        '{"shape":{"circle":{"point":{"x":0,"y":0}}}}',
      );

      await client2.attach(doc2, { syncMode: SyncMode.Manual });
      assert.equal(
        doc2.toSortedJSON(),
        '{"shape":{"circle":{"point":{"x":0,"y":0}}}}',
      );

      doc1.update((root) => {
        root.shape!.circle.point = { x: 1, y: 1 };
      });
      await client1.sync();
      await client2.sync();
      assert.equal(
        doc1.toSortedJSON(),
        '{"shape":{"circle":{"point":{"x":1,"y":1}}}}',
      );
      assert.equal(
        doc2.toSortedJSON(),
        '{"shape":{"circle":{"point":{"x":1,"y":1}}}}',
      );
      doc2.update((root) => {
        delete root.shape;
      }, 'delete shape');
      await client2.sync();
      await client1.sync();
      assert.equal(doc1.toSortedJSON(), '{}');
      assert.equal(doc2.toSortedJSON(), '{}');

      const c1ID = client1.getID()!.slice(-2);
      assert.deepEqual(
        doc1.getUndoStackForTest().at(-1)?.map(toStringHistoryOp),
        [`2:${c1ID}:2.SET.point={"x":0,"y":0}`],
      );
      doc1.history.undo();
      assert.equal(doc1.toSortedJSON(), '{}');
      await client1.sync();
      await client2.sync();
      assert.equal(doc2.toSortedJSON(), '{}');
      assert.equal(doc1.getRedoStackForTest().length, 0);
      assert.equal(doc1.history.canRedo(), false);
    });

    it(`Should handle reverse remove operation for elements that other peers deleted`, async function ({
      task,
    }) {
      // Test scenario:
      // c1: create shape
      // c2: delete shape
      // c1: undo(no changes as the shape was deleted)
      interface TestDoc {
        shape?: { color: string };
      }
      const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
      const doc1 = new Document<TestDoc>(docKey);
      const doc2 = new Document<TestDoc>(docKey);

      const client1 = new Client(testRPCAddr);
      const client2 = new Client(testRPCAddr);
      await client1.activate();
      await client2.activate();

      await client1.attach(doc1, { syncMode: SyncMode.Manual });
      doc1.update((root) => {
        root.shape = { color: 'black' };
      }, 'init doc');
      await client1.sync();
      assert.equal(doc1.toSortedJSON(), '{"shape":{"color":"black"}}');

      await client2.attach(doc2, { syncMode: SyncMode.Manual });
      assert.equal(doc2.toSortedJSON(), '{"shape":{"color":"black"}}');

      doc2.update((root) => {
        delete root.shape;
      }, 'delete shape');
      await client2.sync();
      await client1.sync();
      assert.equal(doc1.toSortedJSON(), '{}');
      assert.equal(doc2.toSortedJSON(), '{}');

      // c2 deleted the shape, so the reverse operation cannot be applied
      doc1.history.undo();
      assert.equal(doc1.toSortedJSON(), '{}');
      assert.equal(doc1.getRedoStackForTest().length, 0);
      assert.equal(doc1.history.canRedo(), false);
    });

    it(`Should handle reverse remove operation for elements (nested objects) that other peers deleted`, async function ({
      task,
    }) {
      // Test scenario:
      // c1: set shape.circle.point to { x: 0, y: 0 }
      // c2: delete shape
      // c1: undo(no changes as the shape was deleted)
      interface TestDoc {
        shape?: {
          circle?: { point?: { x?: number; y?: number }; color?: string };
        };
      }
      const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
      const doc1 = new Document<TestDoc>(docKey);
      const doc2 = new Document<TestDoc>(docKey);

      const client1 = new Client(testRPCAddr);
      const client2 = new Client(testRPCAddr);
      await client1.activate();
      await client2.activate();

      await client1.attach(doc1, { syncMode: SyncMode.Manual });
      doc1.update((root) => {
        root.shape = { circle: { color: 'red' } };
      });
      await client1.sync();
      assert.equal(doc1.toSortedJSON(), '{"shape":{"circle":{"color":"red"}}}');

      await client2.attach(doc2, { syncMode: SyncMode.Manual });
      assert.equal(doc2.toSortedJSON(), '{"shape":{"circle":{"color":"red"}}}');

      doc1.update((root) => {
        root.shape!.circle!.point = { x: 0, y: 0 };
      });
      await client1.sync();
      await client2.sync();
      assert.equal(
        doc1.toSortedJSON(),
        '{"shape":{"circle":{"color":"red","point":{"x":0,"y":0}}}}',
      );
      assert.equal(
        doc2.toSortedJSON(),
        '{"shape":{"circle":{"color":"red","point":{"x":0,"y":0}}}}',
      );
      doc2.update((root) => {
        delete root.shape;
      }, 'delete shape');
      await client2.sync();
      await client1.sync();
      assert.equal(doc1.toSortedJSON(), '{}');
      assert.equal(doc2.toSortedJSON(), '{}');

      const c1ID = client1.getID()!.slice(-2);
      assert.deepEqual(
        doc1.getUndoStackForTest().at(-1)?.map(toStringHistoryOp),
        [`2:${c1ID}:2.REMOVE.3:${c1ID}:1`],
      );
      doc1.history.undo();
      assert.equal(doc1.toSortedJSON(), '{}');
      await client1.sync();
      await client2.sync();
      assert.equal(doc2.toSortedJSON(), '{}');
      assert.deepEqual(doc1.getRedoStackForTest().length, 0);
    });

    it(`Should not propagate changes when there is no applied undo operation`, async function ({
      task,
    }) {
      interface TestDoc {
        shape?: { color: string };
      }
      const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
      const doc1 = new Document<TestDoc>(docKey);
      const doc2 = new Document<TestDoc>(docKey);

      const client1 = new Client(testRPCAddr);
      const client2 = new Client(testRPCAddr);
      await client1.activate();
      await client2.activate();

      await client1.attach(doc1, { syncMode: SyncMode.Manual });
      let doc1ChangeID = doc1.getChangeID();
      let doc1Checkpoint = doc1.getCheckpoint();
      assert.equal(doc1ChangeID.getClientSeq(), 1);
      assert.equal(doc1Checkpoint.getClientSeq(), 1);
      assert.equal(doc1Checkpoint.getServerSeq().toInt(), 1);

      doc1.update((root) => {
        root.shape = { color: 'black' };
      }, 'init doc');
      await client1.sync();
      assert.equal(doc1.toSortedJSON(), '{"shape":{"color":"black"}}');
      doc1ChangeID = doc1.getChangeID();
      doc1Checkpoint = doc1.getCheckpoint();
      assert.equal(doc1ChangeID.getClientSeq(), 2);
      assert.equal(doc1Checkpoint.getClientSeq(), 2);
      assert.equal(doc1Checkpoint.getServerSeq().toInt(), 2);

      await client2.attach(doc2, { syncMode: SyncMode.Manual });
      assert.equal(doc2.toSortedJSON(), '{"shape":{"color":"black"}}');

      doc2.update((root) => {
        delete root.shape;
      }, 'delete shape');
      await client2.sync();
      await client1.sync();
      assert.equal(doc1.toSortedJSON(), '{}');
      assert.equal(doc2.toSortedJSON(), '{}');
      doc1ChangeID = doc1.getChangeID();
      doc1Checkpoint = doc1.getCheckpoint();
      assert.equal(doc1ChangeID.getClientSeq(), 2);
      assert.equal(doc1Checkpoint.getClientSeq(), 2);
      assert.equal(doc1Checkpoint.getServerSeq().toInt(), 4);

      // c2 deleted the shape, so the reverse operation cannot be applied
      doc1.history.undo();
      assert.equal(doc1.toSortedJSON(), '{}');
      assert.equal(doc1.getRedoStackForTest().length, 0);
      assert.equal(doc1.history.canRedo(), false);
      await client1.sync();
      await client2.sync();
      await client1.sync();
      // Since there are no applied operations, there should be no change in the sequence.
      doc1ChangeID = doc1.getChangeID();
      doc1Checkpoint = doc1.getCheckpoint();
      assert.equal(doc1ChangeID.getClientSeq(), 2);
      assert.equal(doc1Checkpoint.getClientSeq(), 2);
      assert.equal(doc1Checkpoint.getServerSeq().toInt(), 4);

      doc1.update((root) => {
        root.shape = { color: 'red' };
      });
      await client1.sync();
      assert.equal(doc1.toSortedJSON(), '{"shape":{"color":"red"}}');
      doc1ChangeID = doc1.getChangeID();
      doc1Checkpoint = doc1.getCheckpoint();
      assert.equal(doc1ChangeID.getClientSeq(), 3);
      assert.equal(doc1Checkpoint.getClientSeq(), 3);
      assert.equal(doc1Checkpoint.getServerSeq().toInt(), 5);
    });

    it(`Should not propagate changes when there is no applied undo operation`, async function ({
      task,
    }) {
      interface TestDoc {
        shape?: { color: string };
      }
      const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
      const doc1 = new Document<TestDoc>(docKey);
      const doc2 = new Document<TestDoc>(docKey);

      const client1 = new Client(testRPCAddr);
      const client2 = new Client(testRPCAddr);
      await client1.activate();
      await client2.activate();

      await client1.attach(doc1, { syncMode: SyncMode.Manual });
      let doc1ChangeID = doc1.getChangeID();
      let doc1Checkpoint = doc1.getCheckpoint();
      assert.equal(doc1ChangeID.getClientSeq(), 1);
      assert.equal(doc1Checkpoint.getClientSeq(), 1);
      assert.equal(doc1Checkpoint.getServerSeq().toInt(), 1);

      doc1.update((root) => {
        root.shape = { color: 'black' };
      }, 'init doc');
      await client1.sync();
      assert.equal(doc1.toSortedJSON(), '{"shape":{"color":"black"}}');
      doc1ChangeID = doc1.getChangeID();
      doc1Checkpoint = doc1.getCheckpoint();
      assert.equal(doc1ChangeID.getClientSeq(), 2);
      assert.equal(doc1Checkpoint.getClientSeq(), 2);
      assert.equal(doc1Checkpoint.getServerSeq().toInt(), 2);

      await client2.attach(doc2, { syncMode: SyncMode.Manual });
      assert.equal(doc2.toSortedJSON(), '{"shape":{"color":"black"}}');

      doc2.update((root) => {
        delete root.shape;
      }, 'delete shape');
      await client2.sync();
      await client1.sync();
      assert.equal(doc1.toSortedJSON(), '{}');
      assert.equal(doc2.toSortedJSON(), '{}');
      doc1ChangeID = doc1.getChangeID();
      doc1Checkpoint = doc1.getCheckpoint();
      assert.equal(doc1ChangeID.getClientSeq(), 2);
      assert.equal(doc1Checkpoint.getClientSeq(), 2);
      assert.equal(doc1Checkpoint.getServerSeq().toInt(), 4);

      // c2 deleted the shape, so the reverse operation cannot be applied
      doc1.history.undo();
      assert.equal(doc1.toSortedJSON(), '{}');
      assert.equal(doc1.getRedoStackForTest().length, 0);
      assert.equal(doc1.history.canRedo(), false);
      await client1.sync();
      await client2.sync();
      await client1.sync();
      // Since there are no applied operations, there should be no change in the sequence.
      doc1ChangeID = doc1.getChangeID();
      doc1Checkpoint = doc1.getCheckpoint();
      assert.equal(doc1ChangeID.getClientSeq(), 2);
      assert.equal(doc1Checkpoint.getClientSeq(), 2);
      assert.equal(doc1Checkpoint.getServerSeq().toInt(), 4);

      doc1.update((root) => {
        root.shape = { color: 'red' };
      });
      await client1.sync();
      assert.equal(doc1.toSortedJSON(), '{"shape":{"color":"red"}}');
      doc1ChangeID = doc1.getChangeID();
      doc1Checkpoint = doc1.getCheckpoint();
      assert.equal(doc1ChangeID.getClientSeq(), 3);
      assert.equal(doc1Checkpoint.getClientSeq(), 3);
      assert.equal(doc1Checkpoint.getServerSeq().toInt(), 5);
    });

    it('Can handle concurrent undo/redo: local undo & global redo', async function ({
      task,
    }) {
      interface TestDoc {
        color: string;
      }
      const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
      const doc1 = new Document<TestDoc>(docKey);
      const doc2 = new Document<TestDoc>(docKey);

      const client1 = new Client(testRPCAddr);
      const client2 = new Client(testRPCAddr);
      await client1.activate();
      await client2.activate();

      await client1.attach(doc1, { syncMode: SyncMode.Manual });
      await client2.attach(doc2, { syncMode: SyncMode.Manual });
      doc1.update((root) => {
        root.color = 'black';
      }, 'init doc');
      await client1.sync();
      await client2.sync();
      assert.equal(doc1.toSortedJSON(), '{"color":"black"}');
      assert.equal(doc2.toSortedJSON(), '{"color":"black"}');

      doc1.update((root) => {
        root.color = 'red';
      }, 'set red');
      doc2.update((root) => {
        root.color = 'green';
      }, 'set green');
      await client1.sync();
      await client2.sync();
      await client1.sync();
      assert.equal(doc1.toSortedJSON(), '{"color":"green"}');
      assert.equal(doc2.toSortedJSON(), '{"color":"green"}');

      doc1.history.undo();
      assert.equal(doc1.toSortedJSON(), '{"color":"black"}'); // local-undo
      await client1.sync();
      await client2.sync();
      assert.equal(doc2.toSortedJSON(), '{"color":"black"}');

      doc1.history.redo();
      assert.equal(doc1.toSortedJSON(), '{"color":"green"}'); // global-redo
      await client1.sync();
      await client2.sync();
      assert.equal(doc2.toSortedJSON(), '{"color":"green"}');
    });

    it('Can properly apply remote operations that occurred before local undo', async function ({
      task,
    }) {
      // Test scenario:
      // c1 & c2: color='black'
      // c1: set color to 'red'
      // c2: set color to 'green'
      // c1: undo
      // sync c1 & c2
      interface TestDoc {
        color: string;
      }
      const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
      const doc1 = new Document<TestDoc>(docKey, { disableGC: true });
      const doc2 = new Document<TestDoc>(docKey, { disableGC: true });

      const client1 = new Client(testRPCAddr);
      const client2 = new Client(testRPCAddr);
      await client1.activate();
      await client2.activate();

      await client1.attach(doc1, { syncMode: SyncMode.Manual });
      await client2.attach(doc2, { syncMode: SyncMode.Manual });
      doc1.update((root) => {
        root.color = 'black';
      }, 'init doc');
      await client1.sync();
      await client2.sync();
      await client1.sync();
      assert.equal(doc1.toSortedJSON(), '{"color":"black"}');
      assert.equal(doc2.toSortedJSON(), '{"color":"black"}');

      doc1.update((root) => {
        root.color = 'red';
      }, 'set red');
      doc2.update((root) => {
        root.color = 'green';
      }, 'set green');

      assert.equal(doc1.toSortedJSON(), '{"color":"red"}');
      assert.equal(doc2.toSortedJSON(), '{"color":"green"}');

      doc1.history.undo();
      assert.equal(doc1.toSortedJSON(), '{"color":"black"}');

      await client1.sync();
      await client2.sync();
      await client1.sync();
      assert.equal(doc1.toSortedJSON(), '{"color":"black"}');
      assert.equal(doc2.toSortedJSON(), '{"color":"black"}');

      doc1.history.redo();
      await client1.sync();
      await client2.sync();
      assert.equal(doc1.toSortedJSON(), '{"color":"red"}');
      assert.equal(doc2.toSortedJSON(), '{"color":"red"}');
    });

    it(`Should handle case of reverse operations referencing already garbage-collected elements`, async function ({
      task,
    }) {
      interface TestDoc {
        shape: { color: string };
      }
      const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
      // TODO(chacha912): Remove the disableGC option
      const doc1 = new Document<TestDoc>(docKey, { disableGC: true });
      const doc2 = new Document<TestDoc>(docKey, { disableGC: true });

      const client1 = new Client(testRPCAddr);
      const client2 = new Client(testRPCAddr);
      await client1.activate();
      await client2.activate();

      await client1.attach(doc1, { syncMode: SyncMode.Manual });
      await client2.attach(doc2, { syncMode: SyncMode.Manual });

      doc1.update((root) => {
        root.shape = { color: 'black' };
      });
      doc2.update((root) => {
        root.shape = { color: 'yellow' };
      });
      await client1.sync();
      await client2.sync();
      await client1.sync();
      assert.equal(doc1.toSortedJSON(), '{"shape":{"color":"yellow"}}');
      assert.equal(doc2.toSortedJSON(), '{"shape":{"color":"yellow"}}');

      doc2.update((root) => {
        root.shape.color = 'red';
      });
      await client2.sync();
      await client1.sync();
      await client2.sync();
      assert.equal(doc1.toSortedJSON(), '{"shape":{"color":"red"}}');
      assert.equal(doc2.toSortedJSON(), '{"shape":{"color":"red"}}');

      doc1.history.undo();
      assert.equal(doc1.toSortedJSON(), '{"shape":{"color":"red"}}');
      assert.equal(doc1.getRedoStackForTest().length, 0);
      assert.equal(doc1.history.canRedo(), false);
      await client1.sync();
      await client2.sync();
      assert.equal(doc2.toSortedJSON(), '{"shape":{"color":"red"}}');
    });

    it(`Should clean up the references to a previously deleted node when the deleted node is restored through undo`, async function ({
      task,
    }) {
      interface TestDoc {
        shape: { color: string };
      }
      const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
      const doc1 = new Document<TestDoc>(docKey);
      const doc2 = new Document<TestDoc>(docKey);

      const client1 = new Client(testRPCAddr);
      const client2 = new Client(testRPCAddr);
      await client1.activate();
      await client2.activate();

      await client1.attach(doc1, { syncMode: SyncMode.Manual });
      await client2.attach(doc2, { syncMode: SyncMode.Manual });

      doc1.update((root) => {
        root.shape = { color: 'black' };
      });
      await client1.sync();
      await client2.sync();
      assert.equal(doc1.toSortedJSON(), '{"shape":{"color":"black"}}');
      assert.equal(doc2.toSortedJSON(), '{"shape":{"color":"black"}}');

      doc2.update((root) => {
        root.shape = { color: 'yellow' };
      });
      await client2.sync();
      await client1.sync();
      assert.equal(doc1.toSortedJSON(), '{"shape":{"color":"yellow"}}');
      assert.equal(doc2.toSortedJSON(), '{"shape":{"color":"yellow"}}');

      doc2.history.undo();
      await client2.sync();
      await client1.sync();
      assert.equal(doc1.toSortedJSON(), '{"shape":{"color":"black"}}');
      assert.equal(doc2.toSortedJSON(), '{"shape":{"color":"black"}}');

      // NOTE(chacha912): removedElementSetByCreatedAt should only retain
      // the entry for `{shape: {color: 'yellow'}}`.
      assert.equal(doc2.getGarbageLen(), 2);
    });
  });
});
