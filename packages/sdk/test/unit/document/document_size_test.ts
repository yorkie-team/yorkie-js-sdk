import { describe, it, assert } from 'vitest';
import Long from 'long';
import {
  Counter,
  CounterType,
  Document,
  JSONObject,
  Text,
  Tree,
} from '@yorkie-js/sdk/src/yorkie';
import { CRDTTreeNode, toXML } from '@yorkie-js/sdk/src/document/crdt/tree';
import { InitialTimeTicket as ITT } from '@yorkie-js/sdk/src/document/time/ticket';
import { idT } from '@yorkie-js/sdk/test/helper/helper';
import { RHT } from '@yorkie-js/sdk/src/document/crdt/rht';

describe('Node Size', () => {
  it('split tree node test', function () {
    const root = new CRDTTreeNode(idT, 'r', []);
    const para = new CRDTTreeNode(idT, 'p', []);
    root.append(para);
    para.append(new CRDTTreeNode(idT, 'text', 'helloworld'));

    const left = para.children[0];
    const [rightText, diffText] = left.splitText(5, 0);
    assert.deepEqual(diffText, { data: 0, meta: 24 });
    assert.deepEqual(left.getDataSize(), { data: 10, meta: 24 });
    assert.deepEqual(rightText!.getDataSize(), { data: 10, meta: 24 });

    const [rightElem, diffElem] = para.splitElement(1, () => ITT);
    assert.deepEqual(diffElem, { data: 0, meta: 24 });
    assert.equal(toXML(para), '<p>hello</p>');
    assert.equal(toXML(rightElem!), '<p>world</p>');
  });

  it.skip('split tree node with attribute test', () => {
    // TODO(raararaara): We need to check if the attributes are copied correctly when splitting elements.
    const attributes = new RHT();
    attributes.set('bold', 'true', ITT);

    const root = new CRDTTreeNode(idT, 'r');
    const para = new CRDTTreeNode(idT, 'p', undefined, attributes);
    root.append(para);
    para.append(new CRDTTreeNode(idT, 'text', 'helloworld'));
    assert.equal(toXML(root), '<r><p bold="true">helloworld</p></r>');

    // split text node
    const left = para.children[0];
    left.splitText(5, 0);

    // split element node
    const [rightElem, diffElem] = para.splitElement(1, () => ITT);
    assert.deepEqual(diffElem, { data: 16, meta: 48 });
    assert.equal(toXML(para), '<p bold="true">hello</p>');
    assert.equal(toXML(rightElem!), '<p bold="true">world</p>');
  });
});

