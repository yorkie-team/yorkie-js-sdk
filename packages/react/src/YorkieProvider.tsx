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
import pkg from '../package.json';

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
 *
 * When `activate` is true (default) the client is activated against the
 * server on mount and deactivated on unmount — required for Document use
 * cases. Set `activate` to false for channel-only apps: the SDK now
 * lazy-attaches the client on the first RefreshChannel heartbeat, so
 * skipping the explicit activate/deactivate round trips removes two
 * unused RPCs per page load.
 */
export function useYorkieClient(opts: ClientOptions, activate: boolean = true) {
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

    /**
     * `activateClient` activates the Yorkie client.
     */
    async function activateClient() {
      if (!didMount) {
        return;
      }

      try {
        const newClient = new Client(opts);
        if (activate) {
          await newClient.activate();
        }
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
      if (activate && client?.isActive()) {
        client.deactivate({ keepalive: true });
      }
    };
  }, [opts.apiKey, opts.rpcAddr, didMount, activate]);

  return { client, loading, error };
}

/**
 * `YorkieProviderProps` extends `ClientOptions` with provider-level options.
 *
 * - `activate` (default `true`): whether to call `client.activate()` on mount
 *   and `client.deactivate()` on unmount. Set to `false` for apps that only
 *   use Channels — under the RefreshChannel-only lifecycle the SDK
 *   lazy-attaches the client on the first heartbeat, so explicit activate
 *   round trips become unnecessary. Document use cases (`useDocument`,
 *   `useYorkieDoc`) still require activation, so leave this `true` if any
 *   descendant attaches a document.
 */
export type YorkieProviderProps = ClientOptions & {
  activate?: boolean;
};

/**
 * `YorkieProvider` is a component that provides the Yorkie client to its children.
 * It initializes the Yorkie client with the given API key and RPC address.
 */
export const YorkieProvider: React.FC<
  PropsWithChildren<YorkieProviderProps>
> = ({ children, activate = true, ...opts }) => {
  // NOTE(hackerwins): useMemo is used to prevent re-creating the client
  // when the component re-renders. If the apiKey or rpcAddr changes,
  // the client will be re-created.
  const clientOpts = useMemo(() => {
    return {
      userAgent: pkg.name + '/' + pkg.version,
      ...opts,
    };
  }, [opts.apiKey, opts.rpcAddr]);
  const { client, loading, error } = useYorkieClient(clientOpts, activate);

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
