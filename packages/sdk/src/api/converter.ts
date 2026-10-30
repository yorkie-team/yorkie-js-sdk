/*
 * Copyright 2023 The Yorkie Authors. All rights reserved.
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

import { ConnectError } from '@connectrpc/connect';
import { create, toBinary, fromBinary } from '@bufbuild/protobuf';
import { timestampDate } from '@bufbuild/protobuf/wkt';
import { ErrorInfoSchema } from '@buf/googleapis_googleapis.bufbuild_es/google/rpc/error_details_pb';
import { Rule } from '@yorkie-js/schema';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';
import { Indexable } from '@yorkie-js/sdk/src/document/document';
import {
  PresenceChange,
  PresenceChangeType,
} from '@yorkie-js/sdk/src/document/presence/change';
import {
  InitialTimeTicket,
  TimeTicket,
} from '@yorkie-js/sdk/src/document/time/ticket';
import { ActorID } from '@yorkie-js/sdk/src/document/time/actor_id';
import { Operation } from '@yorkie-js/sdk/src/document/operation/operation';
import { SetOperation } from '@yorkie-js/sdk/src/document/operation/set_operation';
import { AddOperation } from '@yorkie-js/sdk/src/document/operation/add_operation';
import { MoveOperation } from '@yorkie-js/sdk/src/document/operation/move_operation';
import { RemoveOperation } from '@yorkie-js/sdk/src/document/operation/remove_operation';
import { EditOperation } from '@yorkie-js/sdk/src/document/operation/edit_operation';
import { StyleOperation } from '@yorkie-js/sdk/src/document/operation/style_operation';
import { TreeEditOperation } from '@yorkie-js/sdk/src/document/operation/tree_edit_operation';
import { ChangeID } from '@yorkie-js/sdk/src/document/change/change_id';
import { Change } from '@yorkie-js/sdk/src/document/change/change';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { ElementRHT } from '@yorkie-js/sdk/src/document/crdt/element_rht';
import { RGATreeList } from '@yorkie-js/sdk/src/document/crdt/rga_tree_list';
import { CRDTElement } from '@yorkie-js/sdk/src/document/crdt/element';
import { dropSplitLinksInElement } from '@yorkie-js/sdk/src/document/crdt/split_links';
import { CRDTObject } from '@yorkie-js/sdk/src/document/crdt/object';
import { CRDTArray } from '@yorkie-js/sdk/src/document/crdt/array';
import { VersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { CRDTTreePos } from './../document/crdt/tree';
import {
  RGATreeSplit,
  RGATreeSplitNode,
  RGATreeSplitNodeID,
  RGATreeSplitPos,
  RestoreSpan,
} from '@yorkie-js/sdk/src/document/crdt/rga_tree_split';
import { CRDTText, CRDTTextValue } from '@yorkie-js/sdk/src/document/crdt/text';
import {
  Primitive,
  PrimitiveType,
} from '@yorkie-js/sdk/src/document/crdt/primitive';
import {
  Change as PbChange,
  ChangeSchema as PbChangeSchema,
  ChangeID as PbChangeID,
  ChangeIDSchema as PbChangeIDSchema,
  ChangePack as PbChangePack,
  ChangePackSchema as PbChangePackSchema,
  Checkpoint as PbCheckpoint,
  CheckpointSchema as PbCheckpointSchema,
  Rule as PbRule,
  JSONElement as PbJSONElement,
  JSONElementSchema as PbJSONElementSchema,
  JSONElementSimple as PbJSONElementSimple,
  JSONElementSimpleSchema as PbJSONElementSimpleSchema,
  NodeAttr as PbNodeAttr,
  NodeAttrSchema as PbNodeAttrSchema,
  Operation as PbOperation,
  OperationSchema as PbOperationSchema,
  Presence as PbPresence,
  PresenceSchema as PbPresenceSchema,
  PresenceChange as PbPresenceChange,
  PresenceChangeSchema as PbPresenceChangeSchema,
  RGANode as PbRGANode,
  RGANodeSchema as PbRGANodeSchema,
  RHTNode as PbRHTNode,
  RHTNodeSchema as PbRHTNodeSchema,
  SnapshotSchema as PbSnapshotSchema,
  TextNode as PbTextNode,
  TextNodeSchema as PbTextNodeSchema,
  TextNodeID as PbTextNodeID,
  TextNodeIDSchema as PbTextNodeIDSchema,
  TextNodePos as PbTextNodePos,
  TextNodePosSchema as PbTextNodePosSchema,
  TimeTicket as PbTimeTicket,
  TimeTicketSchema as PbTimeTicketSchema,
  TreeNode as PbTreeNode,
  TreeNodeSchema as PbTreeNodeSchema,
  TreeNodes as PbTreeNodes,
  TreeNodesSchema as PbTreeNodesSchema,
  TreePos as PbTreePos,
  TreePosSchema as PbTreePosSchema,
  TreeNodeID as PbTreeNodeID,
  TreeNodeIDSchema as PbTreeNodeIDSchema,
  VersionVector as PbVersionVector,
  VersionVectorSchema as PbVersionVectorSchema,
  ValueType as PbValueType,
  JSONElement_Tree as PbJSONElement_Tree,
  JSONElement_TreeSchema as PbJSONElement_TreeSchema,
  JSONElement_Text as PbJSONElement_Text,
  JSONElement_TextSchema as PbJSONElement_TextSchema,
  JSONElement_Primitive as PbJSONElement_Primitive,
  JSONElement_PrimitiveSchema as PbJSONElement_PrimitiveSchema,
  JSONElement_Counter as PbJSONElement_Counter,
  JSONElement_CounterSchema as PbJSONElement_CounterSchema,
  JSONElement_JSONObject as PbJSONElement_JSONObject,
  JSONElement_JSONObjectSchema as PbJSONElement_JSONObjectSchema,
  JSONElement_JSONArray as PbJSONElement_JSONArray,
  JSONElement_JSONArraySchema as PbJSONElement_JSONArraySchema,
  PresenceChange_ChangeType as PbPresenceChange_ChangeType,
  Operation_SetSchema as PbOperation_SetSchema,
  Operation_AddSchema as PbOperation_AddSchema,
  Operation_MoveSchema as PbOperation_MoveSchema,
  Operation_RemoveSchema as PbOperation_RemoveSchema,
  Operation_EditSchema as PbOperation_EditSchema,
  Operation_StyleSchema as PbOperation_StyleSchema,
  Operation_IncreaseSchema as PbOperation_IncreaseSchema,
  Operation_TreeEditSchema as PbOperation_TreeEditSchema,
  Operation_TreeStyleSchema as PbOperation_TreeStyleSchema,
  Operation_ArraySetSchema as PbOperation_ArraySetSchema,
  RestoreSpanSchema as PbRestoreSpanSchema,
  RestoreSpan as PbRestoreSpan,
  RestoreMode as PbRestoreMode,
  TreeRestoreSpanSchema as PbTreeRestoreSpanSchema,
  RemovalCancelSchema as PbRemovalCancelSchema,
  PurgedRemovalsSchema as PbPurgedRemovalsSchema,
  PurgedRemovals as PbPurgedRemovals,
  TreeRestoreSpan as PbTreeRestoreSpan,
  RevisionSummary as PbRevisionSummary,
  JSONElement_ZeroTree as PbJSONElement_ZeroTree,
  JSONElement_ZeroTreeSchema as PbJSONElement_ZeroTreeSchema,
  ZeroTreeNodeSchema as PbZeroTreeNodeSchema,
  ZeroTicket as PbZeroTicket,
  ZeroTicketSchema as PbZeroTicketSchema,
  ZeroNodeID as PbZeroNodeID,
  ZeroNodeIDSchema as PbZeroNodeIDSchema,
  ZeroSchema as PbZeroSchema,
  ZeroSchemaSchema as PbZeroSchemaSchema,
  ZeroSchemaChildrenSchema as PbZeroSchemaChildrenSchema,
  ZeroSchemaGridSchema as PbZeroSchemaGridSchema,
  ZeroTokens as PbZeroTokens,
  ZeroTokensSchema as PbZeroTokensSchema,
  ZeroTokenSchema as PbZeroTokenSchema,
  ZeroMarkerSchema as PbZeroMarkerSchema,
  ZeroAttrSchema as PbZeroAttrSchema,
  ZeroAttrEntrySchema as PbZeroAttrEntrySchema,
  ZeroAttrWrite as PbZeroAttrWrite,
  ZeroStyleCancel as PbZeroStyleCancel,
  ZeroStyleCancelSchema as PbZeroStyleCancelSchema,
  ZeroAttrWriteSchema as PbZeroAttrWriteSchema,
  ZeroStyleRangeSchema as PbZeroStyleRangeSchema,
  ZeroCancelSchema as PbZeroCancelSchema,
  ZeroPurgedLedgerSchema as PbZeroPurgedLedgerSchema,
  ZeroRestoreSpan as PbZeroRestoreSpan,
  ZeroRestoreSpanSchema as PbZeroRestoreSpanSchema,
  Operation_ZeroTreeEditSchema as PbOperation_ZeroTreeEditSchema,
  Operation_ZeroTreeStyleSchema as PbOperation_ZeroTreeStyleSchema,
} from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';
import {
  CRDTZeroTree,
  ZeroCancelWrite,
  ZeroGhost,
  ZeroMarker,
  ZeroStyleCancel,
  ZeroToken,
  ZeroTokens,
} from '@yorkie-js/sdk/src/document/crdt/zero_tree';
import {
  ZeroTreeEditOperation,
  ZeroTreeStyleOperation,
} from '@yorkie-js/sdk/src/document/operation/zero_tree_operation';
import {
  BuiltinZeroSchema,
  DefaultZeroSchema,
  ZeroSchema,
} from '@yorkie-js/sdk/src/document/crdt/zero_tree_view';
import { IncreaseOperation } from '@yorkie-js/sdk/src/document/operation/increase_operation';
import {
  CounterType,
  CRDTCounter,
} from '@yorkie-js/sdk/src/document/crdt/counter';
import {
  CRDTTree,
  CRDTTreeNode,
  CRDTTreeNodeID,
  TreeRestoreSpan,
} from '@yorkie-js/sdk/src/document/crdt/tree';
import { traverseAll } from '../util/index_tree';
import { TreeStyleOperation } from '../document/operation/tree_style_operation';
import { RHT } from '../document/crdt/rht';
import { ArraySetOperation } from '../document/operation/array_set_operation';
import { RevisionSummary } from './revision';
import { logger } from '@yorkie-js/sdk/src/util/logger';
import type { ZeroAttrValue } from '@yorkie-js/sdk/src/document/crdt/zero_tree_view';

/**
 * `toPresence` converts the given model to Protobuf format.
 */
function toPresence(presence: Indexable): PbPresence {
  const pbDataMap: { [key: string]: string } = {};
  for (const [key, value] of Object.entries(presence)) {
    pbDataMap[key] = JSON.stringify(value);
  }
  return create(PbPresenceSchema, { data: pbDataMap });
}

/**
 * `toPresenceChange` converts the given model to Protobuf format.
 */
function toPresenceChange(
  presenceChange: PresenceChange<Indexable>,
): PbPresenceChange {
  if (presenceChange.type === PresenceChangeType.Put) {
    return create(PbPresenceChangeSchema, {
      type: PbPresenceChange_ChangeType.PUT,
      presence: toPresence(presenceChange.presence),
    });
  }
  if (presenceChange.type === PresenceChangeType.Patch) {
    // Only the changed keys go on the wire; the patch's `full` copy is local
    // state for `Change.execute` and the base-unavailable fallback. The server
    // folds the patch into the base it holds before storing it.
    return create(PbPresenceChangeSchema, {
      type: PbPresenceChange_ChangeType.PATCH,
      presence: toPresence(presenceChange.presence as Indexable),
    });
  }
  if (presenceChange.type === PresenceChangeType.Clear) {
    return create(PbPresenceChangeSchema, {
      type: PbPresenceChange_ChangeType.CLEAR,
    });
  }

  throw new YorkieError(Code.ErrUnimplemented, `unimplemented type`);
}

/**
 * `toCheckpoint` converts the given model to Protobuf format.
 */
function toCheckpoint(checkpoint: Checkpoint): PbCheckpoint {
  return create(PbCheckpointSchema, {
    serverSeq: checkpoint.getServerSeq(),
    clientSeq: checkpoint.getClientSeq(),
  });
}

/**
 * `toChangeID` converts the given model to Protobuf format.
 */
function toChangeID(changeID: ChangeID): PbChangeID {
  return create(PbChangeIDSchema, {
    clientSeq: changeID.getClientSeq(),
    lamport: changeID.getLamport(),
    actorId: toUint8Array(changeID.getActorID()),
    versionVector: toVersionVector(changeID.getVersionVector()),
  });
}

/**
 * `toTimeTicket` converts the given model to Protobuf format.
 */
function toTimeTicket(ticket?: TimeTicket): PbTimeTicket | undefined {
  if (!ticket) {
    return;
  }

  return create(PbTimeTicketSchema, {
    lamport: ticket.getLamport(),
    delimiter: ticket.getDelimiter(),
    actorId: toUint8Array(ticket.getActorID()),
  });
}

/**
 * `toVersionVector` converts the given model to Protobuf format.
 */
function toVersionVector(vector?: VersionVector): PbVersionVector | undefined {
  if (!vector) {
    return;
  }

  const pbVector = create(PbVersionVectorSchema);
  for (const [actorID, lamport] of vector) {
    const base64ActorID = uint8ArrayToBase64(toUint8Array(actorID));
    pbVector.vector[base64ActorID] = BigInt(lamport.toString());
  }
  return pbVector;
}

/**
 * `toValueType` converts the given model to Protobuf format.
 */
