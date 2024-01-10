import { Document, Indexable, Tree } from '@yorkie-js-sdk/src/yorkie';
import type * as DevTools from './protocol';

let isDevtoolsConnected = false;

/**
 * `sendToPanel` sends a message to the devtools panel.
 */
function sendToPanel(message: DevTools.SDKToPanelMessage): void {
  // Devtools cannot be used in production environments or when run outside of a browser context
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') {
    return;
  }
  if (!isDevtoolsConnected) {
    return;
  }

  const fullMsg = {
    ...message,
    source: 'yorkie-devtools-sdk',
  };
  window.postMessage(fullMsg, '*');
}

/**
 * `setupDevtools` configures the devtools panel, notifying it of document changes
 * and providing requested information.
 */
export function setupDevtools<T, P extends Indexable>(
  doc: Document<T, P>,
): void {
  // Devtools cannot be used in production environments or when run outside of a browser context
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') {
    return;
  }

  sendToPanel({
    msg: 'doc::available',
    docKey: doc.getKey(),
  });

  doc.subscribe('presence', (event) => {
    sendToPanel({
      msg: 'doc::sync::partial',
      docKey: doc.getKey(),
      clients: [doc.getSelfForTest(), ...doc.getOthersForTest()],
      event,
    });
  });

  doc.subscribe((event) => {
    sendToPanel({
      msg: 'doc::sync::partial',
      docKey: doc.getKey(),
      root: doc.toJSForTest(),
      event,
    });
  });

  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (
      (event.data as Record<string, unknown>)?.source !==
      'yorkie-devtools-panel'
    ) {
      return;
    }

    const message = event.data as DevTools.FullPanelToSDKMessage;
    switch (message.msg) {
      case 'devtools::connect':
        isDevtoolsConnected = true;
        sendToPanel({
          msg: 'doc::available',
          docKey: doc.getKey(),
        });
        break;
      case 'devtools::subscribe':
        sendToPanel({
          msg: 'doc::sync::full',
          docKey: doc.getKey(),
          root: doc.toJSForTest(),
          clients: [doc.getSelfForTest(), ...doc.getOthersForTest()],
        });
        break;
      case 'devtools::node::detail':
        if (message.data.type === 'YORKIE_TREE') {
          sendToPanel({
            msg: 'doc::node::detail',
            node: (
              doc.getValueByPath(message.data.path) as Tree
            )?.toJSInfoForTest(),
          });
        }
        break;
    }
  });
}
