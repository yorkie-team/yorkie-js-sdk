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
import { DocEventsForReplay, isDocEventsForReplay } from './types';

type DevtoolsStatus = 'connected' | 'disconnected' | 'synced';

/**
 * `devtoolsStatusByDocKey` stores the panel connection status of each document.
 * The panel reaches every document on the page through a single window message
 * channel, so the status cannot be shared across documents.
 */
const devtoolsStatusByDocKey = new Map<string, DevtoolsStatus>();
const unsubsByDocKey = new Map<string, Array<() => void>>();

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
  if (
    !doc.isEnableDevtools() ||
    typeof window === 'undefined' ||
    unsubsByDocKey.has(doc.getKey())
  ) {
    return;
  }

  docEventsForReplayByDocKey.set(doc.getKey(), []);
  devtoolsStatusByDocKey.set(doc.getKey(), 'disconnected');
  const unsub = doc.subscribe('all', (event) => {
    if (!isDocEventsForReplay(event)) {
      return;
    }

    docEventsForReplayByDocKey.get(doc.getKey())!.push(event);
    if (getDevtoolsStatus(doc.getKey()) === 'synced') {
      sendToPanel({
        msg: 'doc::sync::partial',
        docKey: doc.getKey(),
        event,
      });
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

  // TODO(hackerwins): We need to ensure that this event listener should be
  // removed later.
  window.addEventListener(
    'message',
    (event: MessageEvent<DevTools.FullPanelToSDKMessage>) => {
      if (event.data?.source !== EventSourceDevPanel) {
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
          logger.info(`[YD] Devtools subscribed. Doc: ${doc.getKey()}`);
          break;
      }
    },
  );
}