function toValueType(valueType: PrimitiveType): PbValueType {
  switch (valueType) {
    case PrimitiveType.Null:
      return PbValueType.NULL;
    case PrimitiveType.Boolean:
      return PbValueType.BOOLEAN;
    case PrimitiveType.Integer:
      return PbValueType.INTEGER;
    case PrimitiveType.Long:
      return PbValueType.LONG;
    case PrimitiveType.Double:
      return PbValueType.DOUBLE;
    case PrimitiveType.String:
      return PbValueType.STRING;
    case PrimitiveType.Bytes:
      return PbValueType.BYTES;
    case PrimitiveType.Date:
      return PbValueType.DATE;
    default:
      throw new YorkieError(
        Code.ErrInvalidType,
        `unsupported type: ${valueType}`,
      );
  }
}

/**
 * `toCounterType` converts the given model to Protobuf format.
 */
function toCounterType(valueType: CounterType): PbValueType {
  switch (valueType) {
    case CounterType.Int:
      return PbValueType.INTEGER_CNT;
    case CounterType.Long:
      return PbValueType.LONG_CNT;
    case CounterType.IntDedup:
      return PbValueType.INTEGER_DEDUP_CNT;
    default:
      throw new YorkieError(
        Code.ErrInvalidType,
        `unsupported type: ${valueType}`,
      );
  }
}

/**
 * `toElementSimple` converts the given model to Protobuf format.
 */
function toElementSimple(element: CRDTElement): PbJSONElementSimple {
  if (element instanceof CRDTObject) {
    return create(PbJSONElementSimpleSchema, {
      type: PbValueType.JSON_OBJECT,
      createdAt: toTimeTicket(element.getCreatedAt()),
      value: objectToBytes(element),
    });
  }
  if (element instanceof CRDTArray) {
    return create(PbJSONElementSimpleSchema, {
      type: PbValueType.JSON_ARRAY,
      createdAt: toTimeTicket(element.getCreatedAt()),
      value: arrayToBytes(element),
    });
  }
  if (element instanceof CRDTText) {
    return create(PbJSONElementSimpleSchema, {
      type: PbValueType.TEXT,
      createdAt: toTimeTicket(element.getCreatedAt()),
    });
  }
  if (element instanceof Primitive) {
    return create(PbJSONElementSimpleSchema, {
      type: toValueType(element.getType()),
      createdAt: toTimeTicket(element.getCreatedAt()),
      value: element.toBytes(),
    });
  }
  if (element instanceof CRDTCounter) {
    return create(PbJSONElementSimpleSchema, {
      type: toCounterType(element.getType()),
      createdAt: toTimeTicket(element.getCreatedAt()),
      value: element.toBytes(),
    });
  }
  if (element instanceof CRDTTree) {
    return create(PbJSONElementSimpleSchema, {
      type: PbValueType.TREE,
      createdAt: toTimeTicket(element.getCreatedAt()),
      value: treeToBytes(element),
    });
  }
  if (element instanceof CRDTZeroTree) {
    return create(PbJSONElementSimpleSchema, {
      type: PbValueType.ZERO_TREE,
      createdAt: toTimeTicket(element.getCreatedAt()),
      value: toBinary(PbJSONElementSchema, toZeroTree(element)),
    });
  }

  throw new YorkieError(Code.ErrUnimplemented, `unimplemented element`);
}

/**
 * `toTextNodeID` converts the given model to Protobuf format.
 */
function toTextNodeID(id: RGATreeSplitNodeID): PbTextNodeID {
  return create(PbTextNodeIDSchema, {
    createdAt: toTimeTicket(id.getCreatedAt()),
    offset: id.getOffset(),
  });
}

/**
 * `toTextNodePos` converts the given model to Protobuf format.
 */
function toTextNodePos(pos: RGATreeSplitPos): PbTextNodePos {
  return create(PbTextNodePosSchema, {
    createdAt: toTimeTicket(pos.getID().getCreatedAt()),
    offset: pos.getID().getOffset(),
    relativeOffset: pos.getRelativeOffset(),
  });
}

/**
 * `toTreePos` converts the given model to Protobuf format.
 */
function toTreePos(pos: CRDTTreePos): PbTreePos {
  return create(PbTreePosSchema, {
    parentId: toTreeNodeID(pos.getParentID()),
    leftSiblingId: toTreeNodeID(pos.getLeftSiblingID()),
  });
}

/**
 * `toTreeNodeID` converts the given model to Protobuf format.
 */
function toTreeNodeID(treeNodeID: CRDTTreeNodeID): PbTreeNodeID {
  return create(PbTreeNodeIDSchema, {
    createdAt: toTimeTicket(treeNodeID.getCreatedAt()),
    offset: treeNodeID.getOffset(),
  });
}

/**
 * `toPbTreeRestoreSpan` converts a TreeRestoreSpan to Protobuf format.
 */
function toPbTreeRestoreSpan(span: TreeRestoreSpan): PbTreeRestoreSpan {
  const pbSpan = create(PbTreeRestoreSpanSchema);
  pbSpan.id = toTreeNodeID(span.id);
  pbSpan.nodeType = span.nodeType;
  pbSpan.isText = span.isText;
  pbSpan.length = span.length;
  if (span.value !== undefined) {
    pbSpan.value = span.value;
  }
  if (span.attrs) {
    pbSpan.attributes = toRHT(span.attrs);
  }
  if (span.parentID) {
    pbSpan.parentId = toTreeNodeID(span.parentID);
  }
  if (span.leftSiblingID) {
    pbSpan.leftSiblingId = toTreeNodeID(span.leftSiblingID);
  }
  if (span.rightSiblingID) {
    pbSpan.rightSiblingId = toTreeNodeID(span.rightSiblingID);
  }
  return pbSpan;
}

/**
 * `fromPbTreeRestoreSpan` converts a Protobuf TreeRestoreSpan to model format.
 * A span addresses content by insertion identity, so every node ID it carries
 * is malformed without a `createdAt`, and the attribute snapshot is malformed
 * without an `updatedAt`. Both are rejected here because the decoders below
 * non-null assert those tickets: `fromTreeNodeID` would yield a
 * CRDTTreeNodeID with an undefined createdAt and `fromRHT` an RHT node with an
 * undefined updatedAt, neither failing until deep inside the restore path.
 * Mirrors the server's `fromTreeRestoreSpans`.
 */
function fromPbTreeRestoreSpan(pbSpan: PbTreeRestoreSpan): TreeRestoreSpan {
  const anchors = [
    pbSpan.parentId,
    pbSpan.leftSiblingId,
    pbSpan.rightSiblingId,
  ];
  if (
    !pbSpan.id?.createdAt ||
    anchors.some((anchor) => anchor && !anchor.createdAt) ||
    Object.values(pbSpan.attributes).some((attr) => !attr.updatedAt)
  ) {
    throw new YorkieError(
      Code.ErrInvalidArgument,
      'malformed tree restore span: missing timestamp',
    );
  }
  return {
    id: fromTreeNodeID(pbSpan.id),
    nodeType: pbSpan.nodeType,
    isText: pbSpan.isText,
    length: pbSpan.length,
    value: pbSpan.isText ? pbSpan.value : undefined,
    attrs:
      Object.keys(pbSpan.attributes).length > 0
        ? fromRHT(pbSpan.attributes)
        : undefined,
    parentID: pbSpan.parentId ? fromTreeNodeID(pbSpan.parentId) : undefined,
    leftSiblingID: pbSpan.leftSiblingId
      ? fromTreeNodeID(pbSpan.leftSiblingId)
      : undefined,
    rightSiblingID: pbSpan.rightSiblingId
      ? fromTreeNodeID(pbSpan.rightSiblingId)
      : undefined,
  };
}

/**
 * `toOperation` converts the given model to Protobuf format.
 */
function toOperation(operation: Operation): PbOperation {
  const pbOperation = create(PbOperationSchema);

  if (operation instanceof SetOperation) {
    const setOperation = operation as SetOperation;
    const pbSetOperation = create(PbOperation_SetSchema);
    pbSetOperation.parentCreatedAt = toTimeTicket(
      setOperation.getParentCreatedAt(),
    );
    pbSetOperation.key = setOperation.getKey();
    pbSetOperation.value = toElementSimple(setOperation.getValue());
    pbSetOperation.executedAt = toTimeTicket(setOperation.getExecutedAt());
    pbOperation.body.case = 'set';
    pbOperation.body.value = pbSetOperation;
  } else if (operation instanceof AddOperation) {
    const addOperation = operation as AddOperation;
    const pbAddOperation = create(PbOperation_AddSchema);
    pbAddOperation.parentCreatedAt = toTimeTicket(
      addOperation.getParentCreatedAt(),
    );
    pbAddOperation.prevCreatedAt = toTimeTicket(
      addOperation.getPrevCreatedAt(),
    );
    pbAddOperation.value = toElementSimple(addOperation.getValue());
    pbAddOperation.executedAt = toTimeTicket(addOperation.getExecutedAt());
    pbOperation.body.case = 'add';
    pbOperation.body.value = pbAddOperation;
  } else if (operation instanceof MoveOperation) {
    const moveOperation = operation as MoveOperation;
    const pbMoveOperation = create(PbOperation_MoveSchema);
    pbMoveOperation.parentCreatedAt = toTimeTicket(
      moveOperation.getParentCreatedAt(),
    );
    pbMoveOperation.prevCreatedAt = toTimeTicket(
      moveOperation.getPrevCreatedAt(),
    );
    pbMoveOperation.createdAt = toTimeTicket(moveOperation.getCreatedAt());
    pbMoveOperation.executedAt = toTimeTicket(moveOperation.getExecutedAt());
    pbOperation.body.case = 'move';
    pbOperation.body.value = pbMoveOperation;
  } else if (operation instanceof RemoveOperation) {
    const removeOperation = operation as RemoveOperation;
    const pbRemoveOperation = create(PbOperation_RemoveSchema);
    pbRemoveOperation.parentCreatedAt = toTimeTicket(
      removeOperation.getParentCreatedAt(),
    );
    pbRemoveOperation.createdAt = toTimeTicket(removeOperation.getCreatedAt());
    pbRemoveOperation.executedAt = toTimeTicket(
      removeOperation.getExecutedAt(),
    );
    pbOperation.body.case = 'remove';
    pbOperation.body.value = pbRemoveOperation;
  } else if (operation instanceof EditOperation) {
    const editOperation = operation as EditOperation;
    const pbEditOperation = create(PbOperation_EditSchema);
    pbEditOperation.parentCreatedAt = toTimeTicket(
      editOperation.getParentCreatedAt(),
    );
    pbEditOperation.from = toTextNodePos(editOperation.getFromPos());
    pbEditOperation.to = toTextNodePos(editOperation.getToPos());
    pbEditOperation.content = editOperation.getContent();
    const pbAttributes = pbEditOperation.attributes;
    for (const [key, value] of editOperation.getAttributes()) {
      pbAttributes[key] = value;
    }
    pbEditOperation.executedAt = toTimeTicket(editOperation.getExecutedAt());
    const toPbSpan = (span: RestoreSpan<CRDTTextValue>) => {
      const pbSpan = create(PbRestoreSpanSchema);
      pbSpan.createdAt = toTimeTicket(span.createdAt);
      pbSpan.start = span.start;
      pbSpan.end = span.end;
      pbSpan.content = span.value.getContent();
      pbSpan.removedBy = toTimeTicket(span.removedBy);
      const pbSpanAttrs = pbSpan.attributes;
      for (const [key, value] of Object.entries(span.value.getAttributes())) {
        pbSpanAttrs[key] = value;
      }
      return pbSpan;
    };
    const restoreSpans = editOperation.getRestoreSpans();
    const retombstoneSpans = editOperation.getRetombstoneSpans();
    if (
      (restoreSpans && restoreSpans.length) ||
      (retombstoneSpans && retombstoneSpans.length)
    ) {
      pbEditOperation.restoreSpans = (restoreSpans ?? []).map(toPbSpan);
      pbEditOperation.retombstoneSpans = (retombstoneSpans ?? []).map(toPbSpan);
      pbEditOperation.restoreMode =
        editOperation.getRestoreMode() === 'retombstone'
          ? PbRestoreMode.RETOMBSTONE
          : PbRestoreMode.RESTORE;
    }
    pbOperation.body.case = 'edit';
    pbOperation.body.value = pbEditOperation;
  } else if (operation instanceof StyleOperation) {
    const styleOperation = operation as StyleOperation;
    const pbStyleOperation = create(PbOperation_StyleSchema);
    pbStyleOperation.parentCreatedAt = toTimeTicket(
      styleOperation.getParentCreatedAt(),
    );
    pbStyleOperation.from = toTextNodePos(styleOperation.getFromPos());
    pbStyleOperation.to = toTextNodePos(styleOperation.getToPos());

    const attributesToRemove = styleOperation.getAttributesToRemove();
    if (attributesToRemove.length > 0) {
      pbStyleOperation.attributesToRemove = attributesToRemove;
    }
    const pbAttributes = pbStyleOperation.attributes;
    for (const [key, value] of styleOperation.getAttributes()) {
      pbAttributes[key] = value;
    }
    pbStyleOperation.executedAt = toTimeTicket(styleOperation.getExecutedAt());
    pbOperation.body.case = 'style';
    pbOperation.body.value = pbStyleOperation;
  } else if (operation instanceof IncreaseOperation) {
    const increaseOperation = operation as IncreaseOperation;
    const pbIncreaseOperation = create(PbOperation_IncreaseSchema);
    pbIncreaseOperation.parentCreatedAt = toTimeTicket(
      increaseOperation.getParentCreatedAt(),
    );
    pbIncreaseOperation.value = toElementSimple(increaseOperation.getValue());
    pbIncreaseOperation.executedAt = toTimeTicket(
      increaseOperation.getExecutedAt(),
    );
    pbIncreaseOperation.actor = increaseOperation.getActor();
    pbOperation.body.case = 'increase';
    pbOperation.body.value = pbIncreaseOperation;
  } else if (operation instanceof TreeEditOperation) {
    const treeEditOperation = operation as TreeEditOperation;
    const pbTreeEditOperation = create(PbOperation_TreeEditSchema);
    pbTreeEditOperation.parentCreatedAt = toTimeTicket(
      treeEditOperation.getParentCreatedAt(),
    );
    pbTreeEditOperation.from = toTreePos(treeEditOperation.getFromPos());
    pbTreeEditOperation.to = toTreePos(treeEditOperation.getToPos());
    pbTreeEditOperation.contents = toTreeNodesWhenEdit(
      treeEditOperation.getContents()!,
    );
    pbTreeEditOperation.splitLevel = treeEditOperation.getSplitLevel();

    pbTreeEditOperation.executedAt = toTimeTicket(
      treeEditOperation.getExecutedAt(),
    );
    const treeRestoreSpans = treeEditOperation.getRestoreSpans();
    const treeRetombstoneSpans = treeEditOperation.getRetombstoneSpans();
    if (
      (treeRestoreSpans && treeRestoreSpans.length) ||
      (treeRetombstoneSpans && treeRetombstoneSpans.length)
    ) {
      pbTreeEditOperation.restoreSpans = (treeRestoreSpans ?? []).map(
        toPbTreeRestoreSpan,
      );
      pbTreeEditOperation.retombstoneSpans = (treeRetombstoneSpans ?? []).map(
        toPbTreeRestoreSpan,
      );
      pbTreeEditOperation.restoreMode =
        treeEditOperation.getRestoreMode() === 'retombstone'
          ? PbRestoreMode.RETOMBSTONE
          : PbRestoreMode.RESTORE;
    }
    pbTreeEditOperation.splitTickets = treeEditOperation
      .getSplitTickets()
      .map((ticket) => toTimeTicket(ticket)!);
    pbOperation.body.case = 'treeEdit';
    pbOperation.body.value = pbTreeEditOperation;
  } else if (operation instanceof TreeStyleOperation) {
    const treeStyleOperation = operation as TreeStyleOperation;
    const pbTreeStyleOperation = create(PbOperation_TreeStyleSchema);
    pbTreeStyleOperation.parentCreatedAt = toTimeTicket(
      treeStyleOperation.getParentCreatedAt(),
    );
    pbTreeStyleOperation.from = toTreePos(treeStyleOperation.getFromPos());
    pbTreeStyleOperation.to = toTreePos(treeStyleOperation.getToPos());

    const attributesToRemove = treeStyleOperation.getAttributesToRemove();
    if (attributesToRemove.length > 0) {
      pbTreeStyleOperation.attributesToRemove = attributesToRemove;
    } else {
      const attributesMap = pbTreeStyleOperation.attributes;

      for (const [key, value] of treeStyleOperation.getAttributes()) {
        attributesMap[key] = value;
      }
    }
    pbTreeStyleOperation.executedAt = toTimeTicket(
      treeStyleOperation.getExecutedAt(),
    );
    pbOperation.body.case = 'treeStyle';
    pbOperation.body.value = pbTreeStyleOperation;
  } else if (operation instanceof ZeroTreeEditOperation) {
    const restoreSpans = operation.getRestoreSpans();
    const retombstoneSpans = operation.getRetombstoneSpans();
    const pbZeroTreeEdit = create(PbOperation_ZeroTreeEditSchema, {
      parentCreatedAt: toTimeTicket(operation.getParentCreatedAt()),
      from: toTextNodePos(operation.getFromPos()),
      to: toTextNodePos(operation.getToPos()),
      content: operation.getValue()
        ? toZeroTokens(operation.getValue()!)
        : undefined,
      executedAt: toTimeTicket(operation.getExecutedAt()),
    });
    if (restoreSpans || retombstoneSpans) {
      pbZeroTreeEdit.restoreSpans = (restoreSpans ?? []).map(toZeroRestoreSpan);
      pbZeroTreeEdit.retombstoneSpans = (retombstoneSpans ?? []).map(
        toZeroRestoreSpan,
      );
      pbZeroTreeEdit.restoreMode =
        operation.getRestoreMode() === 'retombstone'
          ? PbRestoreMode.RETOMBSTONE
          : PbRestoreMode.RESTORE;
    }
    pbOperation.body.case = 'zeroTreeEdit';
    pbOperation.body.value = pbZeroTreeEdit;
  } else if (operation instanceof ZeroTreeStyleOperation) {
    pbOperation.body.case = 'zeroTreeStyle';
    pbOperation.body.value = create(PbOperation_ZeroTreeStyleSchema, {
      parentCreatedAt: toTimeTicket(operation.getParentCreatedAt()),
      markerId: toTextNodeID(operation.getMarkerID()),
      writes: toZeroAttrWrites(operation.getWrites()),
      executedAt: toTimeTicket(operation.getExecutedAt()),
    });
    const range = operation.getRange();
    if (range) {
      pbOperation.body.value.range = create(PbZeroStyleRangeSchema, {
        last: range.last ? toTextNodeID(range.last) : undefined,
      });
    }
    const cancel = operation.getCancel();
    if (cancel) {
      pbOperation.body.value.cancel = create(PbZeroStyleCancelSchema, {
        write: toTimeTicket(cancel.write),
        on: cancel.on,
        fallback: toZeroAttrWrites(cancel.fallback),
      });
    }
  } else if (operation instanceof ArraySetOperation) {
    const arraySetOperation = operation as ArraySetOperation;
    const pbArraySetOperation = create(PbOperation_ArraySetSchema);
    pbArraySetOperation.parentCreatedAt = toTimeTicket(
      arraySetOperation.getParentCreatedAt(),
    );
    pbArraySetOperation.createdAt = toTimeTicket(
      arraySetOperation.getCreatedAt(),
    );
    pbArraySetOperation.value = toElementSimple(arraySetOperation.getValue());
    pbArraySetOperation.executedAt = toTimeTicket(
      arraySetOperation.getExecutedAt(),
    );
    pbOperation.body.case = 'arraySet';
    pbOperation.body.value = pbArraySetOperation;
  } else {
    throw new YorkieError(Code.ErrUnimplemented, 'unimplemented operation');
  }

  return pbOperation;
}

