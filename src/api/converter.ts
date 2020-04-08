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

import Long from 'long';

import { Code, YorkieError } from '../util/error';
import { TimeTicket, InitialTimeTicket } from '../document/time/ticket';
import { Operation } from '../document/operation/operation';
import { SetOperation } from '../document/operation/set_operation';
import { AddOperation } from '../document/operation/add_operation';
import { RemoveOperation } from '../document/operation/remove_operation';
import { EditOperation } from '../document/operation/edit_operation';
import { SelectOperation } from '../document/operation/select_operation';
import { DocumentKey } from '../document/key/document_key';
import { ChangeID } from '../document/change/change_id';
import { Change } from '../document/change/change';
import { ChangePack } from '../document/change/change_pack';
import { Checkpoint } from '../document/checkpoint/checkpoint';
import { RHT } from '../document/json/rht';
import { RGATreeList } from '../document/json/rga_tree_list';
import { JSONElement } from '../document/json/element';
import { JSONObject } from '../document/json/object';
import { JSONArray } from '../document/json/array';
import { TextNodeID, TextNodePos, TextNode, RGATreeSplit, PlainText } from '../document/json/text';
import { JSONPrimitive, PrimitiveType } from '../document/json/primitive';
import {
  ChangePack as PbChangePack,
  DocumentKey as PbDocumentKey,
  Checkpoint as PbCheckpoint,
  Operation as PbOperation,
  TimeTicket as PbTimeTicket,
  Change as PbChange,
  ChangeID as PbChangeID,
  JSONElementSimple as PbJSONElementSimple,
  JSONElement as PbJSONElement,
  RHTNode as PbRHTNode,
  RGANode as PbRGANode,
  TextNode as PbTextNode,
  ValueType as PbValueType,
  TextNodeID as PbTextNodeID,
  TextNodePos as PbTextNodePos,
} from './yorkie_pb';

function toDocumentKey(key: DocumentKey): PbDocumentKey {
  const pbDocumentKey = new PbDocumentKey();
  pbDocumentKey.setCollection(key.getCollection());
  pbDocumentKey.setDocument(key.getDocument());
  return pbDocumentKey;
}

function toDocumentKeys(keys: Array<DocumentKey>): Array<PbDocumentKey> {
  return keys.map(toDocumentKey);
}

function toCheckpoint(checkpoint: Checkpoint): PbCheckpoint {
  const pbCheckpoint = new PbCheckpoint();
  pbCheckpoint.setServerSeq(checkpoint.getServerSeqAsString());
  pbCheckpoint.setClientSeq(checkpoint.getClientSeq());
  return pbCheckpoint;
}

function toChangeID(changeID: ChangeID): PbChangeID {
  const pbChangeID = new PbChangeID();
  pbChangeID.setClientSeq(changeID.getClientSeq());
  pbChangeID.setLamport(changeID.getLamportAsString());
  pbChangeID.setActorId(changeID.getActorID());
  return pbChangeID;
}

function toTimeTicket(ticket: TimeTicket): PbTimeTicket {
  if (!ticket) {
    return null;
  }

  const pbTimeTicket = new PbTimeTicket();
  pbTimeTicket.setLamport(ticket.getLamportAsString());
  pbTimeTicket.setDelimiter(ticket.getDelimiter());
  pbTimeTicket.setActorId(ticket.getActorID());
  return pbTimeTicket;
}

function toValueType(valueType: PrimitiveType): PbValueType {
  switch(valueType) {
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
      throw new YorkieError(Code.Unsupported, `unsupported type: ${valueType}`);
  }
}

