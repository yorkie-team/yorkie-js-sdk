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

import Long from 'long';
import * as jspb from 'google-protobuf';
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
  ValueType as PbValueType,
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
import { traverse } from '../util/index_tree';
import { TreeStyleOperation } from '../document/operation/tree_style_operation';
import { RHT } from '../document/crdt/rht';

/**
 * `toPresence` converts the given model to Protobuf format.
 */
function toPresence(presence: Indexable): PbPresence {
  const pbPresence = new PbPresence();
  const pbDataMap = pbPresence.getDataMap();
  for (const [key, value] of Object.entries(presence)) {
    pbDataMap.set(key, JSON.stringify(value));
  }
  return pbPresence;
}

/**
 * `toPresenceChange` converts the given model to Protobuf format.
 */
function toPresenceChange(
  presenceChange: PresenceChange<Indexable>,
): PbPresenceChange {
  const pbPresenceChange = new PbPresenceChange();

  if (presenceChange.type === PresenceChangeType.Put) {
    pbPresenceChange.setType(PbPresenceChange.ChangeType.CHANGE_TYPE_PUT);
    pbPresenceChange.setPresence(toPresence(presenceChange.presence));
  } else if (presenceChange.type === PresenceChangeType.Clear) {
    pbPresenceChange.setType(PbPresenceChange.ChangeType.CHANGE_TYPE_CLEAR);
  }

  return pbPresenceChange;
}

/**
 * `toCheckpoint` converts the given model to Protobuf format.
 */
function toCheckpoint(checkpoint: Checkpoint): PbCheckpoint {
  const pbCheckpoint = new PbCheckpoint();
  pbCheckpoint.setServerSeq(checkpoint.getServerSeqAsString());
  pbCheckpoint.setClientSeq(checkpoint.getClientSeq());
  return pbCheckpoint;
}

/**
 * `toChangeID` converts the given model to Protobuf format.
 */
function toChangeID(changeID: ChangeID): PbChangeID {
  const pbChangeID = new PbChangeID();
  pbChangeID.setClientSeq(changeID.getClientSeq());
  pbChangeID.setLamport(changeID.getLamportAsString());
  pbChangeID.setActorId(toUint8Array(changeID.getActorID()!));
  return pbChangeID;
}

/**
 * `toTimeTicket` converts the given model to Protobuf format.
 */
function toTimeTicket(ticket?: TimeTicket): PbTimeTicket | undefined {
  if (!ticket) {
    return;
  }

  const pbTimeTicket = new PbTimeTicket();
  pbTimeTicket.setLamport(ticket.getLamportAsString());
  pbTimeTicket.setDelimiter(ticket.getDelimiter());
  pbTimeTicket.setActorId(toUint8Array(ticket.getActorID()!));
  return pbTimeTicket;
}

/**
 * `toValueType` converts the given model to Protobuf format.
 */
function toValueType(valueType: PrimitiveType): PbValueType {
  switch (valueType) {
    case PrimitiveType.Null:
      return PbValueType.VALUE_TYPE_NULL;
    case PrimitiveType.Boolean:
      return PbValueType.VALUE_TYPE_BOOLEAN;
    case PrimitiveType.Integer:
      return PbValueType.VALUE_TYPE_INTEGER;
    case PrimitiveType.Long:
      return PbValueType.VALUE_TYPE_LONG;
    case PrimitiveType.Double:
      return PbValueType.VALUE_TYPE_DOUBLE;
    case PrimitiveType.String:
      return PbValueType.VALUE_TYPE_STRING;
    case PrimitiveType.Bytes:
      return PbValueType.VALUE_TYPE_BYTES;
    case PrimitiveType.Date:
      return PbValueType.VALUE_TYPE_DATE;
    default:
      throw new YorkieError(Code.Unsupported, `unsupported type: ${valueType}`);
  }
}

/**
 * `toCounterType` converts the given model to Protobuf format.
 */
function toCounterType(valueType: CounterType): PbValueType {
  switch (valueType) {
    case CounterType.IntegerCnt:
      return PbValueType.VALUE_TYPE_INTEGER_CNT;
    case CounterType.LongCnt:
      return PbValueType.VALUE_TYPE_LONG_CNT;
    default:
      throw new YorkieError(Code.Unsupported, `unsupported type: ${valueType}`);
  }
}

/**
 * `toElementSimple` converts the given model to Protobuf format.
 */
function toElementSimple(element: CRDTElement): PbJSONElementSimple {
  const pbElementSimple = new PbJSONElementSimple();
  if (element instanceof CRDTObject) {
    pbElementSimple.setType(PbValueType.VALUE_TYPE_JSON_OBJECT);
    pbElementSimple.setCreatedAt(toTimeTicket(element.getCreatedAt()));
  } else if (element instanceof CRDTArray) {
    pbElementSimple.setType(PbValueType.VALUE_TYPE_JSON_ARRAY);
    pbElementSimple.setCreatedAt(toTimeTicket(element.getCreatedAt()));
  } else if (element instanceof CRDTText) {
    pbElementSimple.setType(PbValueType.VALUE_TYPE_TEXT);
    pbElementSimple.setCreatedAt(toTimeTicket(element.getCreatedAt()));
  } else if (element instanceof Primitive) {
    const primitive = element as Primitive;
    pbElementSimple.setType(toValueType(primitive.getType()));
    pbElementSimple.setCreatedAt(toTimeTicket(element.getCreatedAt()));
    pbElementSimple.setValue(element.toBytes());
  } else if (element instanceof CRDTCounter) {
    const counter = element as CRDTCounter;
    pbElementSimple.setType(toCounterType(counter.getType()));
    pbElementSimple.setCreatedAt(toTimeTicket(element.getCreatedAt()));
    pbElementSimple.setValue(element.toBytes());
  } else if (element instanceof CRDTTree) {
    const tree = element as CRDTTree;
    pbElementSimple.setType(PbValueType.VALUE_TYPE_TREE);
    pbElementSimple.setCreatedAt(toTimeTicket(element.getCreatedAt()));
    pbElementSimple.setValue(treeToBytes(tree));
  } else {
    throw new YorkieError(Code.Unimplemented, `unimplemented element`);
  }

  return pbElementSimple;
}