/**
 * `toOperations` converts the given model to Protobuf format.
 */
function toOperations(operations: Array<Operation>): Array<PbOperation> {
  const pbOperations = [];
  for (const operation of operations) {
    pbOperations.push(toOperation(operation));
  }
  return pbOperations;
}

/**
 * `toChange` converts the given model to Protobuf format.
 */
function toChange(change: Change<Indexable>): PbChange {
  const pbChange = create(PbChangeSchema, {
    id: toChangeID(change.getID()),
    message: change.getMessage(),
  });
  if (change.hasOperations()) {
    pbChange.operations = toOperations(change.getOperations());
  }
  if (change.hasPresenceChange()) {
    pbChange.presenceChange = toPresenceChange(change.getPresenceChange()!);
  }
  return pbChange;
}

/**
 * `toChanges` converts the given model to Protobuf format.
 */
function toChanges(changes: Array<Change<Indexable>>): Array<PbChange> {
  const pbChanges = [];
  for (const change of changes) {
    pbChanges.push(toChange(change));
  }
  return pbChanges;
}

/**
 * `toRHTNodes` converts the given model to Protobuf format.
 */
function toRHTNodes(rht: ElementRHT): Array<PbRHTNode> {
  const pbRHTNodes = [];
  for (const rhtNode of rht) {
    pbRHTNodes.push(
      create(PbRHTNodeSchema, {
        key: rhtNode.getStrKey(),
        element: toElement(rhtNode.getValue()),
      }),
    );
  }

  return pbRHTNodes;
}

/**
 * `toRGANodes` converts the given model to Protobuf format.
 * Includes both live element nodes and dead position nodes.
 */
function toRGANodes(arr: CRDTArray): Array<PbRGANode> {
  const pbRGANodes = [];
  for (const rgaNode of arr.getAllRGANodes()) {
    if (!rgaNode.getElementEntry()) {
      // Dead position node (abandoned by a move).
      pbRGANodes.push(
        create(PbRGANodeSchema, {
          positionCreatedAt: toTimeTicket(rgaNode.getPositionCreatedAt()),
          positionRemovedAt: toTimeTicket(rgaNode.getRemovedAt()),
        }),
      );
      continue;
    }

    const pbNode = create(PbRGANodeSchema, {
      element: toElement(rgaNode.getValue()),
    });
    if (rgaNode.getPositionMovedAt()) {
      pbNode.positionMovedAt = toTimeTicket(rgaNode.getPositionMovedAt());
      pbNode.positionCreatedAt = toTimeTicket(rgaNode.getPositionCreatedAt());
    }
    pbRGANodes.push(pbNode);
  }

  return pbRGANodes;
}

/**
 * `toTextNodes` converts the given model to Protobuf format.
 */
function toTextNodes(
  rgaTreeSplit: RGATreeSplit<CRDTTextValue>,
): Array<PbTextNode> {
  const pbTextNodes = [];
  // The decoders resolve `insPrevId` against the nodes they have already
  // decoded -- the Go one rejects a link it cannot find, and a JS decoder
  // that floor-matched would link the wrong node -- so a link is written
  // only when its target has already been emitted in this very iteration.
  // A split product's `insPrev` always precedes it here, so this drops
  // nothing the re-issue or a snapshot needs; what it does drop is a
  // dangling link into a node that is no longer in this split (a purged
  // tombstone), which no decoder could have resolved.
  const emitted = new Set<string>();

  for (const textNode of rgaTreeSplit) {
    const pbTextNode = create(PbTextNodeSchema);
    pbTextNode.id = toTextNodeID(textNode.getID());
    pbTextNode.value = textNode.getValue().getContent();
    pbTextNode.removedAt = toTimeTicket(textNode.getRemovedAt());
    writeRemovalLedger(pbTextNode, textNode);
    if (
      textNode.getInsPrev() &&
      emitted.has(textNode.getInsPrevID().toIDString())
    ) {
      pbTextNode.insPrevId = toTextNodeID(textNode.getInsPrevID());
    }
    emitted.add(textNode.getID().toIDString());

    const pbNodeAttrsMap = pbTextNode.attributes;
    const attrs = textNode.getValue().getAttrs();
    for (const attr of attrs) {
      const pbNodeAttr = create(PbNodeAttrSchema);
      pbNodeAttr.value = attr.getValue();
      pbNodeAttr.updatedAt = toTimeTicket(attr.getUpdatedAt());
      pbNodeAttr.isRemoved = attr.isRemoved();
      pbNodeAttrsMap[attr.getKey()] = pbNodeAttr;
    }

    pbTextNodes.push(pbTextNode);
  }

  return pbTextNodes;
}

/**
 * `writeRemovalLedger` writes the removal ledger of a node. A ledger that says
 * only "removed by removedAt" is what a node without one starts from
 * (`RGATreeSplitNode.ledger`), so it is not written.
 */
function writeRemovalLedger(
  pbNode: PbTextNode,
  node: RGATreeSplitNode<CRDTTextValue>,
): void {
  const { dels, cancels } = node.getLedger();
  const removedAt = node.getRemovedAt();
  if (
    !dels ||
    (!cancels?.length &&
      (removedAt
        ? dels.length === 1 && dels[0].equals(removedAt)
        : dels.length === 0))
  ) {
    return;
  }
  pbNode.hasLedger = true;
  pbNode.removals = dels.map((d) => toTimeTicket(d)!);
  pbNode.removalCancels = (cancels ?? []).map(([removal, at]) =>
    create(PbRemovalCancelSchema, {
      removal: toTimeTicket(removal),
      cancelledAt: toTimeTicket(at),
    }),
  );
}

/**
 * `toPurgedRemovals` writes what the ledgers of purged pieces still said.
 * Purge order depends on GC iteration, so the entries go out sorted: one
 * state, one snapshot.
 */
function toPurgedRemovals(
  rgaTreeSplit: RGATreeSplit<CRDTTextValue>,
): Array<PbPurgedRemovals> {
  const purged: Array<{
    createdAt: TimeTicket;
    start: number;
    end: number;
    dels: Array<TimeTicket>;
  }> = [];
  for (const [key, entries] of rgaTreeSplit.getPurgedLedger()) {
    const [lamport, actorID, delimiter] = key.split(':');
    const createdAt = TimeTicket.of(
      BigInt(lamport),
      Number(delimiter),
      actorID,
    );
    for (const e of entries) {
      purged.push({ createdAt, ...e });
    }
  }
  const compareDels = (a: Array<TimeTicket>, b: Array<TimeTicket>) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const c = a[i].compare(b[i]);
      if (c) {
        return c;
      }
    }
    return a.length - b.length;
  };
  purged.sort(
    (a, b) =>
      a.createdAt.compare(b.createdAt) ||
      a.start - b.start ||
      a.end - b.end ||
      compareDels(a.dels, b.dels),
  );
  return purged.map((e) =>
    create(PbPurgedRemovalsSchema, {
      createdAt: toTimeTicket(e.createdAt),
      start: e.start,
      end: e.end,
      removals: e.dels.map((d) => toTimeTicket(d)!),
    }),
  );
}

/**
 * `toTreeNodesWhenEdit` converts the given model to Protobuf format.
 */
function toTreeNodesWhenEdit(nodes: Array<CRDTTreeNode>): Array<PbTreeNodes> {
  const pbTreeNodesList: Array<PbTreeNodes> = [];
  if (!nodes || !nodes.length) {
    return pbTreeNodesList;
  }

  for (const node of nodes) {
    pbTreeNodesList.push(
      create(PbTreeNodesSchema, {
        content: toTreeNodes(node),
      }),
    );
  }

  return pbTreeNodesList;
}

/**
 * `toRHT` converts the given model to Protobuf format.
 */