function toJSONElementSimple(jsonElement: JSONElement): PbJSONElementSimple {
  const pbJSONElement = new PbJSONElementSimple();
  if (jsonElement instanceof JSONObject) {
    pbJSONElement.setType(PbValueType.JSON_OBJECT);
    pbJSONElement.setCreatedAt(toTimeTicket(jsonElement.getCreatedAt()));
  } else if (jsonElement instanceof JSONArray) {
    pbJSONElement.setType(PbValueType.JSON_ARRAY);
    pbJSONElement.setCreatedAt(toTimeTicket(jsonElement.getCreatedAt()));
  } else if (jsonElement instanceof PlainText) {
    pbJSONElement.setType(PbValueType.TEXT);
    pbJSONElement.setCreatedAt(toTimeTicket(jsonElement.getCreatedAt()));
  } else if (jsonElement instanceof JSONPrimitive) {
    const primitive = jsonElement as JSONPrimitive;
    pbJSONElement.setType(toValueType(primitive.getType()));
    pbJSONElement.setCreatedAt(toTimeTicket(jsonElement.getCreatedAt()));
    pbJSONElement.setValue(jsonElement.toBytes());
  }  else {
    throw new YorkieError(Code.Unimplemented, `unimplemented element: ${jsonElement}`);
  }

  return pbJSONElement;
}

function toTextNodeID(id: TextNodeID): PbTextNodeID {
  const pbTextNodeID = new PbTextNodeID();
  pbTextNodeID.setCreatedAt(toTimeTicket(id.getCreatedAt()));
  pbTextNodeID.setOffset(id.getOffset());
  return pbTextNodeID;
}

function toTextNodePos(pos: TextNodePos): PbTextNodePos {
  const pbTextNodePos = new PbTextNodePos();
  pbTextNodePos.setCreatedAt(toTimeTicket(pos.getID().getCreatedAt()));
  pbTextNodePos.setOffset(pos.getID().getOffset());
  pbTextNodePos.setRelativeOffset(pos.getRelativeOffset());
  return pbTextNodePos;
}

function toOperation(operation: Operation): PbOperation {
  const pbOperation = new PbOperation();

  if (operation instanceof SetOperation) {
    const setOperation = operation as SetOperation;
    const pbSetOperation = new PbOperation.Set();
    pbSetOperation.setParentCreatedAt(toTimeTicket(setOperation.getParentCreatedAt()));
    pbSetOperation.setKey(setOperation.getKey())
    pbSetOperation.setValue(toJSONElementSimple(setOperation.getValue()))
    pbSetOperation.setExecutedAt(toTimeTicket(setOperation.getExecutedAt()));
    pbOperation.setSet(pbSetOperation);
  } else if (operation instanceof AddOperation) {
    const addOperation = operation as AddOperation;
    const pbAddOperation = new PbOperation.Add();
    pbAddOperation.setParentCreatedAt(toTimeTicket(addOperation.getParentCreatedAt()));
    pbAddOperation.setPrevCreatedAt(toTimeTicket(addOperation.getPrevCreatedAt()));
    pbAddOperation.setValue(toJSONElementSimple(addOperation.getValue()));
    pbAddOperation.setExecutedAt(toTimeTicket(addOperation.getExecutedAt()));
    pbOperation.setAdd(pbAddOperation);
  } else if (operation instanceof RemoveOperation) {
    const removeOperation = operation as RemoveOperation;
    const pbRemoveOperation = new PbOperation.Remove();
    pbRemoveOperation.setParentCreatedAt(toTimeTicket(removeOperation.getParentCreatedAt()));
    pbRemoveOperation.setCreatedAt(toTimeTicket(removeOperation.getCreatedAt()));
    pbRemoveOperation.setExecutedAt(toTimeTicket(removeOperation.getExecutedAt()));
    pbOperation.setRemove(pbRemoveOperation);
  } else if (operation instanceof EditOperation) {
    const editOperation = operation as EditOperation;
    const pbEditOperation = new PbOperation.Edit();
    pbEditOperation.setParentCreatedAt(toTimeTicket(editOperation.getParentCreatedAt()));
    pbEditOperation.setFrom(toTextNodePos(editOperation.getFromPos()));
    pbEditOperation.setTo(toTextNodePos(editOperation.getToPos()));
    const pbCreatedAtMapByActor = pbEditOperation.getCreatedAtMapByActorMap();
    for (const [key, value] of editOperation.getMaxCreatedAtMapByActor()) {
      pbCreatedAtMapByActor.set(key, toTimeTicket(value));
    }
    pbEditOperation.setContent(editOperation.getContent());
    pbEditOperation.setExecutedAt(toTimeTicket(editOperation.getExecutedAt()));
    pbOperation.setEdit(pbEditOperation);
  } else if (operation instanceof SelectOperation) {
    const selectOperation = operation as SelectOperation;
    const pbSelectOperation = new PbOperation.Select();
    pbSelectOperation.setParentCreatedAt(toTimeTicket(selectOperation.getParentCreatedAt()));
    pbSelectOperation.setFrom(toTextNodePos(selectOperation.getFromPos()));
    pbSelectOperation.setTo(toTextNodePos(selectOperation.getToPos()));
    pbSelectOperation.setExecutedAt(toTimeTicket(selectOperation.getExecutedAt()));
    pbOperation.setSelect(pbSelectOperation);
  } else {
    throw new YorkieError(Code.Unimplemented, 'unimplemented operation');
  }

  return pbOperation;
}

