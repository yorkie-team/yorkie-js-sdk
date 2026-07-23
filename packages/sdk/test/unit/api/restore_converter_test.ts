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
import { converter } from '@yorkie-js/sdk/src/api/converter';
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