function toRHT(rht: RHT): { [key: string]: PbNodeAttr } {
  const pbRHT: { [key: string]: PbNodeAttr } = {};
  for (const node of rht) {
    pbRHT[node.getKey()] = create(PbNodeAttrSchema, {
      value: node.getValue(),
      updatedAt: toTimeTicket(node.getUpdatedAt()),
      isRemoved: node.isRemoved(),
    });
  }

  return pbRHT;
}

/**
 * `toTreeNodes` converts the given model to Protobuf format.
 */
function toTreeNodes(node: CRDTTreeNode): Array<PbTreeNode> {
  if (!node) {
    return [];
  }

  const pbTreeNodes: Array<PbTreeNode> = [];
  traverseAll(node, (n, depth) => {
    const pbTreeNode = create(PbTreeNodeSchema, {
      id: toTreeNodeID(n.id),
      type: n.type,
      removedAt: toTimeTicket(n.removedAt),
      depth,
    });

    if (n.isText) {
      pbTreeNode.value = n.value;
    }
    if (n.insPrevID) {
      pbTreeNode.insPrevId = toTreeNodeID(n.insPrevID);
    }
    if (n.insNextID) {
      pbTreeNode.insNextId = toTreeNodeID(n.insNextID);
    }

    if (n.mergedFrom) {
      pbTreeNode.mergedFrom = toTreeNodeID(n.mergedFrom);
    }
    if (n.mergedAt) {
      pbTreeNode.mergedAt = toTimeTicket(n.mergedAt);
    }

    if (n.attrs) {
      pbTreeNode.attributes = toRHT(n.attrs);
    }

    pbTreeNodes.push(pbTreeNode);
  });

  return pbTreeNodes;
}

/**
 * `toObject` converts the given model to Protobuf format.
 */
function toObject(obj: CRDTObject): PbJSONElement {
  return create(PbJSONElementSchema, {
    body: {
      case: 'jsonObject',
      value: create(PbJSONElement_JSONObjectSchema, {
        nodes: toRHTNodes(obj.getRHT()),
        createdAt: toTimeTicket(obj.getCreatedAt()),
        movedAt: toTimeTicket(obj.getMovedAt()),
        removedAt: toTimeTicket(obj.getRemovedAt()),
      }),
    },
  });
}

/**
 * `toArray` converts the given model to Protobuf format.
 */
function toArray(arr: CRDTArray): PbJSONElement {
  return create(PbJSONElementSchema, {
    body: {
      case: 'jsonArray',
      value: create(PbJSONElement_JSONArraySchema, {
        nodes: toRGANodes(arr),
        createdAt: toTimeTicket(arr.getCreatedAt()),
        movedAt: toTimeTicket(arr.getMovedAt()),
        removedAt: toTimeTicket(arr.getRemovedAt()),
      }),
    },
  });
}

/**
 * `toPrimitive` converts the given model to Protobuf format.
 */
function toPrimitive(primitive: Primitive): PbJSONElement {
  return create(PbJSONElementSchema, {
    body: {
      case: 'primitive',
      value: create(PbJSONElement_PrimitiveSchema, {
        type: toValueType(primitive.getType()),
        value: primitive.toBytes(),
        createdAt: toTimeTicket(primitive.getCreatedAt()),
        movedAt: toTimeTicket(primitive.getMovedAt()),
        removedAt: toTimeTicket(primitive.getRemovedAt()),
      }),
    },
  });
}

/**
 * `toText` converts the given model to Protobuf format.
 */
function toText(text: CRDTText<Record<string, any>>): PbJSONElement {
  return create(PbJSONElementSchema, {
    body: {
      case: 'text',
      value: create(PbJSONElement_TextSchema, {
        nodes: toTextNodes(text.getRGATreeSplit()),
        createdAt: toTimeTicket(text.getCreatedAt()),
        movedAt: toTimeTicket(text.getMovedAt()),
        removedAt: toTimeTicket(text.getRemovedAt()),
        purgedRemovals: toPurgedRemovals(text.getRGATreeSplit()),
      }),
    },
  });
}

/**
 * `toCounter` converts the given model to Protobuf format.
 */
function toCounter(counter: CRDTCounter): PbJSONElement {
  return create(PbJSONElementSchema, {
    body: {
      case: 'counter',
      value: create(PbJSONElement_CounterSchema, {
        type: toCounterType(counter.getType()),
        value: counter.toBytes(),
        createdAt: toTimeTicket(counter.getCreatedAt()),
        movedAt: toTimeTicket(counter.getMovedAt()),
        removedAt: toTimeTicket(counter.getRemovedAt()),
        hllRegisters: counter.hllBytes() || new Uint8Array(),
      }),
    },
  });
}

/**
 * `toTree` converts the given model to Protobuf format.
 */
function toTree(tree: CRDTTree): PbJSONElement {
  return create(PbJSONElementSchema, {
    body: {
      case: 'tree',
      value: create(PbJSONElement_TreeSchema, {
        nodes: toTreeNodes(tree.getRoot()),
        createdAt: toTimeTicket(tree.getCreatedAt()),
        movedAt: toTimeTicket(tree.getMovedAt()),
        removedAt: toTimeTicket(tree.getRemovedAt()),
      }),
    },
  });
}

/**
 * `toZeroTokens` converts a run of Zero Tree tokens to Protobuf format.
 * Consecutive characters travel as one string.
 */
/**
 * `ZeroActors` is the actor table of a ZeroTree element: its tickets name
 * an actor by index, so a snapshot writes each actor id once. Ids are
 * sorted, so the table does not depend on traversal order.
 */
class ZeroActors {
  private index = new Map<string, number>();
  public readonly ids: Array<string>;

  constructor(ids: Array<string>) {
    this.ids = ids;
    ids.forEach((id, i) => this.index.set(id, i));
  }

  /**
   * `of` builds the actor table of the given tree from every ticket it holds.
   */
  public static of(tree: CRDTZeroTree): ZeroActors {
    const ids = new Set<string>();
    const add = (t?: TimeTicket) => t && ids.add(t.getActorID());
    for (const node of tree.getRGA()) {
      add(node.getCreatedAt());
      add(node.getRemovedAt());
      const { dels, cancels } = node.getLedger();
      dels?.forEach(add);
      cancels?.forEach(([d, c]) => (add(d), add(c)));
      for (const token of node.getValue().tokens) {
        if (typeof token !== 'string') {
          token.attrs.forEach((attr) => {
            add(attr.updatedAt);
            attr.history?.forEach((e) => add(e.at));
          });
        }
      }
    }
    for (const cancel of tree.getStyleCancels()) {
      add(cancel.write);
      add(cancel.at);
    }
    return new ZeroActors([...ids].sort());
  }

  /**
   * `ticket` encodes a ticket with its actor as an index into this table.
   */
  public ticket(t?: TimeTicket): PbZeroTicket | undefined {
    if (!t) {
      return;
    }
    return create(PbZeroTicketSchema, {
      lamport: t.getLamport(),
      delimiter: t.getDelimiter(),
      actor: this.index.get(t.getActorID())!,
    });
  }

  /**
   * `nodeID` encodes a node id with its actor as an index into this table.
   */
  public nodeID(id: RGATreeSplitNodeID): PbZeroNodeID {
    return create(PbZeroNodeIDSchema, {
      createdAt: this.ticket(id.getCreatedAt()),
      offset: id.getOffset(),
    });
  }

  /**
   * `fromTicket` decodes a ticket whose actor is an index into this table.
   */
  public fromTicket(t?: PbZeroTicket): TimeTicket | undefined {
    if (!t) {
      return;
    }
    const actor = this.ids[t.actor];
    if (actor === undefined) {
      throw new YorkieError(Code.ErrInvalidArgument, 'unknown zero tree actor');
    }
    return TimeTicket.of(BigInt(t.lamport), t.delimiter, actor);
  }

  /**
   * `fromNodeID` decodes a node id whose actor is an index into this table.
   */
  public fromNodeID(id: PbZeroNodeID): RGATreeSplitNodeID {
    return RGATreeSplitNodeID.of(this.fromTicket(id.createdAt)!, id.offset);
  }
}

/**
 * `toZeroTokens` converts the given tokens to Protobuf format.
 */
function toZeroTokens(value: ZeroTokens, actors?: ZeroActors): PbZeroTokens {
  const pbTokens = create(PbZeroTokensSchema, { scope: value.scope ?? '' });
  let chars = '';
  let ghosts = 0;
  const flush = () => {
    if (chars) {
      pbTokens.tokens.push(
        create(PbZeroTokenSchema, { body: { case: 'chars', value: chars } }),
      );
      chars = '';
    }
    if (ghosts) {
      pbTokens.tokens.push(
        create(PbZeroTokenSchema, { body: { case: 'ghost', value: ghosts } }),
      );
      ghosts = 0;
    }
  };
  for (const token of value.tokens) {
    if (token === ZeroGhost) {
      if (chars) {
        flush();
      }
      ghosts++;
      continue;
    }
    if (ghosts) {
      flush();
    }
    if (typeof token === 'string') {
      // Decoding splits by code point, so a token must be exactly one.
      if (Array.from(token).length !== 1) {
        throw new YorkieError(
          Code.ErrInvalidArgument,
          `zero tree token is not one code point: ${JSON.stringify(token)}`,
        );
      }
      chars += token;
      continue;
    }
    flush();
    const pbMarker = create(PbZeroMarkerSchema, {
      type: token.type,
      depth: token.depth,
      boundary: token.boundary ?? '',
    });
    for (const [key, attr] of token.attrs) {
      pbMarker.attrs.push(
        create(PbZeroAttrSchema, {
          key,
          value: attr.value ?? '',
          updatedAt: actors ? undefined : toTimeTicket(attr.updatedAt),
          updatedAtRef: actors?.ticket(attr.updatedAt),
          isRemoved: attr.value === null,
          history: (attr.history ?? []).map((e) =>
            create(PbZeroAttrEntrySchema, {
              value: e.value ?? '',
              isRemoved: e.value === null,
              updatedAt: actors ? undefined : toTimeTicket(e.at),
              updatedAtRef: actors?.ticket(e.at),
              byRange: !!e.byRange,
            }),
          ),
        }),
      );
    }
    pbTokens.tokens.push(
      create(PbZeroTokenSchema, { body: { case: 'marker', value: pbMarker } }),
    );
  }
  flush();
  return pbTokens;
}

/**
 * `toZeroAttrWrites` converts attribute writes to Protobuf format.
 */
function toZeroAttrWrites(
  writes: Array<[string, ZeroAttrValue]>,
): Array<PbZeroAttrWrite> {
  return writes.map(([key, value]) =>
    create(PbZeroAttrWriteSchema, {
      key,
      value: value ?? '',
      isRemoved: value === null,
    }),
  );
}

/**
 * `fromZeroAttrWrites` converts Protobuf attribute writes to model format.
 */
function fromZeroAttrWrites(
  writes: Array<PbZeroAttrWrite>,
): Array<[string, ZeroAttrValue]> {
  return writes.map(
    (w) => [w.key, w.isRemoved ? null : w.value] as [string, ZeroAttrValue],
  );
}

/**
 * `fromZeroCancelWrite` converts the cancel of a style operation.
 */
function fromZeroCancelWrite(pb: PbZeroStyleCancel): ZeroCancelWrite {
  return {
    write: fromTimeTicket(pb.write)!,
    on: pb.on,
    fallback: fromZeroAttrWrites(pb.fallback),
  };
}

/**
 * `toZeroRestoreSpan` converts a Zero Tree restore span to Protobuf format.
 */
function toZeroRestoreSpan(span: RestoreSpan<ZeroTokens>): PbZeroRestoreSpan {
  return create(PbZeroRestoreSpanSchema, {
    createdAt: toTimeTicket(span.createdAt),
    start: span.start,
    end: span.end,
    value: toZeroTokens(span.value),
    removedBy: toTimeTicket(span.removedBy),
  });
}

/**
 * `toZeroSchema` / `fromZeroSchema` convert the schema a Zero Tree keeps.
 * Lists keep their order: it decides which child fills a gap.
 */
function toZeroSchema(schema: ZeroSchema): PbZeroSchema {
  const children = (m: Record<string, Iterable<string>>) =>
    Object.entries(m).map(([type, list]) =>
      create(PbZeroSchemaChildrenSchema, { type, children: [...list] }),
    );
  return create(PbZeroSchemaSchema, {
    textType: schema.textType,
    textTypes: [...(schema.textTypes ?? [])],
    scoped: [...(schema.scoped ?? [])],
    single: children(schema.single ?? {}),
    grid: schema.grid ? create(PbZeroSchemaGridSchema, schema.grid) : undefined,
    rootType: schema.rootType,
    atomic: [...schema.atomic],
    defaultChild: children(
      Object.fromEntries(
        Object.entries(schema.defaultChild).map(([k, v]) => [k, [v]]),
      ),
    ),
    allowed: children(schema.allowed),
  });
}

/**
 * `fromZeroSchema` converts the given Protobuf schema to model format.
 */
function fromZeroSchema(pb: PbZeroSchema): ZeroSchema {
  const sets = (list: Array<{ type: string; children: Array<string> }>) =>
    Object.fromEntries(list.map((e) => [e.type, new Set(e.children)]));
  return {
    textType: pb.textType,
    textTypes: new Set(pb.textTypes),
    scoped: new Set(pb.scoped),
    single: pb.single.length ? sets(pb.single) : undefined,
    grid: pb.grid
      ? { table: pb.grid.table, row: pb.grid.row, cell: pb.grid.cell }
      : undefined,
    rootType: pb.rootType,
    atomic: new Set(pb.atomic),
    defaultChild: Object.fromEntries(
      pb.defaultChild.map((e) => [e.type, e.children[0]]),
    ),
    allowed: sets(pb.allowed),
  };
}

