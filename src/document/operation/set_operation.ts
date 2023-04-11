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

import { logger } from '@yorkie-js-sdk/src/util/logger';
import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { CRDTElement } from '@yorkie-js-sdk/src/document/crdt/element';
import { CRDTRoot } from '@yorkie-js-sdk/src/document/crdt/root';
import { CRDTObject } from '@yorkie-js-sdk/src/document/crdt/object';
import {
  Operation,
  InternalOpInfo,
} from '@yorkie-js-sdk/src/document/operation/operation';

/**
 * `SetOperation` represents an operation that stores the value corresponding to the
 * given key in the Object.
 */
export class SetOperation extends Operation {
  private key: string;
  private value: CRDTElement;

  constructor(
    key: string,
    value: CRDTElement,
    parentCreatedAt: TimeTicket,
    executedAt: TimeTicket,
  ) {
    super(parentCreatedAt, executedAt);
    this.key = key;
    this.value = value;
  }

  /**
   * `create` creates a new instance of SetOperation.
   */
  public static create(
    key: string,
    value: CRDTElement,
    parentCreatedAt: TimeTicket,
    executedAt: TimeTicket,
  ): SetOperation {
    return new SetOperation(key, value, parentCreatedAt, executedAt);
  }

  /**
   * `execute` executes this operation on the given `CRDTRoot`.
   */
  public execute(root: CRDTRoot): Array<InternalOpInfo> {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
    if (!parentObject) {
      logger.fatal(`fail to find ${this.getParentCreatedAt()}`);
    }
    if (!(parentObject instanceof CRDTObject)) {
      logger.fatal(`fail to execute, only object can execute set`);
    }
    const obj = parentObject as CRDTObject;
    const value = this.value.deepcopy();
    obj.set(this.key, value);
    root.registerElement(value, obj);
    return [
      {
        type: 'set',
        element: this.getParentCreatedAt(),
        key: this.key,
      },
    ];
  }

  /**
   * `getEffectedCreatedAt` returns the creation time of the effected element.
   */
  public getEffectedCreatedAt(): TimeTicket {
    return this.value.getCreatedAt();
  }

  /**
   * `getStructureAsString` returns a string containing the meta data.
   */
  public getStructureAsString(): string {
    return `${this.getParentCreatedAt().getStructureAsString()}.SET`;
  }

  /**
   * `getKey` returns the key of this operation.
   */
  public getKey(): string {
    return this.key;
  }

  /**
   * `getValue` returns the value of this operation.
   */
  public getValue(): CRDTElement {
    return this.value;
  }
}
