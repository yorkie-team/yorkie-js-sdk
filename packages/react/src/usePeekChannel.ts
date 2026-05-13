/*
 * Copyright 2026 The Yorkie Authors. All rights reserved.
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

import { useCallback, useEffect, useRef, useState } from 'react';
import { useYorkie } from './YorkieProvider';

/**
 * `UsePeekChannelOptions` are user-settable options for `usePeekChannel`.
 */
export interface UsePeekChannelOptions {
  /**
   * `pollInterval` opts the hook into continuous polling at the given
   * cadence (ms). When unset, the hook fetches once on mount and stops —
   * this matches the common "snapshot at entry" pattern. Use polling only
   * when the UI genuinely needs a live-updating count.
   */
  pollInterval?: number;

  /**
   * `enabled` toggles execution. When false, the hook does not fetch and
   * holds the last value. Default: true.
   */
  enabled?: boolean;
}

/**
 * `UsePeekChannelResult` is the state exposed by `usePeekChannel`.
 */
export interface UsePeekChannelResult {
  /**
   * `sessionCount` is the most recently fetched count. Starts at 0 before
   * the first successful fetch; gate display on `loading` if 0-vs-unfetched
   * matters in your UI.
   */
  sessionCount: number;

  /**
   * `loading` is true before the first successful fetch (or while a
   * `refetch()` is in flight). Becomes false on success or error.
   */
  loading: boolean;

  /**
   * `error` holds the last error from a fetch, if any.
   */
  error?: Error;

  /**
   * `refetch` issues a peek immediately, ignoring `pollInterval`. Useful on
   * button clicks or after user actions that may have changed the count.
   */
  refetch: () => Promise<void>;
}

/**
 * `usePeekChannel` reads a channel's current session count without joining
 * the channel. By default it fetches once on mount; pass `pollInterval` to
 * opt into continuous polling. The caller does not create a Session on the
 * server, does not receive broadcasts, and does not contribute to the
 * channel's count.
 *
 * Prefer this over `<ChannelProvider readOnly>` when many viewers need to
 * display a count and only a few become real participants — e.g. a global
 * "N people writing" badge shown on every surrounding page.
 *
 * @example One-shot (snapshot at entry)
 * ```tsx
 * function WritersBadge() {
 *   const { sessionCount, loading } = usePeekChannel('post-writers');
 *   if (loading) return null;
 *   return <span>{sessionCount} writing</span>;
 * }
 * ```
 *
 * @example Continuous polling
 * ```tsx
 * function LiveCounter() {
 *   const { sessionCount } = usePeekChannel('post-writers', {
 *     pollInterval: 3000,
 *   });
 *   return <span>{sessionCount} writing</span>;
 * }
 * ```
 *
 * @example Imperative refetch
 * ```tsx
 * function WithRefresh() {
 *   const { sessionCount, refetch } = usePeekChannel('post-writers');
 *   return (
 *     <button onClick={() => refetch()}>{sessionCount} (refresh)</button>
 *   );
 * }
 * ```
 */
export function usePeekChannel(
  channelKey: string,
  opts: UsePeekChannelOptions = {},
): UsePeekChannelResult {
  const { client, loading: clientLoading, error: clientError } = useYorkie();
  const { pollInterval, enabled = true } = opts;

  const [sessionCount, setSessionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>(clientError);

  // Latest channelKey captured for refetch. Avoids closing over stale prop.
  const channelKeyRef = useRef(channelKey);
  channelKeyRef.current = channelKey;

  const peekOnce = useCallback(async () => {
    if (!client || !client.isActive()) return;
    try {
      const count = await client.peekChannel(channelKeyRef.current);
      setSessionCount(count);
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (clientError) {
      setError(clientError);
      setLoading(false);
      return;
    }
    if (clientLoading || !client || !enabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    setLoading(true);

    const run = async () => {
      if (cancelled || !client.isActive()) return;
      try {
        const count = await client.peekChannel(channelKey);
        if (cancelled) return;
        setSessionCount(count);
        setError(undefined);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (!cancelled && pollInterval !== undefined && pollInterval > 0) {
        timer = setTimeout(run, pollInterval);
      }
    };

    run();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [client, clientLoading, clientError, channelKey, pollInterval, enabled]);

  return { sessionCount, loading, error, refetch: peekOnce };
}
