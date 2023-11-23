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
import { CRDTRoot } from '@yorkie-js-sdk/src/document/crdt/root';
import {
  OpSource,
  Operation,
  OperationInfo,
  ExecutionResult,
} from '@yorkie-js-sdk/src/document/operation/operation';
import {
  CRDTContainer,
  CRDTElement,
} from '@yorkie-js-sdk/src/document/crdt/element';
import { CRDTObject } from '@yorkie-js-sdk/src/document/crdt/object';
import { CRDTArray } from '@yorkie-js-sdk/src/document/crdt/array';
import { SetOperation } from '@yorkie-js-sdk/src/document/operation/set_operation';

/**
 * `RemoveOperation` is an operation that removes an element from `CRDTContainer`.
 */
export class RemoveOperation extends Operation {
  private createdAt: TimeTicket;

  constructor(
    parentCreatedAt: TimeTicket,
    createdAt: TimeTicket,
    executedAt?: TimeTicket,
  ) {
    super(parentCreatedAt, executedAt);
    this.createdAt = createdAt;
  }

  /**
   * `create` creates a new instance of RemoveOperation.
   */
  public static create(
    parentCreatedAt: TimeTicket,
    createdAt: TimeTicket,
    executedAt?: TimeTicket,
  ): RemoveOperation {
    return new RemoveOperation(parentCreatedAt, createdAt, executedAt);
  }

  /**
   * `execute` executes this operation on the given `CRDTRoot`.
   */
  public execute(
    root: CRDTRoot,
    source: OpSource,
  ): ExecutionResult | undefined {
    const container = root.findByCreatedAt(
      this.getParentCreatedAt(),
    ) as CRDTContainer;
    if (!container) {
      logger.fatal(`fail to find ${this.getParentCreatedAt()}`);
    }
    if (!(container instanceof CRDTContainer)) {
      logger.fatal(`only object and array can execute remove: ${container}`);
    }

    // NOTE(chacha912): Handle cases where operation cannot be executed during undo and redo.
    if (source === OpSource.UndoRedo) {
      let parent: CRDTElement | undefined = container.getByID(this.createdAt);
      while (parent) {
        if (parent.getRemovedAt()) {
          return;
        }
        parent = root.findElementPairByCreatedAt(parent.getCreatedAt())?.parent;
      }
    }
    const key = container.subPathOf(this.createdAt);
    const reverseOp = this.toReverseOperation(container);

    const elem = container.delete(this.createdAt, this.getExecutedAt());
    root.registerRemovedElement(elem);

    const opInfos: Array<OperationInfo> =
      container instanceof CRDTArray
        ? [
            {
              type: 'remove',
              path: root.createPath(this.getParentCreatedAt()),
              index: Number(key),
            },
          ]
        : [
            {
              type: 'remove',
              path: root.createPath(this.getParentCreatedAt()),
              key,
            },
          ];

    return { opInfos, reverseOp };
  }

  /**
   * `toReverseOperation` returns the reverse operation of this operation.
   */
  private toReverseOperation(
    parentObject: CRDTContainer,
  ): Operation | undefined {
    // TODO(Hyemmie): consider CRDTArray
    if (parentObject instanceof CRDTObject) {
      const key = parentObject.subPathOf(this.createdAt);
      if (key !== undefined) {
        const value = parentObject.get(key);
        if (value !== undefined) {
          return SetOperation.create(
            key,
            value.deepcopy(),
            this.getParentCreatedAt(),
          );
        }
      }
    }
  }

  /**
   * `getEffectedCreatedAt` returns the creation time of the effected element.
   */
  public getEffectedCreatedAt(): TimeTicket {
    return this.getParentCreatedAt();
  }

  /**
   * `toTestString` returns a string containing the meta data.
   */
  public toTestString(): string {
    return `${this.getParentCreatedAt().toTestString()}.REMOVE.${this.createdAt.toTestString()}`;
  }

  /**
   * `getCreatedAt` returns the creation time of the target element.
   */
  public getCreatedAt(): TimeTicket {
    return this.createdAt;
  }
}