/**
 * `toZeroTree` converts the given Zero Tree to Protobuf format: its nodes
 * with their removal ledgers, and what the ledgers of purged pieces said.
 */
function toZeroTree(tree: CRDTZeroTree): PbJSONElement {
  const rga = tree.getRGA();
  const pbTree = create(PbJSONElement_ZeroTreeSchema, {
    createdAt: toTimeTicket(tree.getCreatedAt()),
    movedAt: toTimeTicket(tree.getMovedAt()),
    removedAt: toTimeTicket(tree.getRemovedAt()),
    schema:
      tree.getSchema() === DefaultZeroSchema ||
      tree.getSchema() === BuiltinZeroSchema
        ? undefined
        : toZeroSchema(tree.getSchema()),
  });
  const actors = ZeroActors.of(tree);
  pbTree.actors = actors.ids.map((id) => toUint8Array(id));
  const emitted = new Set<string>();
  for (const node of rga) {
    let { dels, cancels } = node.getLedger();
    // A ledger that says only "removed by removedAt" is what a node without
    // one starts from (`RGATreeSplitNode.ledger`), so it is not written.
    const removedAt = node.getRemovedAt();
    if (
      dels &&
      !cancels?.length &&
      (removedAt
        ? dels.length === 1 && dels[0].equals(removedAt)
        : dels.length === 0)
    ) {
      dels = undefined;
      cancels = undefined;
    }
    const pbNode = create(PbZeroTreeNodeSchema, {
      id: actors.nodeID(node.getID()),
      value: toZeroTokens(node.getValue(), actors),
      removedAt: actors.ticket(node.getRemovedAt()),
      hasLedger: !!dels,
      dels: (dels ?? []).map((d) => actors.ticket(d)!),
      cancels: (cancels ?? []).map(([deletion, at]) =>
        create(PbZeroCancelSchema, {
          deletion: actors.ticket(deletion),
          cancelledAt: actors.ticket(at),
        }),
      ),
    });
    // Same rule as `toTextNodes`: only a link to an emitted node.
    if (node.getInsPrev() && emitted.has(node.getInsPrevID().toIDString())) {
      pbNode.insPrevId = actors.nodeID(node.getInsPrevID());
    }
    emitted.add(node.getID().toIDString());
    pbTree.nodes.push(pbNode);
  }
  // Purge order depends on GC iteration, so the entries go out sorted:
  // a snapshot of one state is the same bytes on every replica and server.
  const purged: Array<{
    createdAt: TimeTicket;
    start: number;
    end: number;
    dels: Array<TimeTicket>;
  }> = [];
  for (const [key, entries] of rga.getPurgedLedger()) {
    const [lamport, actorID, delimiter] = key.split(':');
    const createdAt = TimeTicket.of(
      BigInt(lamport),
      Number(delimiter),
      actorID,
    );
    for (const e of entries) {
      purged.push({ createdAt, ...e });
    }
  }
  const compareDels = (a: Array<TimeTicket>, b: Array<TimeTicket>) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const c = a[i].compare(b[i]);
      if (c) {
        return c;
      }
    }
    return a.length - b.length;
  };
  purged.sort(
    (a, b) =>
      a.createdAt.compare(b.createdAt) ||
      a.start - b.start ||
      a.end - b.end ||
      compareDels(a.dels, b.dels),
  );
  for (const e of purged) {
    pbTree.purgedLedger.push(
      create(PbZeroPurgedLedgerSchema, {
        createdAt: toTimeTicket(e.createdAt),
        start: e.start,
        end: e.end,
        dels: e.dels.map((d) => toTimeTicket(d)!),
      }),
    );
  }
  pbTree.styleCancels = tree.getStyleCancels().map((c) =>
    create(PbZeroStyleCancelSchema, {
      writeRef: actors.ticket(c.write),
      on: c.on,
      fallback: toZeroAttrWrites(c.fallback),
      atRef: actors.ticket(c.at),
    }),
  );
  return create(PbJSONElementSchema, {
    body: { case: 'zeroTree', value: pbTree },
  });
}

/**
 * `toElement` converts the given model to Protobuf format.
 */
export function toElement(element: CRDTElement): PbJSONElement {
  if (element instanceof CRDTObject) {
    return toObject(element);
  }
  if (element instanceof CRDTArray) {
    return toArray(element);
  }
  if (element instanceof Primitive) {
    return toPrimitive(element);
  }
  if (element instanceof CRDTText) {
    return toText(element);
  }
  if (element instanceof CRDTCounter) {
    return toCounter(element);
  }
  if (element instanceof CRDTTree) {
    return toTree(element);
  }
  if (element instanceof CRDTZeroTree) {
    return toZeroTree(element);
  }

  throw new YorkieError(Code.ErrUnimplemented, `unimplemented element`);
}

/**
 * `toChangePack` converts the given model to Protobuf format.
 */
function toChangePack(pack: ChangePack<Indexable>): PbChangePack {
  return create(PbChangePackSchema, {
    documentKey: pack.getDocumentKey(),
    checkpoint: toCheckpoint(pack.getCheckpoint()),
    isRemoved: pack.getIsRemoved(),
    changes: toChanges(pack.getChanges()),
    snapshot: pack.getSnapshot(),
    versionVector: toVersionVector(pack.getVersionVector()),
    epoch: pack.getEpoch(),
  });
}

/**
 * `toRevisionSummary` converts a protobuf RevisionSummary to a RevisionSummary.
 */
export function toRevisionSummary(
  pbRevision: PbRevisionSummary,
): RevisionSummary {
  return {
    id: pbRevision.id,
    label: pbRevision.label,
    description: pbRevision.description,
    snapshot: pbRevision.snapshot,
    createdAt: pbRevision.createdAt
      ? timestampDate(pbRevision.createdAt)
      : new Date(),
  };
}

/**
 * `errorMetadataOf` returns the error metadata of the given connect error.
 */
export function errorMetadataOf(error: ConnectError): Record<string, string> {
  if (!(error instanceof ConnectError)) {
    return {};
  }

  // NOTE(chacha912): Currently, we only use the first detail to represent the
  // error metadata.
  const infos = error.findDetails(ErrorInfoSchema);
  for (const info of infos) {
    return info.metadata;
  }

  return {};
}

/**
 * `errorCodeOf` returns the error code of the given connect error.
 */
export function errorCodeOf(error: ConnectError): string {
  return errorMetadataOf(error).code ?? '';
}

/**
 * `isErrorCode` checks if the error is a ConnectError with the given error code.
 */
export function isErrorCode(
  error: unknown,
  code: string,
): error is ConnectError {
  return error instanceof ConnectError && errorCodeOf(error) === code;
}

/**
 * `fromChangeID` converts the given Protobuf format to model format.
 */
function fromChangeID(pbChangeID: PbChangeID): ChangeID {
  // TODO(hackerwins): Remove BigInt conversion. Some of the bigint values are
  // passed as string in the protobuf. We should fix this in the future.
  return ChangeID.of(
    pbChangeID.clientSeq,
    BigInt(pbChangeID.lamport),
    toHexString(pbChangeID.actorId),
    fromVersionVector(pbChangeID.versionVector)!,
    BigInt(pbChangeID.serverSeq),
  );
}

/**
 * `fromVersionVector` converts the given Protobuf format to model format.
 */
function fromVersionVector(
  pbVersionVector?: PbVersionVector,
): VersionVector | undefined {
  if (!pbVersionVector) {
    return;
  }

  const vector = new VersionVector();
  Object.entries(pbVersionVector.vector).forEach(([key, value]) => {
    const hexKey = bytesToHex(base64ToUint8Array(key));
    vector.set(hexKey, BigInt(value.toString()));
  });
  return vector;
}

/**
 * `fromTimeTicket` converts the given Protobuf format to model format.
 */
function fromTimeTicket(pbTimeTicket?: PbTimeTicket): TimeTicket | undefined {
  if (!pbTimeTicket) {
    return;
  }

  return TimeTicket.of(
    BigInt(pbTimeTicket.lamport),
    pbTimeTicket.delimiter,
    toHexString(pbTimeTicket.actorId),
  );
}

/**
 * `fromPresence` converts the given Protobuf format to model format.
 */
function fromPresence<P extends Indexable>(pbPresence: PbPresence): P {
  const data: Record<string, string> = {};
  Object.entries(pbPresence.data).forEach(([key, value]) => {
    data[key] = JSON.parse(value);
  });

  return data as P;
}

/**
 * `fromPresenceChange` converts the given Protobuf format to model format.
 */
function fromPresenceChange<P extends Indexable>(
  pbPresenceChange: PbPresenceChange,
): PresenceChange<P> {
  const type = pbPresenceChange.type;
  if (type === PbPresenceChange_ChangeType.PUT) {
    const presence = fromPresence<P>(pbPresenceChange.presence!);
    return {
      type: PresenceChangeType.Put,
      presence,
    };
  }
  if (type === PbPresenceChange_ChangeType.PATCH) {
    // The server folds a patch into the base it holds before storing one, so
    // a pulled pack does not normally carry a patch. It is decoded anyway --
    // an echo of a pushed change, or a peer ahead of this SDK, must not fail
    // the whole pack. There is no `full` on the wire: `Change.execute` merges
    // the carried keys onto the presence already held for that actor.
    const presence = fromPresence<P>(pbPresenceChange.presence!);
    return {
      type: PresenceChangeType.Patch,
      presence,
    };
  }
  if (type === PbPresenceChange_ChangeType.CLEAR) {
    return {
      type: PresenceChangeType.Clear,
    };
  }

  throw new YorkieError(Code.ErrInvalidType, `unsupported type: ${type}`);
}

/**
 * `fromPresences` converts the given Protobuf format to model format.
 */
function fromPresences<P extends Indexable>(pbPresences: {
  [key: string]: PbPresence;
}): Map<ActorID, P> {
  const presences = new Map<ActorID, P>();
  Object.entries(pbPresences).forEach(([actorID, pbPresence]) => {
    presences.set(actorID, fromPresence(pbPresence));
  });
  return presences;
}

/**
 * `fromValueType` converts the given Protobuf format to model format.
 */
function fromValueType(pbValueType: PbValueType): PrimitiveType {
  switch (pbValueType) {
    case PbValueType.NULL:
      return PrimitiveType.Null;
    case PbValueType.BOOLEAN:
      return PrimitiveType.Boolean;
    case PbValueType.INTEGER:
      return PrimitiveType.Integer;
    case PbValueType.LONG:
      return PrimitiveType.Long;
    case PbValueType.DOUBLE:
      return PrimitiveType.Double;
    case PbValueType.STRING:
      return PrimitiveType.String;
    case PbValueType.BYTES:
      return PrimitiveType.Bytes;
    case PbValueType.DATE:
      return PrimitiveType.Date;
  }
  throw new YorkieError(
    Code.ErrUnimplemented,
    `unimplemented value type: ${pbValueType}`,
  );
}

/**
 * `fromCounterType` converts the given Protobuf format to model format.
 */
function fromCounterType(pbValueType: PbValueType): CounterType {
  switch (pbValueType) {
    case PbValueType.INTEGER_CNT:
      return CounterType.Int;
    case PbValueType.LONG_CNT:
      return CounterType.Long;
    case PbValueType.INTEGER_DEDUP_CNT:
      return CounterType.IntDedup;
  }
  throw new YorkieError(
    Code.ErrUnimplemented,
    `unimplemented value type: ${pbValueType}`,
  );
}

/**
 * `fromElementSimple` converts the given Protobuf format to model format.
 */
function fromElementSimple(pbElementSimple: PbJSONElementSimple): CRDTElement {
  switch (pbElementSimple.type) {
    case PbValueType.JSON_OBJECT:
      if (!pbElementSimple.value) {
        return CRDTObject.create(fromTimeTicket(pbElementSimple.createdAt)!);
      }
      return dropSplitLinksInElement(bytesToObject(pbElementSimple.value));
    case PbValueType.JSON_ARRAY:
      if (!pbElementSimple.value) {
        return CRDTArray.create(fromTimeTicket(pbElementSimple.createdAt)!);
      }
      return dropSplitLinksInElement(bytesToArray(pbElementSimple.value));
    case PbValueType.TEXT:
      return CRDTText.create(
        RGATreeSplit.create(),
        fromTimeTicket(pbElementSimple.createdAt)!,
      );
    case PbValueType.TREE:
      return dropSplitLinksInElement(bytesToTree(pbElementSimple.value)!);
    case PbValueType.ZERO_TREE:
      return fromZeroTree(
        fromBinary(PbJSONElementSchema, pbElementSimple.value).body
          .value as PbJSONElement_ZeroTree,
      );
    case PbValueType.NULL:
    case PbValueType.BOOLEAN:
    case PbValueType.INTEGER:
    case PbValueType.LONG:
    case PbValueType.DOUBLE:
    case PbValueType.STRING:
    case PbValueType.BYTES:
    case PbValueType.DATE:
      return Primitive.of(
        Primitive.valueFromBytes(
          fromValueType(pbElementSimple.type),
          pbElementSimple.value,
        ),
        fromTimeTicket(pbElementSimple.createdAt)!,
      );
    case PbValueType.INTEGER_CNT:
    case PbValueType.LONG_CNT:
    case PbValueType.INTEGER_DEDUP_CNT:
      return CRDTCounter.create(
        fromCounterType(pbElementSimple.type),
        CRDTCounter.valueFromBytes(
          fromCounterType(pbElementSimple.type),
          pbElementSimple.value,
        ),
        fromTimeTicket(pbElementSimple.createdAt)!,
      );
  }
}

/**
 * `fromTextNodePos` converts the given Protobuf format to model format.
 */
function fromTextNodePos(pbTextNodePos: PbTextNodePos): RGATreeSplitPos {
  return RGATreeSplitPos.of(
    RGATreeSplitNodeID.of(
      fromTimeTicket(pbTextNodePos.createdAt)!,
      pbTextNodePos.offset,
    ),
    pbTextNodePos.relativeOffset,
  );
}

