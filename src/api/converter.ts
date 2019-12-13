import Long from 'long';

import { Code, YorkieError } from '../util/error';
import { TimeTicket } from '../document/time/ticket';
import { Operation } from '../document/operation/operation';
import { SetOperation } from '../document/operation/set_operation';
import { AddOperation } from '../document/operation/add_operation';
import { RemoveOperation } from '../document/operation/remove_operation';
import { DocumentKey } from '../document/key/document_key';
import { ChangeID } from '../document/change/change_id';
import { Change } from '../document/change/change';
import { ChangePack } from '../document/change/change_pack';
import { Checkpoint } from '../document/checkpoint/checkpoint';
import { JSONElement } from '../document/json/element';
import { JSONObject } from '../document/json/object';
import { JSONArray } from '../document/json/array';
import { JSONPrimitive, PrimitiveType } from '../document/json/primitive';
import {
  ChangePack as PbChangePack,
  DocumentKey as PbDocumentKey,
  Checkpoint as PbCheckpoint,
  Operation as PbOperation,
  TimeTicket as PbTimeTicket,
  Change as PbChange,
  ChangeID as PbChangeID,
  JSONElement as PbJSONElement,
  ValueType as PbValueType,
} from './yorkie_pb';

function toDocumentKey(key: DocumentKey): PbDocumentKey {
  const pbDocumentKey = new PbDocumentKey();
  pbDocumentKey.setCollection(key.getCollection());
  pbDocumentKey.setDocument(key.getDocument());
  return pbDocumentKey;
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
  const pbTimeTicket = new PbTimeTicket();
  pbTimeTicket.setLamport(ticket.getLamportAsString());
  pbTimeTicket.setDelimiter(ticket.getDelimiter());
  pbTimeTicket.setActorId(ticket.getActorID());
  return pbTimeTicket;
}

