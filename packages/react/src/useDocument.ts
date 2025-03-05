import { useEffect, useState } from 'react';
import { Client, Document } from '@yorkie-js/sdk';

/**
 * `useDocument` is a custom hook that returns the root object of the document.
 *
 * @param publicAPIKey
 * @param docKey
 * @param initialRoot
 * @returns
 */
export function useDocument<T>(
  publicAPIKey: string,
  docKey: string,
  initialRoot: T,
  options?: {
    rpcAddr?: string;
  },
): {
  root: T;
  update: (callback: (root: T) => void) => void;
  loading: boolean;
  error: Error | undefined;
} {
  const [client, setClient] = useState<Client | undefined>(undefined);
  const [doc, setDoc] = useState<Document<T> | undefined>(undefined);
  const [root, setRoot] = useState<T>(initialRoot);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | undefined>(undefined);

  useEffect(() => {
    setLoading(true);
    setError(undefined);

    /**
     * `setupYorkie` initializes the Yorkie client and attaches the document.
     */
    async function setupYorkie() {
      try {
        const client = new Client(
          options?.rpcAddr || 'https://api.yorkie.dev',
          { apiKey: publicAPIKey },
        );
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
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setLoading(false);
      }
    }

    setupYorkie();

    return () => {
      client?.deactivate({ keepalive: true });
    };
  }, [publicAPIKey, docKey]);

  return {
    root,
    update: (callback: (root: T) => void) => doc?.update(callback),
    loading,
    error,
  };
}
