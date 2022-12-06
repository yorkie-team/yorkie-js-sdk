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
import { Code, YorkieError } from '@yorkie-js-sdk/src/util/error';
import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { CRDTElement } from '@yorkie-js-sdk/src/document/crdt/element';
import { escapeString } from '@yorkie-js-sdk/src/document/json/strings';

export enum PrimitiveType {
  Null,
  Boolean,
  Integer,
  Long,
  Double,
  String,
  Bytes,
  Date,
}

/**
 * `PrimitiveValue` represents a value of primitive type. Only values of type
 * included in `PrimitiveValue` can be set to the document.
 */
export type PrimitiveValue =
  // eslint-disable-next-line @typescript-eslint/ban-types
  null | boolean | number | Long | string | Uint8Array | Date;

/**
 * `Primitive` represents primitive data type including logical clock.
 * It has a type and a value.
 */
export class Primitive extends CRDTElement {
  private valueType: PrimitiveType;
  private value: PrimitiveValue;

  constructor(value: PrimitiveValue, createdAt: TimeTicket) {
    super(createdAt);
    this.valueType = Primitive.getPrimitiveType(value)!;
    this.value = value === undefined ? null : value;
  }

  /**
   * `of` creates a new instance of Primitive.
   */
  public static of(value: PrimitiveValue, createdAt: TimeTicket): Primitive {
    return new Primitive(value, createdAt);
  }

  /**
   * `valueFromBytes` parses the given bytes into value.
   */
  public static valueFromBytes(
    primitiveType: PrimitiveType,
    bytes: Uint8Array,
  ): PrimitiveValue {
    switch (primitiveType) {
      case PrimitiveType.Null:
        return null;
      case PrimitiveType.Boolean:
        return bytes[0] ? true : false;
      case PrimitiveType.Integer:
        return bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24);
      case PrimitiveType.Double: {
        const view = new DataView(bytes.buffer);
        bytes.forEach(function (b, i) {
          view.setUint8(i, b);
        });
        return view.getFloat64(0, true);
      }
      case PrimitiveType.String:
        return new TextDecoder('utf-8').decode(bytes);
      case PrimitiveType.Long:
        return Long.fromBytesLE(Array.from(bytes));
      case PrimitiveType.Bytes:
        return bytes;
      case PrimitiveType.Date:
        return new Date(Long.fromBytesLE(Array.from(bytes), true).toNumber());
      default:
        throw new YorkieError(
          Code.Unimplemented,
          `unimplemented type: ${primitiveType}`,
        );
    }
  }

  /**
   * `toJSON` returns the JSON encoding of the value.
   */
  public toJSON(): string {
    if (this.valueType === PrimitiveType.String) {
      return `"${escapeString(this.value as string)}"`;
    }

    // TODO(hackerwins): We need to consider the case where the value is
    // a byte array and a date.
    return `${this.value}`;
  }

  /**
   * `toSortedJSON` returns the sorted JSON encoding of the value.
   */
  public toSortedJSON(): string {
    return this.toJSON();
  }

  /**
   * `deepcopy` copies itself deeply.
   */
  public deepcopy(): Primitive {
    const primitive = Primitive.of(this.value, this.getCreatedAt());
    primitive.setMovedAt(this.getMovedAt());
    return primitive;
  }

  /**
   * `getType` returns the type of the value.
   */
  public getType(): PrimitiveType {
    return this.valueType!;
  }

  /**
   * `getPrimitiveType` returns the primitive type of the value.
   */
  public static getPrimitiveType(value: unknown): PrimitiveType | undefined {
    switch (typeof value) {
      case 'undefined':
        return PrimitiveType.Null;
      case 'boolean':
        return PrimitiveType.Boolean;
      case 'number':
        return PrimitiveType.Double;
      case 'string':
        return PrimitiveType.String;
      case 'object':
        if (value === null) {
          return PrimitiveType.Null;
        } else if (value instanceof Long) {
          return PrimitiveType.Long;
        } else if (value instanceof Uint8Array) {
          return PrimitiveType.Bytes;
        } else if (value instanceof Date) {
          return PrimitiveType.Date;
        }
    }

    return;
  }

  /**
   * `isSupport` check if the given value is supported type.
   */
  public static isSupport(value: unknown): boolean {
    const primitiveType = Primitive.getPrimitiveType(value);
    if (primitiveType === undefined) {
      return false;
    }
    return true;
  }

  /**
   * `isInteger` checks if the given number is integer.
   */
  public static isInteger(num: number): boolean {
    return num % 1 === 0;
  }

  /**
   * `isNumericType` checks numeric type by JSONPrimitive
   */
  public isNumericType(): boolean {
    const t = this.valueType;
    return (
      t === PrimitiveType.Integer ||
      t === PrimitiveType.Long ||
      t === PrimitiveType.Double
    );
  }

  /**
   * `getValue` returns the value of Primitive.
   */
  public getValue(): PrimitiveValue {
    return this.value;
  }

  /**
   * `toBytes` creates an array representing the value.
   */
  public toBytes(): Uint8Array {
    switch (this.valueType) {
      case PrimitiveType.Null: {
        return new Uint8Array();
      }
      case PrimitiveType.Boolean: {
        const boolVal = this.value as boolean;
        return boolVal ? new Uint8Array([1]) : new Uint8Array([0]);
      }
      case PrimitiveType.Integer: {
        const intVal = this.value as number;
        return new Uint8Array([
          intVal & 0xff,
          (intVal >> 8) & 0xff,
          (intVal >> 16) & 0xff,
          (intVal >> 24) & 0xff,
        ]);
      }
      case PrimitiveType.Double: {
        const doubleVal = this.value as number;
        const uint8Array = new Uint8Array(8);
        const view = new DataView(uint8Array.buffer);
        view.setFloat64(0, doubleVal, true);
        return uint8Array;
      }
      case PrimitiveType.String: {
        return new TextEncoder().encode(this.value as string);
      }
      case PrimitiveType.Long: {
        const longVal = this.value as Long;
        const longToBytes = longVal.toBytesLE();
        return Uint8Array.from(longToBytes);
      }
      case PrimitiveType.Bytes: {
        const bytesVal = this.value as Uint8Array;
        return bytesVal;
      }
      case PrimitiveType.Date: {
        const dateVal = this.value as Date;
        const dateToBytes = Long.fromNumber(
          dateVal.getTime(),
          true,
        ).toBytesLE();
        return Uint8Array.from(dateToBytes);
      }
      default:
        throw new YorkieError(
          Code.Unimplemented,
          `unimplemented type: ${this.valueType}`,
        );
    }
  }
}
