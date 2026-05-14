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
import { Attachable } from './attachable';
import { Document } from '@yorkie-js/sdk/src/document/document';

/**
 * `WatchStream` represents a stream that watches the changes of a resource.
 * Uses the unified Watch RPC: AsyncIterable<WatchResponse>
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
  /**
   * For Documents: the document's resourceID, available at attach time.
   * For Channels: the server-issued session_id. Starts empty and is
   * populated after the first `RefreshChannel` first-call response.
   */
  resourceID: string;
  syncMode?: SyncMode;
  changeEventReceived?: boolean;
  lastHeartbeatTime: number;
  pollInterval: number;
  pollIntervalPinned: boolean;

  private reconnectStreamDelay: number;
  private cancelled: boolean;
  private watchStream?: WatchStream;
  private watchLoopTimerID?: ReturnType<typeof setTimeout>;
  private watchAbortController?: AbortController;
  private syncPromise?: Promise<void>;
  private _detaching = false;

  constructor(
    reconnectStreamDelay: number,
    resource: R,
    resourceID: string = '',
    syncMode?: SyncMode,
    pollInterval: number = 0,
    pollIntervalPinned: boolean = false,
  ) {
    this.reconnectStreamDelay = reconnectStreamDelay;
    this.resource = resource;
    this.resourceID = resourceID;
    this.syncMode = syncMode;
    this.changeEventReceived = syncMode !== undefined ? false : undefined;
    // Initialize to 0 so `needSync`/`needRealtimeSync` return true on the
    // very first tick. Otherwise the first heartbeat is delayed by one full
    // poll interval — channels would show stale sessionCount until then.
    this.lastHeartbeatTime = 0;
    this.pollInterval = pollInterval;
    this.pollIntervalPinned = pollIntervalPinned;
    this.cancelled = false;
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

    if (this.syncMode === SyncMode.Polling) {
      // Time-based: pull at every poll interval, regardless of local changes.
      return Date.now() - this.lastHeartbeatTime >= this.pollInterval;
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

    // For Channel in Manual mode: never auto-sync
    if (this.syncMode === SyncMode.Manual) {
      return false;
    }

    // For Channel in Realtime or Polling mode: heartbeat at the
    // attachment's own interval (falls back to client-level value if zero).
    const interval =
      this.pollInterval > 0 ? this.pollInterval : heartbeatInterval;
    return Date.now() - this.lastHeartbeatTime >= interval;
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
   * `markDetaching` marks this attachment as being in the process of detaching.
   * Once marked, the sync loop will skip this attachment.
   */
  public markDetaching(): void {
    this._detaching = true;
  }

  /**
   * `isDetaching` returns whether this attachment is being detached.
   */
  public isDetaching(): boolean {
    return this._detaching;
  }

  /**
   * `resetDetaching` resets the detaching flag so the attachment can resume
   * syncing. Used when a detach RPC fails and the document remains attached.
   */
  public resetDetaching(): void {
    this._detaching = false;
  }

  /**
   * `setSyncPromise` sets the in-progress sync promise for this attachment.
   */
  public setSyncPromise(promise: Promise<void>): void {
    this.syncPromise = promise;
  }

  /**
   * `clearSyncPromise` clears the in-progress sync promise.
   */
  public clearSyncPromise(): void {
    this.syncPromise = undefined;
  }

  /**
   * `waitForSyncComplete` waits for any in-progress sync to complete.
   */
  public async waitForSyncComplete(): Promise<void> {
    if (this.syncPromise) {
      try {
        await this.syncPromise;
      } catch {
        // Ignore sync errors — we just need it to finish
      }
    }
  }

  /**
   * `resetCancelled` clears the cancelled flag so the watch loop can run again
   * after a previous cancellation (e.g., after changeSyncMode back to Realtime).
   * Caller must invoke `runWatchLoop` immediately after to claim the stream slot;
   * `doLoop`'s `if (this.watchStream)` guard prevents double-stream creation if a
   * delayed `onDisconnect` callback from the previously-cancelled stream races.
   */
  public resetCancelled(): void {
    this.cancelled = false;
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
