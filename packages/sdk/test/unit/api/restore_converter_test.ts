/*
 * Copyright 2024 The Yorkie Authors. All rights reserved.
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
import { fromBinary, toBinary } from '@bufbuild/protobuf';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { OperationSchema as PbOperationSchema } from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';
import { EditOperation } from '@yorkie-js/sdk/src/document/operation/edit_operation';
import { CRDTTextValue } from '@yorkie-js/sdk/src/document/crdt/text';
import {
  RGATreeSplitNodeID,
  RGATreeSplitPos,
  RestoreSpan,
} from '@yorkie-js/sdk/src/document/crdt/rga_tree_split';
import {
  InitialTimeTicket,
  TimeTicket,
} from '@yorkie-js/sdk/src/document/time/ticket';
import { InitialActorID } from '@yorkie-js/sdk/src/document/time/actor_id';

describe('Restore span converter', function () {
  const seed = TimeTicket.of(1n, 0, InitialActorID);
  const executedAt = TimeTicket.of(4n, 0, InitialActorID);
  const pos = RGATreeSplitPos.of(RGATreeSplitNodeID.of(seed, 0), 0);

  const span = (
    start: number,
    end: number,
    content: string,
  ): RestoreSpan<CRDTTextValue> => ({
    createdAt: seed,
    start,
    end,
    value: CRDTTextValue.create(content),
  });

  it('round-trips a restore operation over the wire', function () {
    const spans = [span(4, 6, '45'), span(2, 8, '234567')];
    const op = EditOperation.create(
      InitialTimeTicket,
      pos,
      pos,
      '',
      new Map(),
      executedAt,
      true,
      spans,
      'restore',
    );

    const bytes = converter.operationToBinary(op);
    const restored = converter.bytesToOperation(bytes) as EditOperation;

    assert.equal(restored.getRestoreMode(), 'restore');
    const got = restored.getRestoreSpans()!;
    assert.equal(got.length, 2);
    assert.equal(got[0].start, 4);
    assert.equal(got[0].end, 6);
    assert.equal(got[0].value.getContent(), '45');
    assert.equal(got[1].value.getContent(), '234567');
    assert.isTrue(got[0].createdAt.equals(seed));
  });

  it('round-trips a retombstone operation', function () {
    const op = EditOperation.create(
      InitialTimeTicket,
      pos,
      pos,
      '',
      new Map(),
      executedAt,
      true,
      [span(4, 6, '45')],
      'retombstone',
    );

    const restored = converter.bytesToOperation(
      converter.operationToBinary(op),
    ) as EditOperation;
    assert.equal(restored.getRestoreMode(), 'retombstone');
    assert.equal(restored.getRestoreSpans()!.length, 1);
  });

  it('round-trips the companion retombstone_spans of a replace reverse', function () {
    // The reverse of a replace revives the removed content (restoreSpans) and
    // re-removes the inserted content (retombstoneSpans), both by identity.
    // Both span sets must survive the wire or a peer/server diverges.
    const op = EditOperation.create(
      InitialTimeTicket,
      pos,
      pos,
      '',
      new Map(),
      executedAt,
      true,
      [span(2, 4, 'CD')], // restore (revive the removed "CD")
      'restore',
      [span(0, 2, '12')], // retombstone (re-remove the inserted "12")
    );

    const restored = converter.bytesToOperation(
      converter.operationToBinary(op),
    ) as EditOperation;
    assert.equal(restored.getRestoreMode(), 'restore');
    assert.equal(restored.getRestoreSpans()!.length, 1);
    assert.equal(restored.getRestoreSpans()![0].value.getContent(), 'CD');
    assert.equal(restored.getRetombstoneSpans()!.length, 1);
    assert.equal(restored.getRetombstoneSpans()![0].value.getContent(), '12');
    assert.isTrue(restored.getRetombstoneSpans()![0].createdAt.equals(seed));
  });

  // The wire format carries no per-attribute timestamp, so the decoder has to
  // derive one. It has to be the span's own `createdAt`, not the operation's
  // `executedAt`: an attribute applied by the insertion itself is stamped with
  // the edit's ticket, which is also the id of the node it inserted, so a
  // replica recreating the purged node from this span lands on the same RHT
  // `updatedAt` as the replica that produced it.
  it('stamps span attributes with the span createdAt, not executedAt', function () {
    const styled = span(0, 1, 'X');
    styled.value.setAttr('b', '1', seed);
    const op = EditOperation.create(
      InitialTimeTicket,
      pos,
      pos,
      '',
      new Map(),
      executedAt,
      true,
      undefined,
      'restore',
      [styled],
    );

    const restored = converter.bytesToOperation(
      converter.operationToBinary(op),
    ) as EditOperation;
    const got = restored.getRetombstoneSpans()![0];
    assert.deepEqual(got.value.getAttributes(), { b: '1' });
    for (const node of got.value.getAttrs()) {
      assert.isTrue(
        node.getUpdatedAt().equals(seed),
        'an attribute must decode with the span createdAt',
      );
    }
  });

  // A span is untrusted input: it arrives in a change pack from any peer. The
  // decoder non-null asserts its created_at and `RGATreeSplit.restore` slices
  // the content by `cursor - span.start`, so a blank ticket or an interval
  // that does not match the content only fails deep inside the restore path --
  // on every peer that applies the pack. Reject it at the boundary, the way
  // fromPbTreeRestoreSpan already does for tree spans.
  describe('rejects a malformed span', function () {
    const decodeWith = (
      corrupt: (span: {
        createdAt?: unknown;
        start: number;
        end: number;
        content: string;
      }) => void,
    ) => {
      const op = EditOperation.create(
        InitialTimeTicket,
        pos,
        pos,
        '',
        new Map(),
        executedAt,
        true,
        [span(4, 6, '45')],
        'restore',
      );
      const pb = fromBinary(PbOperationSchema, converter.operationToBinary(op));
      const pbSpan = (pb.body.value as { restoreSpans: Array<unknown> })
        .restoreSpans[0];
      corrupt(pbSpan as never);
      return () => converter.bytesToOperation(toBinary(PbOperationSchema, pb));
    };

    it('on a missing created_at', function () {
      assert.throws(decodeWith((s) => (s.createdAt = undefined)));
    });

    it('on a negative start', function () {
      assert.throws(
        decodeWith((s) => {
          s.start = -2;
          s.end = 0;
        }),
      );
    });

    it('on an inverted interval', function () {
      assert.throws(
        decodeWith((s) => {
          s.start = 6;
          s.end = 4;
        }),
      );
    });

    it('on an interval that does not cover the content', function () {
      assert.throws(decodeWith((s) => (s.end = 9)));
    });
  });

  it('leaves ordinary edits without a restore payload', function () {
    const op = EditOperation.create(
      InitialTimeTicket,
      pos,
      pos,
      'hi',
      new Map(),
      executedAt,
    );

    const restored = converter.bytesToOperation(
      converter.operationToBinary(op),
    ) as EditOperation;
    assert.isUndefined(restored.getRestoreSpans());
    assert.equal(restored.getContent(), 'hi');
  });

  it('decodes to a harmless no-op for peers that ignore restore fields', function () {
    // Mixed-version interop contract: a restore/undo op carries its content
    // only in restoreSpans; its base Edit fields are a zero-width,
    // empty-content edit (from === to, content === ''). A peer or server
    // without restore support drops the unknown restore fields and applies
    // just the base edit — which inserts nothing and deletes nothing. So a
    // restore op reaching an old node CANNOT duplicate or corrupt content
    // (there is no inline content to re-insert); at worst the old node does
    // not perform the restore and stays diverged until upgraded. This pins
    // that wire contract so a future change can't quietly start emitting
    // inline content on the restore path.
    const op = EditOperation.create(
      InitialTimeTicket,
      pos,
      pos,
      '',
      new Map(),
      executedAt,
      true,
      [span(4, 6, '45')],
      'restore',
    );

    const pbOp = converter.toOperation(op);
    assert.equal(pbOp.body.case, 'edit');
    const pbEdit = pbOp.body.value as { content: string };
    assert.equal(
      pbEdit.content,
      '',
      'restore ops carry no inline content for an old peer to re-insert',
    );

    const restored = converter.bytesToOperation(
      converter.operationToBinary(op),
    ) as EditOperation;
    assert.isTrue(
      restored.getFromPos().equals(restored.getToPos()),
      'restore ops are zero-width, so an old peer deletes nothing either',
    );
    assert.equal(restored.getContent(), '');
    // A new peer still receives the full identity payload.
    assert.equal(restored.getRestoreMode(), 'restore');
    assert.equal(restored.getRestoreSpans()!.length, 1);
  });
});
