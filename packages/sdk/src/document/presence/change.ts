/*
 * Copyright 2025 The Yorkie Authors. All rights reserved.
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

import { Indexable } from '@yorkie-js/sdk/src/document/document';

/**
 * `PresencePatchCapability` is the name the server advertises in
 * `ChangePack.capabilities` when it can fold a `Patch` into the presence base
 * it holds. Absence means the server does not take patches.
 */
export const PresencePatchCapability = 'presence-patch';

/**
 * `PresenceChangeType` represents the type of presence change.
 */
export enum PresenceChangeType {
  Put = 'put',
  Clear = 'clear',
  Patch = 'patch',
}

/**
 * `PresenceChange` represents the change of presence.
 *
 * A `Patch` carries only the top-level keys that changed, so it is cheaper to
 * upload than the whole presence. It is normally produced locally: the server
 * folds each patch into a full `Put` before storing, so a pulled pack does not
 * usually carry one. A peer that echoes one back anyway is still decoded --
 * see `fromPresenceChange` -- rather than failing the whole pack.
 *
 * `full` is the whole presence as of the patch. It never goes on the wire, so
 * only a locally minted patch has it. It is what `Change.execute` applies
 * locally -- a local patch has no base to merge into on this side -- and what
 * a `ErrPresenceBaseUnavailable` fallback turns the patch back into. A patch
 * decoded off the wire has none, and is merged onto the presence already held
 * for its actor instead.
 */
export type PresenceChange<P extends Indexable> =
  | { type: PresenceChangeType.Put; presence: P }
  | { type: PresenceChangeType.Patch; presence: Partial<P>; full?: P }
  | { type: PresenceChangeType.Clear };
