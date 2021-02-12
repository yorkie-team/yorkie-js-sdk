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
import { Code, YorkieError } from '../../util/error';
import { TimeTicket } from '../time/ticket';
import { JSONElement } from './element';

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

export type PrimitiveValue =
  | boolean
  | number
  | Long
  | string
  | Uint8Array
  | Date;

/**
 * Primitive represents JSON primitive data type including logical lock.
 * This is immutable.
 */
export class JSONPrimitive extends JSONElement {
  private valueType: PrimitiveType;
  private value: PrimitiveValue;

  constructor(value: PrimitiveValue, createdAt: TimeTicket) {
    super(createdAt);
    this.valueType = JSONPrimitive.getPrimitiveType(value);
    this.value = value;
  }

  public static of(
    value: PrimitiveValue,
    createdAt: TimeTicket,
  ): JSONPrimitive {
    return new JSONPrimitive(value, createdAt);
  }

  public static valueFromBytes(
    primitiveType: PrimitiveType,
    bytes: Uint8Array,
  ): PrimitiveValue {
    switch (primitiveType) {
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
        return new Date(Long.fromBytesLE(Array.from(bytes)).toNumber());
      default:
        throw new YorkieError(
          Code.Unimplemented,
          `unimplemented type: ${primitiveType}`,
        );
    }
  }

  public toJSON(): string {
    if (this.valueType === PrimitiveType.String) {
      return `"${this.value}"`;
    }

    return `${this.value}`;
  }

  public toSortedJSON(): string {
    return this.toJSON();
  }

  public deepcopy(): JSONPrimitive {
    const primitive = JSONPrimitive.of(this.value, this.getCreatedAt());
    primitive.setMovedAt(this.getMovedAt());
    return primitive;
  }

  public getType(): PrimitiveType {
    return this.valueType;
  }

  public static getPrimitiveType(value: unknown): PrimitiveType {
    switch (typeof value) {
      case 'boolean':
        return PrimitiveType.Boolean;
      case 'number':
        return PrimitiveType.Double;
      case 'string':
        return PrimitiveType.String;
      case 'object':
        if (value instanceof Long) {
          return PrimitiveType.Long;
        } else if (value instanceof Uint8Array) {
          return PrimitiveType.Bytes;
        } else if (value instanceof Date) {
          return PrimitiveType.Date;
        }
    }

    return null;
  }

  public static isSupport(value: unknown): boolean {
    return !!JSONPrimitive.getPrimitiveType(value);
  }

  public static isInteger(num: number): boolean {
    return num % 1 === 0;
  }

  /**
   * isNumericType check numeric type by JSONPrimitive
   */
  public isNumericType(): boolean {
    const t = this.valueType;
    return (
      t === PrimitiveType.Integer ||
      t === PrimitiveType.Long ||
      t === PrimitiveType.Double
    );
  }

  public getValue(): PrimitiveValue {
    return this.value;
  }

  public toBytes(): Uint8Array {
    switch (this.valueType) {
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
        const dateToBytes = Long.fromNumber(dateVal.getTime()).toBytesLE();
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
