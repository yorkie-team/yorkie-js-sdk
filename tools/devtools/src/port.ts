import type { PanelToSDKMessage } from './protocol';

const DevPanel = 'yorkie-devtools-panel';
const tabID = chrome.devtools.inspectedWindow.tabId;
const port = chrome.tabs.connect(tabID, {
  name: DevPanel,
});

export const sendMessageToTab = (message: PanelToSDKMessage) => {
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
