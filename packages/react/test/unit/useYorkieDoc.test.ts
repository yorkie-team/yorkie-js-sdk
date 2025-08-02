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

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { StreamConnectionStatus } from '@yorkie-js/sdk';
import { useYorkieDoc } from '../../src/useYorkieDoc';
import pkg from '@yorkie-js/sdk/package.json';
import type { Indexable } from '@yorkie-js/sdk';

interface TestDocumentRoot {
  counter: number;
  user: {
    name: string;
    age: number;
  };
}

interface TestPresence extends Indexable {
  user: {
    id: string;
    name: string;
  };
}

const mockClient = {
  isActive: vi.fn(() => true),
  activate: vi.fn(),
  deactivate: vi.fn(),
};

const mockDocument = {
  subscribe: vi.fn(() => () => {}),
  getRoot: vi.fn(() => ({ counter: 0, user: { name: 'John', age: 25 } })),
  getPresences: vi.fn(() => []),
  update: vi.fn(),
  applySnapshot: vi.fn(),
  detach: vi.fn(),
};

const mockDocumentStore = {
  subscribe: vi.fn(),
  getSnapshot: vi.fn(() => ({
    doc: mockDocument,
    root: { counter: 0, user: { name: 'John', age: 25 } },
    presences: [],
    connection: StreamConnectionStatus.Disconnected,
    update: vi.fn(),
    loading: false,
    error: undefined,
  })),
  setState: vi.fn(),
};

vi.mock('../../src/YorkieProvider', () => ({
  useYorkieClient: vi.fn(() => ({
    client: mockClient,
    loading: false,
    error: undefined,
  })),
}));

vi.mock('../../src/DocumentProvider', () => ({
  useYorkieDocument: vi.fn(),
}));

vi.mock('../../src/createDocumentStore', () => ({
  createDocumentStore: vi.fn(() => mockDocumentStore),
}));

vi.mock('../../src/useSelector', () => ({
  useSelector: vi.fn(() => mockDocumentStore.getSnapshot()),
}));

vi.mock('@yorkie-js/sdk', () => ({
  Client: vi.fn(() => mockClient),
  StreamConnectionStatus: {
    Connected: 'Connected',
    Disconnected: 'Disconnected',
  },
}));

vi.mock('../package.json', () => pkg);

describe('useYorkieDoc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('API Interface', () => {
    it('should have correct return properties', () => {
      const { result } = renderHook(() =>
        useYorkieDoc<TestDocumentRoot, TestPresence>(
          'test-api-key',
          'test-doc-key',
        ),
      );

      expect(result.current).toHaveProperty('root');
      expect(result.current).toHaveProperty('presences');
      expect(result.current).toHaveProperty('connection');
      expect(result.current).toHaveProperty('update');
      expect(result.current).toHaveProperty('loading');
      expect(result.current).toHaveProperty('error');
    });

    it('should return document state from selector', () => {
      const { result } = renderHook(() =>
        useYorkieDoc<TestDocumentRoot, TestPresence>(
          'test-api-key',
          'test-doc-key',
        ),
      );

      expect(result.current.root).toEqual({
        counter: 0,
        user: { name: 'John', age: 25 },
      });
      expect(result.current.presences).toEqual([]);
      expect(result.current.connection).toBe(
        StreamConnectionStatus.Disconnected,
      );
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeUndefined();
    });
  });

  describe.todo('Initial Options', () => {});

  describe('Dependency Management', () => {
    it('should call useYorkieClient with correct options', async () => {
      renderHook(() =>
        useYorkieDoc<TestDocumentRoot, TestPresence>(
          'test-api-key',
          'test-doc-key',
        ),
      );

      const { useYorkieClient } = await import('../../src/YorkieProvider');
      expect(useYorkieClient).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        userAgent: expect.stringContaining('@yorkie-js/react'),
      });
    });

    it('should call useYorkieDocument with correct parameters', async () => {
      renderHook(() =>
        useYorkieDoc<TestDocumentRoot, TestPresence>(
          'test-api-key',
          'test-doc-key',
        ),
      );

      const { useYorkieDocument } = await import('../../src/DocumentProvider');
      expect(useYorkieDocument).toHaveBeenCalledWith(
        mockClient,
        false,
        undefined,
        'test-doc-key',
        {},
        {},
        mockDocumentStore,
      );
    });

    it('should call useSelector with document store', async () => {
      renderHook(() =>
        useYorkieDoc<TestDocumentRoot, TestPresence>(
          'test-api-key',
          'test-doc-key',
        ),
      );

      const { useSelector } = await import('../../src/useSelector');
      expect(useSelector).toHaveBeenCalledWith(mockDocumentStore);
    });
  });
});
