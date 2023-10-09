import { assert } from 'chai';
import { TextView } from '@yorkie-js-sdk/test/helper/helper';
import {
  withTwoClientsAndDocuments,
  assertUndoRedo,
  toDocKey,
  testRPCAddr,
} from '@yorkie-js-sdk/test/integration/integration_helper';
import yorkie, { Document, Text } from '@yorkie-js-sdk/src/yorkie';

describe('Text', function () {
  it('should handle edit operations', function () {
    const doc = new Document<{ k1: Text }>('test-doc');
    assert.equal('{}', doc.toSortedJSON());

    //           ------ ins links ----
    //           |            |      |
    // [init] - [A] - [12] - {BC} - [D]
    doc.update((root) => {
      root.k1 = new Text();
      root.k1.edit(0, 0, 'ABCD');
      root.k1.edit(1, 3, '12');
    }, 'set {"k1":"A12D"}');

    doc.update((root) => {
      assert.equal(
        '[0:00:0:0 ][1:00:2:0 A][1:00:3:0 12]{1:00:2:1 BC}[1:00:2:3 D]',
        root['k1'].toTestString(),
      );

      let range = root['k1'].createRangeForTest(0, 0);
      assert.equal('0:00:0:0:0', range[0].toTestString());

      range = root['k1'].createRangeForTest(1, 1);
      assert.equal('1:00:2:0:1', range[0].toTestString());

      range = root['k1'].createRangeForTest(2, 2);
      assert.equal('1:00:3:0:1', range[0].toTestString());

      range = root['k1'].createRangeForTest(3, 3);
      assert.equal('1:00:3:0:2', range[0].toTestString());

      range = root['k1'].createRangeForTest(4, 4);
      assert.equal('1:00:2:3:1', range[0].toTestString());
    });

    assert.equal(
      '{"k1":[{"val":"A"},{"val":"12"},{"val":"D"}]}',
      doc.toSortedJSON(),
    );
  });

  it('should handle edit operations2', function () {
    const doc = new Document<{ k1: Text }>('test-doc');
    assert.equal('{}', doc.toSortedJSON());

    //           -- ins links ---
    //           |              |
    // [init] - [ABC] - [\n] - [D]
    doc.update((root) => {
      root.k1 = new Text();
      root.k1.edit(0, 0, 'ABCD');
      root.k1.edit(3, 3, '\n');
    }, 'set {"k1":"ABC\nD"}');

    doc.update((root) => {
      assert.equal(
        '[0:00:0:0 ][1:00:2:0 ABC][1:00:3:0 \n][1:00:2:3 D]',
        root['k1'].toTestString(),
      );
    });

    assert.equal(
      '{"k1":[{"val":"ABC"},{"val":"\\n"},{"val":"D"}]}',
      doc.toSortedJSON(),
    );
  });

  it('should handle type 하늘', function () {
    const doc = new Document<{ k1: Text }>('test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root.k1 = new Text();
      root.k1.edit(0, 0, 'ㅎ');
      root.k1.edit(0, 1, '하');
      root.k1.edit(0, 1, '한');
      root.k1.edit(0, 1, '하');
      root.k1.edit(1, 1, '느');
      root.k1.edit(1, 2, '늘');
    }, 'set {"k1":"하늘"}');

    assert.equal('{"k1":[{"val":"하"},{"val":"늘"}]}', doc.toSortedJSON());
  });

  it('should handle deletion of nested nodes', function () {
    const doc = new Document<{
      text: Text;
    }>('test-doc');
    const states: Array<string> = [];
    const view = new TextView();
    doc.update((root) => (root.text = new Text()));
    doc.subscribe('$.text', (event) => {
      if (event.type === 'local-change') {
        const { operations } = event.value;
        view.applyOperations(operations);
      }
    });

    const commands = [
      { from: 0, to: 0, content: 'ABC' }, // ABC
      { from: 3, to: 3, content: 'DEF' }, // ABCDEF
      { from: 2, to: 4, content: '1' }, // AB1EF
      { from: 1, to: 4, content: '2' }, // A2F
    ];

    for (const cmd of commands) {
      doc.update((root) => root.text.edit(cmd.from, cmd.to, cmd.content));
      states.push(doc.getValueByPath('$.text')!.toString());
      assert.equal(view.toString(), doc.getRoot().text.toString());
    }
    assertUndoRedo(doc, states, (doc) =>
      doc.getValueByPath('$.text')!.toString(),
    );
  });

  it('should handle deletion of the last nodes', function () {
    const doc = new Document<{ text: Text }>('test-doc');
    const states: Array<string> = [];
    const view = new TextView();

    doc.update((root) => (root.text = new Text()));
    doc.subscribe('$.text', (event) => {
      if (event.type === 'local-change') {
        const { operations } = event.value;
        view.applyOperations(operations);
      }
    });

    const commands = [
      { from: 0, to: 0, content: 'A' },
      { from: 1, to: 1, content: 'B' },
      { from: 2, to: 2, content: 'C' },
      { from: 3, to: 3, content: 'DE' },
      { from: 5, to: 5, content: 'F' },
      { from: 6, to: 6, content: 'GHI' },
      { from: 9, to: 9 }, // delete no last node
      { from: 8, to: 9 }, // delete one last node with split
      { from: 6, to: 8 }, // delete one last node without split
      { from: 4, to: 6 }, // delete last nodes with split
      { from: 2, to: 4 }, // delete last nodes without split
      { from: 0, to: 2 }, // delete last nodes containing the first
    ];

    for (const cmd of commands) {
      doc.update((root) => root.text.edit(cmd.from, cmd.to, cmd.content!));
      states.push(doc.getValueByPath('$.text')!.toString());
      assert.equal(view.toString(), doc.getRoot().text.toString());
    }
    assertUndoRedo(doc, states, (doc) =>
      doc.getValueByPath('$.text')!.toString(),
    );
  });

  it('should handle deletion with boundary nodes already removed', function () {
    const doc = new Document<{ text: Text }>('test-doc');
    const states: Array<string> = [];
    const view = new TextView();
    doc.update((root) => (root.text = new Text()));
    doc.subscribe('$.text', (event) => {
      if (event.type === 'local-change') {
        const { operations } = event.value;
        view.applyOperations(operations);
      }
    });

    const commands = [
      { from: 0, to: 0, content: '1A1BCXEF1' },
      { from: 8, to: 9 },
      { from: 2, to: 3 },
      { from: 0, to: 1 }, // ABCXEF
      { from: 0, to: 1 }, // delete A with two removed boundaries
      { from: 0, to: 1 }, // delete B with removed left boundary
      { from: 3, to: 4 }, // delete F with removed right boundary
      { from: 1, to: 2 },
      { from: 0, to: 2 }, // delete CE with removed inner node X
    ];

    for (const cmd of commands) {
      doc.update((root) => root.text.edit(cmd.from, cmd.to, cmd.content!));
      states.push(doc.getValueByPath('$.text')!.toString());
      assert.equal(view.toString(), doc.getRoot().text.toString());
    }
  });

  it('should handle edit operations', async function () {
    await withTwoClientsAndDocuments<{ k1: Text }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.k1 = new Text();
        root.k1.edit(0, 0, 'ABCD');
      }, 'set new text by c1');
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), `{"k1":[{"val":"ABCD"}]}`);
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root.k1 = new Text();
        root.k1.edit(0, 0, '1234');
      }, 'edit 0,0 1234 by c1');
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), `{"k1":[{"val":"1234"}]}`);
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });

  it('should handle text edit operations with attributes', function () {
    const doc = new Document<{ k1: Text<{ b: string }> }>('test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root.k1 = new Text();
      root.k1.edit(0, 0, 'ABCD', { b: '1' });
      root.k1.edit(3, 3, '\n');
    }, 'set {"k1":"ABC\nD"}');

    doc.update((root) => {
      assert.equal(
        '[0:00:0:0 ][1:00:2:0 ABC][1:00:3:0 \n][1:00:2:3 D]',
        root['k1'].toTestString(),
      );
    });

    assert.equal(
      '{"k1":[{"attrs":{"b":"1"},"val":"ABC"},{"val":"\\n"},{"attrs":{"b":"1"},"val":"D"}]}',
      doc.toSortedJSON(),
    );
  });

  it('should handle text delete operations', function () {
    const doc = new Document<{ k1: Text }>('test-doc');
    doc.update((root) => {
      root.k1 = new Text();
      root.k1.edit(0, 0, 'ABCD');
    }, 'set ABCD');
    assert.equal(doc.getRoot().k1.toString(), `ABCD`);

    doc.update((root) => {
      root.k1.delete(1, 3);
    }, 'delete BC');
    assert.equal(doc.getRoot().k1.toString(), `AD`);
  });

  it('should handle text empty operations', function () {
    const doc = new Document<{ k1: Text }>('test-doc');
    doc.update((root) => {
      root.k1 = new Text();
      root.k1.edit(0, 0, 'ABCD');
    }, 'set ABCD');
    assert.equal(doc.getRoot().k1.toString(), `ABCD`);

    doc.update((root) => {
      root.k1.empty();
    }, 'empty');
    assert.equal(doc.getRoot().k1.toString(), ``);
  });

  it('should handle concurrent edit operations', async function () {
    await withTwoClientsAndDocuments<{ k1: Text }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.k1 = new Text();
      }, 'set new text by c1');
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), `{"k1":[]}`);
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root['k1'].edit(0, 0, 'ABCD');
      }, 'edit 0,0 ABCD by c1');
      assert.equal(d1.toSortedJSON(), `{"k1":[{"val":"ABCD"}]}`);
      d2.update((root) => {
        root['k1'].edit(0, 0, '1234');
      }, 'edit 0,0 1234 by c2');
      assert.equal(d2.toSortedJSON(), `{"k1":[{"val":"1234"}]}`);
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root['k1'].edit(2, 3, 'XX');
      }, 'edit 2,3 XX by c1');
      d2.update((root) => {
        root['k1'].edit(2, 3, 'YY');
      }, 'edit 2,3 YY by c1');
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root['k1'].edit(4, 5, 'ZZ');
      }, 'edit 4,5 ZZ by c1');
      d2.update((root) => {
        root['k1'].edit(2, 3, 'TT');
      }, 'edit 2,3 TT by c1');

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });

  it('should handle concurrent insertion and deletion', async function () {
    await withTwoClientsAndDocuments<{ k1: Text }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.k1 = new Text();
        root.k1.edit(0, 0, 'AB');
      }, 'set new text by c1');
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), `{"k1":[{"val":"AB"}]}`);
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root['k1'].edit(0, 2, '');
      });
      assert.equal(d1.toSortedJSON(), `{"k1":[]}`);
      d2.update((root) => {
        root['k1'].edit(1, 1, 'C');
      });
      assert.equal(
        d2.toSortedJSON(),
        `{"k1":[{"val":"A"},{"val":"C"},{"val":"B"}]}`,
      );

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), `{"k1":[{"val":"C"}]}`);
      assert.equal(d2.toSortedJSON(), `{"k1":[{"val":"C"}]}`);
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });

  it('should handle concurrent block deletions', async function () {
    await withTwoClientsAndDocuments<{ k1: Text }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.k1 = new Text();
        root.k1.edit(0, 0, '123');
        root.k1.edit(3, 3, '456');
        root.k1.edit(6, 6, '789');
      }, 'set new text by c1');
      await c1.sync();
      await c2.sync();
      assert.equal(
        d1.toSortedJSON(),
        `{"k1":[{"val":"123"},{"val":"456"},{"val":"789"}]}`,
      );
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      const view1 = new TextView();
      d1.subscribe('$.k1', (event) => {
        if (event.type === 'local-change') {
          const { operations } = event.value;
          view1.applyOperations(operations);
        }
      });

      d1.update((root) => {
        root.k1.edit(1, 7, '');
      });
      assert.equal(d1.toSortedJSON(), `{"k1":[{"val":"1"},{"val":"89"}]}`);

      d2.update((root) => {
        root.k1.edit(2, 5, '');
      });
      assert.equal(
        d2.toSortedJSON(),
        `{"k1":[{"val":"12"},{"val":"6"},{"val":"789"}]}`,
      );

      await c1.sync();
      await c2.sync();
      await c1.sync();
    }, this.test!.title);
  });

  it('should maintain the correct weight for nodes newly created then concurrently removed', async function () {
    await withTwoClientsAndDocuments<{ k1: Text }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.k1 = new Text();
      }, 'set new text by c1');

      d1.update((root) => {
        root.k1.edit(0, 0, 'O');
        root.k1.edit(1, 1, 'O');
        root.k1.edit(2, 2, 'O');
      });

      await c1.sync();
      await c2.sync();

      d1.update((root) => {
        root.k1.edit(1, 2, 'X');
        root.k1.edit(1, 2, 'X');
        root.k1.edit(1, 2, '');
      });

      d2.update((root) => {
        root.k1.edit(0, 3, 'N');
      });

      await c1.sync();
      await c2.sync();
      await c1.sync();

      // assert.isOk(d1.getRoot().k1.checkWeight());
      // assert.isOk(d2.getRoot().k1.checkWeight());
    }, this.test!.title);
  });

  // TODO(Hyemmie): The text.edit test is not currently available
  // in the `yorkieteam/yorkie` docker image because it requires a protocol change.
  // To test this case, you need to stop the docker yorkie container
  // and run the yorkie server with the code from the `feat/text-edit-reverse`
  // branch of the yorkie repository.
  describe('Undo/Redo', function () {
    it('Can undo/redo for text edit operation', async function () {
      type TestDoc = { text: Text };
      const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
      const doc = new Document<TestDoc>(docKey);
      doc.update((root) => {
        root.text = new Text();
        root.text.edit(0, 0, 'ABCD');
      }, 'init text');
      assert.equal(doc.toSortedJSON(), '{"text":[{"val":"ABCD"}]}');

      doc.update((root) => {
        root.text.edit(1, 3, '12');
      }, `edit 'ABCD' to 'A12D'`);
      assert.equal(
        doc.toSortedJSON(),
        '{"text":[{"val":"A"},{"val":"12"},{"val":"D"}]}',
      );

      doc.history.undo();
      assert.equal(
        doc.toSortedJSON(),
        '{"text":[{"val":"A"},{"val":"BC"},{"val":"D"}]}',
      );

      doc.history.redo();
      assert.equal(
        doc.toSortedJSON(),
        '{"text":[{"val":"A"},{"val":"12"},{"val":"D"}]}',
      );

      doc.history.undo();
      assert.equal(
        doc.toSortedJSON(),
        '{"text":[{"val":"A"},{"val":"BC"},{"val":"D"}]}',
      );
    });

    it('concurrent undo/redo of text.edit', async function () {
      interface TestDoc {
        text: Text;
      }
      const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
      const doc1 = new yorkie.Document<TestDoc>(docKey);
      const doc2 = new yorkie.Document<TestDoc>(docKey);

      const client1 = new yorkie.Client(testRPCAddr);
      const client2 = new yorkie.Client(testRPCAddr);
      await client1.activate();
      await client2.activate();

      await client1.attach(doc1, { isRealtimeSync: false });
      doc1.update((root) => {
        root.text = new Text();
      }, 'init doc');
      await client1.sync();
      assert.equal('{"text":[]}', doc1.toSortedJSON());

      await client2.attach(doc2, { isRealtimeSync: false });
      assert.equal('{"text":[]}', doc2.toSortedJSON());

      doc1.update((root) => root.text.edit(0, 0, '123456'));
      await client1.sync();
      await client2.sync();
      await client1.sync();
      assert.equal('{"text":[{"val":"123456"}]}', doc1.toSortedJSON());
      assert.equal('{"text":[{"val":"123456"}]}', doc2.toSortedJSON());

      doc2.update((root) => root.text.edit(2, 4, 'CD'));
      await client1.sync();
      await client2.sync();
      await client1.sync();
      assert.equal(
        '{"text":[{"val":"12"},{"val":"CD"},{"val":"56"}]}',
        doc1.toSortedJSON(),
      );
      assert.equal(
        '{"text":[{"val":"12"},{"val":"CD"},{"val":"56"}]}',
        doc2.toSortedJSON(),
      );

      doc1.history.undo();
      assert.equal('{"text":[{"val":"CD"}]}', doc1.toSortedJSON());

      await client1.sync();
      await client2.sync();
      await client1.sync();

      assert.equal('{"text":[{"val":"CD"}]}', doc1.toSortedJSON());
      assert.equal('{"text":[{"val":"CD"}]}', doc2.toSortedJSON());

      doc1.history.redo();

      assert.equal(
        '{"text":[{"val":"12"},{"val":"CD"},{"val":"34"},{"val":"56"}]}',
        doc1.toSortedJSON(),
      );

      await client1.sync();
      await client2.sync();
      await client1.sync();

      assert.equal(
        '{"text":[{"val":"12"},{"val":"CD"},{"val":"34"},{"val":"56"}]}',
        doc1.toSortedJSON(),
      );
      assert.equal(
        '{"text":[{"val":"12"},{"val":"CD"},{"val":"34"},{"val":"56"}]}',
        doc2.toSortedJSON(),
      );
    });

    it('concurrent undo/redo of text.edit 2', async function () {
      interface TestDoc {
        text: Text;
      }
      const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
      const doc1 = new yorkie.Document<TestDoc>(docKey);
      const doc2 = new yorkie.Document<TestDoc>(docKey);

      const client1 = new yorkie.Client(testRPCAddr);
      const client2 = new yorkie.Client(testRPCAddr);
      await client1.activate();
      await client2.activate();

      await client1.attach(doc1, { isRealtimeSync: false });
      doc1.update((root) => {
        root.text = new Text();
      }, 'init doc');
      await client1.sync();
      assert.equal('{"text":[]}', doc1.toSortedJSON());

      await client2.attach(doc2, { isRealtimeSync: false });
      assert.equal('{"text":[]}', doc2.toSortedJSON());

      doc1.update((root) => root.text.edit(0, 0, '123456'));
      await client1.sync();
      await client2.sync();
      await client1.sync();
      assert.equal('{"text":[{"val":"123456"}]}', doc1.toSortedJSON());
      assert.equal('{"text":[{"val":"123456"}]}', doc2.toSortedJSON());

      doc2.update((root) => root.text.edit(0, 0, 'ABC'));
      await client1.sync();
      await client2.sync();
      await client1.sync();
      assert.equal(
        '{"text":[{"val":"ABC"},{"val":"123456"}]}',
        doc1.toSortedJSON(),
      );
      assert.equal(
        '{"text":[{"val":"ABC"},{"val":"123456"}]}',
        doc2.toSortedJSON(),
      );

      doc1.history.undo();
      assert.equal('{"text":[{"val":"ABC"}]}', doc1.toSortedJSON());

      await client1.sync();
      await client2.sync();
      await client1.sync();

      assert.equal('{"text":[{"val":"ABC"}]}', doc1.toSortedJSON());
      assert.equal('{"text":[{"val":"ABC"}]}', doc2.toSortedJSON());

      doc1.history.redo();

      assert.equal(
        '{"text":[{"val":"ABC"},{"val":"123456"}]}',
        doc1.toSortedJSON(),
      );

      await client1.sync();
      await client2.sync();
      await client1.sync();

      assert.equal(
        '{"text":[{"val":"ABC"},{"val":"123456"}]}',
        doc1.toSortedJSON(),
      );
      assert.equal(
        '{"text":[{"val":"ABC"},{"val":"123456"}]}',
        doc2.toSortedJSON(),
      );
    });

    it('concurrent undo/redo of text.edit 3', async function () {
      interface TestDoc {
        text: Text;
      }
      const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
      const doc1 = new yorkie.Document<TestDoc>(docKey);
      const doc2 = new yorkie.Document<TestDoc>(docKey);

      const client1 = new yorkie.Client(testRPCAddr);
      const client2 = new yorkie.Client(testRPCAddr);
      await client1.activate();
      await client2.activate();

      await client1.attach(doc1, { isRealtimeSync: false });
      doc1.update((root) => {
        root.text = new Text();
      }, 'init doc');
      await client1.sync();
      assert.equal('{"text":[]}', doc1.toSortedJSON());

      await client2.attach(doc2, { isRealtimeSync: false });
      assert.equal('{"text":[]}', doc2.toSortedJSON());

      doc1.update((root) => root.text.edit(0, 0, '123456'));
      await client1.sync();
      await client2.sync();
      await client1.sync();
      assert.equal('{"text":[{"val":"123456"}]}', doc1.toSortedJSON());
      assert.equal('{"text":[{"val":"123456"}]}', doc2.toSortedJSON());

      doc2.update((root) => root.text.edit(3, 6, ''));
      await client1.sync();
      await client2.sync();
      await client1.sync();
      assert.equal('{"text":[{"val":"123"}]}', doc1.toSortedJSON());
      assert.equal('{"text":[{"val":"123"}]}', doc2.toSortedJSON());

      doc1.history.undo();
      assert.equal('{"text":[]}', doc1.toSortedJSON());

      await client1.sync();
      await client2.sync();
      await client1.sync();

      assert.equal('{"text":[]}', doc1.toSortedJSON());
      assert.equal('{"text":[]}', doc2.toSortedJSON());

      doc1.history.redo();

      assert.equal(
        '{"text":[{"val":"123"},{"val":"456"}]}',
        doc1.toSortedJSON(),
      );

      await client1.sync();
      await client2.sync();
      await client1.sync();

      assert.equal(
        '{"text":[{"val":"123"},{"val":"456"}]}',
        doc1.toSortedJSON(),
      );
      assert.equal(
        '{"text":[{"val":"123"},{"val":"456"}]}',
        doc2.toSortedJSON(),
      );
    });

    it('concurrent undo/redo of text.edit 4', async function () {
      interface TestDoc {
        text: Text;
      }
      const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
      const doc1 = new yorkie.Document<TestDoc>(docKey);
      const doc2 = new yorkie.Document<TestDoc>(docKey);

      const client1 = new yorkie.Client(testRPCAddr);
      const client2 = new yorkie.Client(testRPCAddr);
      await client1.activate();
      await client2.activate();

      await client1.attach(doc1, { isRealtimeSync: false });
      doc1.update((root) => {
        root.text = new Text();
      }, 'init doc');
      await client1.sync();
      assert.equal('{"text":[]}', doc1.toSortedJSON());

      await client2.attach(doc2, { isRealtimeSync: false });
      assert.equal('{"text":[]}', doc2.toSortedJSON());

      doc1.update((root) => root.text.edit(0, 0, '123456'));
      await client1.sync();
      await client2.sync();
      await client1.sync();
      assert.equal('{"text":[{"val":"123456"}]}', doc1.toSortedJSON());
      assert.equal('{"text":[{"val":"123456"}]}', doc2.toSortedJSON());

      doc2.update((root) => root.text.edit(4, 4, 'ABC'));
      await client1.sync();
      await client2.sync();
      await client1.sync();
      assert.equal(
        '{"text":[{"val":"1234"},{"val":"ABC"},{"val":"56"}]}',
        doc1.toSortedJSON(),
      );
      assert.equal(
        '{"text":[{"val":"1234"},{"val":"ABC"},{"val":"56"}]}',
        doc2.toSortedJSON(),
      );

      doc1.history.undo();
      assert.equal('{"text":[{"val":"ABC"}]}', doc1.toSortedJSON());

      await client1.sync();
      await client2.sync();
      await client1.sync();

      assert.equal('{"text":[{"val":"ABC"}]}', doc1.toSortedJSON());
      assert.equal('{"text":[{"val":"ABC"}]}', doc2.toSortedJSON());

      doc1.history.redo();

      assert.equal(
        '{"text":[{"val":"1234"},{"val":"ABC"},{"val":"56"}]}',
        doc1.toSortedJSON(),
      );

      await client1.sync();
      await client2.sync();
      await client1.sync();

      assert.equal(
        '{"text":[{"val":"1234"},{"val":"ABC"},{"val":"56"}]}',
        doc1.toSortedJSON(),
      );
      assert.equal(
        '{"text":[{"val":"1234"},{"val":"ABC"},{"val":"56"}]}',
        doc2.toSortedJSON(),
      );
    });

    it('concurrent undo/redo of text.edit must turn off GC 1', async function () {
      interface TestDoc {
        text: Text;
      }
      const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
      const doc1 = new yorkie.Document<TestDoc>(docKey);
      const doc2 = new yorkie.Document<TestDoc>(docKey);

      const client1 = new yorkie.Client(testRPCAddr);
      const client2 = new yorkie.Client(testRPCAddr);
      await client1.activate();
      await client2.activate();

      await client1.attach(doc1, { isRealtimeSync: false });
      doc1.update((root) => {
        root.text = new Text();
      }, 'init doc');
      await client1.sync();
      assert.equal('{"text":[]}', doc1.toSortedJSON());

      await client2.attach(doc2, { isRealtimeSync: false });
      assert.equal('{"text":[]}', doc2.toSortedJSON());

      doc1.update((root) => root.text.edit(0, 0, 'ABC'));
      await client1.sync();
      await client2.sync();

      assert.equal('{"text":[{"val":"ABC"}]}', doc1.toSortedJSON());
      assert.equal('{"text":[{"val":"ABC"}]}', doc2.toSortedJSON());

      doc2.update((root) => root.text.edit(3, 3, 'DEF'));
      await client2.sync();
      await client1.sync();

      assert.equal(
        '{"text":[{"val":"ABC"},{"val":"DEF"}]}',
        doc1.toSortedJSON(),
      );
      assert.equal(
        '{"text":[{"val":"ABC"},{"val":"DEF"}]}',
        doc2.toSortedJSON(),
      );

      doc1.update((root) => root.text.edit(2, 4, '1'));
      await client1.sync();
      await client2.sync();
      await client2.sync();
      await client1.sync();

      assert.equal(
        '{"text":[{"val":"AB"},{"val":"1"},{"val":"EF"}]}',
        doc1.toSortedJSON(),
      );
      assert.equal(
        '{"text":[{"val":"AB"},{"val":"1"},{"val":"EF"}]}',
        doc2.toSortedJSON(),
      );

      console.log(doc1.toSortedJSON(), doc1.getGarbageLen());

      doc1.update((root) => root.text.edit(1, 4, '2'));
      await client1.sync();
      await client2.sync();

      assert.equal(
        '{"text":[{"val":"A"},{"val":"2"},{"val":"F"}]}',
        doc1.toSortedJSON(),
      );
      assert.equal(
        '{"text":[{"val":"A"},{"val":"2"},{"val":"F"}]}',
        doc2.toSortedJSON(),
      );

      doc1.history.undo();
      assert.equal(
        '{"text":[{"val":"A"},{"val":"B"},{"val":"1"},{"val":"E"},{"val":"F"}]}',
        doc1.toSortedJSON(),
      );

      assert.throws(
        () => {
          doc1.history.undo();
        },
        Error,
        'the node of the given id should be found',
      );

      client1.detach(doc1);
      client2.detach(doc2);
    });

    it('concurrent undo/redo of text.edit must turn off GC 2', async function () {
      interface TestDoc {
        text: Text;
      }
      const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
      const doc1 = new yorkie.Document<TestDoc>(docKey, { disableGC: true });
      const doc2 = new yorkie.Document<TestDoc>(docKey, { disableGC: true });

      const client1 = new yorkie.Client(testRPCAddr);
      const client2 = new yorkie.Client(testRPCAddr);
      await client1.activate();
      await client2.activate();

      await client1.attach(doc1, { isRealtimeSync: false });
      doc1.update((root) => {
        root.text = new Text();
      }, 'init doc');
      await client1.sync();
      assert.equal('{"text":[]}', doc1.toSortedJSON());

      await client2.attach(doc2, { isRealtimeSync: false });
      assert.equal('{"text":[]}', doc2.toSortedJSON());

      doc1.update((root) => root.text.edit(0, 0, 'ABC'));
      await client1.sync();
      await client2.sync();

      assert.equal('{"text":[{"val":"ABC"}]}', doc1.toSortedJSON());
      assert.equal('{"text":[{"val":"ABC"}]}', doc2.toSortedJSON());

      doc2.update((root) => root.text.edit(3, 3, 'DEF'));
      await client2.sync();
      await client1.sync();

      assert.equal(
        '{"text":[{"val":"ABC"},{"val":"DEF"}]}',
        doc1.toSortedJSON(),
      );
      assert.equal(
        '{"text":[{"val":"ABC"},{"val":"DEF"}]}',
        doc2.toSortedJSON(),
      );

      doc1.update((root) => root.text.edit(2, 4, '1'));
      await client1.sync();
      await client2.sync();
      await client2.sync();
      await client1.sync();

      assert.equal(
        '{"text":[{"val":"AB"},{"val":"1"},{"val":"EF"}]}',
        doc1.toSortedJSON(),
      );
      assert.equal(
        '{"text":[{"val":"AB"},{"val":"1"},{"val":"EF"}]}',
        doc2.toSortedJSON(),
      );

      console.log(doc1.toSortedJSON(), doc1.getGarbageLen());

      doc1.update((root) => root.text.edit(1, 4, '2'));
      await client1.sync();
      await client2.sync();

      assert.equal(
        '{"text":[{"val":"A"},{"val":"2"},{"val":"F"}]}',
        doc1.toSortedJSON(),
      );
      assert.equal(
        '{"text":[{"val":"A"},{"val":"2"},{"val":"F"}]}',
        doc2.toSortedJSON(),
      );

      doc1.history.undo();
      assert.equal(
        '{"text":[{"val":"A"},{"val":"B"},{"val":"1"},{"val":"E"},{"val":"F"}]}',
        doc1.toSortedJSON(),
      );

      doc1.history.undo();
      assert.equal(
        '{"text":[{"val":"A"},{"val":"B"},{"val":"C"},{"val":"D"},{"val":"E"},{"val":"F"}]}',
        doc1.toSortedJSON(),
      );

      client1.detach(doc1);
      client2.detach(doc2);
    });
  });
});

