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

// @vitest-environment jsdom

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import yorkie from '@yorkie-js/sdk/src/yorkie';
import {
  EventSourceDevPanel,
  EventSourceSDK,
  type FullSDKToPanelMessage,
  type PanelToSDKMessage,
} from '@yorkie-js/sdk/src/devtools/protocol';

type TestDoc = { key?: string };

// NOTE(hackerwins): `setupDevtools` never removes its window `message`
// listener and never clears `unsubsByDocKey`, so every document built earlier
// in this file keeps answering the panel. Each case therefore uses its own doc
// keys and every assertion filters the captured messages by those keys instead
// of counting them.
const captured: Array<FullSDKToPanelMessage> = [];

const capture = (event: MessageEvent) => {
  if (event.data?.source === EventSourceSDK) {
    captured.push(event.data);
  }
};

// NOTE(hackerwins): jsdom leaves `event.source` null on `window.postMessage`,
// while a browser sets it to the posting window. `setupDevtools` rejects
// anything whose source is not this window, so the event is constructed
// directly to reproduce what the browser delivers.
const postFromPanel = (message: PanelToSDKMessage) => {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { source: EventSourceDevPanel, ...message },
      source: window,
    }),
  );
};

/**
 * `postFromFrame` imitates a child frame posting to this window: same payload,
 * but a source that is not this window.
 */
const postFromFrame = (message: PanelToSDKMessage) => {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { source: EventSourceDevPanel, ...message },
      source: null,
    }),
  );
};

/**
 * `flush` waits for the messages posted so far, and the answers they trigger,
 * to be delivered. jsdom dispatches `postMessage` as a task.
 */
const flush = async () => {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

const newDoc = (key: string) =>
  new yorkie.Document<TestDoc>(key, { enableDevtools: true });

const keysOf = (msg: string, docKeys: Array<string>) =>
  captured
    .filter((m) => m.msg === msg && 'docKey' in m && docKeys.includes(m.docKey))
    .map((m) => ('docKey' in m ? m.docKey : ''));

describe('Devtools bridge with multiple documents', () => {
  beforeAll(() => {
    window.addEventListener('message', capture);
  });

  beforeEach(() => {
    captured.length = 0;
  });

  afterEach(async () => {
    // NOTE(hackerwins): Return every document on the page, including the ones
    // built by earlier cases, to the 'disconnected' state.
    postFromPanel({ msg: 'devtools::disconnect' });
    await flush();
    captured.length = 0;
  });

  it('announces every document on connect', async () => {
    const keyA = 'devtools-connect-a';
    const keyB = 'devtools-connect-b';
    newDoc(keyA);
    newDoc(keyB);
    await flush();

    captured.length = 0;
    postFromPanel({ msg: 'devtools::connect' });
    await flush();

    expect(keysOf('doc::available', [keyA, keyB]).sort()).toEqual([keyA, keyB]);
  });

  it('answers devtools::subscribe only for the subscribed document', async () => {
    const keyA = 'devtools-subscribe-a';
    const keyB = 'devtools-subscribe-b';
    newDoc(keyA);
    newDoc(keyB);
    postFromPanel({ msg: 'devtools::connect' });
    await flush();

    captured.length = 0;
    postFromPanel({ msg: 'devtools::subscribe', docKey: keyA });
    await flush();

    expect(keysOf('doc::sync::full', [keyA, keyB])).toEqual([keyA]);
  });

  it('streams partial syncs only for the subscribed document', async () => {
    const keyA = 'devtools-partial-a';
    const keyB = 'devtools-partial-b';
    const docA = newDoc(keyA);
    const docB = newDoc(keyB);
    postFromPanel({ msg: 'devtools::connect' });
    await flush();
    postFromPanel({ msg: 'devtools::subscribe', docKey: keyA });
    await flush();

    captured.length = 0;
    docA.update((root) => {
      root.key = 'a1';
    });
    docB.update((root) => {
      root.key = 'b1';
    });
    await flush();
    expect(keysOf('doc::sync::partial', [keyA, keyB])).toEqual([keyA]);

    // Subscribing to the other document is an implicit unsubscribe.
    postFromPanel({ msg: 'devtools::subscribe', docKey: keyB });
    await flush();

    captured.length = 0;
    docA.update((root) => {
      root.key = 'a2';
    });
    docB.update((root) => {
      root.key = 'b2';
    });
    await flush();
    expect(keysOf('doc::sync::partial', [keyA, keyB])).toEqual([keyB]);
  });

  it('announces a document created while the panel is connected', async () => {
    const keyA = 'devtools-late-a';
    const keyLate = 'devtools-late-b';
    newDoc(keyA);
    postFromPanel({ msg: 'devtools::connect' });
    await flush();
    postFromPanel({ msg: 'devtools::subscribe', docKey: keyA });
    await flush();

    captured.length = 0;
    newDoc(keyLate);
    await flush();

    expect(keysOf('doc::available', [keyLate])).toEqual([keyLate]);
    expect(captured.some((m) => m.msg === 'refresh-devtools')).toBe(false);
  });

  it('hands a reused document key to the newest instance', async () => {
    const key = 'devtools-reuse-a';
    const stale = newDoc(key);
    stale.update((root) => {
      root.key = 'from the stale instance';
    });
    await flush();

    // NOTE(hackerwins): A remount constructs a second Document under the same
    // key. The first one is unreachable from the application at this point.
    newDoc(key);
    postFromPanel({ msg: 'devtools::connect' });
    await flush();

    captured.length = 0;
    postFromPanel({ msg: 'devtools::subscribe', docKey: key });
    await flush();

    // Only the live instance answers, and it answers with its own empty log
    // rather than the events the discarded instance recorded.
    const fullSyncs = captured.filter(
      (m) => m.msg === 'doc::sync::full' && 'docKey' in m && m.docKey === key,
    );
    expect(fullSyncs).toHaveLength(1);
    expect((fullSyncs[0] as { events: Array<unknown> }).events).toEqual([]);
  });

  it('ignores panel messages that did not come from this window', async () => {
    const key = 'devtools-foreign-source-a';
    newDoc(key);
    await flush();

    captured.length = 0;
    postFromFrame({ msg: 'devtools::connect' });
    await flush();
    expect(keysOf('doc::available', [key])).toEqual([]);

    // The same message from this window is accepted, so the rejection above is
    // the source check and not a broken payload.
    postFromPanel({ msg: 'devtools::connect' });
    await flush();
    expect(keysOf('doc::available', [key])).toEqual([key]);
  });

  it('asks the panel to refresh when no panel is connected', async () => {
    const key = 'devtools-refresh-a';
    captured.length = 0;
    newDoc(key);
    await flush();

    expect(captured.some((m) => m.msg === 'refresh-devtools')).toBe(true);
    expect(keysOf('doc::available', [key])).toEqual([]);
  });
});
