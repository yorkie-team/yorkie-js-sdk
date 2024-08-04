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

import type { FullSDKToPanelMessage } from 'yorkie-js-sdk';
import { EventSourceDevPanel, EventSourceSDK } from 'yorkie-js-sdk';

let panelPort = null;

// Relay messages received from the SDK to the Devtools panel.
// TODO(hackerwins): We need to ensure that this event listener should be
// removed later.
window.addEventListener('message', (event) => {
  const message = event.data as Record<string, unknown>;
  if (message?.source === EventSourceSDK) {
    if (!panelPort) return;
    panelPort.postMessage(message as FullSDKToPanelMessage);
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
    panelPort.onMessage.removeListener(handleMessage);
    panelPort = null;
    window.postMessage({
      source: EventSourceDevPanel,
      msg: 'devtools::disconnect',
    });
  });
});