/**
 * `toTextNodeID` converts the given model to Protobuf format.
 */
function toTextNodeID(id: RGATreeSplitNodeID): PbTextNodeID {
  const pbTextNodeID = new PbTextNodeID();
  pbTextNodeID.setCreatedAt(toTimeTicket(id.getCreatedAt()));
  pbTextNodeID.setOffset(id.getOffset());
  return pbTextNodeID;
}

/**
 * `toTextNodePos` converts the given model to Protobuf format.
 */
function toTextNodePos(pos: RGATreeSplitPos): PbTextNodePos {
  const pbTextNodePos = new PbTextNodePos();
  pbTextNodePos.setCreatedAt(toTimeTicket(pos.getID().getCreatedAt()));
  pbTextNodePos.setOffset(pos.getID().getOffset());
  pbTextNodePos.setRelativeOffset(pos.getRelativeOffset());
  return pbTextNodePos;
}

/**
 * `toTreePos` converts the given model to Protobuf format.
 */
function toTreePos(pos: CRDTTreePos): PbTreePos {
  const pbTreePos = new PbTreePos();
  pbTreePos.setParentId(toTreeNodeID(pos.getParentID()));
  pbTreePos.setLeftSiblingId(toTreeNodeID(pos.getLeftSiblingID()));
  return pbTreePos;
}

/**
 * `toTreeNodeID` converts the given model to Protobuf format.
 */
function toTreeNodeID(treeNodeID: CRDTTreeNodeID): PbTreeNodeID {
  const pbTreeNodeID = new PbTreeNodeID();
  pbTreeNodeID.setCreatedAt(toTimeTicket(treeNodeID.getCreatedAt()));
  pbTreeNodeID.setOffset(treeNodeID.getOffset());
  return pbTreeNodeID;
}

/**
 * `toOperation` converts the given model to Protobuf format.
 */
