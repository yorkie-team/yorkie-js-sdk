import { ActorID } from '@yorkie-js-sdk/src/document/time/actor_id';
import { Document } from '@yorkie-js-sdk/src/document/document';

/**
 * `PresenceInfo` is presence information of this client.
 */
export type PresenceInfo<P> = {
  clock: number;
  data: P;
};

/**
 * `WatchStream` is a stream that watches the changes of the document.
 */
export type WatchStream = any; // TODO(hackerwins): Define proper type of watchStream.

/**
 * `Attachment` is a class that manages the state of the document.
 */
export class Attachment<P> {
  // TODO(hackerwins): Consider to changing the modifiers of the following properties to private.
  private reconnectStreamDelay: number;
  doc: Document<unknown>;
  docID: string;
  isRealtimeSync: boolean;
  private peerPresenceMap: Map<ActorID, PresenceInfo<P>>;
  remoteChangeEventReceived: boolean;

  watchStream?: WatchStream;
  watchLoopTimerID?: ReturnType<typeof setTimeout>;

  constructor(
    reconnectStreamDelay: number,
    doc: Document<unknown>,
    docID: string,
    isRealtimeSync: boolean,
  ) {
    this.reconnectStreamDelay = reconnectStreamDelay;
    this.doc = doc;
    this.docID = docID;
    this.isRealtimeSync = isRealtimeSync;
    this.peerPresenceMap = new Map();
    this.remoteChangeEventReceived = false;
  }

  /**
   * `changeSyncMode` changes the sync mode of the document.
   */
  public changeSyncMode(isRealtimeSync: boolean): boolean {
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
   * `hasPresence` returns whether the client has presence information.
   */
  public hasPresence(clientID: ActorID): boolean {
    return this.peerPresenceMap.has(clientID);
  }

  /**
   * `setPresence` sets the presence information of the client.
   */
  public setPresence(clientID: ActorID, presenceInfo: PresenceInfo<P>): void {
    if (
      this.peerPresenceMap.has(clientID) &&
      this.peerPresenceMap.get(clientID)!.clock > presenceInfo.clock
    ) {
      return;
    }

    this.peerPresenceMap.set(clientID, presenceInfo);
  }

  /**
   * `getPresence` returns the presence information of the client.
   */
  public getPresence(clientID: ActorID): P | undefined {
    return this.peerPresenceMap.get(clientID)?.data;
  }

  /**
   * `removePresence` removes the presence information of the client.
   */
  public removePresence(clientID: ActorID): void {
    this.peerPresenceMap.delete(clientID);
  }

  /**
   * `getPeers` returns the list of peers.
   */
  public getPeers(): Array<{ clientID: ActorID; presence: P }> {
    const peers: Array<{ clientID: ActorID; presence: P }> = [];
    for (const [clientID, presenceInfo] of this.peerPresenceMap!) {
      peers.push({ clientID, presence: presenceInfo.data });
    }
    return peers;
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
