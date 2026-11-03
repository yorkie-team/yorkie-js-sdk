/*
 * Copyright 2026 The Yorkie Authors. All rights reserved.
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

/**
 * PROTOTYPE — the wire codec the Zero Tree relay and harness use to send
 * changes one by one. Changes travel as protobuf `Change` bytes (hex), the
 * same messages a Yorkie server stores; Zero Tree operations and elements
 * have their own protobuf messages (see `resources.proto`). Decoding builds
 * fresh objects, so replicas never share mutable state.
 */

import { converter } from '@yorkie-js/sdk/src/api/converter';
import { Change } from '@yorkie-js/sdk/src/document/change/change';
import { Indexable } from '@yorkie-js/sdk/src/document/document';
import {
  PresenceChange,
  PresenceChangeType,
} from '@yorkie-js/sdk/src/document/presence/change';

/**
 * A patch goes on the wire as a put of the full presence it was minted with
 * (there is no server here to fold it into the base).
 */
function encPresence<P extends Indexable>(
  change?: PresenceChange<P>,
): PresenceChange<P> | undefined {
  if (change?.type === PresenceChangeType.Patch && change.full) {
    return { type: PresenceChangeType.Put, presence: change.full };
  }
  return change;
}

/**
 * `encodeChange` encodes a change into a hex string of protobuf bytes.
 */
export function encodeChange<P extends Indexable>(change: Change<P>): string {
  const wire = Change.create<P>({
    id: change.getID(),
    operations: change.getOperations(),
    message: change.getMessage(),
    presenceChange: encPresence(change.getPresenceChange()),
  });
  return converter.bytesToHex(
    converter.changeToBytes(wire as unknown as Change<Indexable>),
  );
}

/**
 * `decodeChange` decodes a string made by `encodeChange`.
 */
export function decodeChange<P extends Indexable>(encoded: string): Change<P> {
  return converter.bytesToChange<P>(converter.hexToBytes(encoded));
}
