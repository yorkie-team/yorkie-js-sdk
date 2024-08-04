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

import { EventSourceDevPanel } from 'yorkie-js-sdk';
import type { PanelToSDKMessage } from 'yorkie-js-sdk';

const tabID = chrome.devtools.inspectedWindow.tabId;

// `tabs.connect()` creates a reusable channel for long-term message passing between
// an extension page and a content script. This port can be used for communication with the
// inspected window of a Devtools extension.
// For more details: https://developer.chrome.com/docs/extensions/develop/concepts/messaging#connect
let port: chrome.runtime.Port;
export const connectPort = (onMessage, onDisconnect) => {
  port = chrome.tabs.connect(tabID, {
    name: EventSourceDevPanel,
  });

  port.onMessage.addListener(onMessage);
  port.onDisconnect.addListener(() => {
    port.onMessage.removeListener(onMessage);
    onDisconnect();
    port = undefined;
  });

  sendToSDK({ msg: 'devtools::connect' });
  return port;
};

export const sendToSDK = (message: PanelToSDKMessage) => {
  if (!port) return;
  port.postMessage({
    source: EventSourceDevPanel,
    ...message,
  });
};
