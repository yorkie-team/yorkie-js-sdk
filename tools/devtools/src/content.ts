import type { FullSDKToPanelMessage } from './protocol';

let panelPort = null;

// Relay messages received from the SDK to the Devtools panel.
window.addEventListener('message', (event) => {
  const message = event.data as Record<string, unknown>;
  if (message?.source === 'yorkie-devtools-sdk') {
    if (!panelPort) return;
    panelPort.postMessage(message as FullSDKToPanelMessage);
  }
});

// Relay messages received from the Devtools panel to the SDK.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'yorkie-devtools-panel') {
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
      source: 'yorkie-devtools-panel',
      msg: 'devtools::disconnect',
    });
  });
});
