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

import { EventSourceDevPanel } from '@yorkie-js/sdk';
import type { PanelToSDKMessage } from '@yorkie-js/sdk';

const tabID = chrome.devtools.inspectedWindow.tabId;

// `tabs.connect()` creates a reusable channel for long-term message passing between
// an extension page and a content script. This port can be used for communication with the
// inspected window of a Devtools extension.
// For more details: https://developer.chrome.com/docs/extensions/develop/concepts/messaging#connect
let port: chrome.runtime.Port;

/**
 * `disconnectPort` closes the channel to the inspected page, if one is open.
 *
 * Chrome does not fire `onDisconnect` on the side that disconnects, so the
 * caller's `onDisconnect` callback does not run: this is a deliberate close,
 * not the page going away.
 */
export const disconnectPort = () => {
  if (!port) return;
  port.disconnect();
  port = undefined;
};

export const connectPort = (onMessage, onDisconnect) => {
  // NOTE(hackerwins): The panel connects again whenever the inspected tab
  // finishes loading, and again when the error boundary remounts the provider.
  // Leaving the previous channel open would keep a second listener alive, and
  // its `onDisconnect` would later clear the port this call is about to open,
  // leaving `sendToSDK` a permanent no-op.
  disconnectPort();

  // The listeners below close over this channel rather than the module-level
  // `port`, so a late disconnect can only tear down the channel it belongs to.
  const connected = chrome.tabs.connect(tabID, {
    name: EventSourceDevPanel,
  });
  port = connected;

  connected.onMessage.addListener(onMessage);
  connected.onDisconnect.addListener(() => {
    connected.onMessage.removeListener(onMessage);
    onDisconnect();
    if (port === connected) {
      port = undefined;
    }
  });

  sendToSDK({ msg: 'devtools::connect' });
  return connected;
};

export const sendToSDK = (message: PanelToSDKMessage) => {
  if (!port) return;
  port.postMessage({
    source: EventSourceDevPanel,
    ...message,
  });
};