/**
 * `fromTextNodeID` converts the given Protobuf format to model format.
 */
function fromTextNodeID(pbTextNodeID: PbTextNodeID): RGATreeSplitNodeID {
  return RGATreeSplitNodeID.of(
    fromTimeTicket(pbTextNodeID.createdAt)!,
    pbTextNodeID.offset,
  );
}

/**
 * `fromTextNode` converts the given Protobuf format to model format.
 */
function fromTextNode(pbTextNode: PbTextNode): RGATreeSplitNode<CRDTTextValue> {
  const textValue = CRDTTextValue.create(pbTextNode.value);
  Object.entries(pbTextNode.attributes).forEach(([key, value]) => {
    textValue
      .getAttrs()
      .setInternal(
        key,
        value.value,
        fromTimeTicket(value.updatedAt)!,
        value.isRemoved,
      );
  });

  const textNode = RGATreeSplitNode.create(
    fromTextNodeID(pbTextNode.id!),
    textValue,
  );
  textNode.setRemovedAt(fromTimeTicket(pbTextNode.removedAt));
  if (pbTextNode.hasLedger) {
    textNode.setLedger(
      pbTextNode.removals.map((d) => fromTimeTicket(d)!),
      pbTextNode.removalCancels.map(
        (c) =>
          [fromTimeTicket(c.removal)!, fromTimeTicket(c.cancelledAt)!] as [
            TimeTicket,
            TimeTicket,
          ],
      ),
    );
  }
  return textNode;
}

/**
 * `fromTreePos` converts the given Protobuf format to model format.
 */
function fromTreePos(pbTreePos: PbTreePos): CRDTTreePos {
  return CRDTTreePos.of(
    fromTreeNodeID(pbTreePos.parentId!),
    fromTreeNodeID(pbTreePos.leftSiblingId!),
  );
}

/**
 * `fromTreeNodeID` converts the given Protobuf format to model format.
 */
function fromTreeNodeID(pbTreeNodeID: PbTreeNodeID): CRDTTreeNodeID {
  return CRDTTreeNodeID.of(
    fromTimeTicket(pbTreeNodeID.createdAt)!,
    pbTreeNodeID.offset,
  );
}

/**
 * `fromTreeNodesWhenEdit` converts the given Protobuf format to model format.
 */
function fromTreeNodesWhenEdit(
  pbTreeNodes: Array<PbTreeNodes>,
): Array<CRDTTreeNode> | undefined {
  if (!pbTreeNodes.length) {
    return;
  }

  const treeNodes: Array<CRDTTreeNode> = [];
  for (const node of pbTreeNodes) {
    const treeNode = fromTreeNodes(node.content);
    // An entry whose content is empty decodes to no node at all, and neither
    // keeping nor dropping it is safe. Keeping it puts a hole in the contents
    // array that every later reader dereferences — `edit` down to `toXML`.
    // Dropping it changes what the operation means: `CRDTTree.edit` reads an
    // absent content list as "delete the range", so a payload the sender
    // wrote as an insert would apply here as a deletion, and the split-ticket
    // delimiters this replica reconstructs would no longer line up with the
    // sender's. Reject the pack at the boundary instead, the way every other
    // malformed field in this decoder does.
    if (!treeNode) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        'tree edit content has an entry with no node',
      );
    }

    // Operation content is fully client-controlled and is always freshly
    // created by the editing client, so it can never be a split product,
    // carry a merge lineage, or arrive already tombstoned -- `edit` stamps
    // the lineage on the content it inserts from the merge parent it
    // resolves locally, and tombstones it itself when the parent it lands in
    // is removed. Drop the engine-only links and the tombstones the wire
    // format carries anyway: the tree follows the links as trusted
    // structural pointers once `edit` registers these nodes in nodeMapByID,
    // and a node born tombstoned under a live parent is counted as live
    // content that no GC pair will ever collect. The ATTRIBUTE tombstones
    // `fromRHT` decodes verbatim are left alone -- the undo copy-reinsert
    // path produces genuine ones, and stripping them here would diverge from
    // every other producer and decoder of the same bytes. `CRDTTree.edit`
    // books them into gc instead, so a crafted one is counted and
    // collectable; see `clearTombstones`.
    treeNode.dropEngineOnlyLinks();
    treeNode.clearTombstones();
    treeNodes.push(treeNode);
  }

  return treeNodes;
}

/**
 * `fromTreeNodes` converts the given Protobuf format to model format.
 */
function fromTreeNodes(
  pbTreeNodes: Array<PbTreeNode>,
): CRDTTreeNode | undefined {
  if (pbTreeNodes.length === 0) {
    return;
  }

  const nodes: Array<CRDTTreeNode> = [];
  for (const pbTreeNode of pbTreeNodes) {
    nodes.push(fromTreeNode(pbTreeNode));
  }

  const root = nodes[nodes.length - 1];
  const depthTable = new Map<number, CRDTTreeNode>();
  depthTable.set(pbTreeNodes[nodes.length - 1].depth, nodes[nodes.length - 1]);
  for (let i = nodes.length - 2; i >= 0; i--) {
    const parent = depthTable.get(pbTreeNodes[i].depth - 1);
    // The depths come off the wire. A peer can send a node whose parent depth
    // was never written, or name a text node as a parent; dereferencing the
    // miss threw a bare TypeError from inside the build. Reject the payload
    // at the boundary instead, with the error every other malformed field
    // here raises, so the caller sees a decode failure rather than a crash
    // part way through assembling a tree.
    if (!parent || parent.isText) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `invalid tree node depth: ${pbTreeNodes[i].depth}`,
      );
    }
    parent.prepend(nodes[i]);
    depthTable.set(pbTreeNodes[i].depth, nodes[i]);
  }

  root.updateDescendantsSize();
  root.updateDescendantsSize(true);

  // build CRDTTree from the root to construct the links between nodes.
  return CRDTTree.create(root, InitialTimeTicket).getRoot();
}

/**
 * `fromRHT` converts the given Protobuf format to model format.
 */
function fromRHT(pbRHT: { [key: string]: PbNodeAttr }): RHT {
  const rht = RHT.create();
  for (const [key, pbRHTNode] of Object.entries(pbRHT)) {
    rht.setInternal(
      key,
      pbRHTNode.value,
      fromTimeTicket(pbRHTNode.updatedAt)!,
      pbRHTNode.isRemoved,
    );
  }

  return rht;
}

/**
 * `fromTreeNode` converts the given Protobuf format to model format.
 */
function fromTreeNode(pbTreeNode: PbTreeNode): CRDTTreeNode {
  const id = fromTreeNodeID(pbTreeNode.id!);
  const node = CRDTTreeNode.create(id, pbTreeNode.type);
  const pbAttrs = Object.entries(pbTreeNode.attributes);
  if (node.isText) {
    node.value = pbTreeNode.value;
  } else if (pbAttrs.length) {
    node.attrs = fromRHT(pbTreeNode.attributes);
  }

  if (pbTreeNode.insPrevId) {
    node.insPrevID = fromTreeNodeID(pbTreeNode.insPrevId);
  }

  if (pbTreeNode.insNextId) {
    node.insNextID = fromTreeNodeID(pbTreeNode.insNextId);
  }

  if (pbTreeNode.mergedFrom) {
    node.mergedFrom = fromTreeNodeID(pbTreeNode.mergedFrom);
  }

  if (pbTreeNode.mergedAt) {
    node.mergedAt = fromTimeTicket(pbTreeNode.mergedAt);
  }

  node.removedAt = fromTimeTicket(pbTreeNode.removedAt);

  return node;
}

/**
 * `fromOperation` converts the given Protobuf format to model format.
 */
export function fromOperation(pbOperation: PbOperation): Operation | undefined {
  if (pbOperation.body.case === 'set') {
    const pbSetOperation = pbOperation.body.value;
    return SetOperation.create(
      pbSetOperation!.key,
      fromElementSimple(pbSetOperation!.value!),
      fromTimeTicket(pbSetOperation!.parentCreatedAt)!,
      fromTimeTicket(pbSetOperation!.executedAt)!,
    );
  } else if (pbOperation.body.case === 'add') {
    const pbAddOperation = pbOperation.body.value;
    return AddOperation.create(
      fromTimeTicket(pbAddOperation!.parentCreatedAt)!,
      fromTimeTicket(pbAddOperation!.prevCreatedAt)!,
      fromElementSimple(pbAddOperation!.value!),
      fromTimeTicket(pbAddOperation!.executedAt)!,
    );
  } else if (pbOperation.body.case === 'move') {
    const pbMoveOperation = pbOperation.body.value;
    return MoveOperation.create(
      fromTimeTicket(pbMoveOperation!.parentCreatedAt)!,
      fromTimeTicket(pbMoveOperation!.prevCreatedAt)!,
      fromTimeTicket(pbMoveOperation!.createdAt)!,
      fromTimeTicket(pbMoveOperation!.executedAt)!,
    );
  } else if (pbOperation.body.case === 'remove') {
    const pbRemoveOperation = pbOperation.body.value;
    return RemoveOperation.create(
      fromTimeTicket(pbRemoveOperation!.parentCreatedAt)!,
      fromTimeTicket(pbRemoveOperation!.createdAt)!,
      fromTimeTicket(pbRemoveOperation!.executedAt)!,
    );
  } else if (pbOperation.body.case === 'edit') {
    const pbEditOperation = pbOperation.body.value;
    const attributes = new Map();
    Object.entries(pbEditOperation!.attributes).forEach(([key, value]) => {
      attributes.set(key, value);
    });
    const executedAt = fromTimeTicket(pbEditOperation!.executedAt)!;

    const fromPbSpan = (pbSpan: PbRestoreSpan): RestoreSpan<CRDTTextValue> => {
      const value = CRDTTextValue.create(pbSpan.content);
      for (const [key, attr] of Object.entries(pbSpan.attributes)) {
        value.setAttr(key, attr, executedAt);
      }
      return {
        createdAt: fromTimeTicket(pbSpan.createdAt)!,
        start: pbSpan.start,
        end: pbSpan.end,
        value,
        removedBy: fromTimeTicket(pbSpan.removedBy),
      };
    };
    let restoreSpans: Array<RestoreSpan<CRDTTextValue>> | undefined;
    let retombstoneSpans: Array<RestoreSpan<CRDTTextValue>> | undefined;
    let restoreMode: 'restore' | 'retombstone' | undefined;
    if (
      pbEditOperation!.restoreSpans.length ||
      pbEditOperation!.retombstoneSpans.length
    ) {
      restoreSpans = pbEditOperation!.restoreSpans.map(fromPbSpan);
      retombstoneSpans = pbEditOperation!.retombstoneSpans.map(fromPbSpan);
      restoreMode =
        pbEditOperation!.restoreMode === PbRestoreMode.RETOMBSTONE
          ? 'retombstone'
          : 'restore';
    }

    return EditOperation.create(
      fromTimeTicket(pbEditOperation!.parentCreatedAt)!,
      fromTextNodePos(pbEditOperation!.from!),
      fromTextNodePos(pbEditOperation!.to!),
      pbEditOperation!.content,
      attributes,
      executedAt,
      restoreMode ? true : undefined,
      restoreSpans,
      restoreMode,
      retombstoneSpans,
    );
  } else if (pbOperation.body.case === 'style') {
    const pbStyleOperation = pbOperation.body.value;
    const attributes = new Map<string, string>();
    Object.entries(pbStyleOperation!.attributes).forEach(([key, value]) => {
      attributes.set(key, value);
    });
    const attributesToRemove = pbStyleOperation!.attributesToRemove ?? [];

    return new StyleOperation(
      fromTimeTicket(pbStyleOperation!.parentCreatedAt)!,
      fromTextNodePos(pbStyleOperation!.from!),
      fromTextNodePos(pbStyleOperation!.to!),
      attributes,
      attributesToRemove,
      fromTimeTicket(pbStyleOperation!.executedAt)!,
    );
  } else if (pbOperation.body.case === 'increase') {
    const pbIncreaseOperation = pbOperation.body.value;
    return IncreaseOperation.create(
      fromTimeTicket(pbIncreaseOperation!.parentCreatedAt)!,
      fromElementSimple(pbIncreaseOperation!.value!),
      fromTimeTicket(pbIncreaseOperation!.executedAt)!,
      pbIncreaseOperation!.actor || undefined,
    );
  } else if (pbOperation.body.case === 'treeEdit') {
    const pbTreeEditOperation = pbOperation.body.value;
    let treeRestoreSpans: Array<TreeRestoreSpan> | undefined;
    let treeRetombstoneSpans: Array<TreeRestoreSpan> | undefined;
    let treeRestoreMode: 'restore' | 'retombstone' | undefined;
    if (
      pbTreeEditOperation!.restoreSpans.length ||
      pbTreeEditOperation!.retombstoneSpans.length
    ) {
      treeRestoreSpans = pbTreeEditOperation!.restoreSpans.map(
        fromPbTreeRestoreSpan,
      );
      treeRetombstoneSpans = pbTreeEditOperation!.retombstoneSpans.map(
        fromPbTreeRestoreSpan,
      );
      treeRestoreMode =
        pbTreeEditOperation!.restoreMode === PbRestoreMode.RETOMBSTONE
          ? 'retombstone'
          : 'restore';
    }
    const treeEditExecutedAt = fromTimeTicket(pbTreeEditOperation!.executedAt)!;
    const treeEditContents = fromTreeNodesWhenEdit(
      pbTreeEditOperation!.contents,
    );
    const treeEdit = TreeEditOperation.create(
      fromTimeTicket(pbTreeEditOperation!.parentCreatedAt)!,
      fromTreePos(pbTreeEditOperation!.from!),
      fromTreePos(pbTreeEditOperation!.to!),
      treeEditContents,
      pbTreeEditOperation!.splitLevel,
      treeEditExecutedAt,
      treeRestoreMode ? true : undefined,
      undefined,
      undefined,
      treeRestoreSpans,
      treeRestoreMode,
      treeRetombstoneSpans,
    );
    // Split tickets are read back as sent, the way yorkie's converter reads
    // them: the server applies them verbatim, so a replica that rewrote or
    // refused a ticket here would mint different ids than the snapshot holds.
    //
    // This is not a trust boundary, and no check here could make it one. The
    // only reference a decoder has for these tickets is `executedAt`, off the
    // same wire, so a shape check would read one of the sender's fields
    // against another; and the content node ids and restore-span ids beside
    // them name nodes just as freely. What bounds a hostile id is at the point
    // of use -- `dropDuplicateContents` and `registerNode` in `CRDTTree`.
    treeEdit.setSplitTickets(
      pbTreeEditOperation!.splitTickets.map(
        (ticket) => fromTimeTicket(ticket)!,
      ),
    );
    return treeEdit;
  } else if (pbOperation.body.case === 'treeStyle') {
    const pbTreeStyleOperation = pbOperation.body.value;
    const attributes = new Map();
    const attributesToRemove = pbTreeStyleOperation.attributesToRemove;

    if (attributesToRemove?.length > 0) {
      return TreeStyleOperation.createTreeRemoveStyleOperation(
        fromTimeTicket(pbTreeStyleOperation!.parentCreatedAt)!,
        fromTreePos(pbTreeStyleOperation!.from!),
        fromTreePos(pbTreeStyleOperation!.to!),
        attributesToRemove,
        fromTimeTicket(pbTreeStyleOperation!.executedAt)!,
      );
    } else {
      Object.entries(pbTreeStyleOperation!.attributes).forEach(
        ([key, value]) => {
          attributes.set(key, value);
        },
      );
      return TreeStyleOperation.create(
        fromTimeTicket(pbTreeStyleOperation!.parentCreatedAt)!,
        fromTreePos(pbTreeStyleOperation!.from!),
        fromTreePos(pbTreeStyleOperation!.to!),
        attributes,
        fromTimeTicket(pbTreeStyleOperation!.executedAt)!,
      );
    }
  } else if (pbOperation.body.case === 'zeroTreeEdit') {
    const pbZeroTreeEdit = pbOperation.body.value;
    const hasSpans =
      pbZeroTreeEdit.restoreSpans.length ||
      pbZeroTreeEdit.retombstoneSpans.length ||
      pbZeroTreeEdit.restoreMode !== PbRestoreMode.UNSPECIFIED;
    return new ZeroTreeEditOperation(
      fromTimeTicket(pbZeroTreeEdit.parentCreatedAt)!,
      fromTextNodePos(pbZeroTreeEdit.from!),
      fromTextNodePos(pbZeroTreeEdit.to!),
      pbZeroTreeEdit.content
        ? fromZeroTokens(pbZeroTreeEdit.content)
        : undefined,
      fromTimeTicket(pbZeroTreeEdit.executedAt)!,
      hasSpans
        ? pbZeroTreeEdit.restoreSpans.map(fromZeroRestoreSpan)
        : undefined,
      hasSpans
        ? pbZeroTreeEdit.restoreMode === PbRestoreMode.RETOMBSTONE
          ? 'retombstone'
          : 'restore'
        : undefined,
      hasSpans
        ? pbZeroTreeEdit.retombstoneSpans.map(fromZeroRestoreSpan)
        : undefined,
    );
  } else if (pbOperation.body.case === 'zeroTreeStyle') {
    const pbZeroTreeStyle = pbOperation.body.value;
    return new ZeroTreeStyleOperation(
      fromTimeTicket(pbZeroTreeStyle.parentCreatedAt)!,
      fromTextNodeID(pbZeroTreeStyle.markerId!),
      fromZeroAttrWrites(pbZeroTreeStyle.writes),
      fromTimeTicket(pbZeroTreeStyle.executedAt)!,
      pbZeroTreeStyle.range
        ? {
            last: pbZeroTreeStyle.range.last
              ? fromTextNodeID(pbZeroTreeStyle.range.last)
              : undefined,
          }
        : undefined,
      pbZeroTreeStyle.cancel
        ? fromZeroCancelWrite(pbZeroTreeStyle.cancel)
        : undefined,
    );
  } else if (pbOperation.body.case === 'arraySet') {
    const pbArraySetOperation = pbOperation.body.value;
    return ArraySetOperation.create(
      fromTimeTicket(pbArraySetOperation!.parentCreatedAt)!,
      fromTimeTicket(pbArraySetOperation!.createdAt)!,
      fromElementSimple(pbArraySetOperation!.value!),
      fromTimeTicket(pbArraySetOperation!.executedAt)!,
    );
  } else {
    throw new YorkieError(Code.ErrUnimplemented, `unimplemented operation`);
  }
}