function toOperations(operations: Operation[]): PbOperation[] {
  const pbOperations = [];
  for (const operation of operations) {
    pbOperations.push(toOperation(operation));
  }
  return pbOperations;
}

function toChange(change: Change): PbChange {
  const pbChange = new PbChange();
  pbChange.setId(toChangeID(change.getID()));
  pbChange.setMessage(change.getMessage());
  pbChange.setOperationsList(toOperations(change.getOperations()));
  return pbChange;
}

function toChanges(changes: Change[]): PbChange[] {
  const pbChanges = []
  for (const change of changes) {
    pbChanges.push(toChange(change));
  }
  return pbChanges;
}

function toRHTNodes(rht: RHT): PbRHTNode[] {
  const pbRHTNodes = []
  for (const rhtNode of rht) {
    const pbRHTNode = new PbRHTNode();
    pbRHTNode.setKey(rhtNode.getStrKey());
    // eslint-disable-next-line
    pbRHTNode.setElement(toJSONElement(rhtNode.getValue()));
    pbRHTNodes.push(pbRHTNode);
  }

  return pbRHTNodes;
}

function toRGANodes(rgaTreeList: RGATreeList): PbRGANode[] {
  const pbRGANodes = []
  for (const rgaTreeListNode of rgaTreeList) {
    const pbRGANode = new PbRGANode();
    // eslint-disable-next-line
    pbRGANode.setElement(toJSONElement(rgaTreeListNode.getValue()));
    pbRGANodes.push(pbRGANode);
  }

  return pbRGANodes;
}

function toTextNodes(rgaTreeSplit: RGATreeSplit<string>): PbTextNode[] {
  const pbTextNodes = []
  for (const textNode of rgaTreeSplit) {
    const pbTextNode = new PbTextNode();
    pbTextNode.setId(toTextNodeID(textNode.getID()));
    pbTextNode.setValue(textNode.getValue());
    pbTextNode.setDeletedAt(toTimeTicket(textNode.getDeletedAt()));

    pbTextNodes.push(pbTextNode);
  }

  return pbTextNodes;
}

function toJSONObject(obj: JSONObject): PbJSONElement {
  const pbJSONObject = new PbJSONElement.Object()
  pbJSONObject.setNodesList(toRHTNodes(obj.getRHT()));
  pbJSONObject.setCreatedAt(toTimeTicket(obj.getCreatedAt()));
  pbJSONObject.setDeletedAt(toTimeTicket(obj.getDeletedAt()));

  const pbJSONElement = new PbJSONElement();
  pbJSONElement.setObject(pbJSONObject);
  return pbJSONElement;
}

function toJSONArray(arr: JSONArray): PbJSONElement {
  const pbJSONArray = new PbJSONElement.Array();
  pbJSONArray.setNodesList(toRGANodes(arr.getElements()));
  pbJSONArray.setCreatedAt(toTimeTicket(arr.getCreatedAt()));
  pbJSONArray.setDeletedAt(toTimeTicket(arr.getDeletedAt()));

  const pbJSONElement = new PbJSONElement();
  pbJSONElement.setArray(pbJSONArray);
  return pbJSONElement;
}

