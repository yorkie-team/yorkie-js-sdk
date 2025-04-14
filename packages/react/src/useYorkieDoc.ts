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
  Presence,
  StreamConnectionStatus,
} from '@yorkie-js/sdk';
import { useYorkieClient } from './YorkieProvider';
import { useYorkieDocument } from './DocumentProvider';
import { useMemo } from 'react';

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
  update: (callback: (root: R, presence: Presence<P>) => void) => void;
  loading: boolean;
  error: Error | undefined;
} {
  // NOTE(hackerwins): useMemo is used to prevent creating a new client
  // every time the component re-renders. If the apiKey or docKey
  // changes, a new client will be created.
  const clientOpts = useMemo(() => {
    return {
      apiKey,
      ...opts,
    };
  }, [apiKey]);

  const {
    client,
    loading: clientLoading,
    error: clientError,
  } = useYorkieClient(clientOpts);

  const { root, presences, connection, update, loading, error } =
    useYorkieDocument(
      client,
      clientLoading,
      clientError,
      docKey,
      opts?.initialRoot,
      opts?.initialPresence as P,
    );

  return {
    root: root as R,
    presences,
    connection,
    update: update as (
      callback: (root: R, presence: Presence<P>) => void,
    ) => void,
    loading,
    error,
  };
}
