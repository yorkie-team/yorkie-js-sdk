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

import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';

/**
 * `CRDTElement` represents an element that has `TimeTicket`s.
 *
 * @internal
 */
export abstract class CRDTElement {
  private createdAt: TimeTicket;
  private movedAt?: TimeTicket;
  private removedAt?: TimeTicket;

  constructor(createdAt: TimeTicket) {
    this.createdAt = createdAt;
  }

  /**
   * `getCreatedAt` returns the creation time of this element.
   */
  public getCreatedAt(): TimeTicket {
    return this.createdAt;
  }

  /**
   * `getID` returns the creation time of this element.
   */
  public getID(): TimeTicket {
    return this.createdAt;
  }

  /**
   * `getMovedAt` returns the move time of this element.
   */
  public getMovedAt(): TimeTicket | undefined {
    return this.movedAt;
  }

  /**
   * `getRemovedAt` returns the removal time of this element.
   */
  public getRemovedAt(): TimeTicket | undefined {
    return this.removedAt;
  }

  /**
   * `setMovedAt` sets the move time of this element.
   */
  public setMovedAt(movedAt?: TimeTicket): boolean {
    if (!this.movedAt || (movedAt && movedAt.after(this.movedAt))) {
      this.movedAt = movedAt;
      return true;
    }

    return false;
  }

  /**
   * `setRemovedAt` sets the remove time of this element.
   */
  public setRemovedAt(removedAt?: TimeTicket): void {
    this.removedAt = removedAt;
  }

  /**
   * `remove` removes this element.
   */
  public remove(removedAt?: TimeTicket): boolean {
    if (
      removedAt &&
      removedAt.after(this.createdAt) &&
      (!this.removedAt || removedAt.after(this.removedAt))
    ) {
      this.removedAt = removedAt;
      return true;
    }

    return false;
  }

  /**
   * `isRemoved` check if this element was removed.
   */
  public isRemoved(): boolean {
    return !!this.removedAt;
  }

  abstract toJSON(): string;
  abstract toSortedJSON(): string;
  abstract deepcopy(): CRDTElement;
}

/**
 *
 * `CRDTContainer` represents CRDTArray or CRDtObject.
 * @internal
 */
export abstract class CRDTContainer extends CRDTElement {
  constructor(createdAt: TimeTicket) {
    super(createdAt);
  }

  /**
   * `subPathOf` returns the sub path of the given element.
   */
  abstract subPathOf(createdAt: TimeTicket): string | undefined;

  abstract purge(element: CRDTElement): void;

  abstract delete(createdAt: TimeTicket, executedAt: TimeTicket): CRDTElement;

  abstract getDescendants(
    callback: (elem: CRDTElement, parent: CRDTContainer) => boolean,
  ): void;
}

/**
 * `CRDTTextElement` represents CRDTText or CRDTRichText.
 */
export abstract class CRDTTextElement extends CRDTElement {
  abstract getRemovedNodesLen(): number;
  abstract purgeTextNodesWithGarbage(ticket: TimeTicket): number;
}
