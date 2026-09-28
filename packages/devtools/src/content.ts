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

import type { FullSDKToPanelMessage } from '@yorkie-js/sdk';
import { EventSourceDevPanel, EventSourceSDK } from '@yorkie-js/sdk';
import { replaceBigInts } from './devtools/stringify';

let panelPort = null;

// Relay messages received from the SDK to the Devtools panel.
// TODO(hackerwins): We need to ensure that this event listener should be
// removed later.
window.addEventListener('message', (event) => {
  // NOTE(hackerwins): A cross-origin iframe embedded by the inspected page can
  // post to this window too. Relaying those would let a third party inject
  // documents into the panel, so only this window's own posts are forwarded.
  if (event.source !== window) {
    return;
  }

  const message = event.data as Record<string, unknown>;
  if (message?.source === EventSourceSDK) {
    if (!panelPort) return;
    try {
      panelPort.postMessage(message as FullSDKToPanelMessage);
    } catch {
      // NOTE(hackerwins): The SDK reaches this window through `postMessage`,
      // which clones a `bigint` happily, but a port serializes as JSON and
      // refuses one — so a document holding a Long would lose every message
      // from here on. Only the message that was refused pays for the copy.
      panelPort.postMessage(replaceBigInts(message) as FullSDKToPanelMessage);
    }
  }
});

// Relay messages received from the Devtools panel to the SDK.
// TODO(hackerwins): We need to ensure that this event listener should be
// removed later.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== EventSourceDevPanel) {
    return;
  }
  panelPort = port;
  const handleMessage = (message) => {
    window.postMessage(message, '*');
  };

  port.onMessage.addListener(handleMessage);
  port.onDisconnect.addListener(() => {
    // NOTE(hackerwins): The panel closes its channel and opens a new one
    // whenever the inspected tab finishes loading or the error boundary
    // remounts the provider, so this handler can run for a channel that has
    // already been replaced. Keying off the closed-over `port` rather than
    // `panelPort` keeps a late disconnect from tearing down the live relay and
    // telling the SDK devtools went away.
    port.onMessage.removeListener(handleMessage);
    if (panelPort !== port) {
      return;
    }
    panelPort = null;
    window.postMessage({
      source: EventSourceDevPanel,
      msg: 'devtools::disconnect',
    });
  });
});
