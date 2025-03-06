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
  useState,
} from 'react';
import { Client } from '@yorkie-js/sdk';

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
 * `YorkieProviderProps` is a set of properties for `YorkieProvider`.
 */
interface YorkieProviderProps {
  apiKey: string;
  rpcAddr?: string;
}

/**
 * `YorkieProvider` is a component that provides the Yorkie client to its children.
 * It initializes the Yorkie client with the given API key and RPC address.
 */
export const YorkieProvider: React.FC<
  PropsWithChildren<YorkieProviderProps>
> = ({ apiKey, rpcAddr = 'https://api.yorkie.dev', children }) => {
  const [client, setClient] = useState<Client | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | undefined>(undefined);

  useEffect(() => {
    setLoading(true);
    setError(undefined);

    async function activateClient() {
      try {
        const newClient = new Client(rpcAddr, {
          apiKey,
        });
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
      client?.deactivate({ keepalive: true });
    };
  }, [apiKey, rpcAddr]);

  return (
    <YorkieContext.Provider value={{ client, loading, error }}>
      {children}
    </YorkieContext.Provider>
  );
};

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
