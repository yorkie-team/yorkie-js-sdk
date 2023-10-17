/*
 * Copyright 2023 The Yorkie Authors. All rights reserved.
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

import { deepcopy } from '@yorkie-js-sdk/src/util/object';
import { Indexable } from '@yorkie-js-sdk/src/document/document';
import { ChangeContext } from '@yorkie-js-sdk/src/document/change/context';

/**
 * `PresenceChangeType` represents the type of presence change.
 */
export enum PresenceChangeType {
  Put = 'put',
  Clear = 'clear',
}

/**
 * `PresenceChange` represents the change of presence.
 */
export type PresenceChange<P extends Indexable> =
  | { type: PresenceChangeType.Put; presence: P }
  | { type: PresenceChangeType.Clear };

/**
 * `Presence` represents a proxy for the Presence to be manipulated from the outside.
 */
export class Presence<P extends Indexable> {
  private context: ChangeContext;
  private presence: P;

  constructor(changeContext: ChangeContext, presence: P) {
    this.context = changeContext;
    this.presence = presence;
  }

  /**
   * `set` updates the presence based on the partial presence.
   */
  public set(presence: Partial<P>, option?: { addToHistory: boolean }) {
    for (const key of Object.keys(presence)) {
      this.presence[key as keyof P] = presence[key]!;
    }

    this.context.setPresenceChange({
      type: PresenceChangeType.Put,
      presence: deepcopy(this.presence),
    });

    this.context.setReversePresence(presence, option);
  }

  /**
   * `get` returns the presence value of the given key.
   */
  public get<K extends keyof P>(key: K): P[K] {
    return this.presence[key];
  }

  /**
   * `clear` clears the presence.
   * @internal
   */
  public clear() {
    this.presence = {} as P;

    this.context.setPresenceChange({
      type: PresenceChangeType.Clear,
    });
  }
}
