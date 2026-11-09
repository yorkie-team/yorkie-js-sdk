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
import { Client, Channel, ChannelEventType, SyncMode } from '@yorkie-js/sdk';
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
  syncMode: SyncMode,
  channelHeartbeatInterval: number | undefined,
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
      // No `isActive()` gate: channels can attach on inactive clients under
      // the RefreshChannel-only lifecycle. The first heartbeat lazy-attaches
      // the client (and the channel) to the server.
      if (!client) {
        return;
      }

      channelStore.setState((state) => ({
        ...state,
        loading: true,
        error: undefined,
      }));

      try {
        const newChannel = new Channel(channelKey);
        await client.attach(newChannel, {
          syncMode,
          channelHeartbeatInterval,
        });

        channelRef.current = newChannel;

        // Subscribe to channel events. `client.attach(channel)` now returns
        // before the first RefreshChannel heartbeat, so `sessionCount` and
        // the Attached status only become valid after the server's first
        // response. Keep `loading: true` until that happens, then flip it
        // along with the populated sessionCount on the same event so the
        // UI never sees a transient `loading: false, sessionCount: 0`.
        //
        // SyncError / AuthError events from the SDK populate `error` so
        // consumers can render an error state via the same hook return.
        // Server-confirmed events (PresenceChanged / Initialized / remote
        // Broadcast) clear `error` because they prove the channel is
        // healthy again. LocalBroadcast is purely local and does not
        // imply recovery — exclude it explicitly.
        unsubscribe = newChannel.subscribe((event) => {
          if (
            event.type === ChannelEventType.SyncError ||
            event.type === ChannelEventType.AuthError
          ) {
            const nextError =
              event.type === ChannelEventType.SyncError
                ? event.error instanceof Error
                  ? event.error
                  : new Error(String(event.error))
                : new Error(
                    `auth error during ${event.method}: ${event.reason}`,
                  );
            channelStore.setState((state) => ({
              ...state,
              loading: false,
              error: nextError,
            }));
            return;
          }

          const recovers =
            event.type === ChannelEventType.PresenceChanged ||
            event.type === ChannelEventType.Initialized ||
            event.type === ChannelEventType.Broadcast;
          const ready = newChannel.isAttached() && !!newChannel.getSessionID();
          channelStore.setState((state) => ({
            ...state,
            sessionCount: newChannel.getSessionCount(),
            ...(recovers && state.error ? { error: undefined } : {}),
            ...(ready && state.loading ? { loading: false } : {}),
          }));
        });

        // Expose an idempotent detach so consumers can permanently stop a
        // channel from inside the tree (e.g. on `error`) without unmounting
        // the surrounding `<ChannelProvider>`. Calling `isAttached()` here
        // would be wrong — `client.attach(channel)` is local-only under the
        // RefreshChannel-only lifecycle, so the status stays `Detached`
        // until the first heartbeat lands; an `isAttached()` gate would
        // skip the call and leak the attachment entry. Instead, dispatch
        // unconditionally and swallow `ErrNotAttached` from duplicate /
        // post-unmount calls.
        const detach = async () => {
          if (!client) return;
          try {
            await client.detach(newChannel);
          } catch (err) {
            if (err instanceof Error && /not attached/i.test(err.message)) {
              return;
            }
            throw err;
          }
        };

        channelStore.setState((state) => ({
          ...state,
          channel: newChannel,
          error: undefined,
          detach,
        }));
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
       * `detachChannel` detaches the channel from the client. Channels can
       * be detached on inactive clients — detach is local cleanup only and
       * the server reclaims the session via TTL.
       *
       * Idempotent against the consumer-facing `detach` exposed via
       * `useChannel()`: if the consumer detached first, `client.detach`
       * throws `ErrNotAttached`, which we swallow as a normal cleanup race.
       */
      async function detachChannel() {
        if (channelRef.current && client) {
          try {
            await client.detach(channelRef.current);
          } catch (e) {
            if (e instanceof Error && /not attached/i.test(e.message)) {
              return;
            }
            console.error('Failed to detach channel:', e);
          }
        }
      }
      detachChannel();
    };
  }, [
    client,
    clientLoading,
    clientError,
    channelKey,
    syncMode,
    channelHeartbeatInterval,
    didMount,
  ]);
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
   * `syncMode` selects how the channel keeps presence in sync with the server.
   * - `SyncMode.Realtime` (default): open a watch stream and run the
   *   heartbeat. Required to receive broadcast events.
   * - `SyncMode.Polling`: heartbeat-only. No watch stream is opened.
   *   Recommended for large channels where broadcast is not needed.
   * - `SyncMode.Manual`: no automatic activity.
   *
   * If `isRealtime` is also set, `syncMode` wins.
   */
  syncMode?: SyncMode;

  /**
   * `isRealtime` is a convenience prop covering only Realtime/Manual.
   * - `true`: equivalent to `syncMode={SyncMode.Realtime}`.
   * - `false`: equivalent to `syncMode={SyncMode.Manual}`.
   *
   * Use `syncMode` directly when you want `SyncMode.Polling`, which this
   * boolean prop cannot express. When neither prop is set, the channel
   * falls back to `SyncMode.Realtime`.
   */
  isRealtime?: boolean;

  /**
   * `channelHeartbeatInterval` overrides the heartbeat interval (ms).
   * Applied at attach time. Defaults: Polling=3000, Realtime=30000.
   */
  channelHeartbeatInterval?: number;
}>;

/**
 * `ChannelProvider` is a component that provides Channel context to its children.
 * It must be used within a YorkieProvider to access the client.
 *
 * @example
 * ```tsx
 * import { ChannelProvider, SyncMode } from '@yorkie-js/react';
 *
 * <YorkieProvider apiKey="..." rpcAddr="...">
 *   <ChannelProvider channelKey="room-123" syncMode={SyncMode.Realtime}>
 *     <ChatRoom />
 *   </ChannelProvider>
 * </YorkieProvider>
 * ```
 *
 * The boolean `isRealtime` prop is also accepted as a shortcut for
 * the Realtime/Manual choice (`true` → Realtime, `false` → Manual).
 */
export const ChannelProvider: React.FC<ChannelProviderProps> = ({
  children,
  channelKey,
  syncMode,
  isRealtime,
  channelHeartbeatInterval,
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
      // Placeholder until `useYorkieChannel` wires up the real detach.
      // Pre-attach calls are a no-op rather than a throw.
      detach: async () => {},
    });
  }

  const channelStore = channelStoreRef.current;

  // Resolve syncMode: explicit syncMode wins, then isRealtime, else Realtime.
  const resolvedSyncMode: SyncMode =
    syncMode ?? (isRealtime === false ? SyncMode.Manual : SyncMode.Realtime);

  useYorkieChannel(
    client,
    clientLoading,
    clientError,
    channelKey,
    resolvedSyncMode,
    channelHeartbeatInterval,
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
 * @returns An object containing sessionCount, loading, error state and
 *          a `detach` function for permanently stopping the channel.
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
  const detach = useSelector(channelStore, (state) => state.detach);

  return { sessionCount, loading, error, detach };
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
