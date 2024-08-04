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
  OpSource,
  Operation,
  ExecutionResult,
} from '@yorkie-js-sdk/src/document/operation/operation';
import { RemoveOperation } from '@yorkie-js-sdk/src/document/operation/remove_operation';

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
    executedAt?: TimeTicket,
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
    executedAt?: TimeTicket,
  ): SetOperation {
    return new SetOperation(key, value, parentCreatedAt, executedAt);
  }

  /**
   * `execute` executes this operation on the given `CRDTRoot`.
   */
  public execute(
    root: CRDTRoot,
    source: OpSource,
  ): ExecutionResult | undefined {
    const obj = root.findByCreatedAt(this.getParentCreatedAt()) as CRDTObject;
    if (!obj) {
      logger.fatal(`fail to find ${this.getParentCreatedAt()}`);
    }
    if (!(obj instanceof CRDTObject)) {
      logger.fatal(`fail to execute, only object can execute set`);
    }

    // NOTE(chacha912): Handle cases where operation cannot be executed during undo and redo.
    if (source === OpSource.UndoRedo) {
      let parent: CRDTElement | undefined = obj;
      while (parent) {
        if (parent.getRemovedAt()) {
          return;
        }
        parent = root.findElementPairByCreatedAt(parent.getCreatedAt())?.parent;
      }
    }
    const previousValue = obj.get(this.key);
    const reverseOp = this.toReverseOperation(previousValue);

    const value = this.value.deepcopy();
    const removed = obj.set(this.key, value, this.getExecutedAt());
    // NOTE(chacha912): When resetting elements with the pre-existing createdAt
    // during undo/redo, it's essential to handle previously tombstoned elements.
    // In non-GC languages, there may be a need to execute both deregister and purge.
    if (
      source === OpSource.UndoRedo &&
      root.findByCreatedAt(value.getCreatedAt())
    ) {
      root.deregisterElement(value);
    }
    root.registerElement(value, obj);
    if (removed) {
      root.registerRemovedElement(removed);
    }

    return {
      opInfos: [
        {
          type: 'set',
          path: root.createPath(this.getParentCreatedAt()),
          key: this.key,
        },
      ],
      reverseOp,
    };
  }

  /**
   * `toReverseOperation` returns the reverse operation of this operation.
   */
  private toReverseOperation(value: CRDTElement | undefined): Operation {
    let reverseOp: SetOperation | RemoveOperation = RemoveOperation.create(
      this.getParentCreatedAt(),
      this.value.getCreatedAt(),
    );

    if (value !== undefined && !value.isRemoved()) {
      reverseOp = SetOperation.create(
        this.key,
        value.deepcopy(),
        this.getParentCreatedAt(),
      );
    }
    return reverseOp;
  }

  /**
   * `getEffectedCreatedAt` returns the creation time of the effected element.
   */
  public getEffectedCreatedAt(): TimeTicket {
    return this.value.getCreatedAt();
  }

  /**
   * `toTestString` returns a string containing the meta data.
   */
  public toTestString(): string {
    return `${this.getParentCreatedAt().toTestString()}.SET.${
      this.key
    }=${this.value.toSortedJSON()}`;
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
