/* eslint-disable jsdoc/require-jsdoc */
/* eslint-disable @typescript-eslint/naming-convention */
import { Document, Indexable } from '@yorkie-js-sdk/src/yorkie';

function sendToPanel(message: { msg: string }): void {
  // Devtools cannot be used in production environments or when run outside of a browser context
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') {
    return;
  }

  const fullMsg = {
    ...message,
    source: 'yorkie-devtools-document',
  };

  window.postMessage(fullMsg, '*');
}

export function linkDevtools<T, P extends Indexable>(
  doc: Document<T, P>,
): void {
  // Devtools cannot be used in production environments or when run outside of a browser context
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') {
    return;
  }

  sendToPanel({ msg: `yorkie document ready: ${doc.getKey()}` });
}
