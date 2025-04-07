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

import { Indexable, Presence, StreamConnectionStatus } from '@yorkie-js/sdk';
import { useYorkieClient } from './YorkieProvider';
import { useYorkieDocument } from './DocumentProvider';

/**
 * `useYorkieDoc` is a custom hook that initializes a Yorkie Client and a
 * document in a single hook.
 *
 * @param apiKey
 * @param docKey
 * @returns
 */
export function useYorkieDoc<R, P extends Indexable>(
  apiKey: string,
  docKey: string,
  options?: {
    initialRoot?: R;
    initialPresence?: P;
    rpcAddr?: string;
  },
): {
  root: R;
  presences: Array<{ clientID: string; presence: P }>;
  connection: StreamConnectionStatus;
  update: (callback: (root: R, presence: Presence<P>) => void) => void;
  loading: boolean;
  error: Error | undefined;
} {
  const rpcAddr = options?.rpcAddr || 'https://api.yorkie.dev';
  const initialRoot = options?.initialRoot || ({} as R);
  const initialPresence = options?.initialPresence || ({} as P);

  const {
    client,
    loading: clientLoading,
    error: clientError,
  } = useYorkieClient(apiKey, rpcAddr);

  const { root, presences, connection, update, loading, error } =
    useYorkieDocument(
      client,
      clientLoading,
      clientError,
      docKey,
      initialRoot,
      initialPresence,
    );

  return {
    root,
    presences,
    connection,
    update,
    loading,
    error,
  };
}
