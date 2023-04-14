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

import { CRDTElement } from '@yorkie-js-sdk/src/document/crdt/element';
import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import Long from 'long';
import { Code, YorkieError } from '@yorkie-js-sdk/src/util/error';
import {
  Primitive,
  PrimitiveType,
} from '@yorkie-js-sdk/src/document/crdt/primitive';
import { removeDecimal } from '@yorkie-js-sdk/src/util/number';

/**
 * @internal
 */
export enum CounterType {
  IntegerCnt,
  LongCnt,
}

export type CounterValue = number | Long;

/**
 * `CRDTCounter` is a CRDT implementation of a counter. It is used to represent
 * a number that can be incremented or decremented.
 *
 * @internal
 */
export class CRDTCounter extends CRDTElement {
  private valueType: CounterType;
  private value: CounterValue;

  constructor(
    valueType: CounterType,
    value: CounterValue,
    createdAt: TimeTicket,
  ) {
    super(createdAt);
    this.valueType = valueType;
    switch (valueType) {
      case CounterType.IntegerCnt:
        if (typeof value === 'number') {
          if (value > Math.pow(2, 31) - 1 || value < -Math.pow(2, 31)) {
            this.value = Long.fromNumber(value).toInt();
          } else {
            this.value = removeDecimal(value);
          }
        } else {
          this.value = value.toInt();
        }
        break;
      case CounterType.LongCnt:
        if (typeof value === 'number') {
          this.value = Long.fromNumber(value);
        } else {
          this.value = value;
        }
        break;
      default:
        throw new YorkieError(
          Code.Unimplemented,
          `unimplemented type: ${valueType}`,
        );
    }
  }

  /**
   * `of` creates a new instance of Counter.
   */
  public static of(
    valueType: CounterType,
    value: CounterValue,
    createdAt: TimeTicket,
  ): CRDTCounter {
    return new CRDTCounter(valueType, value, createdAt);
  }
  /**
   * `valueFromBytes` parses the given bytes into value.
   */
  public static valueFromBytes(
    counterType: CounterType,
    bytes: Uint8Array,
  ): CounterValue {
    switch (counterType) {
      case CounterType.IntegerCnt:
        return bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24);
      case CounterType.LongCnt:
        return Long.fromBytesLE(Array.from(bytes));
      default:
        throw new YorkieError(
          Code.Unimplemented,
          `unimplemented type: ${counterType}`,
        );
    }
  }

  /**
   * `toJSON` returns the JSON encoding of the value.
   */
  public toJSON(): string {
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
  public deepcopy(): CRDTCounter {
    const counter = CRDTCounter.of(
      this.valueType,
      this.value,
      this.getCreatedAt(),
    );
    counter.setMovedAt(this.getMovedAt());
    return counter;
  }

  /**
   * `getType` returns the type of the value.
   */
  public getType(): CounterType {
    return this.valueType;
  }

  /**
   * `getCounterType` returns counter type of given value.
   */
  public static getCounterType(value: CounterValue): CounterType | undefined {
    switch (typeof value) {
      case 'object':
        if (value instanceof Long) {
          return CounterType.LongCnt;
        } else {
          return;
        }
      case 'number':
        if (value > Math.pow(2, 31) - 1 || value < -Math.pow(2, 31)) {
          return CounterType.LongCnt;
        } else {
          return CounterType.IntegerCnt;
        }
      default:
        return;
    }
  }
  /**
   * `isSupport` check if there is a counter type of given value.
   */
  public static isSupport(value: CounterValue): boolean {
    return !!CRDTCounter.getCounterType(value);
  }

  /**
   * `isInteger` checks if the num is integer.
   */
  public static isInteger(num: number): boolean {
    return num % 1 === 0;
  }

  /**
   * `isNumericType` check numeric type by JSONCounter.
   */
  public isNumericType(): boolean {
    const t = this.valueType;
    return t === CounterType.IntegerCnt || t === CounterType.LongCnt;
  }

  /**
   * `getValueType` get counter value type.
   */
  public getValueType(): CounterType {
    return this.valueType;
  }

  /**
   * `getValue` get counter value.
   */
  public getValue(): CounterValue {
    return this.value;
  }

  /**
   * `toBytes` creates an array representing the value.
   */
  public toBytes(): Uint8Array {
    switch (this.valueType) {
      case CounterType.IntegerCnt: {
        const intVal = this.value as number;
        return new Uint8Array([
          intVal & 0xff,
          (intVal >> 8) & 0xff,
          (intVal >> 16) & 0xff,
          (intVal >> 24) & 0xff,
        ]);
      }
      case CounterType.LongCnt: {
        const longVal = this.value as Long;
        const longToBytes = longVal.toBytesLE();
        return Uint8Array.from(longToBytes);
      }
      default:
        throw new YorkieError(
          Code.Unimplemented,
          `unimplemented type: ${this.valueType}`,
        );
    }
  }

  /**
   * `increase` increases numeric data.
   */
  public increase(v: Primitive): CRDTCounter {
    /**
     * `checkNumericType` checks if the given target is a numeric type.
     */
    function checkNumericType(target: Primitive | CRDTCounter): void {
      if (!target.isNumericType()) {
        throw new TypeError(
          `Unsupported type of value: ${typeof target.getValue()}`,
        );
      }
    }
    checkNumericType(this);
    checkNumericType(v);

    if (this.valueType === CounterType.LongCnt) {
      this.value = (this.value as Long).add(v.getValue() as number | Long);
    } else {
      if (v.getType() === PrimitiveType.Long) {
        this.value = (this.value as number) + (v.getValue() as Long).toInt();
      } else {
        this.value = Long.fromNumber(
          (this.value as number) + removeDecimal(v.getValue() as number),
        ).toInt();
      }
    }

    return this;
  }
}
