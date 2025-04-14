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
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Client, ClientOptions } from '@yorkie-js/sdk';

type YorkieContextType = {
  client: Client | undefined;
  loading: boolean;
  error: Error | undefined;
};

const YorkieContext = createContext<YorkieContextType>({
  client: undefined,
  loading: true,
  error: undefined,
});

/**
 * `useYorkieClient` is a custom hook that initializes a Yorkie client.
 */
export function useYorkieClient(opts: ClientOptions) {
  const [client, setClient] = useState<Client | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [didMount, setDidMount] = useState(false);

  // NOTE(hackerwins): In StrictMode, the component will call twice
  // useEffect in development mode. To prevent creating a new client
  // twice, create a client after the mounting.
  useEffect(() => {
    setDidMount(true);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(undefined);

    async function activateClient() {
      if (!didMount) {
        return;
      }

      try {
        const newClient = new Client(opts);
        await newClient.activate();
        setClient(newClient);
      } catch (e) {
        setError(
          e instanceof Error ? e : new Error('Failed to activate client'),
        );
      } finally {
        setLoading(false);
      }
    }
    activateClient();

    return () => {
      if (client?.isActive()) {
        client.deactivate({ keepalive: true });
      }
    };
  }, [opts.apiKey, opts.rpcAddr, didMount]);

  return { client, loading, error };
}

/**
 * `YorkieProvider` is a component that provides the Yorkie client to its children.
 * It initializes the Yorkie client with the given API key and RPC address.
 */
export const YorkieProvider: React.FC<PropsWithChildren<ClientOptions>> = ({
  children,
  ...opts
}) => {
  // NOTE(hackerwins): useMemo is used to prevent re-creating the client
  // when the component re-renders. If the apiKey or rpcAddr changes,
  // the client will be re-created.
  const clientOpts = useMemo(
    () => ({
      apiKey: opts.apiKey,
      rpcAddr: opts.rpcAddr,
    }),
    [opts.apiKey, opts.rpcAddr],
  );
  const { client, loading, error } = useYorkieClient(clientOpts);

  return (
    <YorkieContext.Provider value={{ client, loading, error }}>
      {children}
    </YorkieContext.Provider>
  );
};

/**
 * `useYorkie` is a custom hook that returns the Yorkie client and its loading state.
 * @returns
 */
export const useYorkie = () => {
  const context = useContext(YorkieContext);
  if (!context) {
    throw new Error('useYorkie must be used under YorkieProvider');
  }

  return {
    client: context.client,
    loading: context.loading,
    error: context.error,
  };
};
