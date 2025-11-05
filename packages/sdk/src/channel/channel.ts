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
  NextFn,
  Observer,
  Unsubscribe,
} from '@yorkie-js/sdk/src/util/observable';
import { Json } from '../yorkie';

/**
 * Observable interface for subscribing to presence events.
 */
export interface Observable<T> {
  subscribe(observer: (event: T) => void): Unsubscribe;
}

/**
 * `PresenceStatus` represents the status of the presence.
 */
export enum ChannelStatus {
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
 * `BroadcastOptions` are the options for broadcasting a message.
 */
export interface BroadcastOptions {
  /**
   * `error` is called when an error occurs.
   */
  error?: (error: Error) => void;

  /**
   * `maxRetries` is the maximum number of retries.
   */
  maxRetries?: number;
}

/**
 * `ChannelEventType` represents the type of channel event.
 */
export enum ChannelEventType {
  /**
   * `Changed` means that the presence has changed.
   */
  PresenceChanged = 'presence-changed',

  /**
   * `Initialized` means that the presence watch has been initialized.
   */
  Initialized = 'initialized',

  /**
   * `Broadcast` means that a broadcast message has been received.
   */
  Broadcast = 'broadcast',

  /**
   * `LocalBroadcast` means that a broadcast message has been sent by the local client.
   */
  LocalBroadcast = 'local-broadcast',

  /**
   * `AuthError` means that an authentication error has occurred.
   */
  AuthError = 'auth-error',
}

/**
 * `PresenceEvent` represents a presence change event.
 */
export interface PresenceEvent {
  /**
   * `type` is the type of the event.
   */
  type: ChannelEventType.PresenceChanged | ChannelEventType.Initialized;

  /**
   * `count` is the current count value.
   */
  count: number;
}

export interface BroadcastEvent {
  type: ChannelEventType.Broadcast;
  clientID: ActorID;
  topic: string;
  payload: Json;
  options?: BroadcastOptions;
}

export interface LocalBroadcastEvent {
  type: ChannelEventType.LocalBroadcast;
  clientID: ActorID;
  topic: string;
  payload: Json;
  options?: BroadcastOptions;
}

/**
 * `AuthErrorEvent` represents an authentication error event.
 */
export interface AuthErrorEvent {
  /**
   * `type` is the type of the event.
   */
  type: ChannelEventType.AuthError;

  /**
   * `reason` is the reason for the authentication error.
   */
  reason: string;

  /**
   * `method` is the method that caused the authentication error.
   */
  method: string;
}

/**
 * `ChannelEvent` represents an event that occurs in the channel.
 */
export type ChannelEvent =
  | PresenceEvent
  | BroadcastEvent
  | LocalBroadcastEvent
  | AuthErrorEvent;

/**
 * `ChannelEventCallbackMap` represents a map of event types to callbacks.
 */
export type ChannelEventCallbackMap = {
  broadcast: NextFn<BroadcastEvent>;
  'local-broadcast': NextFn<LocalBroadcastEvent>;
  'auth-error': NextFn<AuthErrorEvent>;
  presence: NextFn<PresenceEvent>;
  all: NextFn<ChannelEvent>;
};

/**
 * `Channel` represents a lightweight channel for presence and messaging.
 */
export class Channel implements Observable<ChannelEvent>, Attachable {
  private key: string;
  private status: ChannelStatus;
  private actorID?: ActorID;
  private sessionID?: string;
  private count: number;
  private seq: number;

  private eventStream: Observable<ChannelEvent>;
  private eventStreamObserver!: Observer<ChannelEvent>;

  /**
   * @param key - the key of the channel.
   */
  constructor(key: string) {
    this.key = key;
    this.status = ChannelStatus.Detached;
    this.count = 0;
    this.seq = 0;
    this.eventStream = createObservable<ChannelEvent>(
      (observer) => (this.eventStreamObserver = observer),
    );
  }

  /**
   * `getKey` returns the key of this channel.
   */
  public getKey(): string {
    return this.key;
  }

  /**
   * `getStatus` returns the status of this channel.
   */
  public getStatus(): ChannelStatus {
    return this.status;
  }

  /**
   * `applyStatus` applies the channel status into this channel.
   */
  public applyStatus(status: ChannelStatus): void {
    this.status = status;
  }

  /**
   * `isAttached` returns whether this channel is attached or not.
   */
  public isAttached(): boolean {
    return this.status === ChannelStatus.Attached;
  }

  /**
   * `getActorID` returns the actor ID of this channel.
   */
  public getActorID(): ActorID | undefined {
    return this.actorID;
  }

  /**
   * `setActor` sets the actor ID into this channel.
   */
  public setActor(actorID: ActorID): void {
    this.actorID = actorID;
  }

  /**
   * `getSessionID` returns the session ID from the server.
   */
  public getSessionID(): string | undefined {
    return this.sessionID;
  }

  /**
   * `setSessionID` sets the session ID from the server.
   */
  public setSessionID(sessionID: string): void {
    this.sessionID = sessionID;
  }

