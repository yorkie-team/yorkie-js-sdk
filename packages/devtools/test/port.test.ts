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

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@yorkie-js/sdk', () => ({
  EventSourceDevPanel: 'yorkie-devtools-panel',
}));

/**
 * `FakePort` stands in for a `chrome.runtime.Port`: it records the messages
 * posted to it and lets a test fire `onDisconnect` by hand, which is how the
 * browser reports that the inspected page went away.
 */
class FakePort {
  public posted: Array<unknown> = [];
  public disconnected = false;
  private messageListeners: Array<(message: unknown) => void> = [];
  private disconnectListeners: Array<() => void> = [];

  public onMessage = {
    addListener: (fn: (message: unknown) => void) => {
      this.messageListeners.push(fn);
    },
    removeListener: (fn: (message: unknown) => void) => {
      this.messageListeners = this.messageListeners.filter((it) => it !== fn);
    },
  };

  public onDisconnect = {
    addListener: (fn: () => void) => {
      this.disconnectListeners.push(fn);
    },
  };

  /**
   * `postMessage` records what the panel sent over this channel.
   */
  public postMessage(message: unknown) {
    this.posted.push(message);
  }

  /**
   * `disconnect` marks this channel closed by the panel side.
   */
  public disconnect() {
    this.disconnected = true;
  }

  /**
   * `fireDisconnect` runs the listeners Chrome would run when the other end of
   * this channel goes away.
   */
  public fireDisconnect() {
    for (const fn of this.disconnectListeners) fn();
  }

  /**
   * `messageListenerCount` reports how many listeners are still attached.
   */
  public messageListenerCount() {
    return this.messageListeners.length;
  }
}

let opened: Array<FakePort>;

/**
 * `loadPort` re-imports `port.ts` with a fresh module state, so each test
 * starts with no channel open.
 */
const loadPort = async () => {
  opened = [];
  vi.resetModules();
  vi.stubGlobal('chrome', {
    devtools: { inspectedWindow: { tabId: 7 } },
    tabs: {
      connect: () => {
        const port = new FakePort();
        opened.push(port);
        return port;
      },
    },
  });
  return import('../src/port');
};

describe('connectPort', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('closes the previous channel before opening a new one', async () => {
    const { connectPort } = await loadPort();

    connectPort(vi.fn(), vi.fn());
    connectPort(vi.fn(), vi.fn());

    expect(opened).toHaveLength(2);
    expect(opened[0].disconnected).toBe(true);
    expect(opened[1].disconnected).toBe(false);
  });

  it('keeps a late disconnect of an old channel from killing the new one', async () => {
    const { connectPort, sendToSDK } = await loadPort();

    const staleDisconnect = vi.fn();
    connectPort(vi.fn(), staleDisconnect);
    connectPort(vi.fn(), vi.fn());
    const before = opened[1].posted.length;

    // The old channel reports its disconnect only after the new one is open.
    opened[0].fireDisconnect();

    // The replaced channel says nothing about the live one, so the panel must
    // not be told to reset the document it is still receiving.
    expect(staleDisconnect).not.toHaveBeenCalled();

    // And the live channel is still the one `sendToSDK` writes to.
    sendToSDK({ msg: 'devtools::connect' });
    expect(opened[1].posted).toHaveLength(before + 1);
    expect(opened[1].posted[before]).toEqual({
      source: 'yorkie-devtools-panel',
      msg: 'devtools::connect',
    });
  });

  it('stops sending once the live channel disconnects', async () => {
    const { connectPort, sendToSDK } = await loadPort();

    connectPort(vi.fn(), vi.fn());
    const before = opened[0].posted.length;
    opened[0].fireDisconnect();

    sendToSDK({ msg: 'devtools::connect' });
    expect(opened[0].posted).toHaveLength(before);
  });

  it('drops the message listener of a channel that disconnects', async () => {
    const { connectPort } = await loadPort();

    connectPort(vi.fn(), vi.fn());
    expect(opened[0].messageListenerCount()).toBe(1);

    opened[0].fireDisconnect();
    expect(opened[0].messageListenerCount()).toBe(0);
  });

  it('announces the panel on every channel it opens', async () => {
    const { connectPort } = await loadPort();

    connectPort(vi.fn(), vi.fn());
    connectPort(vi.fn(), vi.fn());

    for (const port of opened) {
      expect(port.posted).toContainEqual({
        source: 'yorkie-devtools-panel',
        msg: 'devtools::connect',
      });
    }
  });

  it('reports the disconnect to the caller that opened the channel', async () => {
    const { connectPort } = await loadPort();

    const onDisconnect = vi.fn();
    connectPort(vi.fn(), onDisconnect);
    opened[0].fireDisconnect();

    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });
});

describe('disconnectPort', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('leaves `sendToSDK` a no-op rather than throwing', async () => {
    const { connectPort, disconnectPort, sendToSDK } = await loadPort();

    connectPort(vi.fn(), vi.fn());
    const before = opened[0].posted.length;
    disconnectPort();

    expect(() => sendToSDK({ msg: 'devtools::connect' })).not.toThrow();
    expect(opened[0].posted).toHaveLength(before);
  });

  it('does nothing when no channel is open', async () => {
    const { disconnectPort } = await loadPort();

    expect(() => disconnectPort()).not.toThrow();
    expect(opened).toHaveLength(0);
  });
});
