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
import { TreeEditOperation } from '@yorkie-js/sdk/src/document/operation/tree_edit_operation';
import {
  CRDTTreeNodeID,
  CRDTTreePos,
  TreeRestoreSpan,
} from '@yorkie-js/sdk/src/document/crdt/tree';
import { RHT } from '@yorkie-js/sdk/src/document/crdt/rht';
import {
  InitialTimeTicket,
  TimeTicket,
} from '@yorkie-js/sdk/src/document/time/ticket';
import { InitialActorID } from '@yorkie-js/sdk/src/document/time/actor_id';

describe('Tree restore span converter', function () {
  const seed = TimeTicket.of(1n, 0, InitialActorID);
  const executedAt = TimeTicket.of(4n, 0, InitialActorID);
  const pos = CRDTTreePos.of(
    CRDTTreeNodeID.of(seed, 0),
    CRDTTreeNodeID.of(seed, 0),
  );

  const attrs = new RHT();
  attrs.set('bold', 'true', seed);

  const elemSpan: TreeRestoreSpan = {
    id: CRDTTreeNodeID.of(seed, 2),
    nodeType: 'p',
    isText: false,
    length: 0,
    attrs,
    parentID: CRDTTreeNodeID.of(seed, 0),
    leftSiblingID: CRDTTreeNodeID.of(seed, 1),
    rightSiblingID: CRDTTreeNodeID.of(seed, 3),
  };
  const textSpan: TreeRestoreSpan = {
    id: CRDTTreeNodeID.of(seed, 5),
    nodeType: 'text',
    isText: true,
    length: 5,
    value: 'hello',
    parentID: CRDTTreeNodeID.of(seed, 2),
  };

  const create = (
    restoreSpans: Array<TreeRestoreSpan>,
    mode: 'restore' | 'retombstone',
    retombstoneSpans: Array<TreeRestoreSpan>,
  ) =>
    TreeEditOperation.create(
      InitialTimeTicket,
      pos,
      pos,
      undefined,
      0,
      executedAt,
      true,
      0,
      0,
      restoreSpans,
      mode,
      retombstoneSpans,
    );

  it('round-trips element + text restore spans with anchors and attrs', function () {
    const op = create([elemSpan, textSpan], 'restore', []);
    const restored = converter.bytesToOperation(
      converter.operationToBinary(op),
    ) as TreeEditOperation;

    assert.equal(restored.getRestoreMode(), 'restore');
    const got = restored.getRestoreSpans()!;
    assert.equal(got.length, 2);

    // element span: identity + tree anchors + attribute snapshot survive.
    assert.isTrue(got[0].id.equals(elemSpan.id));
    assert.equal(got[0].nodeType, 'p');
    assert.isFalse(got[0].isText);
    assert.isTrue(got[0].parentID!.equals(elemSpan.parentID!));
    assert.isTrue(got[0].leftSiblingID!.equals(elemSpan.leftSiblingID!));
    assert.isTrue(got[0].rightSiblingID!.equals(elemSpan.rightSiblingID!));
    assert.equal(got[0].attrs!.get('bold'), 'true');

    // text span: identity + value + length survive.
    assert.isTrue(got[1].id.equals(textSpan.id));
    assert.isTrue(got[1].isText);
    assert.equal(got[1].length, 5);
    assert.equal(got[1].value, 'hello');
    assert.isTrue(got[1].parentID!.equals(textSpan.parentID!));
  });

  it('round-trips a pure-insert reverse (retombstone spans only)', function () {
    // The reverse of an insert carries the inserted nodes only in
    // retombstoneSpans; restoreSpans is empty. Both must survive the wire.
    const op = create([], 'restore', [elemSpan, textSpan]);
    const restored = converter.bytesToOperation(
      converter.operationToBinary(op),
    ) as TreeEditOperation;

    assert.equal(restored.getRestoreMode(), 'restore');
    assert.equal((restored.getRestoreSpans() ?? []).length, 0);
    const retomb = restored.getRetombstoneSpans()!;
    assert.equal(retomb.length, 2);
    assert.isTrue(retomb[0].id.equals(elemSpan.id));
    assert.equal(retomb[1].value, 'hello');
  });

  it('round-trips a redo (retombstone direction)', function () {
    const op = create([textSpan], 'retombstone', [elemSpan]);
    const restored = converter.bytesToOperation(
      converter.operationToBinary(op),
    ) as TreeEditOperation;

    assert.equal(restored.getRestoreMode(), 'retombstone');
    assert.equal(restored.getRestoreSpans()!.length, 1);
    assert.equal(restored.getRetombstoneSpans()!.length, 1);
  });

  it('leaves ordinary tree edits without a restore payload', function () {
    const op = TreeEditOperation.create(
      InitialTimeTicket,
      pos,
      pos,
      undefined,
      0,
      executedAt,
    );
    const restored = converter.bytesToOperation(
      converter.operationToBinary(op),
    ) as TreeEditOperation;
    assert.isUndefined(restored.getRestoreMode());
    assert.isUndefined(restored.getRestoreSpans());
  });
});
