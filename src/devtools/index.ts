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

import { Document, Indexable } from '@yorkie-js-sdk/src/yorkie';
import type * as DevTools from './protocol';
import { EventSourceDevPanel, EventSourceSDK } from './protocol';

let isDevtoolsConnected = false;
const unsubsByDocKey = new Map<string, Array<() => void>>();

/**
 * `sendToPanel` sends a message to the devtools panel.
 */
function sendToPanel(
  message: DevTools.SDKToPanelMessage,
  options?: { force: boolean },
): void {
  if (!(options?.force || isDevtoolsConnected)) {
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
 * `startSync` subscribes to a document and sends messages to a panel accordingly.
 * Initially sends a "full sync" message and later sends "partial sync" messages
 * on document changes.
 */
function startSync<T, P extends Indexable>(doc: Document<T, P>): void {
  sendToPanel({
    msg: 'doc::sync::full',
    docKey: doc.getKey(),
    changes: doc.getChangesForTest(),
  });

  const unsub = doc.subscribeForTest((event) => {
    sendToPanel({
      msg: 'doc::sync::partial',
      docKey: doc.getKey(),
      changes: event.value,
    });
  });

  unsubsByDocKey.set(doc.getKey(), [unsub]);
}

/**
 * `stopSync` cancels all subscriptions to a document.
 */
function stopSync(docKey: string): void {
  const unsubs = unsubsByDocKey.get(docKey);
  if (!unsubs) return;

  unsubsByDocKey.delete(docKey);
  for (const unsub of unsubs) {
    unsub();
  }
}

/**
 * `setupDevtools` sets up the devtools integration. It sends messages to the
 * devtools panel when a document is available, when a document is subscribed,
 * and when a document is changed.
 */
export function setupDevtools<T, P extends Indexable>(
  doc: Document<T, P>,
): void {
  // NOTE(hackerwins): For production builds, or when running in Node.js, do nothing.
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') {
    return;
  }

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
          if (isDevtoolsConnected) {
            break;
          }
          isDevtoolsConnected = true;
          sendToPanel({
            msg: 'doc::available',
            docKey: doc.getKey(),
          });
          break;
        case 'devtools::disconnect':
          isDevtoolsConnected = false;
          stopSync(doc.getKey());
          break;
        case 'devtools::subscribe':
          startSync(doc);
          break;
      }
    },
  );
}
