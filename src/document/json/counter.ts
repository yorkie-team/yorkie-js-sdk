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

import { JSONElement } from './element';
import { TimeTicket } from '../time/ticket';
import Long from 'long';
import { Code, YorkieError } from '../../util/error';
import { JSONPrimitive, PrimitiveType } from './primitive';

export enum CounterType {
  IntegerCnt,
  LongCnt,
  DoubleCnt,
}

type CounterValue = number | Long;

/**
 * Counter represents changeable number data type.
 */
export class Counter extends JSONElement {
  private valueType?: CounterType;
  private value: CounterValue;

  constructor(value: CounterValue, createdAt: TimeTicket) {
    super(createdAt);
    this.valueType = Counter.getCounterType(value);
    this.value = value;
  }

  public static of(value: CounterValue, createdAt: TimeTicket): Counter {
    return new Counter(value, createdAt);
  }

  public static valueFromBytes(
    counterType: CounterType,
    bytes: Uint8Array,
  ): CounterValue {
    switch (counterType) {
      case CounterType.IntegerCnt:
        return bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24);
      case CounterType.DoubleCnt: {
        const view = new DataView(bytes.buffer);
        bytes.forEach(function (b, i) {
          view.setUint8(i, b);
        });
        return view.getFloat64(0, true);
      }
      case CounterType.LongCnt:
        return Long.fromBytesLE(Array.from(bytes));
      default:
        throw new YorkieError(
          Code.Unimplemented,
          `unimplemented type: ${counterType}`,
        );
    }
  }

  public toJSON(): string {
    return `${this.value}`;
  }

  public toSortedJSON(): string {
    return this.toJSON();
  }

  public deepcopy(): Counter {
    const counter = Counter.of(this.value, this.getCreatedAt());
    counter.setMovedAt(this.getMovedAt());
    return counter;
  }

  public getType(): CounterType {
    return this.valueType!;
  }

  public static getCounterType(value: CounterValue): CounterType | undefined {
    switch (typeof value) {
      case 'number':
        return CounterType.DoubleCnt;
      case 'object':
        if (value instanceof Long) {
          return CounterType.LongCnt;
        }
    }

    return;
  }

  public static isSupport(value: CounterValue): boolean {
    return !!Counter.getCounterType(value);
  }

  public static isInteger(num: number): boolean {
    return num % 1 === 0;
  }

  /**
   * isNumericType check numeric type by JSONCounter
   */
  public isNumericType(): boolean {
    const t = this.valueType;
    return (
      t === CounterType.IntegerCnt ||
      t === CounterType.LongCnt ||
      t === CounterType.DoubleCnt
    );
  }

  public getValue(): CounterValue {
    return this.value;
  }

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
      case CounterType.DoubleCnt: {
        const doubleVal = this.value as number;
        const uint8Array = new Uint8Array(8);
        const view = new DataView(uint8Array.buffer);
        view.setFloat64(0, doubleVal, true);
        return uint8Array;
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
   * increase increase numeric data.
   */
  public increase(v: JSONPrimitive): Counter {
    function checkNumericType(target: JSONPrimitive | Counter): void {
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
      (this.value as number) +=
        v.getType() === PrimitiveType.Long
          ? (v.getValue() as Long).toNumber()
          : (v.getValue() as number);
    }

    return this;
  }
}
