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

import { describe, it, assert } from 'vitest';
import yorkie from '@yorkie-js/sdk/src/yorkie';
import type { ClientOptions } from '@yorkie-js/sdk/src/client/client';

/**
 * `requestedInterval` opens a watch stream of the given kind on a client
 * built with `opts`, and returns the heartbeat interval its Watch request
 * asked for. The fake `watch` RPC records the request and refuses the call,
 * so nothing past the request is exercised.
 */
function requestedInterval(
  kind: 'document' | 'channel',
  opts: Partial<ClientOptions> = {},
): bigint {
  const client = new yorkie.Client({
    rpcAddr: 'http://localhost',
    ...opts,
  });
  (client as any).id = '000000000000000000000001';

  let requested: bigint | undefined;
  (client as any).rpcClient = {
    watch: (req: { heartbeatIntervalMs: bigint }) => {
      requested = req.heartbeatIntervalMs;
      throw new Error('watch refused by the test');
    },
  };

  const attachment = {
    resourceID: 'doc-id',
    resource: { getFirstKeyPath: () => 'key' },
  };
  const open =
    kind === 'document'
      ? 'createDocumentWatchStream'
      : 'createChannelWatchStream';
  assert.throws(() =>
    (client as any)[open](attachment, 'key', new AbortController(), () => {}),
  );

  assert.isDefined(requested, `the ${kind} Watch request was never built`);
  return requested!;
}

// The server heartbeats only the streams that ask, so a Watch request that
// carried nothing would silently get no heartbeat and leave the idle watchdog
// from #1472 disarmed -- the failure the request field exists to fix. The
// client builds two Watch requests, and both must carry it.
describe('Watch request heartbeat interval', () => {
  for (const kind of ['document', 'channel'] as const) {
    describe(`on the ${kind} Watch request`, () => {
      it('asks for the default interval when none is configured', () => {
        assert.equal(requestedInterval(kind), 20000n);
      });

      it('asks for the configured interval', () => {
        assert.equal(
          requestedInterval(kind, { watchHeartbeatInterval: 7000 }),
          7000n,
        );
      });

      it('asks for nothing when the interval is 0', () => {
        // Byte for byte what an SDK older than the field sends, and the
        // server answers both the same way: no heartbeats.
        assert.equal(
          requestedInterval(kind, { watchHeartbeatInterval: 0 }),
          0n,
        );
      });

      it('reads a negative or non-numeric interval as asking for nothing', () => {
        assert.equal(
          requestedInterval(kind, { watchHeartbeatInterval: -1 }),
          0n,
        );
        assert.equal(
          requestedInterval(kind, { watchHeartbeatInterval: NaN }),
          0n,
        );
      });

      it('rounds a fractional interval up instead of opting out', () => {
        // Rounding 0.5 down would send 0 and opt the stream out; rounded up,
        // the server clamps it to its minimum like any short interval.
        assert.equal(
          requestedInterval(kind, { watchHeartbeatInterval: 0.5 }),
          1n,
        );
        assert.equal(
          requestedInterval(kind, { watchHeartbeatInterval: 1500.2 }),
          1501n,
        );
      });
    });
  }
});
