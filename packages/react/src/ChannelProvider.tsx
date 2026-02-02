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
import { Client, Channel } from '@yorkie-js/sdk';
import { Store } from './createStore';
import {
  createChannelStore as createChannelStore,
  ChannelContextType as ChannelContextType,
} from './createChannelStore';
import { useSelector } from './useSelector';
import { useYorkie } from './YorkieProvider';

/**
 * `ChannelContext` is a context for sharing Channel store across components.
 */
const ChannelContext = createContext<Store<ChannelContextType> | undefined>(
  undefined,
);

/**
 * `useYorkieChannel` is a custom hook that initializes and manages a Yorkie Channel.
 */
export function useYorkieChannel(
  client: Client | undefined,
  clientLoading: boolean,
  clientError: Error | undefined,
  channelKey: string,
  isRealtime: boolean,
  channelStore: Store<ChannelContextType>,
) {
  const channelRef = useRef<Channel | undefined>(undefined);
  const [didMount, setDidMount] = useState(false);

  // NOTE(hackerwins): In StrictMode, the component will call twice
  // useEffect in development mode. To prevent attaching a channel
  // twice, attach a channel after the mounting.
  useEffect(() => {
    setDidMount(true);
  }, []);

  useEffect(() => {
    if (!didMount || clientLoading || clientError || !client) {
      if (clientError) {
        channelStore.setState((state) => ({
          ...state,
          error: clientError,
          loading: false,
        }));
      }
      return;
    }

    let unsubscribe: (() => void) | undefined;

    /**
     * `attachChannel` attaches the channel to the client.
     */
    async function attachChannel() {
      if (!client || !client.isActive()) {
        return;
      }

      channelStore.setState((state) => ({
        ...state,
        loading: true,
        error: undefined,
      }));

      try {
        const newChannel = new Channel(channelKey);
        await client.attach(newChannel, { isRealtime });

        channelRef.current = newChannel;

        // Subscribe to channel events
        unsubscribe = newChannel.subscribe(() => {
          channelStore.setState((state) => ({
            ...state,
            sessionCount: newChannel.getSessionCount(),
          }));
        });

        channelStore.setState({
          channel: newChannel,
          sessionCount: newChannel.getSessionCount(),
          loading: false,
          error: undefined,
        });
      } catch (e) {
        channelStore.setState((state) => ({
          ...state,
          loading: false,
          error: e instanceof Error ? e : new Error('Failed to attach channel'),
        }));
      }
    }

    attachChannel();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }

      /**
       * `detachChannel` detaches the channel from the client.
       */
      async function detachChannel() {
        if (channelRef.current && client?.isActive()) {
          try {
            await client.detach(channelRef.current);
          } catch (e) {
            console.error('Failed to detach channel:', e);
          }
        }
      }
      detachChannel();
    };
  }, [client, clientLoading, clientError, channelKey, isRealtime, didMount]);
}

/**
 * `ChannelProviderProps` represents the props for ChannelProvider.
 */
export type ChannelProviderProps = PropsWithChildren<{
  /**
   * `channelKey` is the key for the channel.
   */
  channelKey: string;

  /**
   * `isRealtime` determines the synchronization mode.
   * - true: Realtime mode (automatic updates via watch stream)
   * - false: Manual mode (requires manual sync)
   * @default true
   */
  isRealtime?: boolean;
}>;

/**
 * `ChannelProvider` is a component that provides Channel context to its children.
 * It must be used within a YorkieProvider to access the client.
 *
 * @example
 * ```tsx
 * <YorkieProvider apiKey="..." rpcAddr="...">
 *   <ChannelProvider channelKey="room-123" isRealtime={true}>
 *     <ChatRoom />
 *   </ChannelProvider>
 * </YorkieProvider>
 * ```
 */
export const ChannelProvider: React.FC<ChannelProviderProps> = ({
  children,
  channelKey,
  isRealtime = true,
}) => {
  const { client, loading: clientLoading, error: clientError } = useYorkie();

  const channelStoreRef = useRef<Store<ChannelContextType> | undefined>(
    undefined,
  );

  if (!channelStoreRef.current) {
    channelStoreRef.current = createChannelStore({
      channel: undefined,
      sessionCount: 0,
      loading: true,
      error: undefined,
    });
  }

  const channelStore = channelStoreRef.current;

  useYorkieChannel(
    client,
    clientLoading,
    clientError,
    channelKey,
    isRealtime,
    channelStore,
  );

  return (
    <ChannelContext.Provider value={channelStore}>
      {children}
    </ChannelContext.Provider>
  );
};

/**
 * `useChannelStore` returns the Channel store from context.
 * It ensures that the hook is used within a ChannelProvider.
 *
 * @param hookName - Name of the hook calling this function (for error messages)
 * @returns The channel store
 * @throws Error if used outside of ChannelProvider
 */
export const useChannelStore = (hookName: string) => {
  const channelStore = useContext(ChannelContext);
  if (!channelStore) {
    throw new Error(`${hookName} must be used within ChannelProvider`);
  }
  return channelStore;
};

/**
 * `useChannel` is a custom hook that returns the channel state.
 * It must be used within a ChannelProvider.
 *
 * @returns An object containing sessionCount, loading, and error state
 *
 * @example
 * ```tsx
 * function ChatRoom() {
 *   const { sessionCount, loading, error } = useChannel();
 *
 *   if (loading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *
 *   return <div>{sessionCount} online</div>;
 * }
 * ```
 */
export const useChannel = () => {
  const channelStore = useChannelStore('useChannel');
  const sessionCount = useSelector(channelStore, (state) => state.sessionCount);
  const loading = useSelector(channelStore, (state) => state.loading);
  const error = useSelector(channelStore, (state) => state.error);

  return { sessionCount, loading, error };
};

/**
 * `useChannelSessionCount` is a custom hook that returns only the session count value.
 * It must be used within a ChannelProvider.
 * This is a convenience hook for when you only need the session count.
 *
 * @returns The current online session count
 *
 * @example
 * ```tsx
 * function UserCounter() {
 *   const count = useChannelSessionCount();
 *   return <span>{count} online</span>;
 * }
 * ```
 */
export const useChannelSessionCount = (): number => {
  const channelStore = useChannelStore('useChannelSessionCount');
  return useSelector(channelStore, (state) => state.sessionCount);
};