describe('peri-text example: text concurrent edit', function () {
  it('ex1. concurrent insertions on plain text', async function () {
    await withTwoClientsAndDocuments<{ k1: Text }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.k1 = new Text();
        root.k1.edit(0, 0, 'The fox jumped.');
      }, 'set text by c1');
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), `{"k1":[{"val":"The fox jumped."}]}`);
      assert.equal(d2.toSortedJSON(), d1.toSortedJSON());

      d1.update((root) => {
        root.k1.edit(4, 4, 'quick ');
      }, `add 'quick' by c1`);
      assert.equal(
        d1.toSortedJSON(),
        `{"k1":[{"val":"The "},{"val":"quick "},{"val":"fox jumped."}]}`,
      );
      d2.update((root) => {
        root.k1.edit(14, 14, ' over the dog');
      }, `add 'over the dog' by c2`);
      assert.equal(
        d2.toSortedJSON(),
        `{"k1":[{"val":"The fox jumped"},{"val":" over the dog"},{"val":"."}]}`,
      );
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(
        d1.toSortedJSON(),
        '{"k1":[{"val":"The "},{"val":"quick "},{"val":"fox jumped"},{"val":" over the dog"},{"val":"."}]}',
      );
      assert.equal(d2.toSortedJSON(), d1.toSortedJSON());
    }, this.test!.title);
  });

  it('ex2. concurrent formatting and insertion', async function () {
    await withTwoClientsAndDocuments<{ k1: Text }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.k1 = new Text();
        root.k1.edit(0, 0, 'The fox jumped.');
      }, 'set text by c1');
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), `{"k1":[{"val":"The fox jumped."}]}`);
      assert.equal(d2.toSortedJSON(), d1.toSortedJSON());

      d1.update((root) => {
        root.k1.setStyle(0, 15, { bold: true });
      }, `bolds text by c1`);
      assert.equal(
        d1.toSortedJSON(),
        `{"k1":[{"attrs":{"bold":true},"val":"The fox jumped."}]}`,
      );
      d2.update((root) => {
        root.k1.edit(4, 4, 'brown ');
      }, `add 'brown' by c2`);
      assert.equal(
        d2.toSortedJSON(),
        `{"k1":[{"val":"The "},{"val":"brown "},{"val":"fox jumped."}]}`,
      );
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(
        d1.toSortedJSON(),
        '{"k1":[{"attrs":{"bold":true},"val":"The "},{"val":"brown "},{"attrs":{"bold":true},"val":"fox jumped."}]}',
        'd1',
      );
      // TODO(MoonGyu1): d1 and d2 should have the result below after applying mark operation
      // assert.equal(
      //   d1.toSortedJSON(),
      //   '{"k1":[{"attrs":{"bold":true},"val":"The "},{"attrs":{"bold":true},"val":"brown "},{"attrs":{"bold":true},"val":"fox jumped."}]}',
      //   'd1',
      // );
      assert.equal(d2.toSortedJSON(), d1.toSortedJSON());
    }, this.test!.title);
  });

  it('ex3. overlapping formatting(bold)', async function () {
    await withTwoClientsAndDocuments<{ k1: Text }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.k1 = new Text();
        root.k1.edit(0, 0, 'The fox jumped.');
      }, 'set text by c1');
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), `{"k1":[{"val":"The fox jumped."}]}`);
      assert.equal(d2.toSortedJSON(), d1.toSortedJSON());

      d1.update((root) => {
        root.k1.setStyle(0, 7, { bold: true });
      }, `bolds text by c1`);
      assert.equal(
        d1.toSortedJSON(),
        `{"k1":[{"attrs":{"bold":true},"val":"The fox"},{"val":" jumped."}]}`,
      );
      d2.update((root) => {
        root.k1.setStyle(4, 15, { bold: true });
      }, `bolds text by c2`);
      assert.equal(
        d2.toSortedJSON(),
        `{"k1":[{"val":"The "},{"attrs":{"bold":true},"val":"fox jumped."}]}`,
      );
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(
        d1.toSortedJSON(),
        '{"k1":[{"attrs":{"bold":true},"val":"The "},{"attrs":{"bold":true},"val":"fox"},{"attrs":{"bold":true},"val":" jumped."}]}',
        'd1',
      );
      assert.equal(d2.toSortedJSON(), d1.toSortedJSON(), 'd2');
    }, this.test!.title);
  });

  it('ex4. overlapping different formatting(bold and italic)', async function () {
    await withTwoClientsAndDocuments<{ k1: Text }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.k1 = new Text();
        root.k1.edit(0, 0, 'The fox jumped.');
      }, 'set text by c1');
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), `{"k1":[{"val":"The fox jumped."}]}`);
      assert.equal(d2.toSortedJSON(), d1.toSortedJSON());

      d1.update((root) => {
        root.k1.setStyle(0, 7, { bold: true });
      }, `bolds text by c1`);
      assert.equal(
        d1.toSortedJSON(),
        `{"k1":[{"attrs":{"bold":true},"val":"The fox"},{"val":" jumped."}]}`,
      );
      d2.update((root) => {
        root.k1.setStyle(4, 15, { italic: true });
      }, `italicize text by c2`);
      assert.equal(
        d2.toSortedJSON(),
        `{"k1":[{"val":"The "},{"attrs":{"italic":true},"val":"fox jumped."}]}`,
      );
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(
        d1.toSortedJSON(),
        '{"k1":[{"attrs":{"bold":true},"val":"The "},{"attrs":{"bold":true,"italic":true},"val":"fox"},{"attrs":{"italic":true},"val":" jumped."}]}',
        'd1',
      );
      assert.equal(d2.toSortedJSON(), d1.toSortedJSON(), 'd2');
    }, this.test!.title);
  });

  it('ex5. conflicting overlaps(highlighting)', async function () {
    await withTwoClientsAndDocuments<{ k1: Text }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.k1 = new Text();
        root.k1.edit(0, 0, 'The fox jumped.');
      }, 'set text by c1');
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), `{"k1":[{"val":"The fox jumped."}]}`);
      assert.equal(d2.toSortedJSON(), d1.toSortedJSON());

      d1.update((root) => {
        root.k1.setStyle(0, 7, { highlight: 'red' });
      }, `highlight text by c1`);
      assert.equal(
        d1.toSortedJSON(),
        `{"k1":[{"attrs":{"highlight":"red"},"val":"The fox"},{"val":" jumped."}]}`,
      );
      d2.update((root) => {
        root.k1.setStyle(4, 15, { highlight: 'blue' });
      }, `highlight text by c2`);
      assert.equal(
        d2.toSortedJSON(),
        `{"k1":[{"val":"The "},{"attrs":{"highlight":"blue"},"val":"fox jumped."}]}`,
      );
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(
        d1.toSortedJSON(),
        '{"k1":[{"attrs":{"highlight":"red"},"val":"The "},{"attrs":{"highlight":"blue"},"val":"fox"},{"attrs":{"highlight":"blue"},"val":" jumped."}]}',
        'd1',
      );
      assert.equal(d2.toSortedJSON(), d1.toSortedJSON(), 'd2');
    }, this.test!.title);
  });

  it('ex6. conflicting overlaps(bold) - 1', async function () {
    await withTwoClientsAndDocuments<{ k1: Text }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.k1 = new Text();
        root.k1.edit(0, 0, 'The fox jumped.');
      }, 'set text by c1');
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), `{"k1":[{"val":"The fox jumped."}]}`);
      assert.equal(d2.toSortedJSON(), d1.toSortedJSON());

      d1.update((root) => {
        root.k1.setStyle(0, 15, { bold: true });
      }, `bolds text by c1`);
      assert.equal(
        d1.toSortedJSON(),
        `{"k1":[{"attrs":{"bold":true},"val":"The fox jumped."}]}`,
      );
      d1.update((root) => {
        root.k1.setStyle(4, 15, { bold: false });
      }, `non-bolds text by c1`);
      assert.equal(
        d1.toSortedJSON(),
        `{"k1":[{"attrs":{"bold":true},"val":"The "},{"attrs":{"bold":false},"val":"fox jumped."}]}`,
      );
      d2.update((root) => {
        root.k1.setStyle(8, 15, { bold: true });
      }, `bolds text by c2`);
      assert.equal(
        d2.toSortedJSON(),
        `{"k1":[{"val":"The fox "},{"attrs":{"bold":true},"val":"jumped."}]}`,
      );
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(
        d1.toSortedJSON(),
        '{"k1":[{"attrs":{"bold":true},"val":"The "},{"attrs":{"bold":false},"val":"fox "},{"attrs":{"bold":false},"val":"jumped."}]}',
        'd1',
      );
      assert.equal(d2.toSortedJSON(), d1.toSortedJSON(), 'd2');
    }, this.test!.title);
  });

  it('ex6. conflicting overlaps(bold) - 2', async function () {
    await withTwoClientsAndDocuments<{ k1: Text }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.k1 = new Text();
        root.k1.edit(0, 0, 'The fox jumped.');
      }, 'set text by c1');
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), `{"k1":[{"val":"The fox jumped."}]}`);
      assert.equal(d2.toSortedJSON(), d1.toSortedJSON());

      d1.update((root) => {
        root.k1.setStyle(0, 15, { bold: true });
      }, `bolds text by c1`);
      assert.equal(
        d1.toSortedJSON(),
        `{"k1":[{"attrs":{"bold":true},"val":"The fox jumped."}]}`,
      );
      d1.update((root) => {
        root.k1.setStyle(4, 15, { bold: false });
      }, `non-bolds text by c1`);
      assert.equal(
        d1.toSortedJSON(),
        `{"k1":[{"attrs":{"bold":true},"val":"The "},{"attrs":{"bold":false},"val":"fox jumped."}]}`,
      );
      await c1.sync();
      await c2.sync();
      await c1.sync();

      d2.update((root) => {
        root.k1.setStyle(8, 15, { bold: true });
      }, `bolds text by c2`);
      assert.equal(
        d2.toSortedJSON(),
        `{"k1":[{"attrs":{"bold":true},"val":"The "},{"attrs":{"bold":false},"val":"fox "},{"attrs":{"bold":true},"val":"jumped."}]}`,
        'd2',
      );
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON(), 'd1');
    }, this.test!.title);
  });

  it('ex7. multiple instances of the same mark', async function () {
    await withTwoClientsAndDocuments<{ k1: Text }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.k1 = new Text();
        root.k1.edit(0, 0, 'The fox jumped.');
      }, 'set text by c1');
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), `{"k1":[{"val":"The fox jumped."}]}`);
      assert.equal(d2.toSortedJSON(), d1.toSortedJSON());

      d1.update((root) => {
        root.k1.setStyle(0, 7, { comment: `Alice's comment` });
      }, `add comment by c1`);
      assert.equal(
        d1.toSortedJSON(),
        `{"k1":[{"attrs":{"comment":"Alice\\'s comment"},"val":"The fox"},{"val":" jumped."}]}`,
      );
      d2.update((root) => {
        root.k1.setStyle(4, 15, { comment: `Bob's comment` });
      }, `add comment by c2`);
      assert.equal(
        d2.toSortedJSON(),
        `{"k1":[{"val":"The "},{"attrs":{"comment":"Bob\\'s comment"},"val":"fox jumped."}]}`,
      );
      await c1.sync();
      await c2.sync();
      await c1.sync();
      // NOTE(chacha912): multiple comments can be associated with a single character in the text.
      // so it would be better we can keep both comments.
      assert.equal(
        d1.toSortedJSON(),
        `{"k1":[{"attrs":{"comment":"Alice\\'s comment"},"val":"The "},{"attrs":{"comment":"Bob\\'s comment"},"val":"fox"},{"attrs":{"comment":"Bob\\'s comment"},"val":" jumped."}]}`,
        'd1',
      );
      assert.equal(d2.toSortedJSON(), d1.toSortedJSON(), 'd2');
    }, this.test!.title);
  });

  it('ex8. text insertion at span boundaries(bold)', async function () {
    await withTwoClientsAndDocuments<{ k1: Text }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.k1 = new Text();
        root.k1.edit(0, 0, 'The fox jumped.');
        root.k1.setStyle(4, 14, { bold: true });
      }, 'set text by c1');
      await c1.sync();
      await c2.sync();
      assert.equal(
        d1.toSortedJSON(),
        `{"k1":[{"val":"The "},{"attrs":{"bold":true},"val":"fox jumped"},{"val":"."}]}`,
      );
      assert.equal(d2.toSortedJSON(), d1.toSortedJSON());

      d1.update((root) => {
        root.k1.edit(4, 4, 'quick ');
      }, `add text by c1`);
      assert.equal(
        d1.toSortedJSON(),
        `{"k1":[{"val":"The "},{"val":"quick "},{"attrs":{"bold":true},"val":"fox jumped"},{"val":"."}]}`,
      );
      d2.update((root) => {
        root.k1.edit(14, 14, ' over the dog');
      }, `add text by c2`);
      assert.equal(
        d2.toSortedJSON(),
        `{"k1":[{"val":"The "},{"attrs":{"bold":true},"val":"fox jumped"},{"val":" over the dog"},{"val":"."}]}`,
      );
      await c1.sync();
      await c2.sync();
      await c1.sync();
      // NOTE(chacha912): The general rule is that an inserted character inherits the bold/non-bold status
      // of the preceding character.(Microsoft Word, Google Docs, Apple Pages)
      // That is, the text inserted before the bold span becomes non-bold, and the text inserted after the bold span becomes bold.
      assert.equal(
        d1.toSortedJSON(),
        '{"k1":[{"val":"The "},{"val":"quick "},{"attrs":{"bold":true},"val":"fox jumped"},{"val":" over the dog"},{"val":"."}]}',
        'd1',
      );
      assert.equal(d2.toSortedJSON(), d1.toSortedJSON(), 'd2');
    }, this.test!.title);
  });

  it('ex9. text insertion at span boundaries(link)', async function () {
    await withTwoClientsAndDocuments<{ k1: Text }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.k1 = new Text();
        root.k1.edit(0, 0, 'The fox jumped.');
        root.k1.setStyle(4, 14, {
          link: 'https://www.google.com/search?q=jumping+fox',
        });
      }, 'set text by c1');
      await c1.sync();
      await c2.sync();
      assert.equal(
        d1.toSortedJSON(),
        `{"k1":[{"val":"The "},{"attrs":{"link":"https://www.google.com/search?q=jumping+fox"},"val":"fox jumped"},{"val":"."}]}`,
      );
      assert.equal(d2.toSortedJSON(), d1.toSortedJSON());

      d1.update((root) => {
        root.k1.edit(4, 4, 'quick ');
      }, `add text by c1`);
      assert.equal(
        d1.toSortedJSON(),
        `{"k1":[{"val":"The "},{"val":"quick "},{"attrs":{"link":"https://www.google.com/search?q=jumping+fox"},"val":"fox jumped"},{"val":"."}]}`,
      );
      d2.update((root) => {
        root.k1.edit(14, 14, ' over the dog');
      }, `add text by c2`);
      assert.equal(
        d2.toSortedJSON(),
        `{"k1":[{"val":"The "},{"attrs":{"link":"https://www.google.com/search?q=jumping+fox"},"val":"fox jumped"},{"val":" over the dog"},{"val":"."}]}`,
      );
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(
        d1.toSortedJSON(),
        '{"k1":[{"val":"The "},{"val":"quick "},{"attrs":{"link":"https://www.google.com/search?q=jumping+fox"},"val":"fox jumped"},{"val":" over the dog"},{"val":"."}]}',
        'd1',
      );
      assert.equal(d2.toSortedJSON(), d1.toSortedJSON(), 'd2');
    }, this.test!.title);
  });
});
