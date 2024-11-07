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
import { ErrorInfo } from '@buf/googleapis_googleapis.bufbuild_es/google/rpc/error_details_pb';
import { Code, YorkieError } from '@yorkie-js-sdk/src/util/error';
import { Indexable } from '@yorkie-js-sdk/src/document/document';
import {
  PresenceChange,
  PresenceChangeType,
} from '@yorkie-js-sdk/src/document/presence/presence';
import {
  InitialTimeTicket,
  TimeTicket,
} from '@yorkie-js-sdk/src/document/time/ticket';
import { ActorID } from '@yorkie-js-sdk/src/document/time/actor_id';
import { Operation } from '@yorkie-js-sdk/src/document/operation/operation';
import { SetOperation } from '@yorkie-js-sdk/src/document/operation/set_operation';
import { AddOperation } from '@yorkie-js-sdk/src/document/operation/add_operation';
import { MoveOperation } from '@yorkie-js-sdk/src/document/operation/move_operation';
import { RemoveOperation } from '@yorkie-js-sdk/src/document/operation/remove_operation';
import { EditOperation } from '@yorkie-js-sdk/src/document/operation/edit_operation';
import { StyleOperation } from '@yorkie-js-sdk/src/document/operation/style_operation';
import { TreeEditOperation } from '@yorkie-js-sdk/src/document/operation/tree_edit_operation';
import { ChangeID } from '@yorkie-js-sdk/src/document/change/change_id';
import { Change } from '@yorkie-js-sdk/src/document/change/change';
import { ChangePack } from '@yorkie-js-sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js-sdk/src/document/change/checkpoint';
import { ElementRHT } from '@yorkie-js-sdk/src/document/crdt/element_rht';
import { RGATreeList } from '@yorkie-js-sdk/src/document/crdt/rga_tree_list';
import { CRDTElement } from '@yorkie-js-sdk/src/document/crdt/element';
import { CRDTObject } from '@yorkie-js-sdk/src/document/crdt/object';
import { CRDTArray } from '@yorkie-js-sdk/src/document/crdt/array';
import { VersionVector } from '@yorkie-js-sdk/src/document/time/version_vector';
import { CRDTTreePos } from './../document/crdt/tree';
import {
  RGATreeSplit,
  RGATreeSplitNode,
  RGATreeSplitNodeID,
  RGATreeSplitPos,
} from '@yorkie-js-sdk/src/document/crdt/rga_tree_split';
import { CRDTText, CRDTTextValue } from '@yorkie-js-sdk/src/document/crdt/text';
import {
  Primitive,
  PrimitiveType,
} from '@yorkie-js-sdk/src/document/crdt/primitive';
import {
  Change as PbChange,
  ChangeID as PbChangeID,
  ChangePack as PbChangePack,
  Checkpoint as PbCheckpoint,
  JSONElement as PbJSONElement,
  JSONElementSimple as PbJSONElementSimple,
  NodeAttr as PbNodeAttr,
  Operation as PbOperation,
  Presence as PbPresence,
  PresenceChange as PbPresenceChange,
  RGANode as PbRGANode,
  RHTNode as PbRHTNode,
  Snapshot as PbSnapshot,
  TextNode as PbTextNode,
  TextNodeID as PbTextNodeID,
  TextNodePos as PbTextNodePos,
  TimeTicket as PbTimeTicket,
  TreeNode as PbTreeNode,
  TreeNodes as PbTreeNodes,
  TreePos as PbTreePos,
  TreeNodeID as PbTreeNodeID,
  VersionVector as PbVersionVector,
  ValueType as PbValueType,
  JSONElement_Tree as PbJSONElement_Tree,
  JSONElement_Text as PbJSONElement_Text,
  JSONElement_Primitive as PbJSONElement_Primitive,
  JSONElement_Counter as PbJSONElement_Counter,
  JSONElement_JSONObject as PbJSONElement_JSONObject,
  JSONElement_JSONArray as PbJSONElement_JSONArray,
  PresenceChange_ChangeType as PbPresenceChange_ChangeType,
  Operation_Set as PbOperation_Set,
  Operation_Add as PbOperation_Add,
  Operation_Move as PbOperation_Move,
  Operation_Remove as PbOperation_Remove,
  Operation_Edit as PbOperation_Edit,
  Operation_Style as PbOperation_Style,
  Operation_Increase as PbOperation_Increase,
  Operation_TreeEdit as PbOperation_TreeEdit,
  Operation_TreeStyle as PbOperation_TreeStyle,
} from '@yorkie-js-sdk/src/api/yorkie/v1/resources_pb';
import { IncreaseOperation } from '@yorkie-js-sdk/src/document/operation/increase_operation';
import {
  CounterType,
  CRDTCounter,
} from '@yorkie-js-sdk/src/document/crdt/counter';
import {
  CRDTTree,
  CRDTTreeNode,
  CRDTTreeNodeID,
} from '@yorkie-js-sdk/src/document/crdt/tree';
import { traverseAll } from '../util/index_tree';
import { TreeStyleOperation } from '../document/operation/tree_style_operation';
import { RHT } from '../document/crdt/rht';

