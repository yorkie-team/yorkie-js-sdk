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
 * `MaxPresenceBaseSize` is the largest presence the server keeps as a patch
 * base, mirroring `maxPresenceBaseSize` on the server. A presence above it is
 * refused by every fold, so patching it only buys a failed round trip.
 */
const MaxPresenceBaseSize = 4 * 1024;

/**
 * `PresenceEntryOverhead` is the per-key cost the server adds on top of the
 * key and value bytes when it measures a presence (`presenceEntryOverhead`).
 */
const PresenceEntryOverhead = 64;

const encoder = new TextEncoder();

/**
 * `isCacheablePresence` reports whether the server would keep the given
 * presence as a patch base. It mirrors the server's accounting: the UTF-8
 * bytes of each key and of its JSON-encoded value, plus a fixed per-entry
 * overhead. It stops counting as soon as the limit is passed, so an oversized
 * presence does not pay for encoding every value.
 */
function isCacheablePresence(presence: Indexable): boolean {
  let size = 0;
  for (const [key, value] of Object.entries(presence)) {
    size +=
      encoder.encode(key).length +
      encoder.encode(JSON.stringify(value)).length +
      PresenceEntryOverhead;
    if (size > MaxPresenceBaseSize) {
      return false;
    }
  }
  return true;
}

/**
 * `removesKey` reports whether the given partial presence deletes a top-level
 * key rather than setting one. An undo produces these: the reverse presence of
 * a `set` that introduced a key carries that key with no previous value.
 *
 * A patch cannot express a deletion -- only the changed keys go on the wire,
 * and the server folds them onto the base it holds, which leaves a key the
 * update dropped standing for every peer. So an update that removes a key
 * falls back to a full put, which does say what the whole presence now is.
 */
function removesKey(presence: Record<string, unknown>): boolean {
  for (const key of Object.keys(presence)) {
    if (presence[key] === undefined) {
      return true;
    }
  }
  return false;
}

/**
 * `Presence` represents a proxy for the Presence to be manipulated from the outside.
 */
export class Channel<P extends Indexable> {
  private context: ChangeContext;
  private presence: P;

  /**
   * `patchable` is whether this update may record a patch instead of a full
   * put. The document decides it: the server has to have advertised
   * `presence-patch` on its last pack and to be holding a base for us.
   */
  private patchable: boolean;

  /**
   * `patchedKeys` are the keys recorded by the patch this context holds, if it
   * holds one. Several `set` calls in one update overwrite each other's
   * presence change, so the keys accumulate here rather than being taken from
   * the last call alone.
   */
  private patchedKeys?: Set<string>;

  /**
   * `baseless` is whether this context has already recorded a full put or a
   * `clear`. A context carries at most one presence change, so a patch
   * recorded after one of those would replace it rather than follow it -- and
   * the server has no base to fold that patch into. Once raised, the rest of
   * the update stays a full put.
   */
  private baseless = false;

  constructor(
    changeContext: ChangeContext,
    presence: P,
    patchable: boolean = false,
  ) {
    this.context = changeContext;
    this.presence = presence;
    this.patchable = patchable;
  }

  /**
   * `set` updates the presence based on the partial presence.
   */
  public set(presence: Partial<P>, option?: { addToHistory: boolean }) {
    for (const key of Object.keys(presence)) {
      this.presence[key as keyof P] = presence[key]!;
    }

    if (
      this.patchable &&
      !this.baseless &&
      !removesKey(presence) &&
      isCacheablePresence(this.presence)
    ) {
      const keys = this.patchedKeys ?? new Set<string>();
      for (const key of Object.keys(presence)) {
        keys.add(key);
      }
      this.patchedKeys = keys;

      const patch: Partial<P> = {};
      for (const key of keys) {
        patch[key as keyof P] = deepcopy(this.presence[key as keyof P]);
      }

      this.context.setPresenceChange({
        type: PresenceChangeType.Patch,
        presence: patch,
        full: deepcopy(this.presence),
      });
    } else {
      this.baseless = true;
      this.patchedKeys = undefined;
      this.context.setPresenceChange({
        type: PresenceChangeType.Put,
        presence: deepcopy(this.presence),
      });
    }

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
    this.baseless = true;
    this.patchedKeys = undefined;

    this.context.setPresenceChange({
      type: PresenceChangeType.Clear,
    });
  }
}
