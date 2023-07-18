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

      const onDisconnect = () => {
        this.watchStream = undefined;
        this.watchLoopTimerID = setTimeout(doLoop, this.reconnectStreamDelay);
      };

      this.watchStream = await watchStreamCreator(onDisconnect);
    };

    await doLoop();
  }

  /**
   * `cancelWatchStream` cancels the watch stream.
   */
  public cancelWatchStream(): void {
    if (this.watchStream) {
      this.watchStream.cancel();
      this.watchStream = undefined;
    }
    clearTimeout(this.watchLoopTimerID);
    this.watchLoopTimerID = undefined;
  }
}
