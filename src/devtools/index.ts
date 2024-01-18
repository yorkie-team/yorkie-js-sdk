import { Document, Indexable, Tree } from '@yorkie-js-sdk/src/yorkie';
import type * as DevTools from './protocol';

let isDevtoolsConnected = false;
const unsubsByDocKey = new Map<string, Array<() => void>>();

/**
 * `sendToPanel` sends a message to the devtools panel.
 */
function sendToPanel(message: DevTools.SDKToPanelMessage): void {
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
 * `startSync` subscribes to a document and sends messages to a panel accordingly.
 * Initially sends a "full sync" message and later sends "partial sync" messages
 * on document changes.
 */
function startSync<T, P extends Indexable>(doc: Document<T, P>): void {
  sendToPanel({
    msg: 'doc::sync::full',
    docKey: doc.getKey(),
    root: doc.toJSForTest(),
    clients: [doc.getSelfForTest(), ...doc.getOthersForTest()],
  });

  const unsubPresenceEvent = doc.subscribe('presence', (event) => {
    sendToPanel({
      msg: 'doc::sync::partial',
      docKey: doc.getKey(),
      clients: [doc.getSelfForTest(), ...doc.getOthersForTest()],
      event,
    });
  });

  const unsubDocEvent = doc.subscribe((event) => {
    sendToPanel({
      msg: 'doc::sync::partial',
      docKey: doc.getKey(),
      root: doc.toJSForTest(),
      event,
    });
  });

  unsubsByDocKey.set(doc.getKey(), [unsubPresenceEvent, unsubDocEvent]);
}

/**
 * `stopSync` cancels all subscriptions to a document.
 */
function stopSync(docKey: string): void {
  const unsubs = unsubsByDocKey.get(docKey);
  if (!unsubs) return;

  unsubsByDocKey.delete(docKey);
  for (const unsub of unsubs) {
    unsub();
  }
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
      case 'devtools::disconnect':
        isDevtoolsConnected = false;
        stopSync(doc.getKey());
        break;
      case 'devtools::subscribe':
        startSync(doc);
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
