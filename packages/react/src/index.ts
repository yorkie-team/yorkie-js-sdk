import { useEffect, useState } from 'react';
import { Client, Document, JSONArray, JSONObject } from '@yorkie-js/sdk';

/**
 * `useDocument` is a custom hook that returns the root object of the document.
 * @param apiKey
 * @param docKey
 * @param initialRoot
 * @returns
 */
function useDocument<T>(
  apiKey: string,
  docKey: string,
  initialRoot: T,
): {
  root: T;
  update: (callback: (root: T) => void) => void;
} {
  const [client, setClient] = useState<Client | undefined>(undefined);
  const [doc, setDoc] = useState<Document<T> | undefined>(undefined);
  const [root, setRoot] = useState<T>(initialRoot);

  useEffect(() => {
    /**
     * `setupYorkie` initializes the Yorkie client and attaches the document.
     */
    async function setupYorkie() {
      const client = new Client('https://api.yorkie.dev', { apiKey });
      await client.activate();

      const doc = new Document<T>(docKey);
      await client.attach(doc, {
        initialPresence: {},
        initialRoot,
      });

      doc.subscribe((event) => {
        if (event.type === 'remote-change' || event.type === 'local-change') {
          setRoot(doc.getRoot());
        }
      });

      setClient(client);
      setDoc(doc);
      setRoot(doc.getRoot());
    }

    setupYorkie();

    return () => {
      client?.deactivate({ keepalive: true });
    };
  }, [apiKey, docKey]);

  return {
    root,
    update: (callback: (root: T) => void) => doc?.update(callback),
  };
}

export { useDocument };
export type { JSONArray, JSONObject };