function toJSONPrimitive(primitive: JSONPrimitive): PbJSONElement {
  const pbJSONPrimitive = new PbJSONElement.Primitive();
  pbJSONPrimitive.setType(toValueType(primitive.getType()));
  pbJSONPrimitive.setValue(primitive.toBytes());
  pbJSONPrimitive.setCreatedAt(toTimeTicket(primitive.getCreatedAt()));
  pbJSONPrimitive.setDeletedAt(toTimeTicket(primitive.getDeletedAt()));

  const pbJSONElement = new PbJSONElement();
  pbJSONElement.setPrimitive(pbJSONPrimitive);
  return pbJSONElement;
}

function toPlainText(text: PlainText): PbJSONElement {
  const pbText = new PbJSONElement.Text();
  pbText.setNodesList(toTextNodes(text.getRGATreeSplit()));
  pbText.setCreatedAt(toTimeTicket(text.getCreatedAt()));
  pbText.setDeletedAt(toTimeTicket(text.getDeletedAt()));

  const pbJSONElement = new PbJSONElement();
  pbJSONElement.setText(pbText);
  return pbJSONElement;
} 

function toJSONElement(jsonElement: JSONElement): PbJSONElement {
  if (jsonElement instanceof JSONObject) {
    return toJSONObject(jsonElement);
  } else if (jsonElement instanceof JSONArray) {
    return toJSONArray(jsonElement);
  } else if (jsonElement instanceof JSONPrimitive) {
    return toJSONPrimitive(jsonElement);
  } else if (jsonElement instanceof PlainText) {
    return toPlainText(jsonElement);
  } else {
    throw new YorkieError(Code.Unimplemented, `unimplemented element: ${jsonElement}`);
  }

  return null;
}

function toChangePack(pack: ChangePack): PbChangePack {
  const pbChangePack = new PbChangePack();
  pbChangePack.setDocumentKey(toDocumentKey(pack.getKey()));
  pbChangePack.setCheckpoint(toCheckpoint(pack.getCheckpoint()));
  pbChangePack.setChangesList(toChanges(pack.getChanges()));
  pbChangePack.setSnapshot(pack.getSnapshot());
  return pbChangePack;
}

function fromDocumentKey(pbDocumentKey: PbDocumentKey): DocumentKey {
  return DocumentKey.of(
    pbDocumentKey.getCollection(),
    pbDocumentKey.getDocument()
  );
}

function fromDocumentKeys(pbDocumentKeys: Array<PbDocumentKey>): Array<DocumentKey> {
  return pbDocumentKeys.map(fromDocumentKey);
}

function fromChangeID(pbChangeID: PbChangeID): ChangeID {
  return ChangeID.of(
    pbChangeID.getClientSeq(),
    Long.fromString(pbChangeID.getLamport(), true),
    pbChangeID.getActorId()
  );
}

function fromTimeTicket(pbTimeTicket: PbTimeTicket): TimeTicket {
  if (!pbTimeTicket) {
    return null;
  }

  return TimeTicket.of(
    Long.fromString(pbTimeTicket.getLamport(), true),
    pbTimeTicket.getDelimiter(),
    pbTimeTicket.getActorId()
  );
}

