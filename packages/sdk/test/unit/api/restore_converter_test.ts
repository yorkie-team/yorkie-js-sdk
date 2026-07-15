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
});