/**
 * `fromOperations` converts the given Protobuf format to model format.
 */
function fromOperations(pbOperations: Array<PbOperation>): Array<Operation> {
  const operations = [];
  for (const pbOperation of pbOperations) {
    const operation = fromOperation(pbOperation);
    if (operation) {
      operations.push(operation);
    }
  }
  return operations;
}

/**
 * `fromChanges` converts the given Protobuf format to model format.
 */
function fromChanges<P extends Indexable>(
  pbChanges: Array<PbChange>,
): Array<Change<P>> {
  const changes: Array<Change<P>> = [];

  for (const pbChange of pbChanges) {
    changes.push(
      Change.create({
        id: fromChangeID(pbChange.id!),
        operations: fromOperations(pbChange.operations),
        presenceChange: pbChange.presenceChange
          ? fromPresenceChange(pbChange.presenceChange!)
          : undefined,
        message: pbChange.message,
      }),
    );
  }

  return changes;
}

/**
 * `fromCheckpoint` converts the given Protobuf format to model format.
 */
function fromCheckpoint(pbCheckpoint: PbCheckpoint): Checkpoint {
  return Checkpoint.of(BigInt(pbCheckpoint.serverSeq), pbCheckpoint.clientSeq);
}

/**
 * `fromChangePack` converts the given Protobuf format to model format.
 */
function fromChangePack<P extends Indexable>(
  pbPack: PbChangePack,
): ChangePack<P> {
  return ChangePack.create<P>(
    pbPack.documentKey!,
    fromCheckpoint(pbPack.checkpoint!),
    pbPack.isRemoved,
    fromChanges(pbPack.changes),
    fromVersionVector(pbPack.versionVector),
    pbPack.snapshot,
    pbPack.epoch,
    pbPack.capabilities,
  );
}

/**
 * `fromObject` converts the given Protobuf format to model format.
 */
function fromObject(pbObject: PbJSONElement_JSONObject): CRDTObject {
  const rht = new ElementRHT();
  for (const pbRHTNode of pbObject.nodes) {
    const value = fromElement(pbRHTNode.element!);
    rht.set(pbRHTNode.key, value, value.getPositionedAt());
  }

  const obj = new CRDTObject(fromTimeTicket(pbObject.createdAt)!, rht);
  obj.setMovedAt(fromTimeTicket(pbObject.movedAt));
  obj.setRemovedAt(fromTimeTicket(pbObject.removedAt));
  return obj;
}

/**
 * `fromArray` converts the given Protobuf format to model format.
 */
function fromArray(pbArray: PbJSONElement_JSONArray): CRDTArray {
  const rgaTreeList = new RGATreeList();
  for (const pbRGANode of pbArray.nodes) {
    if (!pbRGANode.element) {
      // Dead position node (abandoned by a move).
      if (!pbRGANode.positionCreatedAt || !pbRGANode.positionRemovedAt) {
        throw new YorkieError(
          Code.ErrInvalidArgument,
          'dead RGA position node missing position timestamps',
        );
      }
      const posCreatedAt = fromTimeTicket(pbRGANode.positionCreatedAt)!;
      const posRemovedAt = fromTimeTicket(pbRGANode.positionRemovedAt)!;
      rgaTreeList.addDeadPosition(posCreatedAt, posRemovedAt);
      continue;
    }

    const elem = fromElement(pbRGANode.element);
    const posMovedAt = fromTimeTicket(pbRGANode.positionMovedAt);

    if (posMovedAt) {
      if (!pbRGANode.positionCreatedAt) {
        throw new YorkieError(
          Code.ErrInvalidArgument,
          'moved RGA node missing position_created_at',
        );
      }
      const posCreatedAt = fromTimeTicket(pbRGANode.positionCreatedAt)!;
      rgaTreeList.addMovedElement(elem, posCreatedAt, posMovedAt);
    } else {
      rgaTreeList.insert(elem);
    }
  }

  const arr = new CRDTArray(fromTimeTicket(pbArray.createdAt)!, rgaTreeList);
  arr.setMovedAt(fromTimeTicket(pbArray.movedAt));
  arr.setRemovedAt(fromTimeTicket(pbArray.removedAt));
  return arr;
}

/**
 * `fromPrimitive` converts the given Protobuf format to model format.
 */
function fromPrimitive(pbPrimitive: PbJSONElement_Primitive): Primitive {
  const primitive = Primitive.of(
    Primitive.valueFromBytes(
      fromValueType(pbPrimitive.type),
      pbPrimitive.value,
    ),
    fromTimeTicket(pbPrimitive.createdAt)!,
  );
  primitive.setMovedAt(fromTimeTicket(pbPrimitive.movedAt));
  primitive.setRemovedAt(fromTimeTicket(pbPrimitive.removedAt));
  return primitive;
}

/**
 * `fromText` converts the given Protobuf format to model format.
 */
function fromText<A extends Indexable>(
  pbText: PbJSONElement_Text,
): CRDTText<A> {
  const rgaTreeSplit = new RGATreeSplit<CRDTTextValue>();

  // A Text can arrive inside a client-supplied Set/Add/ArraySet payload, where
  // its split links are as untrusted as the tree links `dropSplitLinksInElement`
  // strips from the same payloads. They are kept rather than dropped -- such a
  // payload can be a copy of real document state, the Text a reverse of Remove
  // restores, whose nodes a later Edit still targets -- so each link is
  // resolved by EXACT id against the nodes already decoded. `findNode` is
  // `findFloorNode`, which answers a missing id with whatever node sorts below
  // it: a dangling or forward link would silently become a link to the wrong
  // node. An unresolvable link is dropped instead, which is what a Text with no
  // links at all already looks like.
  //
  // Being decoded earlier is not enough. Every producer of a link points it at
  // an earlier piece of the SAME insertion -- `splitNode` links a split product
  // to its left half and relinks the following piece, and the restore path
  // links a recreated fragment to the piece covering the offset below it -- so
  // a link naming another insertion, or an offset at or above this node's own,
  // is one no local edit could have made. Accepting it would let a forged
  // payload mis-link a node, and a later Edit resolving through
  // `findFloorNodePreferToLeft` would then compute an out-of-range offset.
  const decoded = new Map<string, RGATreeSplitNode<CRDTTextValue>>();
  let prev = rgaTreeSplit.getHead();
  for (const pbNode of pbText.nodes) {
    const current = rgaTreeSplit.insertAfter(prev, fromTextNode(pbNode));
    if (pbNode.insPrevId) {
      const id = current.getID();
      const insPrevID = fromTextNodeID(pbNode.insPrevId);
      const insPrev =
        insPrevID.hasSameCreatedAt(id) && insPrevID.getOffset() < id.getOffset()
          ? decoded.get(insPrevID.toIDString())
          : undefined;
      if (insPrev) {
        current.setInsPrev(insPrev);
      }
    }
    decoded.set(current.getID().toIDString(), current);
    prev = current;
  }
  const purged = rgaTreeSplit.getPurgedLedger();
  for (const e of pbText.purgedRemovals) {
    const key = fromTimeTicket(e.createdAt)!.toIDString();
    const entries = purged.get(key) ?? [];
    entries.push({
      start: e.start,
      end: e.end,
      dels: e.removals.map((d) => fromTimeTicket(d)!),
    });
    purged.set(key, entries);
  }
  const text = new CRDTText<A>(rgaTreeSplit, fromTimeTicket(pbText.createdAt)!);
  text.setMovedAt(fromTimeTicket(pbText.movedAt));
  text.setRemovedAt(fromTimeTicket(pbText.removedAt));
  return text;
}

/**
 * `fromCounter` converts the given Protobuf format to model format.
 */
function fromCounter(pbCounter: PbJSONElement_Counter): CRDTCounter {
  const counter = CRDTCounter.create(
    fromCounterType(pbCounter.type),
    CRDTCounter.valueFromBytes(
      fromCounterType(pbCounter.type),
      pbCounter.value,
    ),
    fromTimeTicket(pbCounter.createdAt)!,
  );
  counter.setMovedAt(fromTimeTicket(pbCounter.movedAt));
  counter.setRemovedAt(fromTimeTicket(pbCounter.removedAt));
  if (counter.isDedup() && pbCounter.hllRegisters.length > 0) {
    // A rejected payload is logged and dropped rather than thrown on: snapshot
    // decode has no handler, so throwing would stop this client from opening
    // the document at all over one peer's malformed counter.
    if (!counter.restoreHLL(pbCounter.hllRegisters)) {
      logger.warn(
        `discarding malformed HLL registers for counter ${counter
          .getCreatedAt()
          .toTestString()}: ${pbCounter.hllRegisters.length} bytes`,
      );
    }
  }
  return counter;
}

/**
 * `fromTree` converts the given Protobuf format to model format.
 */
function fromTree(pbTree: PbJSONElement_Tree): CRDTTree {
  const root = fromTreeNodes(pbTree.nodes);
  const tree = CRDTTree.create(root!, fromTimeTicket(pbTree.createdAt)!);
  // `toTree` writes both tickets and `CRDTElement.getMetaUsage` charges both,
  // so dropping them here makes a tree restored from a snapshot smaller than
  // the same tree before the restore -- one ticket per stamp. Every other
  // `from*` restores them; this one did not.
  tree.setMovedAt(fromTimeTicket(pbTree.movedAt));
  tree.setRemovedAt(fromTimeTicket(pbTree.removedAt));
  return tree;
}

