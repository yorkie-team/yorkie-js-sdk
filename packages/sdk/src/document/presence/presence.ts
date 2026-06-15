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

import { deepcopy } from '@yorkie-js/sdk/src/util/object';
import { Indexable } from '@yorkie-js/sdk/src/document/document';
import { ChangeContext } from '@yorkie-js/sdk/src/document/change/context';
import { PresenceChangeType } from './change';
/**
 * `Presence` represents a proxy for the Presence to be manipulated from the outside.
 *
 * When the document's enclosing project has `EnablePresence=false`,
 * `set` and `clear` become local-only no-ops: no `PresenceChange` is
 * attached to the context, so the resulting Change carries no presence
 * component and the server has nothing presence-shaped to drop. This
 * mirrors the server-side enforcement for cooperating SDKs; the server
 * still strips presence on its own for any caller that misses this
 * guard. See docs/design/presenceless-project-mode.md in the server
 * repository.
 */
export class Channel<P extends Indexable> {
  private context: ChangeContext;
  private presence: P;
  private enabled: boolean;

  constructor(
    changeContext: ChangeContext,
    presence: P,
    options?: { enabled?: boolean },
  ) {
    this.context = changeContext;
    this.presence = presence;
    this.enabled = options?.enabled !== false;
  }

  /**
   * `set` updates the presence based on the partial presence.
   */
  public set(presence: Partial<P>, option?: { addToHistory: boolean }) {
    for (const key of Object.keys(presence)) {
      this.presence[key as keyof P] = presence[key]!;
    }

    if (!this.enabled) {
      // Presence is disabled for this project: skip emitting any
      // PresenceChange. The local clone presence map is still updated
      // for symmetry, but no PUT change reaches the change pack.
      return;
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
   */
  public clear() {
    this.presence = {} as P;

    if (!this.enabled) {
      // Presence disabled — drop CLEAR too. Without a corresponding
      // PUT having been emitted there is nothing to clear remotely.
      return;
    }

    this.context.setPresenceChange({
      type: PresenceChangeType.Clear,
    });
  }
}