/**
 * `toPresence` converts the given model to Protobuf format.
 */
function toPresence(presence: Indexable): PbPresence {
  const pbPresence = new PbPresence();
  const pbDataMap = pbPresence.data;
  for (const [key, value] of Object.entries(presence)) {
    pbDataMap[key] = JSON.stringify(value);
  }
  return pbPresence;
}

/**
 * `toPresenceChange` converts the given model to Protobuf format.
 */
function toPresenceChange(
  presenceChange: PresenceChange<Indexable>,
): PbPresenceChange {
  if (presenceChange.type === PresenceChangeType.Put) {
    return new PbPresenceChange({
      type: PbPresenceChange_ChangeType.PUT,
      presence: toPresence(presenceChange.presence),
    });
  }
  if (presenceChange.type === PresenceChangeType.Clear) {
    return new PbPresenceChange({
      type: PbPresenceChange_ChangeType.CLEAR,
    });
  }

  throw new YorkieError(Code.ErrUnimplemented, `unimplemented type`);
}

/**
 * `toCheckpoint` converts the given model to Protobuf format.
 */
function toCheckpoint(checkpoint: Checkpoint): PbCheckpoint {
  return new PbCheckpoint({
    serverSeq: checkpoint.getServerSeq(),
    clientSeq: checkpoint.getClientSeq(),
  });
}

/**
 * `toChangeID` converts the given model to Protobuf format.
 */
