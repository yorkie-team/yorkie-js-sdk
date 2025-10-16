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
  ClientOptions,
  Indexable,
  DocPresence,
  StreamConnectionStatus,
} from '@yorkie-js/sdk';
import pkg from '../package.json';
import { useYorkieClient } from './YorkieProvider';
import { useYorkieDocument } from './DocumentProvider';
import { useMemo, useRef } from 'react';
import { createDocumentStore } from './createDocumentStore';
import { useSelector } from './useSelector';

/**
 * `useYorkieDoc` is a custom hook that initializes a Yorkie Client and a
 * document in a single hook.
 */
export function useYorkieDoc<R, P extends Indexable = Indexable>(
  apiKey: string,
  docKey: string,
  opts?: Omit<ClientOptions, 'apiKey'> & {
    initialRoot?: R;
    initialPresence?: P;
  },
): {
  root: R;
  presences: Array<{ clientID: string; presence: P }>;
  connection: StreamConnectionStatus;
  update: (callback: (root: R, presence: DocPresence<P>) => void) => void;
  loading: boolean;
  error: Error | undefined;
} {
  const documentStoreRef = useRef<
    ReturnType<typeof createDocumentStore<R, P>> | undefined
  >(undefined);

  if (!documentStoreRef.current) {
    documentStoreRef.current = createDocumentStore<R, P>({
      doc: undefined,
      root: opts?.initialRoot ?? ({} as R),
      presences: [] as Array<{ clientID: string; presence: P }>,
      connection: StreamConnectionStatus.Disconnected,
      update: () => {},
      loading: true,
      error: undefined,
    });
  }

  const documentStore = documentStoreRef.current;

  // NOTE(hackerwins): useMemo is used to prevent creating a new client
  // every time the component re-renders. If the apiKey or docKey
  // changes, a new client will be created.
  const clientOpts = useMemo(() => {
    return {
      apiKey,
      userAgent: pkg.name + '/' + pkg.version,
      ...opts,
    };
  }, [apiKey, opts]);

  const {
    client,
    loading: clientLoading,
    error: clientError,
  } = useYorkieClient(clientOpts);

  useYorkieDocument<R, P>(
    client,
    clientLoading,
    clientError,
    docKey,
    opts?.initialRoot ?? ({} as R),
    opts?.initialPresence ?? ({} as P),
    documentStore,
  );

  const documentState = useSelector(documentStore);

  return {
    root: documentState.root,
    presences: documentState.presences,
    connection: documentState.connection,
    update: documentState.update,
    loading: documentState.loading,
    error: documentState.error,
  };
}
