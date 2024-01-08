import { Document, Indexable } from '@yorkie-js-sdk/src/yorkie';
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
      clients: doc.getPresences(),
      event,
    });
  });

  doc.subscribe((event) => {
    sendToPanel({
      msg: 'doc::sync::partial',
      docKey: doc.getKey(),
      root: doc.getRoot().toJSForTest!(),
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
          root: doc.getRoot().toJSForTest!(),
          clients: doc.getPresences(),
          nodeDetail: null,
        });
        break;
      case 'devtools::node::detail':
        if (message.data.type === 'YORKIE_TREE') {
          const elem = doc.getValueByPath(message.data.path) as any;
          sendToPanel({
            msg: 'doc::sync::partial',
            docKey: doc.getKey(),
            nodeDetail: getNewCRDTTree(elem?.tree?.getRoot()),
          });
        }
        break;
    }
  });
}

/**
 * getNewCRDTTree returns a new CRDT tree.
 */
function getNewCRDTTree(node: any, parent = null, depth = 0) {
  if (!node) return null;
  const currentNode = {
    type: node.type,
    parent,
    size: node.size,
    id: node.id.toTestString(),
    removedAt: node.removedAt?.toTestString(),
    insPrev: node.insPrevID?.toTestString(),
    insNext: node.insNextID?.toTestString(),
    value: node.isText ? node.value : undefined,
    isRemoved: node.isRemoved,
    children: [] as any,
    depth,
  };

  const children = node.children;
  for (let i = 0; i < children.length; i++) {
    currentNode.children.push(
      getNewCRDTTree(children[i], currentNode.id, depth + 1),
    );
  }
  return currentNode;
}
