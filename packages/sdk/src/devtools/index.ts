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

import {
  Document,
  Indexable,
  TransactionEvent,
} from '@yorkie-js-sdk/src/yorkie';
import { DocEventType } from '@yorkie-js-sdk/src/document/document';
import { logger } from '@yorkie-js-sdk/src/util/logger';
import type * as DevTools from './protocol';
import { EventSourceDevPanel, EventSourceSDK } from './protocol';

type DevtoolsStatus = 'connected' | 'disconnected' | 'synced';
let devtoolsStatus: DevtoolsStatus = 'disconnected';
const unsubsByDocKey = new Map<string, Array<() => void>>();

/**
 * `transactionEventsByDocKey` stores all events in the document for replaying
 * (time-traveling feature) in Devtools. Later, external storage such as
 * IndexedDB will be used.
 */
const transactionEventsByDocKey = new Map<string, Array<TransactionEvent>>();
declare global {
  interface Window {
    transactionEventsByDocKey: Map<string, Array<TransactionEvent>>;
  }
}
if (typeof window !== 'undefined') {
  window.transactionEventsByDocKey = transactionEventsByDocKey;
}

/**
 * `sendToPanel` sends a message to the devtools panel.
 */
function sendToPanel(
  message: DevTools.SDKToPanelMessage,
  options?: { force: boolean },
): void {
  if (!(options?.force || devtoolsStatus !== 'disconnected')) {
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

  transactionEventsByDocKey.set(doc.getKey(), []);
  const unsub = doc.subscribe('all', (event) => {
    if (
      event.some(
        (docEvent) =>
          docEvent.type !== DocEventType.StatusChanged &&
          docEvent.type !== DocEventType.Snapshot &&
          docEvent.type !== DocEventType.LocalChange &&
          docEvent.type !== DocEventType.RemoteChange &&
          docEvent.type !== DocEventType.Initialized &&
          docEvent.type !== DocEventType.Watched &&
          docEvent.type !== DocEventType.Unwatched &&
          docEvent.type !== DocEventType.PresenceChanged,
      )
    ) {
      return;
    }

    transactionEventsByDocKey.get(doc.getKey())!.push(event);
    if (devtoolsStatus === 'synced') {
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
  sendToPanel(
    {
      msg: 'refresh-devtools',
    },
    { force: true },
  );

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
          if (devtoolsStatus !== 'disconnected') {
            break;
          }
          devtoolsStatus = 'connected';
          sendToPanel({
            msg: 'doc::available',
            docKey: doc.getKey(),
          });
          logger.info(`[YD] Devtools connected. Doc: ${doc.getKey()}`);
          break;
        case 'devtools::disconnect':
          devtoolsStatus = 'disconnected';
          logger.info(`[YD] Devtools disconnected. Doc: ${doc.getKey()}`);
          break;
        case 'devtools::subscribe':
          devtoolsStatus = 'synced';
          sendToPanel({
            msg: 'doc::sync::full',
            docKey: doc.getKey(),
            events: transactionEventsByDocKey.get(doc.getKey())!,
          });
          logger.info(`[YD] Devtools subscribed. Doc: ${doc.getKey()}`);
          break;
      }
    },
  );
}
