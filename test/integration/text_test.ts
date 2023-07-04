import { assert } from 'chai';
import { TextView } from '@yorkie-js-sdk/test/helper/helper';
import { withTwoClientsAndDocuments } from '@yorkie-js-sdk/test/integration/integration_helper';
import { Document, Text } from '@yorkie-js-sdk/src/yorkie';

describe('Text', function () {
  it('should handle edit operations', function () {
    const doc = Document.create<{ k1: Text }>('test-doc');
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

      let range = root['k1'].createRange(0, 0);
      assert.equal('0:00:0:0:0', range[0].toTestString());

      range = root['k1'].createRange(1, 1);
      assert.equal('1:00:2:0:1', range[0].toTestString());

      range = root['k1'].createRange(2, 2);
      assert.equal('1:00:3:0:1', range[0].toTestString());

      range = root['k1'].createRange(3, 3);
      assert.equal('1:00:3:0:2', range[0].toTestString());

      range = root['k1'].createRange(4, 4);
      assert.equal('1:00:2:3:1', range[0].toTestString());
    });

    assert.equal(
      '{"k1":[{"val":"A"},{"val":"12"},{"val":"D"}]}',
      doc.toSortedJSON(),
    );
  });

  it('should handle edit operations2', function () {
    const doc = Document.create<{ k1: Text }>('test-doc');
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
    const doc = Document.create<{ k1: Text }>('test-doc');
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
    const doc = Document.create<{
      text: Text;
    }>('test-doc');
    const view = new TextView();
    doc.update((root) => (root.text = new Text()));
    doc.subscribe('$.text', (event) => {
      if (event.type === 'local-change') {
        const { operations } = event.value;
        view.applyOperations(operations);
      }
    });

    const commands = [
      { from: 0, to: 0, content: 'ABC' },
      { from: 3, to: 3, content: 'DEF' },
      { from: 2, to: 4, content: '1' },
      { from: 1, to: 4, content: '2' },
    ];

    for (const cmd of commands) {
      doc.update((root) => root.text.edit(cmd.from, cmd.to, cmd.content));
      assert.equal(view.toString(), doc.getRoot().text.toString());
    }
  });

  it('should handle deletion of the last nodes', function () {
    const doc = Document.create<{ text: Text }>('test-doc');
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
      assert.equal(view.toString(), doc.getRoot().text.toString());
    }
  });

  it('should handle deletion with boundary nodes already removed', function () {
    const doc = Document.create<{ text: Text }>('test-doc');
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
      assert.equal(view.toString(), doc.getRoot().text.toString());
    }
  });

  it('should handle select operations', async function () {
    const doc = Document.create<{
      text: Text;
    }>('test-doc');

    doc.update((root) => {
      root.text = new Text();
      root.text.edit(0, 0, 'ABCD');
    });

    doc.subscribe('$.text', (event) => {
      if (event.type === 'local-change') {
        const { operations } = event.value;

        if (operations[0].type === 'select') {
          assert.equal(operations[0].from, 2);
          assert.equal(operations[0].to, 4);
        }
      }
    });
    doc.update((root) => root.text.select(2, 4));
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
    const doc = Document.create<{ k1: Text<{ b: string }> }>('test-doc');
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
    const doc = Document.create<{ k1: Text }>('test-doc');
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
    const doc = Document.create<{ k1: Text }>('test-doc');
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
});
