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

import { fromBinary, toBinary } from '@bufbuild/protobuf';
import { reflect, type ReflectMessage } from '@bufbuild/protobuf/reflect';
import {
  converter,
  fromElement,
  fromOperation,
  toElement,
} from '@yorkie-js/sdk/src/api/converter';
import {
  JSONElementSchema as PbJSONElementSchema,
  JSONElementSimple as PbJSONElementSimple,
  OperationSchema as PbOperationSchema,
  TimeTicket as PbTimeTicket,
  ValueType as PbValueType,
} from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';
import { ActorID } from '@yorkie-js/sdk/src/document/time/actor_id';
import { Operation } from '@yorkie-js/sdk/src/document/operation/operation';
import { SetOperation } from '@yorkie-js/sdk/src/document/operation/set_operation';
import { AddOperation } from '@yorkie-js/sdk/src/document/operation/add_operation';
import { ArraySetOperation } from '@yorkie-js/sdk/src/document/operation/array_set_operation';
import { CRDTText } from '@yorkie-js/sdk/src/document/crdt/text';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';

const TimeTicketTypeName = 'yorkie.v1.TimeTicket';
const JSONElementSimpleTypeName = 'yorkie.v1.JSONElementSimple';

/**
 * `reissueOperations` returns copies of the given operations in which every
 * ticket issued by the actor `from` names the actor `to` instead. Lamports and
 * delimiters are kept, so the order among the tickets is unchanged. A ticket
 * with lamport 0 is never re-issued: that is `InitialTimeTicket`, the root
 * object's and every sentinel node's identity, shared by all replicas.
 *
 * It goes through the wire format on purpose: the operations come back as the
 * server would decode them (except a Text value, see below), and the walk
 * reaches every TimeTicket the protocol carries -- positions, node IDs, split
 * tickets, restore spans and the elements nested inside a Set/Add/ArraySet
 * value -- without a per-type list that a new field could silently fall out
 * of.
 *
 * It is only sound when every ticket naming `from` was issued locally and has
 * never left this replica, which is the case for a document that has never
 * synced. See docs/design/pre-attach-ticket-reissue.md.
 */
export function reissueOperations(
  ops: Array<Operation>,
  from: ActorID,
  to: ActorID,
): Array<Operation> {
  const reissuer = new TicketReissuer(from, to);

  const reissued: Array<Operation> = [];
  for (const op of ops) {
    const pbOp = converter.toOperation(op);
    reissuer.walk(reflect(PbOperationSchema, pbOp));
    const decoded = fromOperation(pbOp);
    if (!decoded) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `reissue operations: ${op.constructor.name} did not decode`,
      );
    }

    // The wire drops a Text value's content: it carries the Text alone and
    // the Edits that fill it. A Set/Add/ArraySet that restores a removed
    // Text -- the reverse of a Remove, run by Undo -- carries the content,
    // and a later Edit in the same document may target its nodes. Re-issue
    // such a value through its full snapshot encoding instead, so the local
    // root rebuilt from these operations keeps what the user sees.
    reissued.push(reissuer.reissueTextValue(op, decoded));
  }
  return reissued;
}

/**
 * `TicketReissuer` rewrites the actor of the TimeTickets in a protobuf
 * message.
 */
class TicketReissuer {
  private from: ActorID;
  private to: ActorID;

  constructor(from: ActorID, to: ActorID) {
    this.from = from;
    this.to = to;
  }

  /**
   * `reissueTextValue` returns the decoded operation with its Text value
   * replaced by a re-issued copy of the original one, content included. Any
   * other operation is returned unchanged.
   */
  public reissueTextValue(orig: Operation, decoded: Operation): Operation {
    if (
      !(orig instanceof SetOperation) &&
      !(orig instanceof AddOperation) &&
      !(orig instanceof ArraySetOperation)
    ) {
      return decoded;
    }
    const value = orig.getValue();
    if (!(value instanceof CRDTText)) {
      return decoded;
    }

    const pbElement = toElement(value);
    this.walk(reflect(PbJSONElementSchema, pbElement));
    const text = fromElement(pbElement);

    if (decoded instanceof SetOperation) {
      return SetOperation.create(
        decoded.getKey(),
        text,
        decoded.getParentCreatedAt(),
        decoded.getExecutedAt(),
      );
    }
    if (decoded instanceof AddOperation) {
      return AddOperation.create(
        decoded.getParentCreatedAt(),
        decoded.getPrevCreatedAt(),
        text,
        decoded.getExecutedAt(),
      );
    }
    if (decoded instanceof ArraySetOperation) {
      return ArraySetOperation.create(
        decoded.getParentCreatedAt(),
        decoded.getCreatedAt(),
        text,
        decoded.getExecutedAt(),
      );
    }
    return decoded;
  }

  /**
   * `walk` rewrites every TimeTicket reachable from the given message in
   * place.
   */
  public walk(message: ReflectMessage): void {
    switch (message.desc.typeName) {
      case TimeTicketTypeName: {
        const ticket = message.message as PbTimeTicket;
        if (
          ticket.lamport !== 0n &&
          converter.toHexString(ticket.actorId) === this.from
        ) {
          ticket.actorId = converter.toUint8Array(this.to);
        }
        return;
      }
      case JSONElementSimpleTypeName:
        this.walkNestedElement(message.message as PbJSONElementSimple);
        break;
    }

    for (const field of message.fields) {
      if (!message.isSet(field)) {
        continue;
      }

      switch (field.fieldKind) {
        case 'message':
          this.walk(message.get(field));
          break;
        case 'list':
          if (field.listKind === 'message') {
            for (const item of message.get(field)) {
              this.walk(item as ReflectMessage);
            }
          }
          break;
        case 'map':
          // Map keys are left alone: node attributes are keyed by name, and
          // the one actor-keyed map, the deprecated created_at_map_by_actor,
          // is never written.
          if (field.mapKind === 'message') {
            for (const value of message.get(field).values()) {
              this.walk(value as ReflectMessage);
            }
          }
          break;
      }
    }
  }

  /**
   * `walkNestedElement` rewrites the tickets inside the encoded value of an
   * Object, Array or Tree element: the wire carries those as the bytes of a
   * JSONElement, out of reach of the field walk.
   */
  private walkNestedElement(element: PbJSONElementSimple): void {
    switch (element.type) {
      case PbValueType.JSON_OBJECT:
      case PbValueType.JSON_ARRAY:
      case PbValueType.TREE:
        break;
      default:
        return;
    }
    if (!element.value.length) {
      return;
    }

    const nested = fromBinary(PbJSONElementSchema, element.value);
    this.walk(reflect(PbJSONElementSchema, nested));
    element.value = toBinary(PbJSONElementSchema, nested);
  }
}