function toChangeID(changeID: ChangeID): PbChangeID {
  return new PbChangeID({
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

  return new PbTimeTicket({
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

  const pbVector = new PbVersionVector();
  for (const [actorID, lamport] of vector) {
    pbVector.vector[actorID] = BigInt(lamport.toString());
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
    case CounterType.IntegerCnt:
      return PbValueType.INTEGER_CNT;
    case CounterType.LongCnt:
      return PbValueType.LONG_CNT;
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
    return new PbJSONElementSimple({
      type: PbValueType.JSON_OBJECT,
      createdAt: toTimeTicket(element.getCreatedAt()),
      value: objectToBytes(element),
    });
  }
  if (element instanceof CRDTArray) {
    return new PbJSONElementSimple({
      type: PbValueType.JSON_ARRAY,
      createdAt: toTimeTicket(element.getCreatedAt()),
      value: arrayToBytes(element),
    });
  }
  if (element instanceof CRDTText) {
    return new PbJSONElementSimple({
      type: PbValueType.TEXT,
      createdAt: toTimeTicket(element.getCreatedAt()),
    });
  }
  if (element instanceof Primitive) {
    return new PbJSONElementSimple({
      type: toValueType(element.getType()),
      createdAt: toTimeTicket(element.getCreatedAt()),
      value: element.toBytes(),
    });
  }
  if (element instanceof CRDTCounter) {
    return new PbJSONElementSimple({
      type: toCounterType(element.getType()),
      createdAt: toTimeTicket(element.getCreatedAt()),
      value: element.toBytes(),
    });
  }
  if (element instanceof CRDTTree) {
    return new PbJSONElementSimple({
      type: PbValueType.TREE,
      createdAt: toTimeTicket(element.getCreatedAt()),
      value: treeToBytes(element),
    });
  }

  throw new YorkieError(Code.ErrUnimplemented, `unimplemented element`);
}

/**
 * `toTextNodeID` converts the given model to Protobuf format.
 */
function toTextNodeID(id: RGATreeSplitNodeID): PbTextNodeID {
  return new PbTextNodeID({
    createdAt: toTimeTicket(id.getCreatedAt()),
    offset: id.getOffset(),
  });
}

/**
 * `toTextNodePos` converts the given model to Protobuf format.
 */
function toTextNodePos(pos: RGATreeSplitPos): PbTextNodePos {
  return new PbTextNodePos({
    createdAt: toTimeTicket(pos.getID().getCreatedAt()),
    offset: pos.getID().getOffset(),
    relativeOffset: pos.getRelativeOffset(),
  });
}

/**
 * `toTreePos` converts the given model to Protobuf format.
 */
function toTreePos(pos: CRDTTreePos): PbTreePos {
  return new PbTreePos({
    parentId: toTreeNodeID(pos.getParentID()),
    leftSiblingId: toTreeNodeID(pos.getLeftSiblingID()),
  });
}

/**
 * `toTreeNodeID` converts the given model to Protobuf format.
 */
function toTreeNodeID(treeNodeID: CRDTTreeNodeID): PbTreeNodeID {
  return new PbTreeNodeID({
    createdAt: toTimeTicket(treeNodeID.getCreatedAt()),
    offset: treeNodeID.getOffset(),
  });
}

/**
 * `toOperation` converts the given model to Protobuf format.
 */
function toOperation(operation: Operation): PbOperation {
  const pbOperation = new PbOperation();

  if (operation instanceof SetOperation) {
    const setOperation = operation as SetOperation;
    const pbSetOperation = new PbOperation_Set();
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
    const pbAddOperation = new PbOperation_Add();
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
    const pbMoveOperation = new PbOperation_Move();
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
    const pbRemoveOperation = new PbOperation_Remove();
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
    const pbEditOperation = new PbOperation_Edit();
    pbEditOperation.parentCreatedAt = toTimeTicket(
      editOperation.getParentCreatedAt(),
    );
    pbEditOperation.from = toTextNodePos(editOperation.getFromPos());
    pbEditOperation.to = toTextNodePos(editOperation.getToPos());
    const pbCreatedAtMapByActor = pbEditOperation.createdAtMapByActor;
    for (const [key, value] of editOperation.getMaxCreatedAtMapByActor()) {
      pbCreatedAtMapByActor[key] = toTimeTicket(value)!;
    }
    pbEditOperation.content = editOperation.getContent();
    const pbAttributes = pbEditOperation.attributes;
    for (const [key, value] of editOperation.getAttributes()) {
      pbAttributes[key] = value;
    }
    pbEditOperation.executedAt = toTimeTicket(editOperation.getExecutedAt());
    pbOperation.body.case = 'edit';
    pbOperation.body.value = pbEditOperation;
  } else if (operation instanceof StyleOperation) {
    const styleOperation = operation as StyleOperation;
    const pbStyleOperation = new PbOperation_Style();
    pbStyleOperation.parentCreatedAt = toTimeTicket(
      styleOperation.getParentCreatedAt(),
    );
    pbStyleOperation.from = toTextNodePos(styleOperation.getFromPos());
    pbStyleOperation.to = toTextNodePos(styleOperation.getToPos());
    const pbCreatedAtMapByActor = pbStyleOperation.createdAtMapByActor;
    for (const [key, value] of styleOperation.getMaxCreatedAtMapByActor()) {
      pbCreatedAtMapByActor[key] = toTimeTicket(value)!;
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
    const pbIncreaseOperation = new PbOperation_Increase();
    pbIncreaseOperation.parentCreatedAt = toTimeTicket(
      increaseOperation.getParentCreatedAt(),
    );
    pbIncreaseOperation.value = toElementSimple(increaseOperation.getValue());
    pbIncreaseOperation.executedAt = toTimeTicket(
      increaseOperation.getExecutedAt(),
    );
    pbOperation.body.case = 'increase';
    pbOperation.body.value = pbIncreaseOperation;
  } else if (operation instanceof TreeEditOperation) {
    const treeEditOperation = operation as TreeEditOperation;
    const pbTreeEditOperation = new PbOperation_TreeEdit();
    const pbCreatedAtMapByActor = pbTreeEditOperation.createdAtMapByActor;
    for (const [key, value] of treeEditOperation.getMaxCreatedAtMapByActor()) {
      pbCreatedAtMapByActor[key] = toTimeTicket(value)!;
    }
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
    pbOperation.body.case = 'treeEdit';
    pbOperation.body.value = pbTreeEditOperation;
  } else if (operation instanceof TreeStyleOperation) {
    const treeStyleOperation = operation as TreeStyleOperation;
    const pbTreeStyleOperation = new PbOperation_TreeStyle();
    pbTreeStyleOperation.parentCreatedAt = toTimeTicket(
      treeStyleOperation.getParentCreatedAt(),
    );
    pbTreeStyleOperation.from = toTreePos(treeStyleOperation.getFromPos());
    pbTreeStyleOperation.to = toTreePos(treeStyleOperation.getToPos());
    const pbCreatedAtMapByActor = pbTreeStyleOperation.createdAtMapByActor;
    for (const [key, value] of treeStyleOperation.getMaxCreatedAtMapByActor()) {
      pbCreatedAtMapByActor[key] = toTimeTicket(value)!;
    }

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
  const pbChange = new PbChange({
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
      new PbRHTNode({
        key: rhtNode.getStrKey(),
        element: toElement(rhtNode.getValue()),
      }),
    );
  }

  return pbRHTNodes;
}

/**
 * `toRGANodes` converts the given model to Protobuf format.
 */
function toRGANodes(rgaTreeList: RGATreeList): Array<PbRGANode> {
  const pbRGANodes = [];
  for (const rgaTreeListNode of rgaTreeList) {
    pbRGANodes.push(
      new PbRGANode({
        element: toElement(rgaTreeListNode.getValue()),
      }),
    );
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

  for (const textNode of rgaTreeSplit) {
    const pbTextNode = new PbTextNode();
    pbTextNode.id = toTextNodeID(textNode.getID());
    pbTextNode.value = textNode.getValue().getContent();
    pbTextNode.removedAt = toTimeTicket(textNode.getRemovedAt());

    const pbNodeAttrsMap = pbTextNode.attributes;
    const attrs = textNode.getValue().getAttrs();
    for (const attr of attrs) {
      const pbNodeAttr = new PbNodeAttr();
      pbNodeAttr.value = attr.getValue();
      pbNodeAttr.updatedAt = toTimeTicket(attr.getUpdatedAt());
      pbNodeAttrsMap[attr.getKey()] = pbNodeAttr;
    }

    pbTextNodes.push(pbTextNode);
  }

  return pbTextNodes;
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
      new PbTreeNodes({
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
    pbRHT[node.getKey()] = new PbNodeAttr({
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
    const pbTreeNode = new PbTreeNode({
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
  const pbElement = new PbJSONElement();
  pbElement.body.case = 'jsonObject';
  pbElement.body.value = new PbJSONElement_JSONObject({
    nodes: toRHTNodes(obj.getRHT()),
    createdAt: toTimeTicket(obj.getCreatedAt()),
    movedAt: toTimeTicket(obj.getMovedAt()),
    removedAt: toTimeTicket(obj.getRemovedAt()),
  });
  return pbElement;
}

/**
 * `toArray` converts the given model to Protobuf format.
 */
function toArray(arr: CRDTArray): PbJSONElement {
  const pbElement = new PbJSONElement();
  pbElement.body.case = 'jsonArray';
  pbElement.body.value = new PbJSONElement_JSONArray({
    nodes: toRGANodes(arr.getElements()),
    createdAt: toTimeTicket(arr.getCreatedAt()),
    movedAt: toTimeTicket(arr.getMovedAt()),
    removedAt: toTimeTicket(arr.getRemovedAt()),
  });
  return pbElement;
}

/**
 * `toPrimitive` converts the given model to Protobuf format.
 */
function toPrimitive(primitive: Primitive): PbJSONElement {
  const pbElement = new PbJSONElement();
  pbElement.body.case = 'primitive';
  pbElement.body.value = new PbJSONElement_Primitive({
    type: toValueType(primitive.getType()),
    value: primitive.toBytes(),
    createdAt: toTimeTicket(primitive.getCreatedAt()),
    movedAt: toTimeTicket(primitive.getMovedAt()),
    removedAt: toTimeTicket(primitive.getRemovedAt()),
  });
  return pbElement;
}

/**
 * `toText` converts the given model to Protobuf format.
 */
function toText(text: CRDTText<Record<string, any>>): PbJSONElement {
  const pbElement = new PbJSONElement();
  pbElement.body.case = 'text';
  pbElement.body.value = new PbJSONElement_Text({
    nodes: toTextNodes(text.getRGATreeSplit()),
    createdAt: toTimeTicket(text.getCreatedAt()),
    movedAt: toTimeTicket(text.getMovedAt()),
    removedAt: toTimeTicket(text.getRemovedAt()),
  });
  return pbElement;
}

/**
 * `toCounter` converts the given model to Protobuf format.
 */
function toCounter(counter: CRDTCounter): PbJSONElement {
  const pbElement = new PbJSONElement();
  pbElement.body.case = 'counter';
  pbElement.body.value = new PbJSONElement_Counter({
    type: toCounterType(counter.getType()),
    value: counter.toBytes(),
    createdAt: toTimeTicket(counter.getCreatedAt()),
    movedAt: toTimeTicket(counter.getMovedAt()),
    removedAt: toTimeTicket(counter.getRemovedAt()),
  });
  return pbElement;
}

/**
 * `toTree` converts the given model to Protobuf format.
 */
function toTree(tree: CRDTTree): PbJSONElement {
  const pbElement = new PbJSONElement();
  pbElement.body.case = 'tree';
  pbElement.body.value = new PbJSONElement_Tree({
    nodes: toTreeNodes(tree.getRoot()),
    createdAt: toTimeTicket(tree.getCreatedAt()),
    movedAt: toTimeTicket(tree.getMovedAt()),
    removedAt: toTimeTicket(tree.getRemovedAt()),
  });
  return pbElement;
}

/**
 * `toElement` converts the given model to Protobuf format.
 */
function toElement(element: CRDTElement): PbJSONElement {
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

  throw new YorkieError(Code.ErrUnimplemented, `unimplemented element`);
}

/**
 * `toChangePack` converts the given model to Protobuf format.
 */
function toChangePack(pack: ChangePack<Indexable>): PbChangePack {
  return new PbChangePack({
    documentKey: pack.getDocumentKey(),
    checkpoint: toCheckpoint(pack.getCheckpoint()),
    isRemoved: pack.getIsRemoved(),
    changes: toChanges(pack.getChanges()),
    snapshot: pack.getSnapshot(),
    versionVector: toVersionVector(pack.getVersionVector()),
    minSyncedTicket: toTimeTicket(pack.getMinSyncedTicket()),
  });
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
  const infos = error.findDetails(ErrorInfo);
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
    vector.set(key, BigInt(value.toString()));
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
      return CounterType.IntegerCnt;
    case PbValueType.LONG_CNT:
      return CounterType.LongCnt;
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
      return bytesToObject(pbElementSimple.value);
    case PbValueType.JSON_ARRAY:
      if (!pbElementSimple.value) {
        return CRDTArray.create(fromTimeTicket(pbElementSimple.createdAt)!);
      }
      return bytesToArray(pbElementSimple.value);
    case PbValueType.TEXT:
      return CRDTText.create(
        RGATreeSplit.create(),
        fromTimeTicket(pbElementSimple.createdAt)!,
      );
    case PbValueType.TREE:
      return bytesToTree(pbElementSimple.value)!;
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
    textValue.setAttr(key, value.value, fromTimeTicket(value.updatedAt)!);
  });

  const textNode = RGATreeSplitNode.create(
    fromTextNodeID(pbTextNode.id!),
    textValue,
  );
  textNode.remove(fromTimeTicket(pbTextNode.removedAt));
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
  pbTreeNodes.forEach((node) => {
    const treeNode = fromTreeNodes(node.content);
    treeNodes.push(treeNode!);
  });

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
    parent!.prepend(nodes[i]);
    depthTable.set(pbTreeNodes[i].depth, nodes[i]);
  }

  root.updateDescendantsSize();

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

  node.removedAt = fromTimeTicket(pbTreeNode.removedAt);

  return node;
}

/**
 * `fromOperation` converts the given Protobuf format to model format.
 */
function fromOperation(pbOperation: PbOperation): Operation | undefined {
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
    const createdAtMapByActor = new Map();
    Object.entries(pbEditOperation!.createdAtMapByActor).forEach(
      ([key, value]) => {
        createdAtMapByActor.set(key, fromTimeTicket(value));
      },
    );
    const attributes = new Map();
    Object.entries(pbEditOperation!.attributes).forEach(([key, value]) => {
      attributes.set(key, value);
    });
    return EditOperation.create(
      fromTimeTicket(pbEditOperation!.parentCreatedAt)!,
      fromTextNodePos(pbEditOperation!.from!),
      fromTextNodePos(pbEditOperation!.to!),
      createdAtMapByActor,
      pbEditOperation!.content,
      attributes,
      fromTimeTicket(pbEditOperation!.executedAt)!,
    );
  } else if (pbOperation.body.case === 'style') {
    const pbStyleOperation = pbOperation.body.value;
    const createdAtMapByActor = new Map();
    Object.entries(pbStyleOperation!.createdAtMapByActor).forEach(
      ([key, value]) => {
        createdAtMapByActor.set(key, fromTimeTicket(value));
      },
    );
    const attributes = new Map();
    Object.entries(pbStyleOperation!.attributes).forEach(([key, value]) => {
      attributes.set(key, value);
    });
    return StyleOperation.create(
      fromTimeTicket(pbStyleOperation!.parentCreatedAt)!,
      fromTextNodePos(pbStyleOperation!.from!),
      fromTextNodePos(pbStyleOperation!.to!),
      createdAtMapByActor,
      attributes,
      fromTimeTicket(pbStyleOperation!.executedAt)!,
    );
  } else if (pbOperation.body.case === 'select') {
    // TODO(hackerwins): Select is deprecated.
    return;
  } else if (pbOperation.body.case === 'increase') {
    const pbIncreaseOperation = pbOperation.body.value;
    return IncreaseOperation.create(
      fromTimeTicket(pbIncreaseOperation!.parentCreatedAt)!,
      fromElementSimple(pbIncreaseOperation!.value!),
      fromTimeTicket(pbIncreaseOperation!.executedAt)!,
    );
  } else if (pbOperation.body.case === 'treeEdit') {
    const pbTreeEditOperation = pbOperation.body.value;
    const createdAtMapByActor = new Map();
    Object.entries(pbTreeEditOperation!.createdAtMapByActor).forEach(
      ([key, value]) => {
        createdAtMapByActor.set(key, fromTimeTicket(value));
      },
    );
    return TreeEditOperation.create(
      fromTimeTicket(pbTreeEditOperation!.parentCreatedAt)!,
      fromTreePos(pbTreeEditOperation!.from!),
      fromTreePos(pbTreeEditOperation!.to!),
      fromTreeNodesWhenEdit(pbTreeEditOperation!.contents),
      pbTreeEditOperation!.splitLevel,
      createdAtMapByActor,
      fromTimeTicket(pbTreeEditOperation!.executedAt)!,
    );
  } else if (pbOperation.body.case === 'treeStyle') {
    const pbTreeStyleOperation = pbOperation.body.value;
    const attributes = new Map();
    const attributesToRemove = pbTreeStyleOperation.attributesToRemove;
    const createdAtMapByActor = new Map();
    if (pbTreeStyleOperation?.createdAtMapByActor) {
      Object.entries(pbTreeStyleOperation!.createdAtMapByActor).forEach(
        ([key, value]) => {
          createdAtMapByActor.set(key, fromTimeTicket(value));
        },
      );
    }

    if (attributesToRemove?.length > 0) {
      return TreeStyleOperation.createTreeRemoveStyleOperation(
        fromTimeTicket(pbTreeStyleOperation!.parentCreatedAt)!,
        fromTreePos(pbTreeStyleOperation!.from!),
        fromTreePos(pbTreeStyleOperation!.to!),
        createdAtMapByActor,
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
        createdAtMapByActor,
        attributes,
        fromTimeTicket(pbTreeStyleOperation!.executedAt)!,
      );
    }
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
    fromTimeTicket(pbPack.minSyncedTicket),
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
    // eslint-disable-next-line
    rgaTreeList.insert(fromElement(pbRGANode.element!));
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

  let prev = rgaTreeSplit.getHead();
  for (const pbNode of pbText.nodes) {
    const current = rgaTreeSplit.insertAfter(prev, fromTextNode(pbNode));
    if (pbNode.insPrevId) {
      current.setInsPrev(
        rgaTreeSplit.findNode(fromTextNodeID(pbNode.insPrevId!)),
      );
    }
    prev = current;
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
  return counter;
}

/**
 * `fromTree` converts the given Protobuf format to model format.
 */
function fromTree(pbTree: PbJSONElement_Tree): CRDTTree {
  const root = fromTreeNodes(pbTree.nodes);
  return CRDTTree.create(root!, fromTimeTicket(pbTree.createdAt)!);
}

/**
 * `fromElement` converts the given Protobuf format to model format.
 */
function fromElement(pbElement: PbJSONElement): CRDTElement {
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
  } else {
    throw new YorkieError(Code.ErrUnimplemented, `unimplemented element`);
  }
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

  const snapshot = PbSnapshot.fromBinary(bytes);
  return {
    root: fromElement(snapshot.root!) as CRDTObject,
    presences: fromPresences<P>(snapshot.presences),
  };
}

/**
 * `versionVectorToHex` converts the given VersionVector to bytes.
 */
function versionVectorToHex(vector: VersionVector): string {
  const pbVersionVector = toVersionVector(vector)!;

  return bytesToHex(pbVersionVector.toBinary());
}

/**
 * `hexToVersionVector` creates a VersionVector from the given bytes.
 */
function hexToVersionVector(hex: string): VersionVector {
  const bytes = hexToBytes(hex);
  const pbVersionVector = PbVersionVector.fromBinary(bytes);

  return fromVersionVector(pbVersionVector)!;
}

/**
 * `bytesToObject` creates an JSONObject from the given byte array.
 */
function bytesToObject(bytes?: Uint8Array): CRDTObject {
  if (!bytes) {
    throw new YorkieError(Code.ErrInvalidArgument, 'bytes is empty');
  }

  const pbElement = PbJSONElement.fromBinary(bytes);
  return fromObject(pbElement.body.value! as PbJSONElement_JSONObject);
}

/**
 * `objectToBytes` converts the given JSONObject to byte array.
 */
function objectToBytes(obj: CRDTObject): Uint8Array {
  return toElement(obj).toBinary();
}

/**
 * `bytesToArray` creates an CRDTArray from the given bytes.
 */
function bytesToArray(bytes?: Uint8Array): CRDTArray {
  if (!bytes) {
    throw new YorkieError(Code.ErrInvalidArgument, 'bytes is empty');
  }

  const pbElement = PbJSONElement.fromBinary(bytes);
  return fromArray(pbElement.body.value! as PbJSONElement_JSONArray);
}

/**
 * `arrayToBytes` converts the given CRDTArray to bytes.
 */
function arrayToBytes(array: CRDTArray): Uint8Array {
  return toArray(array).toBinary();
}

/**
 * `bytesToTree` creates an CRDTTree from the given bytes.
 */
function bytesToTree(bytes?: Uint8Array): CRDTTree {
  if (!bytes) {
    throw new YorkieError(Code.ErrInvalidArgument, 'bytes is empty');
  }

  const pbElement = PbJSONElement.fromBinary(bytes);
  return fromTree(pbElement.body.value! as PbJSONElement_Tree);
}

/**
 * `treeToBytes` converts the given tree to bytes.
 */
function treeToBytes(tree: CRDTTree): Uint8Array {
  return toTree(tree).toBinary();
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
 * `toUnit8Array` converts the given hex string to byte array.
 */
function toUint8Array(hex: string): Uint8Array {
  return hexToBytes(hex);
}

/**
 * `bytesToChangeID` creates a ChangeID from the given bytes.
 */
function bytesToChangeID(bytes: Uint8Array): ChangeID {
  const pbChangeID = PbChangeID.fromBinary(bytes);
  return fromChangeID(pbChangeID);
}

/**
 * `bytesToOperation` creates an Operation from the given bytes.
 */
function bytesToOperation(bytes: Uint8Array): Operation {
  const pbOperation = PbOperation.fromBinary(bytes);
  return fromOperation(pbOperation)!;
}

/**
 * `converter` is a converter that converts the given model to protobuf format.
 * is also used to convert models to bytes and vice versa.
 */
export const converter = {
  fromPresence,
  toChangePack,
  fromChangePack,
  fromChanges,
  toTreeNodes,
  fromTreeNodes,
  objectToBytes,
  bytesToObject,
  bytesToSnapshot,
  bytesToHex,
  hexToBytes,
  toHexString,
  toUint8Array,
  toOperation,
  toChangeID,
  PbChangeID,
  bytesToChangeID,
  bytesToOperation,
  versionVectorToHex,
  hexToVersionVector,
};