/**
 * `fromZeroTokens` converts a Protobuf token run to model format.
 */
function fromZeroTokens(
  pbTokens: PbZeroTokens,
  actors?: ZeroActors,
): ZeroTokens {
  const tokens: Array<ZeroToken> = [];
  for (const pbToken of pbTokens.tokens) {
    if (pbToken.body.case === 'chars') {
      tokens.push(...Array.from(pbToken.body.value));
    } else if (pbToken.body.case === 'ghost') {
      for (let i = 0; i < pbToken.body.value; i++) {
        tokens.push(ZeroGhost);
      }
    } else if (pbToken.body.case === 'marker') {
      const pbMarker = pbToken.body.value;
      const marker = new ZeroMarker(
        pbMarker.type,
        pbMarker.depth,
        undefined,
        pbMarker.boundary || undefined,
      );
      for (const attr of pbMarker.attrs) {
        marker.attrs.set(attr.key, {
          value: attr.isRemoved ? null : attr.value,
          updatedAt: (attr.updatedAtRef
            ? actors!.fromTicket(attr.updatedAtRef)
            : fromTimeTicket(attr.updatedAt))!,
          ...(attr.history.length
            ? {
                history: attr.history.map((e) => ({
                  value: e.isRemoved ? null : e.value,
                  at: (e.updatedAtRef
                    ? actors!.fromTicket(e.updatedAtRef)
                    : fromTimeTicket(e.updatedAt))!,
                  ...(e.byRange ? { byRange: true } : {}),
                })),
              }
            : {}),
        });
      }
      tokens.push(marker);
    }
  }
  return new ZeroTokens(tokens, pbTokens.scope || undefined);
}

/**
 * `fromZeroRestoreSpan` converts a Protobuf restore span to model format.
 */
function fromZeroRestoreSpan(
  pbSpan: PbZeroRestoreSpan,
): RestoreSpan<ZeroTokens> {
  return {
    createdAt: fromTimeTicket(pbSpan.createdAt)!,
    start: pbSpan.start,
    end: pbSpan.end,
    value: fromZeroTokens(pbSpan.value!),
    removedBy: fromTimeTicket(pbSpan.removedBy),
  };
}

/**
 * `fromZeroTree` converts the given Protobuf format to model format.
 */
function fromZeroTree(pbTree: PbJSONElement_ZeroTree): CRDTZeroTree {
  const rga = RGATreeSplit.create<ZeroTokens>();
  // Links resolve by exact id against nodes already decoded, as `fromText`.
  const decoded = new Map<string, RGATreeSplitNode<ZeroTokens>>();
  let prev = rga.getHead();
  const actors = new ZeroActors(pbTree.actors.map((b) => toHexString(b)));
  for (const pbNode of pbTree.nodes) {
    const node = RGATreeSplitNode.create(
      actors.fromNodeID(pbNode.id!),
      fromZeroTokens(pbNode.value!, actors),
    ) as RGATreeSplitNode<ZeroTokens>;
    node.setRemovedAt(actors.fromTicket(pbNode.removedAt));
    if (pbNode.hasLedger) {
      node.setLedger(
        pbNode.dels.map((d) => actors.fromTicket(d)!),
        pbNode.cancels.map(
          (c) =>
            [
              actors.fromTicket(c.deletion)!,
              actors.fromTicket(c.cancelledAt)!,
            ] as [TimeTicket, TimeTicket],
        ),
      );
    }
    const current = rga.insertAfter(prev, node);
    if (pbNode.insPrevId) {
      const id = current.getID();
      const insPrevID = actors.fromNodeID(pbNode.insPrevId);
      const insPrev =
        insPrevID.hasSameCreatedAt(id) && insPrevID.getOffset() < id.getOffset()
          ? decoded.get(insPrevID.toIDString())
          : undefined;
      if (insPrev) {
        current.setInsPrev(insPrev);
      }
    }
    decoded.set(current.getID().toIDString(), current);
    prev = current;
  }
  const purged = rga.getPurgedLedger();
  for (const e of pbTree.purgedLedger) {
    const key = fromTimeTicket(e.createdAt)!.toIDString();
    const entries = purged.get(key) ?? [];
    entries.push({
      start: e.start,
      end: e.end,
      dels: e.dels.map((d) => fromTimeTicket(d)!),
    });
    purged.set(key, entries);
  }
  const tree = new CRDTZeroTree(
    rga,
    fromTimeTicket(pbTree.createdAt)!,
    pbTree.schema ? fromZeroSchema(pbTree.schema) : BuiltinZeroSchema,
  );
  tree.setMovedAt(fromTimeTicket(pbTree.movedAt));
  tree.setRemovedAt(fromTimeTicket(pbTree.removedAt));
  for (const c of pbTree.styleCancels) {
    tree.loadStyleCancel(
      new ZeroStyleCancel(
        actors.fromTicket(c.writeRef)!,
        c.on,
        actors.fromTicket(c.atRef)!,
        fromZeroAttrWrites(c.fallback),
      ),
    );
  }
  return tree;
}

/**
 * `fromElement` converts the given Protobuf format to model format.
 */
export function fromElement(pbElement: PbJSONElement): CRDTElement {
  if (pbElement.body.case === 'jsonObject') {
    return fromObject(pbElement.body.value!);
  } else if (pbElement.body.case === 'jsonArray') {
    return fromArray(pbElement.body.value!);
  } else if (pbElement.body.case === 'primitive') {
    return fromPrimitive(pbElement.body.value!);
  } else if (pbElement.body.case === 'text') {
    return fromText(pbElement.body.value!);
  } else if (pbElement.body.case === 'counter') {
    return fromCounter(pbElement.body.value!);
  } else if (pbElement.body.case === 'tree') {
    return fromTree(pbElement.body.value!);
  } else if (pbElement.body.case === 'zeroTree') {
    return fromZeroTree(pbElement.body.value!);
  } else {
    throw new YorkieError(Code.ErrUnimplemented, `unimplemented element`);
  }
}

/**
 * `fromSchemaRules` converts the given Protobuf format to model format.
 */
function fromSchemaRules(pbRules: Array<PbRule>): Array<Rule> {
  return pbRules.map((pbRule) => {
    const rule: Record<string, unknown> = {
      path: pbRule.path,
      type: pbRule.type,
    };
    if (pbRule.treeNodes && pbRule.treeNodes.length > 0) {
      rule.treeNodes = pbRule.treeNodes.map((tn) => ({
        nodeType: tn.nodeType,
        content: tn.content,
        marks: tn.marks,
        group: tn.group,
      }));
    }
    return rule as Rule;
  });
}

/**
 * `bytesToSnapshot` creates a Snapshot from the given byte array.
 */
function bytesToSnapshot<P extends Indexable>(
  bytes?: Uint8Array,
): {
  root: CRDTObject;
  presences: Map<ActorID, P>;
} {
  if (!bytes) {
    return {
      root: CRDTObject.create(InitialTimeTicket),
      presences: new Map(),
    };
  }

  const snapshot = fromBinary(PbSnapshotSchema, bytes);
  return {
    root: fromElement(snapshot.root!) as CRDTObject,
    presences: fromPresences<P>(snapshot.presences),
  };
}

/**
 * `snapshotToBytes` converts the given root and presences into a byte array.
 * It is the reverse of `bytesToSnapshot`: the produced bytes decode back into
 * the same `{ root, presences }` shape via the shared `Snapshot` message.
 */
function snapshotToBytes<P extends Indexable>(
  root: CRDTObject,
  presences: Map<ActorID, P>,
): Uint8Array {
  const pbPresences: { [key: string]: PbPresence } = {};
  for (const [actorID, presence] of presences) {
    pbPresences[actorID] = toPresence(presence);
  }

  const snapshot = create(PbSnapshotSchema, {
    root: toElement(root),
    presences: pbPresences,
  });
  return toBinary(PbSnapshotSchema, snapshot);
}

/**
 * `versionVectorToHex` converts the given VersionVector to bytes.
 */
function versionVectorToHex(vector: VersionVector): string {
  const pbVersionVector = toVersionVector(vector)!;

  return bytesToHex(toBinary(PbVersionVectorSchema, pbVersionVector));
}

/**
 * `hexToVersionVector` creates a VersionVector from the given bytes.
 */
function hexToVersionVector(hex: string): VersionVector {
  const bytes = hexToBytes(hex);
  const pbVersionVector = fromBinary(PbVersionVectorSchema, bytes);

  return fromVersionVector(pbVersionVector)!;
}

/**
 * `bytesToObject` creates an JSONObject from the given byte array.
 */
function bytesToObject(bytes?: Uint8Array): CRDTObject {
  if (!bytes) {
    throw new YorkieError(Code.ErrInvalidArgument, 'bytes is empty');
  }

  const pbElement = fromBinary(PbJSONElementSchema, bytes);
  return fromObject(pbElement.body.value! as PbJSONElement_JSONObject);
}

/**
 * `objectToBytes` converts the given JSONObject to byte array.
 */
function objectToBytes(obj: CRDTObject): Uint8Array {
  return toBinary(PbJSONElementSchema, toElement(obj));
}

/**
 * `bytesToArray` creates an CRDTArray from the given bytes.
 */
function bytesToArray(bytes?: Uint8Array): CRDTArray {
  if (!bytes) {
    throw new YorkieError(Code.ErrInvalidArgument, 'bytes is empty');
  }

  const pbElement = fromBinary(PbJSONElementSchema, bytes);
  return fromArray(pbElement.body.value! as PbJSONElement_JSONArray);
}

/**
 * `arrayToBytes` converts the given CRDTArray to bytes.
 */
function arrayToBytes(array: CRDTArray): Uint8Array {
  return toBinary(PbJSONElementSchema, toArray(array));
}

/**
 * `bytesToTree` creates an CRDTTree from the given bytes.
 */
function bytesToTree(bytes?: Uint8Array): CRDTTree {
  if (!bytes) {
    throw new YorkieError(Code.ErrInvalidArgument, 'bytes is empty');
  }

  const pbElement = fromBinary(PbJSONElementSchema, bytes);
  return fromTree(pbElement.body.value! as PbJSONElement_Tree);
}

/**
 * `treeToBytes` converts the given tree to bytes.
 */
function treeToBytes(tree: CRDTTree): Uint8Array {
  return toBinary(PbJSONElementSchema, toTree(tree));
}

/**
 * `changeToBytes` / `bytesToChange` convert one change (PROTOTYPE: the Zero
 * Tree relay and harness send changes one by one).
 */
function changeToBytes(change: Change<Indexable>): Uint8Array {
  return toBinary(PbChangeSchema, toChange(change));
}

/**
 * `bytesToChange` decodes one change from bytes.
 */
function bytesToChange<P extends Indexable>(bytes: Uint8Array): Change<P> {
  return fromChanges<P>([fromBinary(PbChangeSchema, bytes)])[0];
}

/**
 * `bytesToHex` creates an hex string from the given byte array.
 */
function bytesToHex(bytes?: Uint8Array): string {
  if (!bytes) {
    return '';
  }

  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * `toHexString` converts the given byte array to hex string.
 */
function toHexString(bytes: Uint8Array): string {
  return bytesToHex(bytes);
}

/**
 * `hexToBytes` converts the given hex string to byte array.
 */
function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(
    hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
  );
}

/**
 * `base64ToUint8Array` converts the given base64 string to Uint8Array.
 */
function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    const binary = window.atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } else if (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as any).Buffer !== 'undefined'
  ) {
    const Buffer = (globalThis as any).Buffer;
    return new Uint8Array(Buffer.from(base64, 'base64'));
  } else {
    throw new Error('No base64 decoder available');
  }
}

/**
 * `toUnit8Array` converts the given hex string to byte array.
 */
function toUint8Array(hex: string): Uint8Array {
  return hexToBytes(hex);
}

/**
 * `uint8ArrayToBase64` converts the given Uint8Array to base64 string.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  } else if (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as any).Buffer !== 'undefined'
  ) {
    const Buffer = (globalThis as any).Buffer;
    return Buffer.from(bytes).toString('base64');
  } else {
    throw new Error('No base64 encoder available');
  }
}
/**
 * `bytesToChangeID` creates a ChangeID from the given bytes.
 */
function bytesToChangeID(bytes: Uint8Array): ChangeID {
  const pbChangeID = fromBinary(PbChangeIDSchema, bytes);
  return fromChangeID(pbChangeID);
}

/**
 * `bytesToOperation` creates an Operation from the given bytes.
 */
function bytesToOperation(bytes: Uint8Array): Operation {
  const pbOperation = fromBinary(PbOperationSchema, bytes);
  return fromOperation(pbOperation)!;
}

/**
 * `converter` is a converter that converts the given model to protobuf format.
 * is also used to convert models to bytes and vice versa.
 */
export const converter = {
  changeToBytes,
  bytesToChange,
  fromPresence,
  toChangePack,
  fromChangePack,
  fromChanges,
  toTreeNodes,
  fromTreeNodes,
  objectToBytes,
  bytesToObject,
  bytesToSnapshot,
  snapshotToBytes,
  bytesToHex,
  hexToBytes,
  toHexString,
  toUint8Array,
  toOperation,
  toChangeID,
  bytesToChangeID,
  bytesToOperation,
  versionVectorToHex,
  hexToVersionVector,
  fromSchemaRules,
  toRevisionSummary,
  changeIDToBinary: (changeID: ChangeID) =>
    toBinary(PbChangeIDSchema, toChangeID(changeID)),
  operationToBinary: (op: Operation) =>
    toBinary(PbOperationSchema, toOperation(op)),
};
