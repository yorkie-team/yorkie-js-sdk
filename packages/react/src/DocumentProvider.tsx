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

import { createContext, useContext, useEffect, useState } from 'react';
import { Document, Indexable } from '@yorkie-js/sdk';
import { useYorkie } from './YorkieProvider';

type DocumentContextType<R, P> = {
  root: R;
  presences: { clientID: string; presence: P }[];
  update: (callback: (root: R) => void) => void;
  loading: boolean;
  error: Error | undefined;
};

const DocumentContext = createContext<DocumentContextType<any, any> | null>(
  null,
);

export const DocumentProvider = <R, P extends Indexable>({
  docKey,
  initialRoot,
  children,
}: {
  docKey: string;
  initialRoot: R;
  children: React.ReactNode;
}) => {
  const client = useYorkie();
  const [doc, setDoc] = useState<Document<R, P> | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [root, setRoot] = useState(initialRoot);
  const [presences, setPresences] = useState<
    { clientID: string; presence: any }[]
  >([]);

  useEffect(() => {
    setLoading(true);
    setError(undefined);

    if (!client) return;

    const newDoc = new Document<R, P>(docKey);
    async function attachDocument() {
      try {
        await client?.attach(newDoc);

        newDoc.subscribe(() => {
          setRoot({ ...newDoc.getRoot() });
        });

        newDoc.subscribe('presence', () => {
          setPresences(newDoc.getPresences());
        });

        setDoc(newDoc);
        setRoot({ ...newDoc.getRoot() });
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
      client.detach(newDoc);
    };
  }, [client, docKey]);

  const update = (callback: (root: any) => void) => {
    if (doc) {
      doc.update(callback);
    }
  };

  return (
    <DocumentContext.Provider
      value={{ root, presences, update, loading, error }}
    >
      {children}
    </DocumentContext.Provider>
  );
};

/**
 * `useDocument` is a custom hook that returns the root object and update function of the document.
 * This hook must be used within a `DocumentProvider`.
 */
export const useDocument = <R, P extends Indexable>() => {
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
 * `usePresence` is a custom hook that returns the presence of the document.
 */
export const usePresence = () => {
  const context = useContext(DocumentContext);
  if (!context) {
    throw new Error('usePresence must be used within a DocumentProvider');
  }
  return context.presences;
};
