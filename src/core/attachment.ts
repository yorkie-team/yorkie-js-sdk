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
 * `Attachment` is a class that manages the state of the document.
 */
export class Attachment<P> {
  doc: Document<unknown>;
  docID: string;
  isRealtimeSync: boolean;
  peerPresenceMap: Map<ActorID, PresenceInfo<P>>;
  remoteChangeEventReceived: boolean;

  watchStream?: any; // TODO(hackerwins): Define proper type of watchStream.
  watchLoopTimerID?: ReturnType<typeof setTimeout>;

  constructor(doc: Document<unknown>, docID: string, isRealtimeSync: boolean) {
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

    this.watchStream.cancel();
    this.watchStream = undefined;
    clearTimeout(this.watchLoopTimerID);
    this.watchLoopTimerID = undefined;
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
}
