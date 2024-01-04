/* eslint-disable jsdoc/require-jsdoc */
/* eslint-disable @typescript-eslint/naming-convention */
import { Document, Indexable } from '@yorkie-js-sdk/src/yorkie';
import type * as DevTools from './protocol';

function sendToPanel(message: DevTools.SDKToPanelMessage): void {
  // Devtools cannot be used in production environments or when run outside of a browser context
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') {
    return;
  }

  const fullMsg = {
    ...message,
    source: 'yorkie-devtools-sdk',
  };
  console.log('🚀 sdk ---> panel', fullMsg);

  window.postMessage(fullMsg, '*');
}

export function linkDevtools<T, P extends Indexable>(
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
}
