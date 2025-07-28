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
  useRef,
} from 'react';
import { Client, ClientOptions } from '@yorkie-js/sdk';
import pkg from '../package.json';
import { createClientStore } from './createClientStore';
import { useSelector } from './useSelector';
import { Store } from './createStore';

type YorkieContextType = {
  client: Client | undefined;
  loading: boolean;
  error: Error | undefined;
};

// eslint-disable-next-line @typescript-eslint/ban-types
const YorkieContext = createContext<Store<YorkieContextType> | null>(null);

/**
 * `useYorkieClient` is a custom hook that initializes a Yorkie client.
 * NOTE(hackerwins): In StrictMode, the component will call twice
 *  useEffect in development mode. To prevent creating a new client
 *  twice, create a client after the mounting.
 */
export function useYorkieClient(
  opts: ClientOptions,
  clientStore: Store<YorkieContextType>,
) {
  const didMountRef = useRef(false);

  useEffect(() => {
    didMountRef.current = true;
  }, []);

  useEffect(() => {
    clientStore.setState((state) => ({
      ...state,
      loading: true,
      error: undefined,
    }));

    /**
     * `activateClient` activates the Yorkie client.
     */
    async function activateClient() {
      if (!didMountRef.current) {
        return;
      }

      try {
        const newClient = new Client(opts);
        await newClient.activate();
        clientStore.setState((state) => ({
          ...state,
          client: newClient,
        }));
      } catch (e) {
        clientStore.setState((state) => ({
          ...state,
          error:
            e instanceof Error ? e : new Error('Failed to activate client'),
        }));
      } finally {
        clientStore.setState((state) => ({
          ...state,
          loading: false,
        }));
      }
    }
    activateClient();

    return () => {
      const currentState = clientStore.getSnapshot();
      if (currentState.client?.isActive()) {
        currentState.client.deactivate({ keepalive: true });
      }
    };
  }, [opts, clientStore]);
}

// [apiKey, opts?.rpcAddr, opts?.token, opts?.initialPresence, opts?.initialRoot])

/**
 * `YorkieProvider` is a component that provides the Yorkie client to its children.
 * It initializes the Yorkie client with the given API key and RPC address.
 */
export const YorkieProvider: React.FC<PropsWithChildren<ClientOptions>> = ({
  children,
  ...opts
}) => {
  const clientStoreRef = useRef<
    ReturnType<typeof createClientStore> | undefined
  >(undefined);

  if (!clientStoreRef.current) {
    clientStoreRef.current = createClientStore();
  }

  const clientStore = clientStoreRef.current;

  // NOTE(hackerwins): useMemo is used to prevent re-creating the client
  // when the component re-renders. If the apiKey or rpcAddr changes,
  // the client will be re-created.
  const clientOpts = useMemo(() => {
    return {
      userAgent: pkg.name + '/' + pkg.version,
      ...opts,
    };
  }, [opts.apiKey, opts.rpcAddr]);

  useYorkieClient(clientOpts, clientStore);

  return (
    <YorkieContext.Provider value={clientStore}>
      {children}
    </YorkieContext.Provider>
  );
};

/**
 * `useYorkie` is a custom hook that returns the complete Yorkie client context.
 * @returns The complete Yorkie client context.
 */
export const useYorkie = () => {
  const clientStore = useContext(YorkieContext);
  if (!clientStore) {
    throw new Error('useYorkie must be used under YorkieProvider');
  }

  return useSelector(clientStore);
};
