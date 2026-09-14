/*
 * Copyright 2024 The Yorkie Authors. All rights reserved.
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

import { Document, Indexable } from '@yorkie-js/sdk/src/yorkie';
import { logger } from '@yorkie-js/sdk/src/util/logger';
import type * as DevTools from './protocol';
import { EventSourceDevPanel, EventSourceSDK } from './protocol';
import {
  DocEventsForReplay,
  DocNotification,
  isDocEventForReplay,
  isDocNotificationEvent,
} from './types';

type DevtoolsStatus = 'connected' | 'disconnected' | 'synced';

/**
 * `devtoolsStatusByDocKey` stores the panel connection status of each document.
 * The panel reaches every document on the page through a single window message
 * channel, so the status cannot be shared across documents.
 */
const devtoolsStatusByDocKey = new Map<string, DevtoolsStatus>();
const unsubsByDocKey = new Map<string, Array<() => void>>();

/**
 * `teardownByDocKey` releases everything the previous `setupDevtools` call
 * registered for a document key: the event subscription, the window listener
 * and the recorded events.
 */
const teardownByDocKey = new Map<string, () => void>();

/**
 * `getDevtoolsStatus` returns the panel connection status of the given
 * document.
 */
function getDevtoolsStatus(docKey: string): DevtoolsStatus {
  return devtoolsStatusByDocKey.get(docKey) || 'disconnected';
}

/**
 * `isPanelConnected` returns whether the panel is attached to any document on
 * this page.
 */
function isPanelConnected(): boolean {
  for (const status of devtoolsStatusByDocKey.values()) {
    if (status !== 'disconnected') {
      return true;
    }
  }

  return false;
}

/**
 * `docEventsForReplayByDocKey` stores all events in the document for replaying
 * (time-traveling feature) in Devtools. Later, external storage such as
 * IndexedDB will be used.
 */
const docEventsForReplayByDocKey = new Map<string, Array<DocEventsForReplay>>();
declare global {
  interface Window {
    docEventsForReplayByDocKey: Map<string, Array<DocEventsForReplay>>;
  }
}
if (typeof window !== 'undefined') {
  window.docEventsForReplayByDocKey = docEventsForReplayByDocKey;
}

/**
 * `docNotificationsByDocKey` stores the events that cannot be replayed, such as
 * `LocalChangesDropped`. They are kept beside `docEventsForReplayByDocKey`
 * because `Document.applyDocEventsForReplay` has no case for them and the
 * panel's time travel is an index over the replay list.
 */
const docNotificationsByDocKey = new Map<string, Array<DocNotification>>();

/**
 * `sendToPanel` sends a message to the devtools panel.
 */
function sendToPanel(
  message: DevTools.SDKToPanelMessage,
  options?: { force: boolean },
): void {
  const connected =
    'docKey' in message && getDevtoolsStatus(message.docKey) !== 'disconnected';
  if (!(options?.force || connected)) {
    return;
  }

  window.postMessage(
    {
      source: EventSourceSDK,
      ...message,
    },
    '*',
  );
}

/**
 * `setupDevtools` sets up the devtools integration. It sends messages to the
 * devtools panel when a document is available, when a document is subscribed,
 * and when a document is changed.
 */
