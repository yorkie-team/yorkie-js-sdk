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

import { useEffect, useState } from 'react';
import { useYorkie } from './YorkieProvider';

/**
 * `UsePeekChannelOptions` are user-settable options for `usePeekChannel`.
 */
export interface UsePeekChannelOptions {
  /**
   * `pollInterval` is the cadence (ms) at which to re-read the count.
   * Default: 3000.
   */
  pollInterval?: number;

  /**
   * `enabled` toggles polling on/off. When false, polling stops and the
   * hook holds the last value. Default: true.
   */
  enabled?: boolean;
}

/**
 * `UsePeekChannelResult` is the state exposed by `usePeekChannel`.
 */
export interface UsePeekChannelResult {
  sessionCount: number;
  loading: boolean;
  error?: Error;
}

/**
 * `usePeekChannel` reads a channel's current session count without joining
 * the channel. The caller polls on the configured cadence; no Session is
 * created on the server and no broadcasts are received.
 *
 * Prefer this over `<ChannelProvider readOnly>` when many viewers need to
 * display a count and only a few become real participants — e.g. a global
 * "N people writing" badge shown on every surrounding page.
 *
 * @example
 * ```tsx
 * function WritersBadge() {
 *   const { sessionCount } = usePeekChannel('post-writers', {
 *     pollInterval: 2000,
 *   });
 *   return <span>{sessionCount} writing</span>;
 * }
 * ```
 */
export function usePeekChannel(
  channelKey: string,
  opts: UsePeekChannelOptions = {},
): UsePeekChannelResult {
  const { client, loading: clientLoading, error: clientError } = useYorkie();
  const pollInterval = opts.pollInterval ?? 3000;
  const enabled = opts.enabled !== false;

  const [sessionCount, setSessionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>(clientError);

  useEffect(() => {
    if (clientError) {
      setError(clientError);
      setLoading(false);
      return;
    }
    if (clientLoading || !client || !enabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (cancelled || !client.isActive()) return;
      try {
        const count = await client.peekChannel(channelKey);
        if (cancelled) return;
        setSessionCount(count);
        setError(undefined);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setLoading(false);
      } finally {
        if (!cancelled) {
          timer = setTimeout(tick, pollInterval);
        }
      }
    };

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [client, clientLoading, clientError, channelKey, pollInterval, enabled]);

  return { sessionCount, loading, error };
}
