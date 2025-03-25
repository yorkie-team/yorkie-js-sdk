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

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  Document,
  Presence,
  Indexable,
  StreamConnectionStatus,
} from '@yorkie-js/sdk';
import { useYorkie } from './YorkieProvider';

type DocumentContextType<R, P extends Indexable = Indexable> = {
  root: R;
  presences: { clientID: string; presence: P }[];
  update: (callback: (root: R) => void) => void;
  loading: boolean;
  error: Error | undefined;
  connection: StreamConnectionStatus | undefined;
};

const DocumentContext = createContext<DocumentContextType<any> | null>(null);

/**
 * `DocumentProvider` is a component that provides a document to its children.
 * This component must be under a `YorkieProvider` component to initialize the
 * Yorkie client properly.
 */
export const DocumentProvider = <R, P extends Indexable = Indexable>({
  docKey,
  initialRoot = {} as R,
  initialPresence = {} as P,
  children,
}: {
  docKey: string;
  initialRoot?: R;
  initialPresence?: P;
  children?: React.ReactNode;
}) => {
  const { client, loading: clientLoading, error: clientError } = useYorkie();
  const [doc, setDoc] = useState<Document<R, P> | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [root, setRoot] = useState(initialRoot);
  const [presences, setPresences] = useState<
    { clientID: string; presence: any }[]
  >([]);
  const [connection, setConnection] = useState<
    StreamConnectionStatus | undefined
  >(undefined);

  useEffect(() => {
    if (clientError) {
      setLoading(false);
      setError(clientError);
      return;
    }

    if (!client || clientLoading) {
      setLoading(true);
      return;
    }

    setLoading(true);
    setError(undefined);

    const newDoc = new Document<R, P>(docKey);

    newDoc.subscribe(() => {
      setRoot(newDoc.getRoot());
    });

    newDoc.subscribe('presence', () => {
      setPresences(newDoc.getPresences());
    });

    newDoc.subscribe('connection', (event) => {
      setConnection(event.value);
    });

    async function attachDocument() {
      try {
        await client?.attach(newDoc, {
          initialRoot,
          initialPresence,
        });

        setDoc(newDoc);
        setRoot(newDoc.getRoot());
        setPresences(newDoc.getPresences());
      } catch (err) {
        setError(
          err instanceof Error ? err : new Error('Failed to attach document'),
        );
      } finally {
        setLoading(false);
      }
    }

    attachDocument();

    return () => {
      if (client && client.hasDocument(docKey)) {
        client.detach(newDoc);
      }
    };
  }, [client, clientLoading, clientError, docKey]);

  const update = useCallback(
    (callback: (root: R, presence: Presence<P>) => void) => {
      if (!doc) {
        return;
      }

      try {
        doc.update(callback);
      } catch (err) {
        setError(
          err instanceof Error ? err : new Error('Failed to update document'),
        );
      }
    },
    [doc],
  );

  return (
    <DocumentContext.Provider
      value={{ root, presences, update, loading, error, connection }}
    >
      {children}
    </DocumentContext.Provider>
  );
};

/**
 * `useDocument` is a custom hook that returns the root object and update function of the document.
 * This hook must be used within a `DocumentProvider`.
 */
export const useDocument = <R, P extends Indexable = Indexable>() => {
  const context = useContext(DocumentContext);
  if (!context) {
    throw new Error('useDocument must be used within a DocumentProvider');
  }
  return {
    root: context.root as R,
    presences: context.presences as { clientID: string; presence: P }[],
    update: context.update as (
      callback: (root: R, presence: P) => void,
    ) => void,
    loading: context.loading,
    error: context.error,
    connection: context.connection,
  };
};

/**
 * `useRoot` is a custom hook that returns the root object of the document.
 * This hook must be used within a `DocumentProvider`.
 */
export const useRoot = () => {
  const context = useContext(DocumentContext);
  if (!context) {
    throw new Error('useRoot must be used within a DocumentProvider');
  }
  return { root: context.root };
};

/**
 * `usePresences` is a custom hook that returns the presences of the document.
 */
export const usePresences = () => {
  const context = useContext(DocumentContext);
  if (!context) {
    throw new Error('usePresences must be used within a DocumentProvider');
  }
  return context.presences;
};

/**
 * `useConnection` is a custom hook that returns the connection status of the document.
 */
export const useConnection = () => {
  const context = useContext(DocumentContext);
  if (!context) {
    throw new Error('useConnection must be used within a DocumentProvider');
  }
  return context.connection;
};