  /**
   * `getPresenceCount` returns the current count value.
   */
  public getPresenceCount(): number {
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
   * `hasLocalChanges` returns whether this channel has local changes or not.
   * Channel is server-managed, so it always returns false.
   */
  public hasLocalChanges(): boolean {
    // NOTE(hackerwins): Consider to keep broadcast messages locally in the future.
    return false;
  }

  /**
   * `subscribe` registers a callback to subscribe to events on the channel.
   * The callback will be called when the broadcast event is received from the remote client.
   */
  public subscribe(
    type: 'broadcast',
    next: ChannelEventCallbackMap['broadcast'],
  ): Unsubscribe;
  /**
   * `subscribe` registers a callback to subscribe to events on the channel.
   * The callback will be called when the local client sends a broadcast event.
   */
  public subscribe(
    type: 'local-broadcast',
    next: ChannelEventCallbackMap['local-broadcast'],
  ): Unsubscribe;
  /**
   * `subscribe` registers a callback to subscribe to events on the channel.
   * The callback will be called when an authentication error occurs.
   */
  public subscribe(
    type: 'auth-error',
    next: ChannelEventCallbackMap['auth-error'],
  ): Unsubscribe;
  /**
   * `subscribe` registers a callback to subscribe to presence events on the channel.
   * The callback will be called when the presence count changes.
   */
  public subscribe(
    type: 'presence',
    next: ChannelEventCallbackMap['presence'],
  ): Unsubscribe;
  /**
   * `subscribe` registers a callback to subscribe to all events on the channel.
   */
  public subscribe(
    type: 'all',
    next: ChannelEventCallbackMap['all'],
  ): Unsubscribe;
  /**
   * `subscribe` registers a callback to subscribe to broadcast events for a specific topic.
   * The callback will be called when a broadcast event with the matching topic is received.
   */
  public subscribe(topic: string, next: NextFn<BroadcastEvent>): Unsubscribe;
  /**
   * `subscribe` registers an observer for all channel events.
   * Returns an unsubscribe function.
   */
  public subscribe(arg1: NextFn<ChannelEvent>): Unsubscribe;

  /**
   * `subscribe` implementation.
   */
  public subscribe(
    arg1:
      | 'broadcast'
      | 'local-broadcast'
      | 'auth-error'
      | 'presence'
      | 'all'
      | string
      | NextFn<ChannelEvent>,
    arg2?:
      | ChannelEventCallbackMap['broadcast']
      | ChannelEventCallbackMap['local-broadcast']
      | ChannelEventCallbackMap['auth-error']
      | ChannelEventCallbackMap['presence']
      | ChannelEventCallbackMap['all']
      | NextFn<BroadcastEvent>,
  ): Unsubscribe {
    if (typeof arg1 === 'function') {
      return this.eventStream.subscribe(arg1);
    }

    const typeOrTopic = arg1;
    const callback = arg2;

    if (!callback) {
      throw new Error(
        'callback is required when subscribing to specific event type or topic',
      );
    }

    // Handle reserved event types
    if (typeOrTopic === 'broadcast') {
      return this.eventStream.subscribe((event) => {
        if (event.type === ChannelEventType.Broadcast) {
          (callback as ChannelEventCallbackMap['broadcast'])(event);
        }
      });
    }

    if (typeOrTopic === 'local-broadcast') {
      return this.eventStream.subscribe((event) => {
        if (event.type === ChannelEventType.LocalBroadcast) {
          (callback as ChannelEventCallbackMap['local-broadcast'])(event);
        }
      });
    }

    if (typeOrTopic === 'auth-error') {
      return this.eventStream.subscribe((event) => {
        if (event.type === ChannelEventType.AuthError) {
          (callback as ChannelEventCallbackMap['auth-error'])(event);
        }
      });
    }

    if (typeOrTopic === 'presence') {
      return this.eventStream.subscribe((event) => {
        if (
          event.type === ChannelEventType.PresenceChanged ||
          event.type === ChannelEventType.Initialized
        ) {
          (callback as ChannelEventCallbackMap['presence'])(event);
        }
      });
    }

    if (typeOrTopic === 'all') {
      return this.eventStream.subscribe(callback as NextFn<ChannelEvent>);
    }

    // Handle topic-based subscription for broadcast events
    const topic = typeOrTopic;
    return this.eventStream.subscribe((event) => {
      if (event.type === ChannelEventType.Broadcast && event.topic === topic) {
        (callback as NextFn<BroadcastEvent>)(event);
      }
    });
  }

  /**
   * `publish` publishes an event to all registered handlers.
   */
  public publish(event: ChannelEvent): void {
    if (this.eventStreamObserver) {
      this.eventStreamObserver.next(event);
    }
  }

  /**
   * `broadcast` sends a message to all clients watching this channel.
   */
  public broadcast(
    topic: string,
    payload: any,
    options?: BroadcastOptions,
  ): void {
    if (this.status !== ChannelStatus.Attached) {
      throw new Error(`channel is not attached: ${this.status}`);
    }

    if (!this.actorID) {
      throw new Error('actorID is not set');
    }

    this.publish({
      type: ChannelEventType.LocalBroadcast,
      clientID: this.actorID,
      topic,
      payload,
      options,
    });
  }
}
