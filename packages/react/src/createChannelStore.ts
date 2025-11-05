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

import { Channel } from '@yorkie-js/sdk';
import { createStore, Store } from './createStore';

/**
 * `ChannelContextType` represents the state of the Channel context.
 */
export type ChannelContextType = {
  /**
   * `channel` is the Channel instance.
   */
  channel: Channel | undefined;

  /**
   * `count` is the current online user count.
   */
  count: number;

  /**
   * `loading` indicates whether the presence is being initialized.
   */
  loading: boolean;

  /**
   * `error` contains any error that occurred during initialization.
   */
  error: Error | undefined;
};

/**
 * `createPresenceStore` creates a store for managing Presence state.
 * @param initialState - Initial state for the presence store
 * @returns Store instance for presence state management
 */
export function createChannelStore(
  initialState: ChannelContextType,
): Store<ChannelContextType> {
  return createStore<ChannelContextType>(initialState);
}
