/*
 * Copyright 2021 The Yorkie Authors. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { assert } from 'chai';
import { JSONArray, Text, Document } from '@yorkie-js-sdk/src/yorkie';
import { MaxTimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { InitialCheckpoint } from '@yorkie-js-sdk/src/document/change/checkpoint';
import { DocumentStatus } from '@yorkie-js-sdk/src/document/document';
import { Counter } from '@yorkie-js-sdk/src/yorkie';
import { CounterType } from '@yorkie-js-sdk/src/document/crdt/counter';

const benchmarkTextEditGC = (size: number) => {
  const doc = Document.create<{ text: Text }>('test-doc');
  assert.equal('{}', doc.toJSON());
  // 01. initial
  doc.update((root) => {
    root.text = new Text();
    const { text } = root;
    for (let i = 0; i < size; i++) {
      text.edit(i, i, 'a');
    }
  }, 'initial');
  // 02. 100 nodes modified
  doc.update((root) => {
    const { text } = root;
    for (let i = 0; i < size; i++) {
      text.edit(i, i + 1, 'b');
    }
  }, `modify ${size} nodes`);
  // 03. GC
  assert.equal(size, doc.getGarbageLen());
  assert.equal(size, doc.garbageCollect(MaxTimeTicket));
  const empty = 0;
  assert.equal(empty, doc.getGarbageLen());
};
const benchmarkTextSplitGC = (size: number) => {
  const doc = Document.create<{ text: Text }>('test-doc');
  assert.equal('{}', doc.toJSON());

  // 01. initial
  const string = 'a'.repeat(size);
  doc.update((root) => {
    root.text = new Text();

    root.text.edit(0, 0, string);
  }, 'initial');
  // 02. 100 nodes modified
  doc.update((root) => {
    for (let i = 0; i < size; i++) {
      root.text.edit(i, i + 1, 'b');
    }
  }, 'Modify one node multiple times');
  // 03. GC
  assert.equal(size, doc.getGarbageLen());
  assert.equal(size, doc.garbageCollect(MaxTimeTicket));
  const empty = 0;
  assert.equal(empty, doc.getGarbageLen());
};
const benchmarkTextDeleteAll = (size: number) => {
  const doc = Document.create<{ text: Text }>('test-doc');
  doc.update((root) => {
    root.text = new Text();
  }, 'initialize');
  // 01. inserts many chracters
  for (let i = 0; i < size; i++) {
    doc.update((root) => {
      root.text.edit(i, i, 'a');
    }, 'insert chracter');
  }
  // 02. deletes them
  doc.update((root) => {
    root.text.edit(0, size, '');
  }, 'delete them');
  assert.equal(doc.getRoot().text.toString(), '');
};
const benchmarkText = (size: number) => {
  const doc = Document.create<{ text: Text }>('test-doc');

  doc.update((root) => {
    root.text = new Text();

    for (let i = 0; i < size; i++) {
      root.text.edit(i, i, 'a');
    }
  });
};
const benchmarkCounter = (size: number) => {
  const doc = Document.create<{ counter: Counter }>('test-doc');

  doc.update((root) => {
    root.counter = new Counter(CounterType.IntegerCnt, 0);
    for (let i = 0; i < size; i++) {
      root.counter.increase(i);
    }
  });
};
const benchmarkObject = (size: number) => {
  const doc = Document.create<{ k1: number }>('test-doc');

  doc.update((root) => {
    for (let i = 0; i < size; i++) {
      root.k1 = i;
    }
  });
};
const benchmarkArray = (size: number) => {
  const doc = Document.create<{ k1: JSONArray<number> }>('test-doc');

  doc.update((root) => {
    root.k1 = [];

    for (let i = 0; i < size; i++) {
      root.k1.push(i);
    }
  });
};
const benchmarkArrayGC = (size: number) => {
  const doc = Document.create<{ k1?: JSONArray<number> }>('test-doc');

  doc.update((root) => {
    root.k1 = [];

    for (let i = 0; i < size; i++) {
      root.k1.push(i);
    }
  });
  doc.update((root) => {
    delete root.k1;
  });

  assert.equal(size + 1, doc.garbageCollect(MaxTimeTicket));
};

const tests = [
  {
    name: 'Document#constructor',
    run: (): void => {
      const doc = Document.create<{ text: JSONArray<string> }>(`test-doc`);
      assert.equal('{}', doc.toJSON());
      assert.equal(doc.getCheckpoint(), InitialCheckpoint);
      assert.isFalse(doc.hasLocalChanges());
    },
  },
  {
    name: 'Document#status',
    run: (): void => {
      const doc = Document.create<{ text: JSONArray<string> }>(`test-doc`);
      assert.equal(doc.getStatus(), DocumentStatus.Detached);
      doc.setStatus(DocumentStatus.Attached);
      assert.equal(doc.getStatus(), DocumentStatus.Attached);
    },
  },
  {
    name: 'Document#equals',
    run: (): void => {
      const doc1 = Document.create<{ text: string }>('d1');
      const doc2 = Document.create<{ text: string }>('d2');
      const doc3 = Document.create<{ text: string }>('d3');
      doc1.update((root) => {
        root.text = 'value';
      }, 'update text');
      assert.notEqual(doc1.toJSON(), doc2.toJSON());
      assert.equal(doc2.toJSON(), doc3.toJSON());
    },
  },
  {
    name: 'Document#nested update',
    run: (): void => {
      const expected = `{"k1":"v1","k2":{"k4":"v4"},"k3":["v5","v6"]}`;
      const doc = Document.create<{
        k1: string;
        k2: { k4: string };
        k3: Array<string>;
      }>('test-doc');
      assert.equal('{}', doc.toJSON());
      assert.isFalse(doc.hasLocalChanges());
      doc.update((root) => {
        root.k1 = 'v1';
        root.k2 = { k4: 'v4' };
        root.k3 = ['v5', 'v6'];
      }, 'updates k1,k2,k3');
      assert.equal(expected, doc.toJSON());
      assert.isTrue(doc.hasLocalChanges());
    },
  },
  {
    name: 'Document#delete',
    run: (): void => {
      const doc = Document.create<{
        k1?: string;
        k2?: { k4: string };
        k3?: Array<string>;
      }>('test-doc');
      assert.equal('{}', doc.toJSON());
      assert.isFalse(doc.hasLocalChanges());
      let expected = `{"k1":"v1","k2":{"k4":"v4"},"k3":["v5","v6"]}`;
      doc.update((root) => {
        root.k1 = 'v1';
        root.k2 = { k4: 'v4' };
        root.k3 = ['v5', 'v6'];
      }, 'updates k1,k2,k3');
      assert.equal(expected, doc.toJSON());
      expected = `{"k1":"v1","k3":["v5","v6"]}`;
      doc.update((root) => {
        delete root.k2;
      }, 'deletes k2');
      assert.equal(expected, doc.toJSON());
    },
  },
  {
    name: 'Document#object',
    run: (): void => {
      const doc = Document.create<{ k1: string }>('test-doc');
      doc.update((root) => {
        root.k1 = 'v1';
        root.k1 = 'v2';
      });
      assert.equal(`{"k1":"v2"}`, doc.toJSON());
    },
  },
  {
    name: 'Document#array',
    run: (): void => {
      const doc = Document.create<{ k1: JSONArray<number> }>('test-doc');

      doc.update((root) => {
        root.k1 = [];
        root.k1.push(1);
        root.k1.push(2);
        root.k1.push(3);

        assert.equal('{"k1":[1,2,3]}', root.toJSON!());
        assert.equal(root.k1.length, 3);
        assert.equal(
          '[1:000000000000000000000000:2:1][1:000000000000000000000000:3:2][1:000000000000000000000000:4:3]',
          root.k1.getStructureAsString!(),
        );

        root.k1.splice(1, 1);
        assert.equal('{"k1":[1,3]}', root.toJSON!());
        assert.equal(root.k1.length, 2);
        assert.equal(
          '[1:000000000000000000000000:2:1]{1:000000000000000000000000:3:2}[1:000000000000000000000000:4:3]',
          root.k1.getStructureAsString!(),
        );

        const first = root.k1.getElementByIndex!(0);
        root.k1.insertAfter!(first.getID!(), 2);
        assert.equal('{"k1":[1,2,3]}', root.toJSON!());
        assert.equal(root.k1.length, 3);
        assert.equal(
          '[1:000000000000000000000000:2:1][1:000000000000000000000000:6:2]{1:000000000000000000000000:3:2}[1:000000000000000000000000:4:3]',
          root.k1.getStructureAsString!(),
        );

        const third = root.k1.getElementByIndex!(2);
        root.k1.insertAfter!(third.getID!(), 4);
        assert.equal('{"k1":[1,2,3,4]}', root.toJSON!());
        assert.equal(root.k1.length, 4);
        assert.equal(
          '[1:000000000000000000000000:2:1][1:000000000000000000000000:6:2]{1:000000000000000000000000:3:2}[1:000000000000000000000000:4:3][1:000000000000000000000000:7:4]',
          root.k1.getStructureAsString!(),
        );

        for (let i = 0; i < root.k1.length; i++) {
          assert.equal(i + 1, root.k1[i]);
        }
      });
    },
  },
  {
    name: 'Document#text',
    run: (): void => {
      const doc = Document.create<{ k1: Text }>('test-doc');
      doc.update((root) => {
        root.k1 = new Text();
        root.k1.edit(0, 0, 'ABCD');
        root.k1.edit(1, 3, '12');
      });
      assert.equal(
        `{"k1":[{"val":"A"},{"val":"12"},{"val":"D"}]}`,
        doc.toJSON(),
      );
      assert.equal(
        `[0:00:0:0 ][1:00:2:0 A][1:00:3:0 12]{1:00:2:1 BC}[1:00:2:3 D]`,
        doc.getRoot().k1.getStructureAsString(),
      );
      doc.update((root) => {
        const [pos1] = root.k1.createRange(0, 0);
        assert.equal('0:00:0:0:0', pos1.getStructureAsString());
        const [pos2] = root.k1.createRange(1, 1);
        assert.equal('1:00:2:0:1', pos2.getStructureAsString());
        const [pos3] = root.k1.createRange(2, 2);
        assert.equal('1:00:3:0:1', pos3.getStructureAsString());
        const [pos4] = root.k1.createRange(3, 3);
        assert.equal('1:00:3:0:2', pos4.getStructureAsString());
        const [pos5] = root.k1.createRange(4, 4);
        assert.equal('1:00:2:3:1', pos5.getStructureAsString());
      });
    },
  },
  {
    name: 'Document#text composition test',
    run: (): void => {
      const doc = Document.create<{ k1: Text }>('test-doc');
      doc.update((root) => {
        root.k1 = new Text();
        root.k1.edit(0, 0, 'ㅎ');
        root.k1.edit(0, 1, '하');
        root.k1.edit(0, 1, '한');
        root.k1.edit(0, 1, '하');
        root.k1.edit(1, 1, '느');
        root.k1.edit(1, 2, '늘');
      });
      assert.equal(`{"k1":[{"val":"하"},{"val":"늘"}]}`, doc.toJSON());
    },
  },
  {
    name: 'Document#rich text test',
    run: (): void => {
      const doc = Document.create<{ k1: Text }>('test-doc');
      doc.update((root) => {
        root.k1 = new Text();
        root.k1.edit(0, 0, 'Hello world');
        assert.equal(
          '[0:00:0:0 ][1:00:2:0 Hello world]',
          root.k1.getStructureAsString(),
        );
      });
      assert.equal('{"k1":[{"val":"Hello world"}]}', doc.toJSON());
      doc.update((root) => {
        root.k1.setStyle(0, 5, { b: '1' });
        assert.equal(
          '[0:00:0:0 ][1:00:2:0 Hello][1:00:2:5  world]',
          root.k1.getStructureAsString(),
        );
      });
      assert.equal(
        '{"k1":[{"attrs":{"b":"1"},"val":"Hello"},{"val":" world"}]}',
        doc.toJSON(),
      );
      doc.update((root) => {
        root.k1.setStyle(0, 5, { b: '1' });
        assert.equal(
          '[0:00:0:0 ][1:00:2:0 Hello][1:00:2:5  world]',
          root.k1.getStructureAsString(),
        );
        root.k1.setStyle(3, 5, { i: '1' });
        assert.equal(
          '[0:00:0:0 ][1:00:2:0 Hel][1:00:2:3 lo][1:00:2:5  world]',
          root.k1.getStructureAsString(),
        );
      });
      assert.equal(
        '{"k1":[{"attrs":{"b":"1"},"val":"Hel"},{"attrs":{"b":"1","i":"1"},"val":"lo"},{"val":" world"}]}',
        doc.toJSON(),
      );
      doc.update((root) => {
        root.k1.edit(5, 11, ' yorkie');
        assert.equal(
          '[0:00:0:0 ][1:00:2:0 Hel][1:00:2:3 lo][4:00:1:0  yorkie]{1:00:2:5  world}',
          root.k1.getStructureAsString(),
        );
      });
      assert.equal(
        '{"k1":[{"attrs":{"b":"1"},"val":"Hel"},{"attrs":{"b":"1","i":"1"},"val":"lo"},{"val":" yorkie"}]}',
        doc.toJSON(),
      );
      doc.update((root) => {
        root.k1.edit(5, 5, '\n', { list: 'true' });
        assert(
          '[0:00:0:0 ][1:00:2:0 Hel][1:00:2:3 lo][5:00:1:0 ]' +
            '[4:00:1:0  yorkie]{1:00:2:5  world}',
          root.k1.getStructureAsString(),
        );
      });
      assert.equal(
        '{"k1":[{"attrs":{"b":"1"},"val":"Hel"},{"attrs":{"b":"1","i":"1"},"val":"lo"},{"attrs":{"list":"true"},"val":"\\n"},{"val":" yorkie"}]}',
        doc.toJSON(),
      );
    },
  },
  {
    name: 'Document#counter test',
    run: (): void => {
      const doc = Document.create<{ age: Counter; price: Counter }>('test-doc');
      const integer = 10;
      const long = 5;
      const uinteger = 100;
      const float = 3.14;
      const double = 5.66;
      doc.update((root) => {
        root.age = new Counter(CounterType.IntegerCnt, 5);
        root.age.increase(long);
        root.age.increase(double);
        root.age.increase(float);
        root.age.increase(uinteger);
        root.age.increase(integer);
      });
      assert.equal('{"age":128}', doc.toJSON());
      doc.update((root) => {
        root.price = new Counter(CounterType.LongCnt, 9000000000000000000);
        root.price.increase(long);
        root.price.increase(double);
        root.price.increase(float);
        root.price.increase(uinteger);
        root.price.increase(integer);
      });
      assert.equal('{"age":128,"price":9000000000000000123}', doc.toJSON());
      doc.update((root) => {
        root.age.increase(-5);
        root.age.increase(-3.14);
        root.price.increase(-100);
        root.price.increase(-20.5);
      });
      assert.equal('{"age":120,"price":9000000000000000003}', doc.toJSON());
      // TODO: We need to filter not-allowed type
      // counter.increase() method doesn't filter not-allowed type
    },
  },
  {
    name: 'Document#text edit gc 100',
    run: (): void => {
      benchmarkTextEditGC(100);
    },
  },
  {
    name: 'Document#text edit gc 1000',
    run: (): void => {
      benchmarkTextEditGC(1000);
    },
  },
  {
    name: 'Document#text split gc 100',
    run: (): void => {
      benchmarkTextSplitGC(100);
    },
  },
  {
    name: 'Document#text split gc 1000',
    run: (): void => {
      benchmarkTextSplitGC(1000);
    },
  },
  {
    name: 'Document#text delete all 10000',
    run: (): void => {
      benchmarkTextDeleteAll(10000);
    },
  },
  {
    name: 'Document#text 100',
    run: (): void => {
      benchmarkText(100);
    },
  },
  {
    name: 'Document#text 1000',
    run: (): void => {
      benchmarkText(1000);
    },
  },
  {
    name: 'Document#array 1000',
    run: (): void => {
      benchmarkArray(1000);
    },
  },
  {
    name: 'Document#array 10000',
    run: (): void => {
      benchmarkArray(10000);
    },
  },
  {
    name: 'Document#array gc 1000',
    run: (): void => {
      benchmarkArrayGC(1000);
    },
  },
  {
    name: 'Document#array gc 10000',
    run: (): void => {
      benchmarkArrayGC(10000);
    },
  },
  {
    name: 'Document#counter 1000',
    run: (): void => {
      benchmarkCounter(1000);
    },
  },
  {
    name: 'Document#counter 10000',
    run: (): void => {
      benchmarkCounter(10000);
    },
  },
  {
    name: 'Document#object 1000',
    run: (): void => {
      benchmarkObject(1000);
    },
  },
  {
    name: 'Document#object 10000',
    run: (): void => {
      benchmarkObject(10000);
    },
  },
];

export default tests;