function toJSONElement(jsonElement: JSONElement): PbJSONElement {
  const pbJSONElement = new PbJSONElement();
  if (jsonElement instanceof JSONObject) {
    pbJSONElement.setType(PbValueType.JSON_OBJECT);
    pbJSONElement.setCreatedAt(toTimeTicket(jsonElement.getCreatedAt()));
  } else if (jsonElement instanceof JSONArray) {
    pbJSONElement.setType(PbValueType.JSON_ARRAY);
    pbJSONElement.setCreatedAt(toTimeTicket(jsonElement.getCreatedAt()));
  } else if (jsonElement instanceof JSONPrimitive) {
    const primitive = jsonElement as JSONPrimitive;
    pbJSONElement.setType(toValueType(primitive.getType()));
    pbJSONElement.setCreatedAt(toTimeTicket(jsonElement.getCreatedAt()));
    pbJSONElement.setValue(jsonElement.toBytes());
  } else {
    throw new YorkieError(Code.Unimplemented, `unimplemented element: ${jsonElement}`);
  }

  return pbJSONElement;
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

function toOperation(operation: Operation): PbOperation {
  const pbOperation = new PbOperation();

  if (operation instanceof SetOperation) {
    const setOperation = operation as (SetOperation);
    const pbSetOperation = new PbOperation.Set();
    pbSetOperation.setParentCreatedAt(toTimeTicket(setOperation.getParentCreatedAt()));
    pbSetOperation.setKey(setOperation.getKey())
    pbSetOperation.setValue(toJSONElement(setOperation.getValue()))
    pbSetOperation.setExecutedAt(toTimeTicket(setOperation.getExecutedAt()));
    pbOperation.setSet(pbSetOperation);
  } else if (operation instanceof AddOperation) {
    const addOperation = operation as (AddOperation);
    const pbAddOperation = new PbOperation.Add();
    pbAddOperation.setParentCreatedAt(toTimeTicket(addOperation.getParentCreatedAt()));
    pbAddOperation.setPrevCreatedAt(toTimeTicket(addOperation.getPrevCreatedAt()));
    pbAddOperation.setValue(toJSONElement(addOperation.getValue()));
    pbAddOperation.setExecutedAt(toTimeTicket(addOperation.getExecutedAt()));
    pbOperation.setAdd(pbAddOperation);
  } else if (operation instanceof RemoveOperation) {
    const removeOperation = operation as (RemoveOperation);
    const pbRemoveOperation = new PbOperation.Remove();
    pbRemoveOperation.setParentCreatedAt(toTimeTicket(removeOperation.getParentCreatedAt()));
    pbRemoveOperation.setCreatedAt(toTimeTicket(removeOperation.getCreatedAt()));
    pbRemoveOperation.setExecutedAt(toTimeTicket(removeOperation.getExecutedAt()));
    pbOperation.setRemove(pbRemoveOperation);

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

function toChangePack(pack: ChangePack): PbChangePack {
  const pbChangePack = new PbChangePack();
  pbChangePack.setDocumentKey(toDocumentKey(pack.getKey()));
  pbChangePack.setCheckpoint(toCheckpoint(pack.getCheckpoint()));
  pbChangePack.setChangesList(toChanges(pack.getChanges()));
  return pbChangePack;
}

function fromDocumentKey(pbDocumentKey: PbDocumentKey): DocumentKey {
  return DocumentKey.of(
    pbDocumentKey.getCollection(),
    pbDocumentKey.getDocument()
  );
}

function fromChangeID(pbChangeID: PbChangeID): ChangeID {
  return ChangeID.of(
    pbChangeID.getClientSeq(),
    Long.fromString(pbChangeID.getLamport(), true),
    pbChangeID.getActorId()
  );
}

function fromTimeTicket(pbTimeTicket: PbTimeTicket): TimeTicket {
  return TimeTicket.of(
    Long.fromString(pbTimeTicket.getLamport(), true),
    pbTimeTicket.getDelimiter(),
    pbTimeTicket.getActorId()
  );
}

function fromJSONElement(pbJSONElement: PbJSONElement): JSONElement {
  switch (pbJSONElement.getType()) {
    case PbValueType.JSON_OBJECT:
      return JSONObject.create(fromTimeTicket(pbJSONElement.getCreatedAt()));
    case PbValueType.JSON_ARRAY:
      return JSONArray.create(fromTimeTicket(pbJSONElement.getCreatedAt()));
    case PbValueType.BOOLEAN:
      return JSONPrimitive.of(
        JSONPrimitive.valueFromBytes(PrimitiveType.Boolean, pbJSONElement.getValue_asU8()),
        fromTimeTicket(pbJSONElement.getCreatedAt())
      );
    case PbValueType.INTEGER:
      return JSONPrimitive.of(
        JSONPrimitive.valueFromBytes(PrimitiveType.Integer, pbJSONElement.getValue_asU8()),
        fromTimeTicket(pbJSONElement.getCreatedAt())
      );
    case PbValueType.LONG:
      return JSONPrimitive.of(
        JSONPrimitive.valueFromBytes(PrimitiveType.Long, pbJSONElement.getValue_asU8()),
        fromTimeTicket(pbJSONElement.getCreatedAt())
      );
    case PbValueType.DOUBLE:
      return JSONPrimitive.of(
        JSONPrimitive.valueFromBytes(PrimitiveType.Double, pbJSONElement.getValue_asU8()),
        fromTimeTicket(pbJSONElement.getCreatedAt())
      );
    case PbValueType.STRING:
      return JSONPrimitive.of(
        JSONPrimitive.valueFromBytes(PrimitiveType.String, pbJSONElement.getValue_asU8()),
        fromTimeTicket(pbJSONElement.getCreatedAt())
      );
    case PbValueType.BYTES:
      return JSONPrimitive.of(
        JSONPrimitive.valueFromBytes(PrimitiveType.Bytes, pbJSONElement.getValue_asU8()),
        fromTimeTicket(pbJSONElement.getCreatedAt())
      );
    case PbValueType.DATE:
      return JSONPrimitive.of(
        JSONPrimitive.valueFromBytes(PrimitiveType.Date, pbJSONElement.getValue_asU8()),
        fromTimeTicket(pbJSONElement.getCreatedAt())
      );
  }

  throw new YorkieError(Code.Unimplemented, `unimplemented element: ${pbJSONElement}`);
}

function fromOperations(pbOperations: PbOperation[]): Operation[] {
  const operations = [];

  for (const pbOperation of pbOperations) {
    let operation: Operation;
    if (pbOperation.hasSet()) {
      const pbSetOperation = pbOperation.getSet();
      operation = SetOperation.create(
        pbSetOperation.getKey(),
        fromJSONElement(pbSetOperation.getValue()),
        fromTimeTicket(pbSetOperation.getParentCreatedAt()),
        fromTimeTicket(pbSetOperation.getExecutedAt())
      );
    } else if (pbOperation.hasAdd()) {
      const pbAddOperation = pbOperation.getAdd();
      operation = AddOperation.create(
        fromTimeTicket(pbAddOperation.getParentCreatedAt()),
        fromTimeTicket(pbAddOperation.getPrevCreatedAt()),
        fromJSONElement(pbAddOperation.getValue()),
        fromTimeTicket(pbAddOperation.getExecutedAt())
      );
    } else if (pbOperation.hasRemove()) {
      const pbRemoveOperation = pbOperation.getRemove();
      operation = RemoveOperation.create(
        fromTimeTicket(pbRemoveOperation.getParentCreatedAt()),
        fromTimeTicket(pbRemoveOperation.getCreatedAt()),
        fromTimeTicket(pbRemoveOperation.getExecutedAt())
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
    fromChanges(pbPack.getChangesList())
  );
}

export const converter = {
  toChangePack: toChangePack,
  fromChangePack: fromChangePack,
}
