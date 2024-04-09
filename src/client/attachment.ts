import { Document, Indexable } from '@yorkie-js-sdk/src/document/document';
import { SyncMode } from '@yorkie-js-sdk/src/client/client';

/**
 * `WatchStream` is a stream that watches the changes of the document.
 */
export type WatchStream = any; // TODO(hackerwins): Define proper type of watchStream.

/**
 * `Attachment` is a class that manages the state of the document.
 */
export class Attachment<T, P extends Indexable> {
  // TODO(hackerwins): Consider to changing the modifiers of the following properties to private.
  private reconnectStreamDelay: number;
  doc: Document<T, P>;
  docID: string;
  isRealtimeSync: boolean;
  syncMode: SyncMode;
  remoteChangeEventReceived: boolean;

  watchStream?: WatchStream;
  watchLoopTimerID?: ReturnType<typeof setTimeout>;
  watchAbortController?: AbortController;

  constructor(
    reconnectStreamDelay: number,
    doc: Document<T, P>,
    docID: string,
    isRealtimeSync: boolean,
  ) {
    this.reconnectStreamDelay = reconnectStreamDelay;
    this.doc = doc;
    this.docID = docID;
    this.isRealtimeSync = isRealtimeSync;
    this.syncMode = SyncMode.PushPull;
    this.remoteChangeEventReceived = false;
  }

  /**
   * `changeRealtimeSync` changes whether to synchronize the document in realtime or not.
   */
  public changeRealtimeSync(isRealtimeSync: boolean): boolean {
    if (this.isRealtimeSync === isRealtimeSync) {
      return false;
    }

    if (isRealtimeSync) {
      this.isRealtimeSync = true;
      return true;
    }

    this.cancelWatchStream();
    this.isRealtimeSync = false;
    return true;
  }

  /**
   * `changeSyncMode` changes the sync mode of the document.
   */
  public changeSyncMode(syncMode: SyncMode) {
    // NOTE(chacha912): In pushonly/syncoff mode, the client does not receive change events
    // from the server. Therefore, we need to set `remoteChangeEventReceived` to true
    // to sync the local and remote changes. This has limitations in that unnecessary
    // syncs occur if the client and server do not have any changes.
    if (syncMode === SyncMode.PushPull && syncMode !== this.syncMode) {
      this.remoteChangeEventReceived = true;
    }

    this.syncMode = syncMode;
  }

  /**
   * `needRealtimeSync` returns whether the document needs to be synced in real time.
   */
  public needRealtimeSync(): boolean {
    return (
      this.isRealtimeSync &&
      (this.doc.hasLocalChanges() || this.remoteChangeEventReceived)
    );
  }

  /**
   * `runWatchLoop` runs the watch loop.
   */
  public async runWatchLoop(
    watchStreamCreator: (onDisconnect: () => void) => Promise<WatchStream>,
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
            this.watchLoopTimerID = setTimeout(
              doLoop,
              this.reconnectStreamDelay,
            );
          });
      } catch (err) {
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
    if (this.watchStream && this.watchAbortController) {
      this.watchAbortController.abort();
      this.watchStream = undefined;
      this.watchAbortController = undefined;
    }
    clearTimeout(this.watchLoopTimerID);
    this.watchLoopTimerID = undefined;
  }
}
