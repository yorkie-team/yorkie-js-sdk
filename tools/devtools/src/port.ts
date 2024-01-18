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

import type { PanelToSDKMessage } from './protocol';

const DevPanel = 'yorkie-devtools-panel';
const tabID = chrome.devtools.inspectedWindow.tabId;

// `tabs.connect()` creates a reusable channel for long-term message passing between
// an extension page and a content script. This port can be used for communication with the
// inspected window of a Devtools extension.
// For more details: https://developer.chrome.com/docs/extensions/develop/concepts/messaging#connect
let port: chrome.runtime.Port;
port = chrome.tabs.connect(tabID, {
  name: DevPanel,
});
port.onDisconnect.addListener(() => {
  port = undefined;
});

export const sendToSDK = (message: PanelToSDKMessage) => {
  if (!port) return;
  port.postMessage({
    ...message,
    source: DevPanel,
  });
};

export const onPortMessage = port.onMessage;

// The inspected window was reloaded, so we should reload the panel.
// Ideally, we should reconnect instead of performing a full reload.
chrome.tabs.onUpdated.addListener((id, { status }) => {
  if (status === 'complete' && tabID === id) {
    window.location.reload();
  }
});