export function setupDevtools<T, P extends Indexable>(
  doc: Document<T, P>,
): void {
  if (!doc.isEnableDevtools() || typeof window === 'undefined') {
    return;
  }

  // NOTE(hackerwins): A document key can be claimed twice on one page when a
  // component remounts and constructs a new Document under the same key. The
  // previous instance is gone, but its subscription and window listener would
  // keep answering the panel and hand the user a dead document's history, so
  // the newest instance takes the key over.
  //
  // The protocol identifies a document by its key alone, so two documents that
  // are alive at once under one key (two clients collaborating inside a single
  // page) are indistinguishable from a remount. The newest wins in both cases;
  // the older one stops being recorded. Telling them apart needs an identity
  // the protocol does not carry.
  teardownByDocKey.get(doc.getKey())?.();

  docEventsForReplayByDocKey.set(doc.getKey(), []);
  docNotificationsByDocKey.set(doc.getKey(), []);
  // NOTE(hackerwins): A re-claim replaces the Document behind the key, not the
  // panel's attachment to it. Zeroing the status here would make
  // `isPanelConnected` report false on a single-document page, so the SDK would
  // send `refresh-devtools` and wipe the view the re-announce path exists to
  // preserve.
  if (!devtoolsStatusByDocKey.has(doc.getKey())) {
    devtoolsStatusByDocKey.set(doc.getKey(), 'disconnected');
  }
  const unsub = doc.subscribe('all', (events) => {
    // NOTE(hackerwins): One transaction can carry both replayable events and
    // events that cannot be replayed, so the batch is split by hand.
    // `events.filter(isDocEventForReplay)` does not narrow here: this callback
    // receives `DocEvents<P>` with `P` still an unresolved type parameter,
    // while the guard is declared over `DocEvent<Indexable, OpInfo>`.
    const eventsForReplay: DocEventsForReplay = [];
    const notifications: Array<DocNotification> = [];
    for (const event of events) {
      if (isDocEventForReplay(event)) {
        eventsForReplay.push(event);
      } else if (isDocNotificationEvent(event)) {
        notifications.push({ event, timestamp: Date.now() });
      }
    }

    // NOTE(hackerwins): The replay half of the batch goes first, so that the
    // document state the panel replays never lags behind a notification that
    // refers to it. The two lists are rendered separately anyway, so the
    // interleaving within one transaction is not observable.
    if (eventsForReplay.length > 0) {
      docEventsForReplayByDocKey.get(doc.getKey())!.push(eventsForReplay);
      if (getDevtoolsStatus(doc.getKey()) === 'synced') {
        sendToPanel({
          msg: 'doc::sync::partial',
          docKey: doc.getKey(),
          event: eventsForReplay,
        });
      }
    }

    for (const notification of notifications) {
      docNotificationsByDocKey.get(doc.getKey())!.push(notification);
      if (getDevtoolsStatus(doc.getKey()) === 'synced') {
        sendToPanel({
          msg: 'doc::notification::partial',
          docKey: doc.getKey(),
          notification,
        });
      }
    }
  });
  // TODO(chacha912): Cancel the subscription when the document is removed.
  unsubsByDocKey.set(doc.getKey(), [unsub]);

  // NOTE(chacha912): Send initial message, in case the devtool panel is already open.
  // NOTE(hackerwins): When the panel is already attached to another document on
  // this page, announcing this document is enough. Asking for a refresh would
  // throw away the view the user is currently looking at.
  if (isPanelConnected()) {
    sendToPanel(
      {
        msg: 'doc::available',
        docKey: doc.getKey(),
      },
      { force: true },
    );
  } else {
    sendToPanel(
      {
        msg: 'refresh-devtools',
      },
      { force: true },
    );
  }

  const handleMessage = (
    event: MessageEvent<DevTools.FullPanelToSDKMessage>,
  ) => {
    // NOTE(hackerwins): `message` events also arrive from child frames. Only
    // this window's own posts come from the panel relay; a third-party iframe
    // must not be able to drive the bridge.
    if (event.source !== window || event.data?.source !== EventSourceDevPanel) {
      return;
    }

    const message = event.data;
    switch (message.msg) {
      case 'devtools::connect':
        // NOTE(hackerwins): The panel clears its state before sending
        // `devtools::connect`, so every document has to announce itself
        // again, including one that is already connected.
        devtoolsStatusByDocKey.set(doc.getKey(), 'connected');
        sendToPanel({
          msg: 'doc::available',
          docKey: doc.getKey(),
        });
        logger.info(`[YD] Devtools connected. Doc: ${doc.getKey()}`);
        break;
      case 'devtools::disconnect':
        devtoolsStatusByDocKey.set(doc.getKey(), 'disconnected');
        logger.info(`[YD] Devtools disconnected. Doc: ${doc.getKey()}`);
        break;
      case 'devtools::subscribe':
        // NOTE(hackerwins): The panel watches one document at a time, so
        // subscribing to another document stops the stream of this one.
        if (message.docKey !== doc.getKey()) {
          if (getDevtoolsStatus(doc.getKey()) === 'synced') {
            devtoolsStatusByDocKey.set(doc.getKey(), 'connected');
          }
          break;
        }

        devtoolsStatusByDocKey.set(doc.getKey(), 'synced');
        sendToPanel({
          msg: 'doc::sync::full',
          docKey: doc.getKey(),
          events: docEventsForReplayByDocKey.get(doc.getKey())!,
        });
        sendToPanel({
          msg: 'doc::notification::full',
          docKey: doc.getKey(),
          notifications: docNotificationsByDocKey.get(doc.getKey())!,
        });
        logger.info(`[YD] Devtools subscribed. Doc: ${doc.getKey()}`);
        break;
    }
  };
  window.addEventListener('message', handleMessage);

  // TODO(hackerwins): This runs when the key is claimed again. A document that
  // is removed and never recreated still leaks its listener.
  teardownByDocKey.set(doc.getKey(), () => {
    for (const unsubscribe of unsubsByDocKey.get(doc.getKey()) || []) {
      unsubscribe();
    }
    window.removeEventListener('message', handleMessage);
    unsubsByDocKey.delete(doc.getKey());
    docEventsForReplayByDocKey.delete(doc.getKey());
    docNotificationsByDocKey.delete(doc.getKey());
    teardownByDocKey.delete(doc.getKey());
  });
}
