/*
 * Copyright 2026 The Yorkie Authors. All rights reserved.
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
import { create, toBinary } from '@bufbuild/protobuf';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import {
  OperationSchema as PbOperationSchema,
  TreeNodesSchema as PbTreeNodesSchema,
} from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';
import { TreeEditOperation } from '@yorkie-js/sdk/src/document/operation/tree_edit_operation';
import {
  CRDTTreeNode,
  CRDTTreeNodeID,
  CRDTTreePos,
} from '@yorkie-js/sdk/src/document/crdt/tree';
import {
  InitialTimeTicket,
  TimeTicket,
} from '@yorkie-js/sdk/src/document/time/ticket';
import { InitialActorID } from '@yorkie-js/sdk/src/document/time/actor_id';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';

/**
 * A TreeEdit's content is always freshly created by the editing client, so it
 * can never legitimately be a split product, carry a merge lineage, or arrive
 * tombstoned -- yet the wire format carries every one of those fields on each
 * tree node. The converter drops them on the way in, and rejects an empty
 * content group outright. These mirror yorkie's
 * `tree_content_tombstone_test.go` and `tree_edit_content_missing_test.go`
 * (yorkie#2033).
 */
describe('TreeEdit content sanitizing', () => {
  const ticket = (lamport: number) =>
    TimeTicket.of(BigInt(lamport), 0, InitialActorID);
  const pos = CRDTTreePos.of(
    CRDTTreeNodeID.of(ticket(1), 0),
    CRDTTreeNodeID.of(ticket(1), 0),
  );

  /**
   * `roundTrip` encodes a TreeEdit carrying `content` and decodes it back,
   * returning the decoded content.
   */
  function roundTrip(content: CRDTTreeNode): CRDTTreeNode {
    const op = TreeEditOperation.create(
      InitialTimeTicket,
      pos,
      pos,
      [content],
      0,
      ticket(9),
    );
    const decoded = converter.bytesToOperation(
      converter.operationToBinary(op),
    ) as TreeEditOperation;
    const contents = decoded.getContents()!;
    assert.equal(contents.length, 1);
    return contents[0];
  }

  /**
   * `buildContent` builds <p>hello</p> as fresh content.
   */
  function buildContent(): [CRDTTreeNode, CRDTTreeNode] {
    const text = new CRDTTreeNode(
      CRDTTreeNodeID.of(ticket(3), 0),
      'text',
      'hello',
    );
    const paragraph = new CRDTTreeNode(CRDTTreeNodeID.of(ticket(2), 0), 'p', [
      text,
    ]);
    return [paragraph, text];
  }

  it('should drop a tombstone the content carries', () => {
    // A node born tombstoned under a live parent would be counted into the
    // live data size with no GC pair ever registered for it.
    const [paragraph, text] = buildContent();
    paragraph.removedAt = ticket(4);
    text.removedAt = ticket(4);

    const content = roundTrip(paragraph);

    assert.isFalse(content.isRemoved, 'content arrived tombstoned');
    assert.equal(content.allChildren.length, 1);
    assert.isFalse(
      content.allChildren[0].isRemoved,
      'content descendant arrived tombstoned',
    );
    // The revived text has to be back in its parent's visible size: the
    // decode excludes removed children from it, so a tombstone cleared
    // without that bookkeeping would size the content as if empty.
    assert.equal(content.paddedSize(), 'hello'.length + 2);
  });

  it('should drop a merge lineage the content carries', () => {
    // Only a merge may stamp mergedFrom/mergedAt; the §1.1 redirect and the
    // §6.2 delete propagation read them as trusted structural pointers.
    const [paragraph, text] = buildContent();
    paragraph.mergedFrom = CRDTTreeNodeID.of(ticket(5), 0);
    paragraph.mergedAt = ticket(7);
    // Naming its own parent, so the decoder derives a mergedInto from it.
    text.mergedFrom = paragraph.id;
    text.mergedAt = ticket(7);

    const content = roundTrip(paragraph);

    const decodedText = content.allChildren[0];
    assert.isUndefined(content.mergedFrom);
    assert.isUndefined(content.mergedAt);
    assert.isUndefined(decodedText.mergedFrom);
    assert.isUndefined(decodedText.mergedAt);
    // The decoder derives mergedInto from mergedFrom while it builds the
    // content, so it has to go too: a source must not keep pointing at a
    // destination no field records any more.
    assert.isUndefined(content.mergedInto);
  });

  it('should drop split links the content carries', () => {
    const [paragraph, text] = buildContent();
    text.insPrevID = CRDTTreeNodeID.of(ticket(3), 9);
    text.insNextID = CRDTTreeNodeID.of(ticket(3), 9);

    const decodedText = roundTrip(paragraph).allChildren[0];

    assert.isUndefined(decodedText.insPrevID);
    assert.isUndefined(decodedText.insNextID);
  });

  it('should reject an empty content group', () => {
    // An empty group decodes to no root; carried into the operation it is a
    // crash on apply, where the edit deep-copies each content.
    const [paragraph] = buildContent();
    const op = TreeEditOperation.create(
      InitialTimeTicket,
      pos,
      pos,
      [paragraph],
      0,
      ticket(9),
    );
    const pbOp = converter.toOperation(op);
    assert.equal(pbOp.body.case, 'treeEdit');
    if (pbOp.body.case === 'treeEdit') {
      pbOp.body.value.contents = [create(PbTreeNodesSchema, { content: [] })];
    }

    assert.throws(
      () => converter.bytesToOperation(toBinary(PbOperationSchema, pbOp)),
      YorkieError,
      'tree edit content missing',
    );
    try {
      converter.bytesToOperation(toBinary(PbOperationSchema, pbOp));
    } catch (err) {
      assert.equal((err as YorkieError).code, Code.ErrInvalidArgument);
    }
  });
});
