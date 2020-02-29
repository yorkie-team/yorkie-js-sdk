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

import { logger } from '../../util/logger';
import { TimeTicket } from '../time/ticket';
import { JSONContainer, JSONElement } from './element';
import { RHT, RHTNode } from './rht';
import { PlainText } from './text';

/**
 * JSONObject represents a JSON object, but unlike regular JSON, it has time
 * tickets which is created by logical clock.
 */
export class JSONObject extends JSONContainer {
  private memberNodes: RHT;

  constructor(createdAt: TimeTicket, memberNodes: RHT) {
    super(createdAt);
    this.memberNodes = memberNodes;
  }

  public static create(createdAt: TimeTicket): JSONObject {
    return new JSONObject(createdAt, RHT.create());
  }

  public getOrCreateText(key: string): PlainText {
    logger.fatal('unsupported: this method should be called by proxy');
    return null;
  }

  public getText(key: string): PlainText {
    logger.fatal('unsupported: this method should be called by proxy');
    return null;
  }

  public set(key: string, value: JSONElement): void {
    this.memberNodes.set(key, value);
  }

  public remove(createdAt: TimeTicket, executedAt: TimeTicket): JSONElement {
    return this.memberNodes.remove(createdAt, executedAt);
  }

  public removeByKey(key: string, executedAt: TimeTicket): JSONElement {
    return this.memberNodes.removeByKey(key, executedAt);
  }

  public get(key: string): JSONElement {
    return this.memberNodes.get(key);
  }

  public has(key: string): boolean {
    return this.memberNodes.has(key);
  }

  public *[Symbol.iterator](): IterableIterator<[string, JSONElement]> {
    const keySet = new Set<string>();
    for (const node of this.memberNodes) {
      if (!keySet.has(node.getStrKey())) {
        keySet.add(node.getStrKey());
        if (!node.isDeleted()) {
          yield [node.getStrKey(), node.getValue()];
        }
      }
    }
  }

  public toJSON(): string {
    const json = []
    for (const [key, value] of this) {
      json.push(`"${key}":${value.toJSON()}`);
    }
    return `{${json.join(',')}}`;
  }

  public getMembers(): RHT {
    return this.memberNodes;
  }

  public deepcopy(): JSONObject {
    const clone = JSONObject.create(this.getCreatedAt());
    for (const node of this.memberNodes) {
      clone.memberNodes.set(
        node.getStrKey(),
        node.getValue().deepcopy(),
      );
    }
    clone.delete(this.getDeletedAt());
    return clone;
  }

  public *getDescendants(): IterableIterator<JSONElement> {
    for (const node of this.getMembers()) {
      const element = node.getValue();
      if (element instanceof JSONContainer) {
        for (const descendant of element.getDescendants()) {
          yield descendant;
        }
      } 

      yield element;
    }
  }
}
