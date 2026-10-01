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
  CRDTTree,
  CRDTTreeNode,
  CRDTTreeNodeID,
  CRDTTreePos,
} from '@yorkie-js/sdk/src/document/crdt/tree';
import { RHT } from '@yorkie-js/sdk/src/document/crdt/rht';
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

  /**
   * `craftMergeLineage` stamps a lineage the decoder really does derive a
   * `mergedInto` from: `text` names its own parent as the parent a merge
   * moved it out of, and that parent is a tombstone, which is the only shape
   * `rebuildMergeState` plants a forwarding pointer for.
   */
  function craftMergeLineage(paragraph: CRDTTreeNode, text: CRDTTreeNode) {
    paragraph.mergedFrom = CRDTTreeNodeID.of(ticket(5), 0);
    paragraph.mergedAt = ticket(7);
    paragraph.removedAt = ticket(6);
    text.mergedFrom = paragraph.id;
    text.mergedAt = ticket(7);
  }

  it('should drop a merge lineage the content carries', () => {
    // Only a merge may stamp mergedFrom/mergedAt; the §1.1 redirect and the
    // §6.2 delete propagation read them as trusted structural pointers.
    const [paragraph, text] = buildContent();
    craftMergeLineage(paragraph, text);

    // The same bytes read by the same decoder without the sanitizer: without
    // this the `mergedInto` assertion below would hold for a fixture the
    // decoder never derives one from, and would keep holding if the drop were
    // deleted.
    const rawText = new CRDTTreeNode(
      CRDTTreeNodeID.of(ticket(3), 0),
      'text',
      'hello',
    );
    const rawParagraph = new CRDTTreeNode(CRDTTreeNodeID.of(ticket(2), 0), 'p');
    // `prepend`, as `fromTreeNodes` links its nodes: the constructor's child
    // array leaves `parent` unset, and `rebuildMergeState` reads it.
    rawParagraph.prepend(rawText);
    craftMergeLineage(rawParagraph, rawText);
    CRDTTree.create(rawParagraph, ticket(8));
    assert.isTrue(
      rawParagraph.mergedInto?.equals(rawParagraph.id),
      'fixture does not make the decoder derive a mergedInto',
    );

    const content = roundTrip(paragraph);

    const decodedText = content.allChildren[0];
    assert.isUndefined(content.mergedFrom);
    assert.isUndefined(content.mergedAt);
    assert.isUndefined(decodedText.mergedFrom);
    assert.isUndefined(decodedText.mergedAt);
    // The decoder really does derive mergedInto from mergedFrom while it
    // builds this content -- the guard above proves it -- so it has to go
    // too: a source must not keep pointing at a destination no field records
    // any more. Two halves of the sanitizer erase it, the lineage drop and
    // `unremove` (a derived pointer only ever sits on a tombstone), and the
    // assertion is on the end state rather than on either one.
    assert.isUndefined(content.mergedInto);
  });

  it('should drop an attribute tombstone the content carries', () => {
    // An attribute tombstone on content nobody ever styled is storage that
    // `getDataSize` charges to no one and the TreeEdit insert path registers
    // no GC pair for: unbounded growth the document size cannot see.
    const [, text] = buildContent();
    const attrs = new RHT();
    attrs.set('live', 'yes', ticket(2));
    attrs.set('crafted', 'x'.repeat(64), ticket(2));
    attrs.remove('crafted', ticket(3));
    const paragraph = new CRDTTreeNode(
      CRDTTreeNodeID.of(ticket(2), 0),
      'p',
      [text],
      attrs,
    );
    assert.isTrue(
      paragraph.attrs!.getNodeMapByKey().get('crafted')!.isRemoved(),
    );

    const content = roundTrip(paragraph);

    // The live entry proves the attributes made the round trip at all, so the
    // missing one is the purge and not a decode that dropped them wholesale.
    assert.equal(content.attrs?.get('live'), 'yes');
    assert.isFalse(
      content.attrs!.getNodeMapByKey().has('crafted'),
      'content kept a crafted attribute tombstone',
    );
    assert.equal(content.attrs!.size(), 1);
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
      /entry with no node/,
    );
    let thrown: unknown;
    try {
      converter.bytesToOperation(toBinary(PbOperationSchema, pbOp));
    } catch (err) {
      thrown = err;
    }
    assert.instanceOf(thrown, YorkieError);
    assert.equal((thrown as YorkieError).code, Code.ErrInvalidArgument);
  });
});