function fromValueType(pbValueType: PbValueType): PrimitiveType {
  switch(pbValueType) {
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
  throw new YorkieError(Code.Unimplemented, `unimplemented value type: ${pbValueType}`);
}

function fromJSONElementSimple(pbJSONElement: PbJSONElementSimple): JSONElement {
  switch (pbJSONElement.getType()) {
    case PbValueType.JSON_OBJECT:
      return JSONObject.create(fromTimeTicket(pbJSONElement.getCreatedAt()));
    case PbValueType.JSON_ARRAY:
      return JSONArray.create(fromTimeTicket(pbJSONElement.getCreatedAt()));
    case PbValueType.TEXT:
      return PlainText.create(RGATreeSplit.create(), fromTimeTicket(pbJSONElement.getCreatedAt()));
    case PbValueType.BOOLEAN:
    case PbValueType.INTEGER:
    case PbValueType.LONG:
    case PbValueType.DOUBLE:
    case PbValueType.STRING:
    case PbValueType.BYTES:
    case PbValueType.DATE:
      return JSONPrimitive.of(
        JSONPrimitive.valueFromBytes(fromValueType(pbJSONElement.getType()), pbJSONElement.getValue_asU8()),
        fromTimeTicket(pbJSONElement.getCreatedAt())
      );
  }

  throw new YorkieError(Code.Unimplemented, `unimplemented element: ${pbJSONElement}`);
}

function fromTextNodePos(pbTextNodePos: PbTextNodePos): TextNodePos {
  return TextNodePos.of(
    TextNodeID.of(
      fromTimeTicket(pbTextNodePos.getCreatedAt()),
      pbTextNodePos.getOffset()
    ),
    pbTextNodePos.getRelativeOffset()
  );
}

function fromTextNodeID(pbTextNodeID: PbTextNodeID): TextNodeID {
  return TextNodeID.of(
    fromTimeTicket(pbTextNodeID.getCreatedAt()),
    pbTextNodeID.getOffset()
  );
}

function fromTextNode(pbTextNode: PbTextNode): TextNode<string> {
  const textNode = TextNode.create(
    fromTextNodeID(pbTextNode.getId()),
    pbTextNode.getValue()
  );
  textNode.delete(fromTimeTicket(pbTextNode.getDeletedAt()));
  return textNode;
}

function fromOperations(pbOperations: PbOperation[]): Operation[] {
  const operations = [];

  for (const pbOperation of pbOperations) {
    let operation: Operation;
    if (pbOperation.hasSet()) {
      const pbSetOperation = pbOperation.getSet();
      operation = SetOperation.create(
        pbSetOperation.getKey(),
        fromJSONElementSimple(pbSetOperation.getValue()),
        fromTimeTicket(pbSetOperation.getParentCreatedAt()),
        fromTimeTicket(pbSetOperation.getExecutedAt())
      );
    } else if (pbOperation.hasAdd()) {
      const pbAddOperation = pbOperation.getAdd();
      operation = AddOperation.create(
        fromTimeTicket(pbAddOperation.getParentCreatedAt()),
        fromTimeTicket(pbAddOperation.getPrevCreatedAt()),
        fromJSONElementSimple(pbAddOperation.getValue()),
        fromTimeTicket(pbAddOperation.getExecutedAt())
      );
    } else if (pbOperation.hasRemove()) {
      const pbRemoveOperation = pbOperation.getRemove();
      operation = RemoveOperation.create(
        fromTimeTicket(pbRemoveOperation.getParentCreatedAt()),
        fromTimeTicket(pbRemoveOperation.getCreatedAt()),
        fromTimeTicket(pbRemoveOperation.getExecutedAt())
      );
    } else if (pbOperation.hasEdit()) {
      const pbEditOperation = pbOperation.getEdit();
      const createdAtMapByActor = new Map();
      pbEditOperation.getCreatedAtMapByActorMap().forEach((value, key) => {
        createdAtMapByActor.set(key, fromTimeTicket(value));
      });
      operation = EditOperation.create(
        fromTimeTicket(pbEditOperation.getParentCreatedAt()),
        fromTextNodePos(pbEditOperation.getFrom()),
        fromTextNodePos(pbEditOperation.getTo()),
        createdAtMapByActor,
        pbEditOperation.getContent(),
        fromTimeTicket(pbEditOperation.getExecutedAt()),
      );
    } else if (pbOperation.hasSelect()) {
      const pbSelectOperation = pbOperation.getSelect();
      operation = SelectOperation.create(
        fromTimeTicket(pbSelectOperation.getParentCreatedAt()),
        fromTextNodePos(pbSelectOperation.getFrom()),
        fromTextNodePos(pbSelectOperation.getTo()),
        fromTimeTicket(pbSelectOperation.getExecutedAt()),
      );
    } else {
      throw new YorkieError(Code.Unimplemented, `unimplemented operation: ${operation}`);
    }

    operations.push(operation)
  }

  return operations;
}

function fromChanges(pbChanges: PbChange[]): Change[] {
  const changes = [];

  for (const pbChange of pbChanges) {
    changes.push(Change.create(
      fromChangeID(pbChange.getId()),
      pbChange.getMessage(),
      fromOperations(pbChange.getOperationsList())
    ));
  }

  return changes;
}

function fromCheckpoint(pbCheckpoint: PbCheckpoint): Checkpoint {
  return Checkpoint.of(
    Long.fromString(pbCheckpoint.getServerSeq(), true),
    pbCheckpoint.getClientSeq()
  )
}

function fromChangePack(pbPack: PbChangePack): ChangePack {
  return ChangePack.create(
    fromDocumentKey(pbPack.getDocumentKey()),
    fromCheckpoint(pbPack.getCheckpoint()),
    fromChanges(pbPack.getChangesList()),
    pbPack.getSnapshot_asU8(),
  );
}

function fromJSONObject(pbObject: PbJSONElement.Object): JSONObject {
  const rht = new RHT();
  for (const pbRHTNode of pbObject.getNodesList()) {
    // eslint-disable-next-line
    rht.set(pbRHTNode.getKey(), fromJSONElement(pbRHTNode.getElement()));
  }

  const obj = new JSONObject(fromTimeTicket(pbObject.getCreatedAt()), rht);
  obj.delete(fromTimeTicket(pbObject.getDeletedAt()));
  return obj;
}

function fromJSONArray(pbArray: PbJSONElement.Array): JSONArray {
  const rgaTreeList = new RGATreeList();
  for (const pbRGANode of pbArray.getNodesList()) {
    // eslint-disable-next-line
    rgaTreeList.insert(fromJSONElement(pbRGANode.getElement()));
  }

  const arr = new JSONArray(fromTimeTicket(pbArray.getCreatedAt()), rgaTreeList);
  arr.delete(fromTimeTicket(pbArray.getDeletedAt()));
  return arr;
}

function fromJSONPrimitive(pbPrimitive: PbJSONElement.Primitive): JSONPrimitive {
  const primitive = JSONPrimitive.of(
    JSONPrimitive.valueFromBytes(fromValueType(pbPrimitive.getType()), pbPrimitive.getValue_asU8()),
    fromTimeTicket(pbPrimitive.getCreatedAt())
  );
  primitive.delete(fromTimeTicket(pbPrimitive.getDeletedAt()));
  return primitive;
}

function fromJSONText(pbText: PbJSONElement.Text): PlainText {
  const rgaTreeSplit = new RGATreeSplit<string>();

  let prev = rgaTreeSplit.getHead();
  for (const pbNode of pbText.getNodesList()) {
    const current = rgaTreeSplit.insertAfter(prev, fromTextNode(pbNode));
    if (pbNode.hasInsPrevId()) {
      current.setInsPrev(rgaTreeSplit.findTextNode(fromTextNodeID(pbNode.getInsPrevID())));
    }
    prev = current;
  }

  const text = PlainText.create(
    rgaTreeSplit,
    fromTimeTicket(pbText.getCreatedAt()),
  );
  text.delete(fromTimeTicket(pbText.getDeletedAt()));
  return text;
}

function fromJSONElement(pbJSONElement: PbJSONElement): JSONElement {
  if (pbJSONElement.hasObject()) {
    return fromJSONObject(pbJSONElement.getObject());
  } else if (pbJSONElement.hasArray()) {
    return fromJSONArray(pbJSONElement.getArray());
  } else if (pbJSONElement.hasPrimitive()) {
    return fromJSONPrimitive(pbJSONElement.getPrimitive());
  } else if (pbJSONElement.hasText()) {
    return fromJSONText(pbJSONElement.getText());
  } else {
    throw new YorkieError(Code.Unimplemented, `unimplemented element: ${pbJSONElement}`);
  }
}

function bytesToObject(bytes: Uint8Array): JSONObject {
  if (!bytes) {
    return JSONObject.create(InitialTimeTicket);
  }

  const pbJSONElement = PbJSONElement.deserializeBinary(bytes);
  return fromJSONObject(pbJSONElement.getObject());
}

function objectToBytes(obj: JSONObject): Uint8Array {
  return toJSONElement(obj).serializeBinary();
}

export const converter = {
  toChangePack: toChangePack,
  fromChangePack: fromChangePack,
  toDocumentKeys: toDocumentKeys,
  fromDocumentKeys: fromDocumentKeys,
  objectToBytes: objectToBytes,
  bytesToObject: bytesToObject,
}
