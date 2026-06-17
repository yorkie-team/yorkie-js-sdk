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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { YorkieProvider } from '../../src/YorkieProvider';

const mocks = vi.hoisted(() => {
  const state = { isActive: false };
  return {
    state,
    constructorSpy: vi.fn(),
    activateSpy: vi.fn().mockResolvedValue(undefined),
    deactivateSpy: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@yorkie-js/sdk', () => ({
  Client: vi.fn(function MockClient(opts: unknown) {
    mocks.constructorSpy(opts);
    return {
      activate: async () => {
        mocks.state.isActive = true;
        await mocks.activateSpy();
      },
      deactivate: async (deactivateOpts: unknown) => {
        await mocks.deactivateSpy(deactivateOpts);
        mocks.state.isActive = false;
      },
      isActive: () => mocks.state.isActive,
    };
  }),
}));

beforeEach(() => {
  mocks.constructorSpy.mockClear();
  mocks.activateSpy.mockClear();
  mocks.deactivateSpy.mockClear();
  mocks.state.isActive = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('YorkieProvider deactivateOnUnload prop', () => {
  it('forwards deactivateOnUnload:false to the Client constructor', async () => {
    render(
      <YorkieProvider
        apiKey="k"
        rpcAddr="http://localhost"
        deactivateOnUnload={false}
      >
        <div data-testid="child" />
      </YorkieProvider>,
    );
    await waitFor(() => expect(mocks.constructorSpy).toHaveBeenCalled());
    expect(mocks.constructorSpy.mock.calls[0][0]).toMatchObject({
      apiKey: 'k',
      rpcAddr: 'http://localhost',
      deactivateOnUnload: false,
    });
  });

  it('forwards deactivateOnUnload:true (explicit) to the Client constructor', async () => {
    render(
      <YorkieProvider
        apiKey="k"
        rpcAddr="http://localhost"
        deactivateOnUnload={true}
      >
        <div />
      </YorkieProvider>,
    );
    await waitFor(() => expect(mocks.constructorSpy).toHaveBeenCalled());
    expect(mocks.constructorSpy.mock.calls[0][0]).toMatchObject({
      deactivateOnUnload: true,
    });
  });

  it('omits deactivateOnUnload from constructor opts when not provided', async () => {
    render(
      <YorkieProvider apiKey="k" rpcAddr="http://localhost">
        <div />
      </YorkieProvider>,
    );
    await waitFor(() => expect(mocks.constructorSpy).toHaveBeenCalled());
    expect(mocks.constructorSpy.mock.calls[0][0]).not.toHaveProperty(
      'deactivateOnUnload',
    );
  });

  it('skips unmount-time deactivate when deactivateOnUnload is false', async () => {
    const { unmount } = render(
      <YorkieProvider
        apiKey="k"
        rpcAddr="http://localhost"
        deactivateOnUnload={false}
      >
        <div />
      </YorkieProvider>,
    );
    await waitFor(() => expect(mocks.activateSpy).toHaveBeenCalled());
    unmount();
    expect(mocks.deactivateSpy).not.toHaveBeenCalled();
  });
});
