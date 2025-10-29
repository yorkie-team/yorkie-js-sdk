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
  useRef,
  useState,
} from 'react';
import { Client, Presence } from '@yorkie-js/sdk';
import { Store } from './createStore';
import {
  createPresenceStore,
  PresenceContextType,
} from './createPresenceStore';
import { useSelector } from './useSelector';
import { useYorkie } from './YorkieProvider';

/**
 * `PresenceContext` is a context for sharing Presence store across components.
 */
const PresenceContext = createContext<Store<PresenceContextType> | undefined>(
  undefined,
);

/**
 * `useYorkiePresence` is a custom hook that initializes and manages a Yorkie Presence.
 */
export function useYorkiePresence(
  client: Client | undefined,
  clientLoading: boolean,
  clientError: Error | undefined,
  presenceKey: string,
  isRealtime: boolean,
  presenceStore: Store<PresenceContextType>,
) {
  const presenceRef = useRef<Presence | undefined>(undefined);
  const [didMount, setDidMount] = useState(false);

  // NOTE(hackerwins): In StrictMode, the component will call twice
  // useEffect in development mode. To prevent attaching a presence
  // twice, attach a presence after the mounting.
  useEffect(() => {
    setDidMount(true);
  }, []);

  useEffect(() => {
    if (!didMount || clientLoading || clientError || !client) {
      if (clientError) {
        presenceStore.setState((state) => ({
          ...state,
          error: clientError,
          loading: false,
        }));
      }
      return;
    }

    let unsubscribe: (() => void) | undefined;

    /**
     * `attachPresence` attaches the presence to the client.
     */
    async function attachPresence() {
      if (!client || !client.isActive()) {
        return;
      }

      presenceStore.setState((state) => ({
        ...state,
        loading: true,
        error: undefined,
      }));

      try {
        const newPresence = new Presence(presenceKey);
        await client.attach(newPresence, { isRealtime });

        presenceRef.current = newPresence;

        // Subscribe to presence events
        unsubscribe = newPresence.subscribe((event) => {
          presenceStore.setState((state) => ({
            ...state,
            count: newPresence.getCount(),
          }));
        });

        presenceStore.setState({
          presence: newPresence,
          count: newPresence.getCount(),
          loading: false,
          error: undefined,
        });
      } catch (e) {
        presenceStore.setState((state) => ({
          ...state,
          loading: false,
          error:
            e instanceof Error ? e : new Error('Failed to attach presence'),
        }));
      }
    }

    attachPresence();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }

      /**
       * `detachPresence` detaches the presence from the client.
       */
      async function detachPresence() {
        if (presenceRef.current && client?.isActive()) {
          try {
            await client.detach(presenceRef.current);
          } catch (e) {
            console.error('Failed to detach presence:', e);
          }
        }
      }
      detachPresence();
    };
  }, [client, clientLoading, clientError, presenceKey, isRealtime, didMount]);
}

/**
 * `PresenceProviderProps` represents the props for PresenceProvider.
 */
export type PresenceProviderProps = PropsWithChildren<{
  /**
   * `presenceKey` is the key for the presence counter.
   */
  presenceKey: string;

  /**
   * `isRealtime` determines the synchronization mode.
   * - true: Realtime mode (automatic updates via watch stream)
   * - false: Manual mode (requires manual sync)
   * @default true
   */
  isRealtime?: boolean;
}>;

/**
 * `PresenceProvider` is a component that provides Presence context to its children.
 * It must be used within a YorkieProvider to access the client.
 *
 * @example
 * ```tsx
 * <YorkieProvider apiKey="..." rpcAddr="...">
 *   <PresenceProvider presenceKey="room-123" isRealtime={true}>
 *     <ChatRoom />
 *   </PresenceProvider>
 * </YorkieProvider>
 * ```
 */
export const PresenceProvider: React.FC<PresenceProviderProps> = ({
  children,
  presenceKey,
  isRealtime = true,
}) => {
  const { client, loading: clientLoading, error: clientError } = useYorkie();

  const presenceStoreRef = useRef<Store<PresenceContextType> | undefined>(
    undefined,
  );

  if (!presenceStoreRef.current) {
    presenceStoreRef.current = createPresenceStore({
      presence: undefined,
      count: 0,
      loading: true,
      error: undefined,
    });
  }

  const presenceStore = presenceStoreRef.current;

  useYorkiePresence(
    client,
    clientLoading,
    clientError,
    presenceKey,
    isRealtime,
    presenceStore,
  );

  return (
    <PresenceContext.Provider value={presenceStore}>
      {children}
    </PresenceContext.Provider>
  );
};

/**
 * `usePresenceStore` returns the Presence store from context.
 * It ensures that the hook is used within a PresenceProvider.
 *
 * @param hookName - Name of the hook calling this function (for error messages)
 * @returns The presence store
 * @throws Error if used outside of PresenceProvider
 */
export const usePresenceStore = (hookName: string) => {
  const presenceStore = useContext(PresenceContext);
  if (!presenceStore) {
    throw new Error(`${hookName} must be used within PresenceProvider`);
  }
  return presenceStore;
};

/**
 * `usePresence` is a custom hook that returns the presence state.
 * It must be used within a PresenceProvider.
 *
 * @returns An object containing count, loading, and error state
 *
 * @example
 * ```tsx
 * function ChatRoom() {
 *   const { count, loading, error } = usePresence();
 *
 *   if (loading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *
 *   return <div>{count} users online</div>;
 * }
 * ```
 */
export const usePresence = () => {
  const presenceStore = usePresenceStore('usePresence');
  const count = useSelector(presenceStore, (state) => state.count);
  const loading = useSelector(presenceStore, (state) => state.loading);
  const error = useSelector(presenceStore, (state) => state.error);

  return { count, loading, error };
};

/**
 * `usePresenceCount` is a custom hook that returns only the count value.
 * It must be used within a PresenceProvider.
 * This is a convenience hook for when you only need the count.
 *
 * @returns The current online user count
 *
 * @example
 * ```tsx
 * function UserCounter() {
 *   const count = usePresenceCount();
 *   return <span>{count} users online</span>;
 * }
 * ```
 */
export const usePresenceCount = (): number => {
  const presenceStore = usePresenceStore('usePresenceCount');
  return useSelector(presenceStore, (state) => state.count);
};
