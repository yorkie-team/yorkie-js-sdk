/*
 * Copyright 2020 The Yorkie Authors. All rights reserved.
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

import { describe, it, assert } from 'vitest';
import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import {
  OperationSchema as PbOperationSchema,
  RestoreSpan as PbRestoreSpan,
  RestoreSpanSchema as PbRestoreSpanSchema,
} from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';
import { Counter, Primitive, Text, Tree } from '@yorkie-js/sdk/src/yorkie';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import { CRDTTree, CRDTTreeNode } from '@yorkie-js/sdk/src/document/crdt/tree';

describe('Converter', function () {
  it('should encode/decode bytes', function () {
    const doc = new Document<{
      k1: {
        ['k1-1']: boolean;
        ['k1-2']: number;
        ['k1-5']: string;
      };
      k2: Array<boolean | number | string>;
      k3: Text<{
        bold?: boolean;
        indent?: number;
        italic?: boolean | null;
        color?: string;
      }>;
      k4: Counter;
    }>('test-doc');

    doc.update((root) => {
      root.k1 = {
        'k1-1': true,
        'k1-2': 2147483647,
        // 'k1-3': yorkie.Long.fromString('9223372036854775807'),
        // 'k1-4': 1.79,
        'k1-5': '4',
        // 'k6': new Uint8Array([65,66]),
        // 'k7': new Date(),
      };

      root.k2 = [
        true,
        2147483647,
        // yorkie.Long.fromString('9223372036854775807'),
        // 1.79,
        '4',
        // new Uint8Array([65,66]),
        // new Date(),
      ];

      root.k3 = new Text();
      root.k3.edit(0, 0, 'ㅎ');
      root.k3.edit(0, 1, '하');
      root.k3.edit(0, 1, '한');
      root.k3.edit(0, 1, '하');
      root.k3.edit(1, 1, '느');
      root.k3.edit(1, 2, '늘');
      root.k3.setStyle(0, 2, {
        bold: true,
        indent: 2,
        italic: false,
        color: 'red',
      });
      root.k4 = new Counter(0);
      root.k4.increase(1).increase(2).increase(3);
    });

    const bytes = converter.objectToBytes(doc.getRootObject());
    const obj = converter.bytesToObject(bytes);
    assert.equal(doc.toSortedJSON(), obj.toSortedJSON());
  });

  it('convert hex string <-> byte array', function () {
    const hexString = '0123456789abcdef01234567';
    const bytes = converter.toUint8Array(hexString);
    assert.equal(bytes.length, 12);
    assert.equal(converter.toHexString(bytes), hexString);
  });

  it('should encode and decode tree properly', function () {
    const doc = new Document<{
      tree: Tree;
    }>('test-doc');

    doc.update((root) => {
      root.tree = new Tree({
        type: 'r',
        children: [
          { type: 'p', children: [{ type: 'text', value: '12' }] },
          { type: 'p', children: [{ type: 'text', value: '34' }] },
        ],
      });

      root.tree.editByPath([0, 1], [1, 1]);

      root.tree.style(0, 1, { b: 't', i: 't' });
      assert.equal(root.tree.toXML(), '<r><p b="t" i="t">14</p></r>');

      root.tree.removeStyle(0, 1, ['i']);
    });
    assert.equal(doc.getRoot().tree.toXML(), /*html*/ `<r><p b="t">14</p></r>`);
    assert.equal(doc.getRoot().tree.getSize(), 4);

    const bytes = converter.objectToBytes(doc.getRootObject());
    const obj = converter.bytesToObject(bytes);

    assert.equal(
      doc.getRoot().tree.getNodeSize(),
      (obj.get('tree') as unknown as Tree).getNodeSize(),
    );

    assert.equal(
      doc.getRoot().tree.getSize(),
      (obj.get('tree') as unknown as Tree).getSize(),
    );
    assert.equal(
      doc.getRoot().tree.toXML(),
      (obj.get('tree') as unknown as Tree).toXML(),
    );
  });

  // Regression test for the snapshot-roundtrip convergence bug fixed by
  // persisting `mergedFrom` and `mergedAt` on moved children. A tree
  // that undergoes a merge and is then serialized via `objectToBytes`
  // must deserialize with:
  //   - `mergedFrom` and `mergedAt` preserved on moved children
  //   - `mergedInto` reconstructed on the source parent by
  //     `CRDTTree.rebuildMergeState` so the Fix 3 redirect can find it
  //
  // See: yorkie-team/yorkie PR #1729 for the Go-side fix and the
  // underlying bug description.
  it('should persist merge state across bytes roundtrip', function () {
    const doc = new Document<{ t: Tree }>('test-doc');

    // Build <root><p>a</p><p>b</p></root> and merge into <root><p>ab</p></root>.
    doc.update((root) => {
      root.t = new Tree({
        type: 'root',
        children: [
          { type: 'p', children: [{ type: 'text', value: 'a' }] },
          { type: 'p', children: [{ type: 'text', value: 'b' }] },
        ],
      });
      root.t.edit(2, 4);
    });
    assert.equal(doc.getRoot().t.toXML(), '<root><p>ab</p></root>');

    // Snapshot the root object and reconstruct. The fresh CRDTObject
    // constructs its inner CRDTTree through the normal constructor,
    // which triggers `rebuildMergeState`.
    const bytes = converter.objectToBytes(doc.getRootObject());
    const cloned = converter.bytesToObject(bytes);
    const clonedTree = cloned.get('t') as unknown as CRDTTree;
    assert.equal(clonedTree.toXML(), '<root><p>ab</p></root>');

    // Find the moved child (the text node "b" that was moved from the
    // tombstoned second <p> to the first <p>) and the source parent.
    const rootNode = clonedTree.getRoot();
    const firstP = rootNode.allChildren[0];
    let movedChild: CRDTTreeNode | undefined;
    for (const child of firstP.allChildren) {
      if (child.mergedFrom) {
        movedChild = child;
        break;
      }
    }
    assert.isDefined(movedChild, 'moved child should carry mergedFrom');
    assert.isDefined(
      movedChild!.mergedAt,
      'moved child should carry mergedAt after roundtrip',
    );

    // The source parent (second <p>) is now tombstoned. rebuildMergeState
    // must have set its mergedInto to the merge target (first <p>).
    const sourceParent = rootNode.allChildren[1];
    assert.isTrue(sourceParent.isRemoved, 'source parent should be tombstoned');
    assert.isDefined(
      sourceParent.mergedInto,
      'rebuildMergeState should set mergedInto on tombstoned source',
    );
    assert.isTrue(
      sourceParent.mergedInto!.equals(firstP.id),
      'mergedInto should point at the merge target',
    );
  });

  it('object converting to bytes with gc elements test', function () {
    const doc = new Document<{ o: { [key: string]: string } }>('test-doc');

    doc.update((root) => {
      root.o = {};
      root.o['1'] = 'a';
    });
    assert.equal(doc.getRoot().o['1'], 'a');

    doc.update((r) => (r.o['1'] = 'b'));
    assert.equal(doc.getRoot().o['1'], 'b');

    let foundGCElementWithValueA = false;
    const root = doc.getRootCRDT();
    for (const pair of root.getGCElementPairs()) {
      if (pair.element instanceof Primitive) {
        if (pair.element.getValue() === 'a') {
          foundGCElementWithValueA = true;
          break;
        }
      }
    }
    assert.isTrue(foundGCElementWithValueA);

    const bytes = converter.objectToBytes(doc.getRootObject());
    const obj = converter.bytesToObject(bytes);

    foundGCElementWithValueA = false;
    const newRoot = new CRDTRoot(obj);
    for (const pair of newRoot.getGCElementPairs()) {
      if (pair.element instanceof Primitive) {
        if (pair.element.getValue() === 'a') {
          foundGCElementWithValueA = true;
          break;
        }
      }
    }
    assert.isTrue(foundGCElementWithValueA);
    assert.equal(obj.toSortedJSON(), doc.getRootObject().toSortedJSON());
  });

  it('should reject a text position carrying a negative offset', function () {
    const doc = new Document<{ k1: Text }>('test-doc');
    doc.update((root) => {
      root.k1 = new Text();
      root.k1.edit(0, 0, 'ABCD');
    });

    const pbOps = doc
      .createChangePack()
      .getChanges()
      .flatMap((change) => change.getOperations())
      .map((op) =>
        fromBinary(PbOperationSchema, converter.operationToBinary(op)),
      );
    const pbOp = pbOps.find((candidate) => candidate.body.case === 'edit');
    if (pbOp?.body.case !== 'edit') {
      assert.fail('the text edit should encode as an edit operation');
    }
    const edit = pbOp.body.value;
    // The untampered operation round-trips, so a rejection below is the
    // offset and not the encoding.
    assert.isOk(converter.bytesToOperation(toBinary(PbOperationSchema, pbOp)));

    // `offset` and `relative_offset` are int32 on the wire, so a peer can
    // send a negative one; it has to be refused before it reaches the
    // position arithmetic in RGATreeSplit.
    for (const field of ['offset', 'relativeOffset'] as const) {
      const original = edit.from![field];
      edit.from![field] = -1;
      assert.throws(
        () => converter.bytesToOperation(toBinary(PbOperationSchema, pbOp)),
        /non-negative integer/,
      );
      edit.from![field] = original;
    }
  });

  it('should reject a malformed text restore span', function () {
    const doc = new Document<{ k1: Text }>('test-doc');
    doc.update((root) => {
      root.k1 = new Text();
      root.k1.edit(0, 0, 'ABCD');
    });

    const pbOps = doc
      .createChangePack()
      .getChanges()
      .flatMap((change) => change.getOperations())
      .map((op) =>
        fromBinary(PbOperationSchema, converter.operationToBinary(op)),
      );
    const pbOp = pbOps.find((candidate) => candidate.body.case === 'edit');
    if (pbOp?.body.case !== 'edit') {
      assert.fail('the text edit should encode as an edit operation');
    }
    const edit = pbOp.body.value;
    const createdAt = edit.from!.createdAt;

    // `start`/`end` are int32 on the wire and `RGATreeSplit.restore` mints
    // node ids straight from them, and the span is addressed by insertion
    // identity, so it is malformed without a `created_at` the same way a tree
    // restore span is.
    const cases: Array<[string, (span: PbRestoreSpan) => void, RegExp]> = [
      ['a negative start', (span) => (span.start = -1), /non-negative integer/],
      ['a negative end', (span) => (span.end = -1), /non-negative integer/],
      ['a reversed range', (span) => (span.start = 3), /should not be after/],
      [
        'a missing timestamp',
        (span) => (span.createdAt = undefined),
        /missing timestamp/,
      ],
    ];
    for (const [name, tamper, message] of cases) {
      const span = create(PbRestoreSpanSchema, {
        createdAt,
        start: 0,
        end: 2,
        content: 'AB',
      });
      edit.restoreSpans = [span];
      // The untampered span decodes, so a rejection below is the field.
      assert.isOk(
        converter.bytesToOperation(toBinary(PbOperationSchema, pbOp)),
      );
      tamper(span);
      assert.throws(
        () => converter.bytesToOperation(toBinary(PbOperationSchema, pbOp)),
        message,
        undefined,
        `a restore span with ${name} should be refused`,
      );
    }
  });
});
