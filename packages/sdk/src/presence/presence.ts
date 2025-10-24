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
import { Attachable } from '@yorkie-js/sdk/src/client/attachable';
import {
  createObservable,
  Observer,
  Unsubscribe,
} from '@yorkie-js/sdk/src/util/observable';

/**
 * Observable interface for subscribing to presence events.
 */
export interface Observable<T> {
  subscribe(observer: (event: T) => void): Unsubscribe;
}

/**
 * `PresenceStatus` represents the status of the presence.
 */
export enum PresenceStatus {
  /**
   * `Detached` means that the presence is not attached to the client.
   */
  Detached = 'detached',

  /**
   * `Attached` means that the presence is attached to the client.
   */
  Attached = 'attached',

  /**
   * `Removed` means that the presence is removed.
   */
  Removed = 'removed',
}

/**
 * `PresenceEventType` represents the type of presence event.
 */
export enum PresenceEventType {
  /**
   * `Changed` means that the presence count has changed.
   */
  Changed = 'changed',

  /**
   * `Initialized` means that the presence watch has been initialized.
   */
  Initialized = 'initialized',
}

/**
 * `PresenceEvent` represents an event that occurs in the presence.
 */
export interface PresenceEvent {
  /**
   * `type` is the type of the event.
   */
  type: PresenceEventType;

  /**
   * `count` is the current count value.
   */
  count: number;
}

/**
 * `Presence` represents a lightweight presence counter for tracking online users.
 * It provides real-time count updates through the watch stream.
 * It implements Attachable interface to be managed by Attachment.
 */
export class Presence implements Observable<PresenceEvent>, Attachable {
  private key: string;
  private status: PresenceStatus;
  private actorID?: ActorID;
  private presenceID?: string;
  private count: number;
  private seq: number;

  private eventStream: Observable<PresenceEvent>;
  private eventStreamObserver!: Observer<PresenceEvent>;

  /**
   * @param key - the key of the presence counter.
   */
  constructor(key: string) {
    this.key = key;
    this.status = PresenceStatus.Detached;
    this.count = 0;
    this.seq = 0;
    this.eventStream = createObservable<PresenceEvent>(
      (observer) => (this.eventStreamObserver = observer),
    );
  }

  /**
   * `getKey` returns the key of this presence counter.
   */
  public getKey(): string {
    return this.key;
  }

  /**
   * `getStatus` returns the status of this presence counter.
   */
  public getStatus(): PresenceStatus {
    return this.status;
  }

  /**
   * `applyStatus` applies the presence status into this presence counter.
   */
  public applyStatus(status: PresenceStatus): void {
    this.status = status;
  }

  /**
   * `isAttached` returns whether this presence counter is attached or not.
   */
  public isAttached(): boolean {
    return this.status === PresenceStatus.Attached;
  }

  /**
   * `getActorID` returns the actor ID of this presence counter.
   */
  public getActorID(): ActorID | undefined {
    return this.actorID;
  }

  /**
   * `setActor` sets the actor ID into this presence counter.
   */
  public setActor(actorID: ActorID): void {
    this.actorID = actorID;
  }

  /**
   * `getPresenceID` returns the presence ID from the server.
   */
  public getPresenceID(): string | undefined {
    return this.presenceID;
  }

  /**
   * `setPresenceID` sets the presence ID from the server.
   */
  public setPresenceID(presenceID: string): void {
    this.presenceID = presenceID;
  }

  /**
   * `getCount` returns the current count value.
   */
  public getCount(): number {
    return this.count;
  }

  /**
   * `updateCount` updates the count and sequence number if the sequence is newer.
   * Returns true if the count was updated, false if the update was ignored.
   */
  public updateCount(count: number, seq: number): boolean {
    // Always accept initialization (seq === 0)
    if (seq === 0 || seq > this.seq) {
      this.count = count;
      this.seq = seq;
      return true;
    }

    return false;
  }

  /**
   * `hasLocalChanges` returns whether this presence has local changes or not.
   * Presence is server-managed, so it always returns false.
   */
  public hasLocalChanges(): boolean {
    return false;
  }

  /**
   * `subscribe` registers an observer for presence events.
   * Returns an unsubscribe function.
   */
  public subscribe(observer: (event: PresenceEvent) => void): Unsubscribe {
    return this.eventStream.subscribe(observer);
  }

  /**
   * `publish` publishes an event to all registered handlers.
   */
  public publish(event: PresenceEvent): void {
    if (this.eventStreamObserver) {
      this.eventStreamObserver.next(event);
    }
  }
}
