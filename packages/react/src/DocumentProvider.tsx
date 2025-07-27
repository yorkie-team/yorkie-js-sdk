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

import React, { createContext, useContext, useEffect, useRef } from 'react';
import {
  Document,
  Presence,
  Indexable,
  StreamConnectionStatus,
  Client,
} from '@yorkie-js/sdk';
import { useYorkie } from './YorkieProvider';
import { createDocumentStore } from './createDocumentStore';
import { useSelector } from './useSelector';
import { Store } from './createStore';
import { shallowEqual } from './shallowEqual';

/**
 * `useYorkieDocument` is a custom hook that initializes a Yorkie document.
 * @param client
 * @param clientLoading
 * @param clientError
 * @param docKey
 * @param initialRoot
 * @param initialPresence
 * @returns
 */
export function useYorkieDocument<R, P extends Indexable = Indexable>(
  client: Client | undefined,
  clientLoading: boolean,
  clientError: Error | undefined,
  docKey: string,
  initialRoot: R,
  initialPresence: P,
  documentStore: Store<DocumentContextType<R, P>>,
) {
  useEffect(() => {
    if (clientError) {
      documentStore.setState((state) => ({
        ...state,
        loading: false,
        error: clientError,
      }));
      return;
    }

    if (!client || clientLoading) {
      documentStore.setState((state) => ({
        ...state,
        loading: true,
      }));
      return;
    }

    documentStore.setState((state) => ({
      ...state,
      loading: true,
      error: undefined,
    }));

    const newDoc = new Document<R, P>(docKey);
    const unsubs: Array<() => void> = [];

    unsubs.push(
      newDoc.subscribe(() => {
        documentStore.setState((state) => ({
          ...state,
          root: newDoc.getRoot(),
        }));
      }),
    );

    unsubs.push(
      newDoc.subscribe('presence', () => {
        documentStore.setState((state) => ({
          ...state,
          presences: newDoc.getPresences(),
        }));
      }),
    );

    unsubs.push(
      newDoc.subscribe('connection', (event) => {
        documentStore.setState((state) => ({
          ...state,
          connection: event.value,
        }));
      }),
    );

    /**
     * `attachDocument` is an asynchronous function that attaches the document to the client.
     * */
    async function attachDocument() {
      try {
        await client?.attach(newDoc, {
          initialRoot,
          initialPresence,
        });

        const update = (callback: (root: R, presence: Presence<P>) => void) => {
          try {
            newDoc.update(callback);
          } catch (err) {
            documentStore.setState((state) => ({
              ...state,
              error:
                err instanceof Error
                  ? err
                  : new Error('Failed to update document'),
            }));
          }
        };

        documentStore.setState((state) => ({
          ...state,
          doc: newDoc,
          root: newDoc.getRoot(),
          presences: newDoc.getPresences(),
          update,
        }));
      } catch (err) {
        documentStore.setState((state) => ({
          ...state,
          error:
            err instanceof Error ? err : new Error('Failed to attach document'),
        }));
      } finally {
        documentStore.setState((state) => ({
          ...state,
          loading: false,
        }));
      }
    }

    attachDocument();

    return () => {
      if (client && client.hasDocument(docKey)) {
        client.detach(newDoc);
      }

      for (const unsub of unsubs) {
        unsub();
      }
    };
  }, [client, clientLoading, clientError, docKey, documentStore]);
}

export type DocumentContextType<R, P extends Indexable = Indexable> = {
  doc: Document<R, P> | undefined;
  root: R;
  presences: Array<{ clientID: string; presence: P }>;
  connection: StreamConnectionStatus;
  update: (callback: (root: R, presence: Presence<P>) => void) => void;
  loading: boolean;
  error: Error | undefined;
};

const DocumentContext =
  // eslint-disable-next-line @typescript-eslint/ban-types
  createContext<Store<DocumentContextType<any, any>> | null>(null);

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

  /**
   * Initialize the document store only once per component instance.
   * It prevents creating a new store on every render without using `useMemo`.
   */
  const documentStoreRef = useRef<
    ReturnType<typeof createDocumentStore<R, P>> | undefined
  >(undefined);

  if (!documentStoreRef.current) {
    documentStoreRef.current = createDocumentStore<R, P>(initialRoot);
  }

  const documentStore = documentStoreRef.current;

  useYorkieDocument<R, P>(
    client,
    clientLoading,
    clientError,
    docKey,
    initialRoot,
    initialPresence,
    documentStore,
  );

  return (
    <DocumentContext.Provider value={documentStore}>
      {children}
    </DocumentContext.Provider>
  );
};

/**
 * `useDocument` is a custom hook that returns the complete document context.
 * This hook must be used within a `DocumentProvider`.
 * @returns The complete document context.
 */
export function useDocument<
  R,
  P extends Indexable = Indexable,
>(): DocumentContextType<R, P> {
  const documentStore = useContext(DocumentContext);
  if (!documentStore) {
    throw new Error('useDocument must be used within a DocumentProvider');
  }

  return useSelector(documentStore);
}

/**
 * `createDocumentSelector` is a factory function that provides a selector-based `useDocument` hook.
 * By currying this function, type T can be inferred from the selector function.
 */
export const createDocumentSelector = <
  R,
  P extends Indexable = Indexable,
>() => {
  return <T = DocumentContextType<R, P>,>(
    selector?: (state: DocumentContextType<R, P>) => T,
    equalityFn: (a: T, b: T) => boolean = shallowEqual,
  ): T => {
    const documentStore = useContext(DocumentContext);
    if (!documentStore) {
      throw new Error('useDocument must be used within a DocumentProvider');
    }

    if (!selector) {
      return useSelector(documentStore, (s) => s as T, equalityFn);
    }

    return useSelector(documentStore, selector, equalityFn);
  };
};

/**
 * `useRoot` is a custom hook that returns the root object of the document.
 * This hook must be used within a `DocumentProvider`.
 */
export const useRoot = <R,>() => {
  const documentStore = useDocumentStore('useRoot');
  const root = useSelector(documentStore, (store) => store.root);
  return { root: root as R };
};

/**
 * `usePresences` is a custom hook that returns the presences of the document.
 */
export const usePresences = <P extends Indexable = Indexable>() => {
  const documentStore = useDocumentStore('usePresences');
  return useSelector(documentStore, (store) => store.presences) as Array<{
    clientID: string;
    presence: P;
  }>;
};

/**
 * `useConnection` is a custom hook that returns the connection status of the document.
 */
export const useConnection = () => {
  const documentStore = useDocumentStore('useConnection');
  return useSelector(documentStore, (store) => store.connection);
};

/**
 * `useDocumentStore` is a custom hook that returns the document store.
 * It also ensures that the hook is used within a `DocumentProvider`.
 */
const useDocumentStore = (hookName: string) => {
  const documentStore = useContext(DocumentContext);
  if (!documentStore) {
    throw new Error(`${hookName} must be used within a DocumentProvider`);
  }
  return documentStore;
};
