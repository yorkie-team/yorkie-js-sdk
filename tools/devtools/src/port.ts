import type { PanelToSDKMessage } from './protocol';

const DevPanel = 'yorkie-devtools-panel';
const tabID = chrome.devtools.inspectedWindow.tabId;

// `tabs.connect()` creates a reusable channel for long-term message passing between
// an extension page and a content script. This port can be used for communication with the
// inspected window of a Devtools extension.
// For more details: https://developer.chrome.com/docs/extensions/develop/concepts/messaging#connect
let port: chrome.runtime.Port | null = null;
port = chrome.tabs.connect(tabID, {
  name: DevPanel,
});
port.onDisconnect.addListener(() => {
  port = null;
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
