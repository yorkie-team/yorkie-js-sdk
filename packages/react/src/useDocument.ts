/*
 * Copyright 2025 The Yorkie Authors. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useCallback, useEffect, useState } from 'react';
import { Client, Document } from '@yorkie-js/sdk';

/**
 * `useDocument` is a custom hook that returns the root object of the document.
 *
 * @param apiKey
 * @param docKey
 * @param initialRoot
 * @returns
 */
export function useDocument<T>(
  apiKey: string,
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
          { apiKey },
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
  }, [apiKey, docKey, JSON.stringify(initialRoot), JSON.stringify(options)]);

  const update = useCallback(
    (callback: (root: T) => void) => {
      if (!doc) {
        console.warn('Attempted to update document before it was initialized');
        return;
      }

      doc.update((root) => {
        callback(root);
      });
    },
    [doc],
  );

  return {
    root,
    update,
    loading,
    error,
  };
}
