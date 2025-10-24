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

import { ActorID } from '@yorkie-js/sdk/src/document/time/actor_id';

/**
 * `ResourceStatus` represents the common status interface for attachable resources.
 */
export type ResourceStatus = 'detached' | 'attached' | 'removed';

/**
 * `Attachable` is an interface for resources that can be attached to a client.
 */
export interface Attachable {
  /**
   * `getKey` returns the key of this resource.
   */
  getKey(): string;

  /**
   * `getStatus` returns the status of this resource.
   */
  getStatus(): ResourceStatus;

  /**
   * `setActor` sets the actor ID into this resource.
   */
  setActor(actorID: ActorID): void;

  /**
   * `hasLocalChanges` returns whether this resource has local changes to be synchronized.
   * Returns true for Document when there are uncommitted changes.
   * Returns false for Presence as it is server-managed.
   */
  hasLocalChanges(): boolean;

  /**
   * `publish` publishes an event to notify observers about changes in this resource.
   */
  publish(event: unknown): void;
}
