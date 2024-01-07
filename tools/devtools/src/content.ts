import type { FullSDKToPanelMessage } from './protocol';

let panelPort = null;
window.addEventListener('message', (event) => {
  const message = event.data as Record<string, unknown>;
  if (message?.source === 'yorkie-devtools-sdk') {
    if (!panelPort) return;
    // console.log('💌 msg from sdk', message);
    panelPort.postMessage(message as FullSDKToPanelMessage);
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'yorkie-devtools-panel') {
    return;
  }
  panelPort = port;
  panelPort.onMessage.addListener((message) => {
    // console.log('📝 msg from devtools', message);
    window.postMessage(message, '*');
  });
});