describe('Document Size', () => {
  it('primitive and object test', function () {
    const doc = new Document<{
      k0: null;
      k1: boolean;
      k2: number;
      k3: Long;
      k4: number;
      k5: string;
      k6: Uint8Array;
      k7: Date;
      k8: undefined;
    }>('test-doc');

    // NOTE(hackerwins): O(Created) + P(CreatedAt, MovedAt)
    doc.update((root) => (root['k0'] = null));
    assert.deepEqual(doc.getDocSize().live, { data: 8, meta: 72 });

    // NOTE(hackerwins): O(Created) + P(CreatedAt, MovedAt) * 2
    doc.update((root) => (root['k1'] = true));
    assert.deepEqual(doc.getDocSize().live, { data: 12, meta: 120 });

    doc.update((root) => (root['k2'] = 2147483647));
    assert.deepEqual(doc.getDocSize().live, { data: 16, meta: 168 });

    doc.update((root) => (root['k3'] = Long.MAX_VALUE));
    assert.deepEqual(doc.getDocSize().live, { data: 24, meta: 216 });

    doc.update((root) => (root['k4'] = 1.79));
    assert.deepEqual(doc.getDocSize().live, { data: 32, meta: 264 });

    doc.update((root) => (root['k5'] = '4'));
    assert.deepEqual(doc.getDocSize().live, { data: 34, meta: 312 });

    doc.update((root) => (root['k6'] = new Uint8Array([65, 66])));
    assert.deepEqual(doc.getDocSize().live, { data: 36, meta: 360 });

    doc.update((root) => (root['k7'] = new Date()));
    assert.deepEqual(doc.getDocSize().live, { data: 44, meta: 408 });

    doc.update((root) => (root['k8'] = undefined));
    assert.deepEqual(doc.getDocSize().live, { data: 52, meta: 456 });
  });

  it('array test', function () {
    const doc = new Document<{ arr: Array<string> }>('test-doc');

    doc.update((root) => (root['arr'] = []));
    assert.deepEqual(doc.getDocSize().live, { data: 0, meta: 72 });

    doc.update((root) => root['arr'].push('a'));
    assert.deepEqual(doc.getDocSize().live, { data: 2, meta: 96 });
    assert.deepEqual(doc.getDocSize().gc, { data: 0, meta: 0 });

    doc.update((root) => delete root['arr'][0]);
    assert.deepEqual(doc.getDocSize().live, { data: 0, meta: 72 });
    assert.deepEqual(doc.getDocSize().gc, { data: 2, meta: 48 });
  });

  it('gc test', function () {
    const doc = new Document<JSONObject<{ num?: number; str: string }>>(
      'test-doc',
    );

    doc.update((root) => {
      root['num'] = 1;
      root['str'] = 'hello';
    });
    assert.deepEqual(doc.getDocSize().live, { data: 14, meta: 120 });

    doc.update((root) => {
      delete root['num'];
    });
    assert.deepEqual(doc.getDocSize().live, { data: 10, meta: 72 });
    // NOTE(hackerwins): P(CreatedAt, MovedAt, RemovedAt)
    assert.deepEqual(doc.getDocSize().gc, { data: 4, meta: 72 });
  });

  it('counter test', function () {
    const doc = new Document<{ counter: Counter }>('test-doc');
    doc.update((root) => (root.counter = new Counter(CounterType.Int, 0)));
    assert.deepEqual(doc.getDocSize().live, { data: 4, meta: 72 });
  });

  it('text test', function () {
    const doc = new Document<{ text: Text }>('test-doc');

    doc.update((root) => (root.text = new Text()));
    assert.deepEqual(doc.getDocSize().live, { data: 0, meta: 72 });
    assert.deepEqual(doc.getDocSize().gc, { data: 0, meta: 0 });

    doc.update((root) => root.text.edit(0, 0, 'helloworld'));
    assert.deepEqual(doc.getDocSize().live, { data: 20, meta: 96 });
    assert.deepEqual(doc.getDocSize().gc, { data: 0, meta: 0 });

    doc.update((root) => root.text.edit(5, 5, ' '));
    assert.deepEqual(doc.getDocSize().live, { data: 22, meta: 144 });
    assert.deepEqual(doc.getDocSize().gc, { data: 0, meta: 0 });

    doc.update((root) => root.text.edit(6, 11, ''));
    assert.deepEqual(doc.getDocSize().live, { data: 12, meta: 120 });
    assert.deepEqual(doc.getDocSize().gc, { data: 10, meta: 48 });

    doc.update((root) => root.text.setStyle(0, 5, { bold: true }));
    assert.deepEqual(doc.getDocSize().live, { data: 28, meta: 144 });
    assert.deepEqual(doc.getDocSize().gc, { data: 10, meta: 48 });

    doc.update((root) => root.text.edit(1, 1, ''));
    assert.equal(
      doc.toJSON(),
      `{"text":[{"attrs":{"bold":true},"val":"h"},{"attrs":{"bold":true},"val":"ello"},{"val":" "}]}`,
    );
    assert.deepEqual(doc.getDocSize().live, { data: 44, meta: 192 });
    assert.deepEqual(doc.getDocSize().gc, { data: 10, meta: 48 });
  });

  it('tree test', function () {
    const doc = new Document<{ tree: Tree }>('test-doc');

    doc.update((root) => {
      root.tree = new Tree({
        type: 'doc',
        children: [{ type: 'p', children: [] }],
      });

      assert.equal(root.tree.toXML(), `<doc><p></p></doc>`);
    });
    assert.deepEqual(doc.getDocSize().live, { data: 0, meta: 120 });
    assert.deepEqual(doc.getDocSize().gc, { data: 0, meta: 0 });

    doc.update((root) => {
      root.tree.edit(1, 1, {
        type: 'text',
        value: 'helloworld',
      });
    });
    assert.equal(doc.getRoot().tree.toXML(), `<doc><p>helloworld</p></doc>`);
    assert.deepEqual(doc.getDocSize().live, { data: 20, meta: 144 });
    assert.deepEqual(doc.getDocSize().gc, { data: 0, meta: 0 });

    doc.update((root) => {
      root.tree.edit(1, 7, {
        type: 'text',
        value: 'w',
      });
    });
    assert.equal(doc.getRoot().tree.toXML(), `<doc><p>world</p></doc>`);
    assert.deepEqual(doc.getDocSize().live, { data: 10, meta: 168 });
    assert.deepEqual(doc.getDocSize().gc, { data: 12, meta: 48 });

    doc.update((root) => {
      root.tree.edit(7, 7, {
        type: 'p',
        children: [{ type: 'text', value: 'abcd' }],
      });
    });
    assert.equal(
      doc.getRoot().tree.toXML(),
      `<doc><p>world</p><p>abcd</p></doc>`,
    );
    assert.deepEqual(doc.getDocSize().live, { data: 18, meta: 216 });
    assert.deepEqual(doc.getDocSize().gc, { data: 12, meta: 48 });

    doc.update((root) => root.tree.edit(7, 13));
    assert.equal(doc.getRoot().tree.toXML(), `<doc><p>world</p></doc>`);
    assert.deepEqual(doc.getDocSize().live, { data: 10, meta: 168 });
    assert.deepEqual(doc.getDocSize().gc, { data: 20, meta: 144 });

    doc.update((root) => {
      root.tree.style(0, 7, { bold: true });
    });
    assert.equal(
      doc.getRoot().tree.toXML(),
      `<doc><p bold="true">world</p></doc>`,
    );
    assert.deepEqual(doc.getDocSize().live, { data: 26, meta: 192 });
    assert.deepEqual(doc.getDocSize().gc, { data: 20, meta: 144 });

    doc.update((root) => {
      root.tree.removeStyle(0, 7, ['bold']);
    });
    assert.equal(doc.getRoot().tree.toXML(), `<doc><p>world</p></doc>`);
    assert.deepEqual(doc.getDocSize().live, { data: 10, meta: 168 });
    assert.deepEqual(doc.getDocSize().gc, { data: 36, meta: 168 });
  });
});
