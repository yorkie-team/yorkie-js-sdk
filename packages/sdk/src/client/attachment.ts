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

import { SyncMode } from '@yorkie-js/sdk/src/client/client';
import { Unsubscribe } from '@yorkie-js/sdk/src/util/observable';
import { Attachable } from './attachable';
import { Document } from '@yorkie-js/sdk/src/document/document';

/**
 * `WatchStream` represents a stream that watches the changes of a resource.
 * - For Document: AsyncIterable<WatchDocumentResponse>
 * - For Presence: AsyncIterable<WatchPresenceResponse>
 */
export type WatchStream = AsyncIterable<unknown>;

/**
 * `WatchStreamCreator` is a function type that creates a watch stream for a resource.
 * It takes an onDisconnect callback and returns a promise that resolves to a tuple of
 * [WatchStream, AbortController] for managing the stream lifecycle.
 */
export type WatchStreamCreator = (
  onDisconnect: () => void,
) => Promise<[WatchStream, AbortController]>;

/**
 * `Attachment` is a class that manages the state of an attachable resource (Document or Presence).
 */
export class Attachment<R extends Attachable> {
  resource: R;
  resourceID: string;
  syncMode?: SyncMode;
  changeEventReceived?: boolean;
  lastHeartbeatTime: number;

  private reconnectStreamDelay: number;
  private cancelled: boolean;
  private watchStream?: WatchStream;
  private watchLoopTimerID?: ReturnType<typeof setTimeout>;
  private watchAbortController?: AbortController;

  unsubscribeBroadcastEvent?: Unsubscribe;

  constructor(
    reconnectStreamDelay: number,
    resource: R,
    resourceID: string,
    syncMode?: SyncMode,
    unsubscribeBroadcastEvent?: Unsubscribe,
  ) {
    this.reconnectStreamDelay = reconnectStreamDelay;
    this.resource = resource;
    this.resourceID = resourceID;
    this.syncMode = syncMode;
    this.changeEventReceived = syncMode !== undefined ? false : undefined;
    this.lastHeartbeatTime = Date.now();
    this.cancelled = false;
    this.unsubscribeBroadcastEvent = unsubscribeBroadcastEvent;
  }

  /**
   * `changeSyncMode` changes the sync mode of the document.
   */
  public changeSyncMode(syncMode: SyncMode) {
    this.syncMode = syncMode;
  }

  /**
   * `needRealtimeSync` returns whether the resource needs to be synced in real time.
   * Only applicable to Document resources with syncMode defined.
   */
  public needRealtimeSync(): boolean {
    if (this.syncMode === SyncMode.RealtimeSyncOff) {
      return false;
    }

    if (this.syncMode === SyncMode.RealtimePushOnly) {
      return this.resource.hasLocalChanges();
    }

    return (
      this.syncMode !== SyncMode.Manual &&
      (this.resource.hasLocalChanges() || (this.changeEventReceived ?? false))
    );
  }

  /**
   * `needSync` determines if the attachment needs sync.
   * This includes both document sync and presence heartbeat.
   */
  public needSync(heartbeatInterval: number): boolean {
    // For Document: check if realtime sync is needed
    if (this.resource instanceof Document) {
      return this.needRealtimeSync();
    }

    // For Presence in Manual mode: never auto-sync
    if (this.syncMode === SyncMode.Manual) {
      return false;
    }

    // For Presence in Realtime mode: check if heartbeat is needed
    return Date.now() - this.lastHeartbeatTime >= heartbeatInterval;
  }

  /**
   * `updateHeartbeatTime` updates the last heartbeat time.
   */
  public updateHeartbeatTime(): void {
    this.lastHeartbeatTime = Date.now();
  }

  /**
   * `runWatchLoop` runs the watch loop.
   */
  public async runWatchLoop(
    watchStreamCreator: WatchStreamCreator,
  ): Promise<void> {
    const doLoop = async (): Promise<void> => {
      if (this.watchStream) {
        return Promise.resolve();
      }
      if (this.watchLoopTimerID) {
        clearTimeout(this.watchLoopTimerID);
        this.watchLoopTimerID = undefined;
      }

      try {
        [this.watchStream, this.watchAbortController] =
          await watchStreamCreator(() => {
            this.watchStream = undefined;
            this.watchAbortController = undefined;

            // NOTE(hackerwins): Only set reconnect timer if we're not being
            // cancelled.
            if (!this.cancelled) {
              this.watchLoopTimerID = setTimeout(
                doLoop,
                this.reconnectStreamDelay,
              );
            }
          });
      } catch {
        // TODO(hackerwins): For now, if the creation of the watch stream fails,
        // it is considered normal and the watch loop is executed again after a
        // certain period of time.
        // In the future, we need to find a better way to handle this.
      }
    };

    await doLoop();
  }

  /**
   * `cancelWatchStream` cancels the watch stream.
   */
  public cancelWatchStream(): void {
    this.cancelled = true;

    if (this.watchStream && this.watchAbortController) {
      this.watchAbortController.abort();
      this.watchStream = undefined;
      this.watchAbortController = undefined;
    }
    clearTimeout(this.watchLoopTimerID);
    this.watchLoopTimerID = undefined;
  }
}