function toOperation(operation: Operation): PbOperation {
  const pbOperation = new PbOperation();

  if (operation instanceof SetOperation) {
    const setOperation = operation as SetOperation;
    const pbSetOperation = new PbOperation.Set();
    pbSetOperation.setParentCreatedAt(
      toTimeTicket(setOperation.getParentCreatedAt()),
    );
    pbSetOperation.setKey(setOperation.getKey());
    pbSetOperation.setValue(toElementSimple(setOperation.getValue()));
    pbSetOperation.setExecutedAt(toTimeTicket(setOperation.getExecutedAt()));
    pbOperation.setSet(pbSetOperation);
  } else if (operation instanceof AddOperation) {
    const addOperation = operation as AddOperation;
    const pbAddOperation = new PbOperation.Add();
    pbAddOperation.setParentCreatedAt(
      toTimeTicket(addOperation.getParentCreatedAt()),
    );
    pbAddOperation.setPrevCreatedAt(
      toTimeTicket(addOperation.getPrevCreatedAt()),
    );
    pbAddOperation.setValue(toElementSimple(addOperation.getValue()));
    pbAddOperation.setExecutedAt(toTimeTicket(addOperation.getExecutedAt()));
    pbOperation.setAdd(pbAddOperation);
  } else if (operation instanceof MoveOperation) {
    const moveOperation = operation as MoveOperation;
    const pbMoveOperation = new PbOperation.Move();
    pbMoveOperation.setParentCreatedAt(
      toTimeTicket(moveOperation.getParentCreatedAt()),
    );
    pbMoveOperation.setPrevCreatedAt(
      toTimeTicket(moveOperation.getPrevCreatedAt()),
    );
    pbMoveOperation.setCreatedAt(toTimeTicket(moveOperation.getCreatedAt()));
    pbMoveOperation.setExecutedAt(toTimeTicket(moveOperation.getExecutedAt()));
    pbOperation.setMove(pbMoveOperation);
  } else if (operation instanceof RemoveOperation) {
    const removeOperation = operation as RemoveOperation;
    const pbRemoveOperation = new PbOperation.Remove();
    pbRemoveOperation.setParentCreatedAt(
      toTimeTicket(removeOperation.getParentCreatedAt()),
    );
    pbRemoveOperation.setCreatedAt(
      toTimeTicket(removeOperation.getCreatedAt()),
    );
    pbRemoveOperation.setExecutedAt(
      toTimeTicket(removeOperation.getExecutedAt()),
    );
    pbOperation.setRemove(pbRemoveOperation);
  } else if (operation instanceof EditOperation) {
    const editOperation = operation as EditOperation;
    const pbEditOperation = new PbOperation.Edit();
    pbEditOperation.setParentCreatedAt(
      toTimeTicket(editOperation.getParentCreatedAt()),
    );
    pbEditOperation.setFrom(toTextNodePos(editOperation.getFromPos()));
    pbEditOperation.setTo(toTextNodePos(editOperation.getToPos()));
    const pbCreatedAtMapByActor = pbEditOperation.getCreatedAtMapByActorMap();
    for (const [key, value] of editOperation.getMaxCreatedAtMapByActor()) {
      pbCreatedAtMapByActor.set(key, toTimeTicket(value)!);
    }
    pbEditOperation.setContent(editOperation.getContent());
    const pbAttributes = pbEditOperation.getAttributesMap();
    for (const [key, value] of editOperation.getAttributes()) {
      pbAttributes.set(key, value);
    }
    pbEditOperation.setExecutedAt(toTimeTicket(editOperation.getExecutedAt()));
    pbOperation.setEdit(pbEditOperation);
  } else if (operation instanceof StyleOperation) {
    const styleOperation = operation as StyleOperation;
    const pbStyleOperation = new PbOperation.Style();
    pbStyleOperation.setParentCreatedAt(
      toTimeTicket(styleOperation.getParentCreatedAt()),
    );
    pbStyleOperation.setFrom(toTextNodePos(styleOperation.getFromPos()));
    pbStyleOperation.setTo(toTextNodePos(styleOperation.getToPos()));
    const pbAttributes = pbStyleOperation.getAttributesMap();
    for (const [key, value] of styleOperation.getAttributes()) {
      pbAttributes.set(key, value);
    }
    pbStyleOperation.setExecutedAt(
      toTimeTicket(styleOperation.getExecutedAt()),
    );
    pbOperation.setStyle(pbStyleOperation);
  } else if (operation instanceof IncreaseOperation) {
    const increaseOperation = operation as IncreaseOperation;
    const pbIncreaseOperation = new PbOperation.Increase();
    pbIncreaseOperation.setParentCreatedAt(
      toTimeTicket(increaseOperation.getParentCreatedAt()),
    );
    pbIncreaseOperation.setValue(toElementSimple(increaseOperation.getValue()));
    pbIncreaseOperation.setExecutedAt(
      toTimeTicket(increaseOperation.getExecutedAt()),
    );
    pbOperation.setIncrease(pbIncreaseOperation);
  } else if (operation instanceof TreeEditOperation) {
    const treeEditOperation = operation as TreeEditOperation;
    const pbTreeEditOperation = new PbOperation.TreeEdit();
    const pbCreatedAtMapByActor =
      pbTreeEditOperation.getCreatedAtMapByActorMap();
    for (const [key, value] of treeEditOperation.getMaxCreatedAtMapByActor()) {
      pbCreatedAtMapByActor.set(key, toTimeTicket(value)!);
    }
    pbTreeEditOperation.setParentCreatedAt(
      toTimeTicket(treeEditOperation.getParentCreatedAt()),
    );
    pbTreeEditOperation.setFrom(toTreePos(treeEditOperation.getFromPos()));
    pbTreeEditOperation.setTo(toTreePos(treeEditOperation.getToPos()));
    pbTreeEditOperation.setContentsList(
      toTreeNodesWhenEdit(treeEditOperation.getContents()!),
    );
    pbTreeEditOperation.setExecutedAt(
      toTimeTicket(treeEditOperation.getExecutedAt()),
    );
    pbOperation.setTreeEdit(pbTreeEditOperation);
  } else if (operation instanceof TreeStyleOperation) {
    const treeStyleOperation = operation as TreeStyleOperation;
    const pbTreeStyleOperation = new PbOperation.TreeStyle();
    pbTreeStyleOperation.setParentCreatedAt(
      toTimeTicket(treeStyleOperation.getParentCreatedAt()),
    );
    pbTreeStyleOperation.setFrom(toTreePos(treeStyleOperation.getFromPos()));
    pbTreeStyleOperation.setTo(toTreePos(treeStyleOperation.getToPos()));

    const attributesMap = pbTreeStyleOperation.getAttributesMap();

    for (const [key, value] of treeStyleOperation.getAttributes()) {
      attributesMap.set(key, value);
    }
    pbTreeStyleOperation.setExecutedAt(
      toTimeTicket(treeStyleOperation.getExecutedAt()),
    );
    pbOperation.setTreeStyle(pbTreeStyleOperation);
  } else {
    throw new YorkieError(Code.Unimplemented, 'unimplemented operation');
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
  const pbChange = new PbChange();
  pbChange.setId(toChangeID(change.getID()));
  pbChange.setMessage(change.getMessage()!);
  if (change.hasOperations()) {
    pbChange.setOperationsList(toOperations(change.getOperations()));
  }
  if (change.hasPresenceChange()) {
    pbChange.setPresenceChange(toPresenceChange(change.getPresenceChange()!));
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
    const pbRHTNode = new PbRHTNode();
    pbRHTNode.setKey(rhtNode.getStrKey());
    // eslint-disable-next-line
    pbRHTNode.setElement(toElement(rhtNode.getValue()));
    pbRHTNodes.push(pbRHTNode);
  }

  return pbRHTNodes;
}

/**
 * `toRGANodes` converts the given model to Protobuf format.
 */
function toRGANodes(rgaTreeList: RGATreeList): Array<PbRGANode> {
  const pbRGANodes = [];
  for (const rgaTreeListNode of rgaTreeList) {
    const pbRGANode = new PbRGANode();
    // eslint-disable-next-line
    pbRGANode.setElement(toElement(rgaTreeListNode.getValue()));
    pbRGANodes.push(pbRGANode);
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
    pbTextNode.setId(toTextNodeID(textNode.getID()));
    pbTextNode.setValue(textNode.getValue().getContent());
    pbTextNode.setRemovedAt(toTimeTicket(textNode.getRemovedAt()));

    const pbNodeAttrsMap = pbTextNode.getAttributesMap();
    const attrs = textNode.getValue().getAttrs();
    for (const attr of attrs) {
      const pbNodeAttr = new PbNodeAttr();
      pbNodeAttr.setValue(attr.getValue());
      pbNodeAttr.setUpdatedAt(toTimeTicket(attr.getUpdatedAt()));
      pbNodeAttrsMap.set(attr.getKey(), pbNodeAttr);
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

  nodes.forEach((node) => {
    const pbTreeNodes = new PbTreeNodes();
    pbTreeNodes.setContentList(toTreeNodes(node));
    pbTreeNodesList.push(pbTreeNodes);
  });

  return pbTreeNodesList;
}

/**
 * `toTreeNodes` converts the given model to Protobuf format.
 */
function toTreeNodes(node: CRDTTreeNode): Array<PbTreeNode> {
  if (!node) {
    return [];
  }

  const pbTreeNodes: Array<PbTreeNode> = [];
  traverse(node, (n, depth) => {
    const pbTreeNode = new PbTreeNode();
    pbTreeNode.setId(toTreeNodeID(n.id));
    pbTreeNode.setType(n.type);
    if (n.isText) {
      pbTreeNode.setValue(n.value);
    }
    if (n.insPrevID) {
      pbTreeNode.setInsPrevId(toTreeNodeID(n.insPrevID));
    }
    if (n.insNextID) {
      pbTreeNode.setInsNextId(toTreeNodeID(n.insNextID));
    }

    pbTreeNode.setRemovedAt(toTimeTicket(n.removedAt));
    pbTreeNode.setDepth(depth);

    if (n.attrs) {
      const pbNodeAttrsMap = pbTreeNode.getAttributesMap();
      for (const attr of n.attrs) {
        const pbNodeAttr = new PbNodeAttr();
        pbNodeAttr.setValue(attr.getValue());
        pbNodeAttr.setUpdatedAt(toTimeTicket(attr.getUpdatedAt()));
        pbNodeAttrsMap.set(attr.getKey(), pbNodeAttr);
      }
    }

    pbTreeNodes.push(pbTreeNode);
  });

  return pbTreeNodes;
}

/**
 * `toObject` converts the given model to Protobuf format.
 */
function toObject(obj: CRDTObject): PbJSONElement {
  const pbObject = new PbJSONElement.JSONObject();
  pbObject.setNodesList(toRHTNodes(obj.getRHT()));
  pbObject.setCreatedAt(toTimeTicket(obj.getCreatedAt()));
  pbObject.setMovedAt(toTimeTicket(obj.getMovedAt()));
  pbObject.setRemovedAt(toTimeTicket(obj.getRemovedAt()));

  const pbElement = new PbJSONElement();
  pbElement.setJsonObject(pbObject);
  return pbElement;
}

/**
 * `toArray` converts the given model to Protobuf format.
 */
function toArray(arr: CRDTArray): PbJSONElement {
  const pbArray = new PbJSONElement.JSONArray();
  pbArray.setNodesList(toRGANodes(arr.getElements()));
  pbArray.setCreatedAt(toTimeTicket(arr.getCreatedAt()));
  pbArray.setMovedAt(toTimeTicket(arr.getMovedAt()));
  pbArray.setRemovedAt(toTimeTicket(arr.getRemovedAt()));

  const pbElement = new PbJSONElement();
  pbElement.setJsonArray(pbArray);
  return pbElement;
}

/**
 * `toPrimitive` converts the given model to Protobuf format.
 */
function toPrimitive(primitive: Primitive): PbJSONElement {
  const pbPrimitive = new PbJSONElement.Primitive();
  pbPrimitive.setType(toValueType(primitive.getType()));
  pbPrimitive.setValue(primitive.toBytes());
  pbPrimitive.setCreatedAt(toTimeTicket(primitive.getCreatedAt()));
  pbPrimitive.setMovedAt(toTimeTicket(primitive.getMovedAt()));
  pbPrimitive.setRemovedAt(toTimeTicket(primitive.getRemovedAt()));

  const pbElement = new PbJSONElement();
  pbElement.setPrimitive(pbPrimitive);
  return pbElement;
}

/**
 * `toText` converts the given model to Protobuf format.
 */
function toText(text: CRDTText<Record<string, any>>): PbJSONElement {
  const pbText = new PbJSONElement.Text();
  pbText.setNodesList(toTextNodes(text.getRGATreeSplit()));
  pbText.setCreatedAt(toTimeTicket(text.getCreatedAt()));
  pbText.setMovedAt(toTimeTicket(text.getMovedAt()));
  pbText.setRemovedAt(toTimeTicket(text.getRemovedAt()));

  const pbElement = new PbJSONElement();
  pbElement.setText(pbText);
  return pbElement;
}

/**
 * `toCounter` converts the given model to Protobuf format.
 */
function toCounter(counter: CRDTCounter): PbJSONElement {
  const pbCounter = new PbJSONElement.Counter();
  pbCounter.setType(toCounterType(counter.getType()));
  pbCounter.setValue(counter.toBytes());
  pbCounter.setCreatedAt(toTimeTicket(counter.getCreatedAt()));
  pbCounter.setMovedAt(toTimeTicket(counter.getMovedAt()));
  pbCounter.setRemovedAt(toTimeTicket(counter.getRemovedAt()));

  const pbElement = new PbJSONElement();
  pbElement.setCounter(pbCounter);
  return pbElement;
}

/**
 * `toTree` converts the given model to Protobuf format.
 */
function toTree(tree: CRDTTree): PbJSONElement {
  const pbTree = new PbJSONElement.Tree();
  pbTree.setNodesList(toTreeNodes(tree.getRoot()));
  pbTree.setCreatedAt(toTimeTicket(tree.getCreatedAt()));
  pbTree.setMovedAt(toTimeTicket(tree.getMovedAt()));
  pbTree.setRemovedAt(toTimeTicket(tree.getRemovedAt()));

  const pbElement = new PbJSONElement();
  pbElement.setTree(pbTree);
  return pbElement;
}

/**
 * `toElement` converts the given model to Protobuf format.
 */
function toElement(element: CRDTElement): PbJSONElement {
  if (element instanceof CRDTObject) {
    return toObject(element);
  } else if (element instanceof CRDTArray) {
    return toArray(element);
  } else if (element instanceof Primitive) {
    return toPrimitive(element);
  } else if (element instanceof CRDTText) {
    return toText(element);
  } else if (element instanceof CRDTCounter) {
    return toCounter(element);
  } else if (element instanceof CRDTTree) {
    return toTree(element);
  } else {
    throw new YorkieError(Code.Unimplemented, `unimplemented element`);
  }
}

/**
 * `toChangePack` converts the given model to Protobuf format.
 */
function toChangePack(pack: ChangePack<Indexable>): PbChangePack {
  const pbChangePack = new PbChangePack();
  pbChangePack.setDocumentKey(pack.getDocumentKey());
  pbChangePack.setCheckpoint(toCheckpoint(pack.getCheckpoint()));
  pbChangePack.setIsRemoved(pack.getIsRemoved());
  pbChangePack.setChangesList(toChanges(pack.getChanges()));
  pbChangePack.setSnapshot(pack.getSnapshot()!);
  pbChangePack.setMinSyncedTicket(toTimeTicket(pack.getMinSyncedTicket()));
  return pbChangePack;
}

/**
 * `fromChangeID` converts the given Protobuf format to model format.
 */
function fromChangeID(pbChangeID: PbChangeID): ChangeID {
  return ChangeID.of(
    pbChangeID.getClientSeq(),
    Long.fromString(pbChangeID.getLamport(), true),
    toHexString(pbChangeID.getActorId_asU8()),
  );
}

/**
 * `fromTimeTicket` converts the given Protobuf format to model format.
 */
function fromTimeTicket(pbTimeTicket?: PbTimeTicket): TimeTicket | undefined {
  if (!pbTimeTicket) {
    return;
  }

  return TimeTicket.of(
    Long.fromString(pbTimeTicket.getLamport(), true),
    pbTimeTicket.getDelimiter(),
    toHexString(pbTimeTicket.getActorId_asU8()),
  );
}

/**
 * `fromPresence` converts the given Protobuf format to model format.
 */
function fromPresence<P extends Indexable>(pbPresence: PbPresence): P {
  const data: Record<string, string> = {};
  pbPresence.getDataMap().forEach((value: string, key: string) => {
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
  const type = pbPresenceChange.getType();

  if (type === PbPresenceChange.ChangeType.CHANGE_TYPE_PUT) {
    const presence = fromPresence<P>(pbPresenceChange.getPresence()!);
    return {
      type: PresenceChangeType.Put,
      presence,
    };
  } else if (type === PbPresenceChange.ChangeType.CHANGE_TYPE_CLEAR) {
    return {
      type: PresenceChangeType.Clear,
    };
  } else {
    throw new YorkieError(Code.Unsupported, `unsupported type: ${type}`);
  }
}

/**
 * `fromPresences` converts the given Protobuf format to model format.
 */
function fromPresences<P extends Indexable>(
  pbPresences: jspb.Map<string, PbPresence>,
): Map<ActorID, P> {
  const presences = new Map<ActorID, P>();
  pbPresences.forEach((pbPresence: PbPresence, actorID: string) => {
    presences.set(actorID, fromPresence(pbPresence));
  });
  return presences;
}

/**
 * `fromValueType` converts the given Protobuf format to model format.
 */
function fromValueType(pbValueType: PbValueType): PrimitiveType {
  switch (pbValueType) {
    case PbValueType.VALUE_TYPE_NULL:
      return PrimitiveType.Null;
    case PbValueType.VALUE_TYPE_BOOLEAN:
      return PrimitiveType.Boolean;
    case PbValueType.VALUE_TYPE_INTEGER:
      return PrimitiveType.Integer;
    case PbValueType.VALUE_TYPE_LONG:
      return PrimitiveType.Long;
    case PbValueType.VALUE_TYPE_DOUBLE:
      return PrimitiveType.Double;
    case PbValueType.VALUE_TYPE_STRING:
      return PrimitiveType.String;
    case PbValueType.VALUE_TYPE_BYTES:
      return PrimitiveType.Bytes;
    case PbValueType.VALUE_TYPE_DATE:
      return PrimitiveType.Date;
  }
  throw new YorkieError(
    Code.Unimplemented,
    `unimplemented value type: ${pbValueType}`,
  );
}

/**
 * `fromCounterType` converts the given Protobuf format to model format.
 */
function fromCounterType(pbValueType: PbValueType): CounterType {
  switch (pbValueType) {
    case PbValueType.VALUE_TYPE_INTEGER_CNT:
      return CounterType.IntegerCnt;
    case PbValueType.VALUE_TYPE_LONG_CNT:
      return CounterType.LongCnt;
  }
  throw new YorkieError(
    Code.Unimplemented,
    `unimplemented value type: ${pbValueType}`,
  );
}

/**
 * `fromElementSimple` converts the given Protobuf format to model format.
 */
function fromElementSimple(pbElementSimple: PbJSONElementSimple): CRDTElement {
  switch (pbElementSimple.getType()) {
    case PbValueType.VALUE_TYPE_JSON_OBJECT:
      return CRDTObject.create(fromTimeTicket(pbElementSimple.getCreatedAt())!);
    case PbValueType.VALUE_TYPE_JSON_ARRAY:
      return CRDTArray.create(fromTimeTicket(pbElementSimple.getCreatedAt())!);
    case PbValueType.VALUE_TYPE_TEXT:
      return CRDTText.create(
        RGATreeSplit.create(),
        fromTimeTicket(pbElementSimple.getCreatedAt())!,
      );
    case PbValueType.VALUE_TYPE_TREE:
      return bytesToTree(pbElementSimple.getValue_asU8())!;
    case PbValueType.VALUE_TYPE_NULL:
    case PbValueType.VALUE_TYPE_BOOLEAN:
    case PbValueType.VALUE_TYPE_INTEGER:
    case PbValueType.VALUE_TYPE_LONG:
    case PbValueType.VALUE_TYPE_DOUBLE:
    case PbValueType.VALUE_TYPE_STRING:
    case PbValueType.VALUE_TYPE_BYTES:
    case PbValueType.VALUE_TYPE_DATE:
      return Primitive.of(
        Primitive.valueFromBytes(
          fromValueType(pbElementSimple.getType()),
          pbElementSimple.getValue_asU8(),
        ),
        fromTimeTicket(pbElementSimple.getCreatedAt())!,
      );
    case PbValueType.VALUE_TYPE_INTEGER_CNT:
    case PbValueType.VALUE_TYPE_LONG_CNT:
      return CRDTCounter.create(
        fromCounterType(pbElementSimple.getType()),
        CRDTCounter.valueFromBytes(
          fromCounterType(pbElementSimple.getType()),
          pbElementSimple.getValue_asU8(),
        ),
        fromTimeTicket(pbElementSimple.getCreatedAt())!,
      );
  }
}

/**
 * `fromTextNodePos` converts the given Protobuf format to model format.
 */
function fromTextNodePos(pbTextNodePos: PbTextNodePos): RGATreeSplitPos {
  return RGATreeSplitPos.of(
    RGATreeSplitNodeID.of(
      fromTimeTicket(pbTextNodePos.getCreatedAt())!,
      pbTextNodePos.getOffset(),
    ),
    pbTextNodePos.getRelativeOffset(),
  );
}

/**
 * `fromTextNodeID` converts the given Protobuf format to model format.
 */
function fromTextNodeID(pbTextNodeID: PbTextNodeID): RGATreeSplitNodeID {
  return RGATreeSplitNodeID.of(
    fromTimeTicket(pbTextNodeID.getCreatedAt())!,
    pbTextNodeID.getOffset(),
  );
}

/**
 * `fromTextNode` converts the given Protobuf format to model format.
 */
function fromTextNode(pbTextNode: PbTextNode): RGATreeSplitNode<CRDTTextValue> {
  const textValue = CRDTTextValue.create(pbTextNode.getValue());
  pbTextNode.getAttributesMap().forEach((value, key) => {
    textValue.setAttr(
      key,
      value.getValue(),
      fromTimeTicket(value.getUpdatedAt())!,
    );
  });

  const textNode = RGATreeSplitNode.create(
    fromTextNodeID(pbTextNode.getId()!),
    textValue,
  );
  textNode.remove(fromTimeTicket(pbTextNode.getRemovedAt()));
  return textNode;
}

/**
 * `fromTreePos` converts the given Protobuf format to model format.
 */
function fromTreePos(pbTreePos: PbTreePos): CRDTTreePos {
  return CRDTTreePos.of(
    fromTreeNodeID(pbTreePos.getParentId()!),
    fromTreeNodeID(pbTreePos.getLeftSiblingId()!),
  );
}

/**
 * `fromTreeNodeID` converts the given Protobuf format to model format.
 */
function fromTreeNodeID(pbTreeNodeID: PbTreeNodeID): CRDTTreeNodeID {
  return CRDTTreeNodeID.of(
    fromTimeTicket(pbTreeNodeID.getCreatedAt())!,
    pbTreeNodeID.getOffset(),
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
    const treeNode = fromTreeNodes(node.getContentList());
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
  for (let i = nodes.length - 2; i >= 0; i--) {
    let parent: CRDTTreeNode;
    for (let j = i + 1; j < nodes.length; j++) {
      if (pbTreeNodes[i].getDepth() - 1 === pbTreeNodes[j].getDepth()) {
        parent = nodes[j];
        break;
      }
    }

    parent!.prepend(nodes[i]);
  }

  // build CRDTTree from the root to construct the links between nodes.
  return CRDTTree.create(root, InitialTimeTicket).getRoot();
}

/**
 * `fromTreeNode` converts the given Protobuf format to model format.
 */
function fromTreeNode(pbTreeNode: PbTreeNode): CRDTTreeNode {
  const id = fromTreeNodeID(pbTreeNode.getId()!);
  const node = CRDTTreeNode.create(id, pbTreeNode.getType());
  if (node.isText) {
    node.value = pbTreeNode.getValue();
  } else {
    const attrs = RHT.create();
    pbTreeNode.getAttributesMap().forEach((value, key) => {
      attrs.set(key, value.getValue(), fromTimeTicket(value.getUpdatedAt())!);
    });
    node.attrs = attrs;
  }

  if (pbTreeNode.hasInsPrevId()) {
    node.insPrevID = fromTreeNodeID(pbTreeNode.getInsPrevId()!);
  }

  if (pbTreeNode.hasInsNextId()) {
    node.insNextID = fromTreeNodeID(pbTreeNode.getInsNextId()!);
  }

  node.removedAt = fromTimeTicket(pbTreeNode.getRemovedAt());

  return node;
}

/**
 * `fromOperations` converts the given Protobuf format to model format.
 */
function fromOperations(pbOperations: Array<PbOperation>): Array<Operation> {
  const operations = [];

  for (const pbOperation of pbOperations) {
    let operation: Operation;
    if (pbOperation.hasSet()) {
      const pbSetOperation = pbOperation.getSet();
      operation = SetOperation.create(
        pbSetOperation!.getKey(),
        fromElementSimple(pbSetOperation!.getValue()!),
        fromTimeTicket(pbSetOperation!.getParentCreatedAt())!,
        fromTimeTicket(pbSetOperation!.getExecutedAt())!,
      );
    } else if (pbOperation.hasAdd()) {
      const pbAddOperation = pbOperation.getAdd();
      operation = AddOperation.create(
        fromTimeTicket(pbAddOperation!.getParentCreatedAt())!,
        fromTimeTicket(pbAddOperation!.getPrevCreatedAt())!,
        fromElementSimple(pbAddOperation!.getValue()!),
        fromTimeTicket(pbAddOperation!.getExecutedAt())!,
      );
    } else if (pbOperation.hasMove()) {
      const pbMoveOperation = pbOperation.getMove();
      operation = MoveOperation.create(
        fromTimeTicket(pbMoveOperation!.getParentCreatedAt())!,
        fromTimeTicket(pbMoveOperation!.getPrevCreatedAt())!,
        fromTimeTicket(pbMoveOperation!.getCreatedAt())!,
        fromTimeTicket(pbMoveOperation!.getExecutedAt())!,
      );
    } else if (pbOperation.hasRemove()) {
      const pbRemoveOperation = pbOperation.getRemove();
      operation = RemoveOperation.create(
        fromTimeTicket(pbRemoveOperation!.getParentCreatedAt())!,
        fromTimeTicket(pbRemoveOperation!.getCreatedAt())!,
        fromTimeTicket(pbRemoveOperation!.getExecutedAt())!,
      );
    } else if (pbOperation.hasEdit()) {
      const pbEditOperation = pbOperation.getEdit();
      const createdAtMapByActor = new Map();
      pbEditOperation!.getCreatedAtMapByActorMap().forEach((value, key) => {
        createdAtMapByActor.set(key, fromTimeTicket(value));
      });
      const attributes = new Map();
      pbEditOperation!.getAttributesMap().forEach((value, key) => {
        attributes.set(key, value);
      });
      operation = EditOperation.create(
        fromTimeTicket(pbEditOperation!.getParentCreatedAt())!,
        fromTextNodePos(pbEditOperation!.getFrom()!),
        fromTextNodePos(pbEditOperation!.getTo()!),
        createdAtMapByActor,
        pbEditOperation!.getContent(),
        attributes,
        fromTimeTicket(pbEditOperation!.getExecutedAt())!,
      );
    } else if (pbOperation.hasStyle()) {
      const pbStyleOperation = pbOperation.getStyle();
      const attributes = new Map();
      pbStyleOperation!.getAttributesMap().forEach((value, key) => {
        attributes.set(key, value);
      });
      operation = StyleOperation.create(
        fromTimeTicket(pbStyleOperation!.getParentCreatedAt())!,
        fromTextNodePos(pbStyleOperation!.getFrom()!),
        fromTextNodePos(pbStyleOperation!.getTo()!),
        attributes,
        fromTimeTicket(pbStyleOperation!.getExecutedAt())!,
      );
    } else if (pbOperation.hasSelect()) {
      // TODO(hackerwins): Select is deprecated.
      continue;
    } else if (pbOperation.hasIncrease()) {
      const pbIncreaseOperation = pbOperation.getIncrease();
      operation = IncreaseOperation.create(
        fromTimeTicket(pbIncreaseOperation!.getParentCreatedAt())!,
        fromElementSimple(pbIncreaseOperation!.getValue()!),
        fromTimeTicket(pbIncreaseOperation!.getExecutedAt())!,
      );
    } else if (pbOperation.hasTreeEdit()) {
      const pbTreeEditOperation = pbOperation.getTreeEdit();
      const createdAtMapByActor = new Map();
      pbTreeEditOperation!.getCreatedAtMapByActorMap().forEach((value, key) => {
        createdAtMapByActor.set(key, fromTimeTicket(value));
      });
      operation = TreeEditOperation.create(
        fromTimeTicket(pbTreeEditOperation!.getParentCreatedAt())!,
        fromTreePos(pbTreeEditOperation!.getFrom()!),
        fromTreePos(pbTreeEditOperation!.getTo()!),
        createdAtMapByActor,
        fromTreeNodesWhenEdit(pbTreeEditOperation!.getContentsList()),
        fromTimeTicket(pbTreeEditOperation!.getExecutedAt())!,
      );
    } else if (pbOperation.hasTreeStyle()) {
      const pbTreeStyleOperation = pbOperation.getTreeStyle();
      const attributes = new Map();

      pbTreeStyleOperation!.getAttributesMap().forEach((value, key) => {
        attributes.set(key, value);
      });
      operation = TreeStyleOperation.create(
        fromTimeTicket(pbTreeStyleOperation!.getParentCreatedAt())!,
        fromTreePos(pbTreeStyleOperation!.getFrom()!),
        fromTreePos(pbTreeStyleOperation!.getTo()!),
        attributes,
        fromTimeTicket(pbTreeStyleOperation!.getExecutedAt())!,
      );
    } else {
      throw new YorkieError(Code.Unimplemented, `unimplemented operation`);
    }

    operations.push(operation);
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
        id: fromChangeID(pbChange.getId()!),
        operations: fromOperations(pbChange.getOperationsList()),
        presenceChange: pbChange.hasPresenceChange()
          ? fromPresenceChange(pbChange.getPresenceChange()!)
          : undefined,
        message: pbChange.getMessage(),
      }),
    );
  }

  return changes;
}

/**
 * `fromCheckpoint` converts the given Protobuf format to model format.
 */
function fromCheckpoint(pbCheckpoint: PbCheckpoint): Checkpoint {
  return Checkpoint.of(
    Long.fromString(pbCheckpoint.getServerSeq(), true),
    pbCheckpoint.getClientSeq(),
  );
}

/**
 * `fromChangePack` converts the given Protobuf format to model format.
 */
function fromChangePack<P extends Indexable>(
  pbPack: PbChangePack,
): ChangePack<P> {
  return ChangePack.create<P>(
    pbPack.getDocumentKey()!,
    fromCheckpoint(pbPack.getCheckpoint()!),
    pbPack.getIsRemoved(),
    fromChanges(pbPack.getChangesList()),
    pbPack.getSnapshot_asU8(),
    fromTimeTicket(pbPack.getMinSyncedTicket()),
  );
}

/**
 * `fromObject` converts the given Protobuf format to model format.
 */
function fromObject(pbObject: PbJSONElement.JSONObject): CRDTObject {
  const rht = new ElementRHT();
  for (const pbRHTNode of pbObject.getNodesList()) {
    // eslint-disable-next-line
    rht.set(pbRHTNode.getKey(), fromElement(pbRHTNode.getElement()!));
  }

  const obj = new CRDTObject(fromTimeTicket(pbObject.getCreatedAt())!, rht);
  obj.setMovedAt(fromTimeTicket(pbObject.getMovedAt()));
  obj.setRemovedAt(fromTimeTicket(pbObject.getRemovedAt()));
  return obj;
}

/**
 * `fromArray` converts the given Protobuf format to model format.
 */
function fromArray(pbArray: PbJSONElement.JSONArray): CRDTArray {
  const rgaTreeList = new RGATreeList();
  for (const pbRGANode of pbArray.getNodesList()) {
    // eslint-disable-next-line
    rgaTreeList.insert(fromElement(pbRGANode.getElement()!));
  }

  const arr = new CRDTArray(
    fromTimeTicket(pbArray.getCreatedAt())!,
    rgaTreeList,
  );
  arr.setMovedAt(fromTimeTicket(pbArray.getMovedAt()));
  arr.setRemovedAt(fromTimeTicket(pbArray.getRemovedAt()));
  return arr;
}

/**
 * `fromPrimitive` converts the given Protobuf format to model format.
 */
function fromPrimitive(pbPrimitive: PbJSONElement.Primitive): Primitive {
  const primitive = Primitive.of(
    Primitive.valueFromBytes(
      fromValueType(pbPrimitive.getType()),
      pbPrimitive.getValue_asU8(),
    ),
    fromTimeTicket(pbPrimitive.getCreatedAt())!,
  );
  primitive.setMovedAt(fromTimeTicket(pbPrimitive.getMovedAt()));
  primitive.setRemovedAt(fromTimeTicket(pbPrimitive.getRemovedAt()));
  return primitive;
}

/**
 * `fromText` converts the given Protobuf format to model format.
 */
function fromText<A extends Indexable>(
  pbText: PbJSONElement.Text,
): CRDTText<A> {
  const rgaTreeSplit = new RGATreeSplit<CRDTTextValue>();

  let prev = rgaTreeSplit.getHead();
  for (const pbNode of pbText.getNodesList()) {
    const current = rgaTreeSplit.insertAfter(prev, fromTextNode(pbNode));
    if (pbNode.hasInsPrevId()) {
      current.setInsPrev(
        rgaTreeSplit.findNode(fromTextNodeID(pbNode.getInsPrevId()!)),
      );
    }
    prev = current;
  }
  const text = new CRDTText<A>(
    rgaTreeSplit,
    fromTimeTicket(pbText.getCreatedAt())!,
  );
  text.setMovedAt(fromTimeTicket(pbText.getMovedAt()));
  text.setRemovedAt(fromTimeTicket(pbText.getRemovedAt()));
  return text;
}

/**
 * `fromCounter` converts the given Protobuf format to model format.
 */
function fromCounter(pbCounter: PbJSONElement.Counter): CRDTCounter {
  const counter = CRDTCounter.create(
    fromCounterType(pbCounter.getType()),
    CRDTCounter.valueFromBytes(
      fromCounterType(pbCounter.getType()),
      pbCounter.getValue_asU8(),
    ),
    fromTimeTicket(pbCounter.getCreatedAt())!,
  );
  counter.setMovedAt(fromTimeTicket(pbCounter.getMovedAt()));
  counter.setRemovedAt(fromTimeTicket(pbCounter.getRemovedAt()));
  return counter;
}

/**
 * `fromTree` converts the given Protobuf format to model format.
 */
function fromTree(pbTree: PbJSONElement.Tree): CRDTTree {
  const root = fromTreeNodes(pbTree.getNodesList());
  return CRDTTree.create(root!, fromTimeTicket(pbTree.getCreatedAt())!);
}

/**
 * `fromElement` converts the given Protobuf format to model format.
 */
function fromElement(pbElement: PbJSONElement): CRDTElement {
  if (pbElement.hasJsonObject()) {
    return fromObject(pbElement.getJsonObject()!);
  } else if (pbElement.hasJsonArray()) {
    return fromArray(pbElement.getJsonArray()!);
  } else if (pbElement.hasPrimitive()) {
    return fromPrimitive(pbElement.getPrimitive()!);
  } else if (pbElement.hasText()) {
    return fromText(pbElement.getText()!);
  } else if (pbElement.hasCounter()) {
    return fromCounter(pbElement.getCounter()!);
  } else if (pbElement.hasTree()) {
    return fromTree(pbElement.getTree()!);
  } else {
    throw new YorkieError(Code.Unimplemented, `unimplemented element`);
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

  const snapshot = PbSnapshot.deserializeBinary(bytes);
  return {
    root: fromElement(snapshot.getRoot()!) as CRDTObject,
    presences: fromPresences<P>(snapshot.getPresencesMap()),
  };
}

/**
 * `bytesToObject` creates an JSONObject from the given byte array.
 */
function bytesToObject(bytes?: Uint8Array): CRDTObject {
  if (!bytes) {
    return CRDTObject.create(InitialTimeTicket);
  }

  const pbElement = PbJSONElement.deserializeBinary(bytes);
  return fromObject(pbElement.getJsonObject()!);
}

/**
 * `objectToBytes` converts the given JSONObject to byte array.
 */
function objectToBytes(obj: CRDTObject): Uint8Array {
  return toElement(obj).serializeBinary();
}

/**
 * `bytesToTree` creates an CRDTTree from the given bytes.
 */
function bytesToTree(bytes?: Uint8Array): CRDTTree {
  if (!bytes) {
    throw new Error('bytes is empty');
  }

  const pbElement = PbJSONElement.deserializeBinary(bytes);
  return fromTree(pbElement.getTree()!);
}

/**
 * `treeToBytes` converts the given tree to bytes.
 */
function treeToBytes(tree: CRDTTree): Uint8Array {
  return toTree(tree).serializeBinary();
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
 * `converter` is a converter that converts the given model to protobuf format.
 * is also used to convert models to bytes and vice versa.
 */
export const converter = {
  fromPresence,
  toChangePack,
  fromChangePack,
  fromChanges,
  objectToBytes,
  bytesToObject,
  bytesToSnapshot,
  toHexString,
  toUint8Array,
};
