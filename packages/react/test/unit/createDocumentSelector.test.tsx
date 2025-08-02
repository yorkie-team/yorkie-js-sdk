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

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { StreamConnectionStatus } from '@yorkie-js/sdk';
import {
  createDocumentSelector,
  DocumentProvider,
} from '../../src/DocumentProvider';
import { shallowEqual } from '../../src/shallowEqual';
import type { Indexable } from '@yorkie-js/sdk';

const mockDocument = {
  subscribe: vi.fn(() => () => {}),
  getRoot: vi.fn(() => ({ counter: 0, user: { name: 'John', age: 25 } })),
  getPresences: vi.fn<() => Array<TestPresence>>(() => []),
  update: vi.fn(),
};

vi.mock('@yorkie-js/sdk', () => ({
  Document: vi.fn(() => mockDocument),
  StreamConnectionStatus: {
    Connected: 'Connected',
    Disconnected: 'Disconnected',
  },
  Client: vi.fn(() => ({
    activate: vi.fn(),
    deactivate: vi.fn(),
    isActive: vi.fn(() => false),
  })),
}));

// Mock useYorkie hook directly
vi.mock('../../src/YorkieProvider', () => ({
  YorkieProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useYorkie: vi.fn(() => ({
    client: {
      attach: vi.fn(),
      detach: vi.fn(),
      hasDocument: vi.fn(() => false),
    },
    loading: false,
    error: undefined,
  })),
}));

interface TestDocumentRoot {
  counter: number;
  user: {
    name: string;
    age: number;
  };
  items?: Array<string>;
}

interface TestPresence extends Indexable {
  user: {
    cursor: {
      x: number;
      y: number;
    };
  };
}

describe('createDocumentSelector', () => {
  const useTestDocumentSelector = createDocumentSelector<
    TestDocumentRoot,
    TestPresence
  >();

  const initialRoot: TestDocumentRoot = {
    counter: 0,
    user: {
      name: 'John',
      age: 25,
    },
    items: ['item1', 'item2'],
  };

  const TestWrapper: React.FC<{ children: React.ReactNode }> = ({
    children,
  }) => (
    <DocumentProvider docKey="test-doc" initialRoot={initialRoot}>
      {children}
    </DocumentProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    mockDocument.getRoot.mockReturnValue(initialRoot);
    mockDocument.getPresences.mockReturnValue([]);
  });

  it('should return entire DocumentContext', () => {
    const { result } = renderHook(
      () => useTestDocumentSelector((state) => state),
      { wrapper: TestWrapper },
    );

    expect(result.current).toMatchObject({
      root: initialRoot,
      presences: [],
      loading: expect.any(Boolean),
      error: undefined,
    });
  });

  it('should select only root object', () => {
    const { result } = renderHook(
      () => useTestDocumentSelector((state) => state.root),
      { wrapper: TestWrapper },
    );

    expect(result.current).toEqual(initialRoot);
  });

  it('should select specific property from root', () => {
    const { result } = renderHook(
      () => useTestDocumentSelector((state) => state.root.counter),
      { wrapper: TestWrapper },
    );

    expect(result.current).toBe(0);
  });

  it('should select nested object properties', () => {
    const { result } = renderHook(
      () => useTestDocumentSelector((state) => state.root.user.name),
      { wrapper: TestWrapper },
    );

    expect(result.current).toBe('John');
  });

  it('should combine multiple properties', () => {
    const { result } = renderHook(
      () =>
        useTestDocumentSelector(
          (state) => ({
            counter: state.root.counter,
            userName: state.root.user.name,
            loading: state.loading,
          }),
          shallowEqual,
        ),
      { wrapper: TestWrapper },
    );

    expect(result.current).toEqual({
      counter: 0,
      userName: 'John',
      loading: expect.any(Boolean),
    });
  });

  it('should select presences', () => {
    const { result } = renderHook(
      () => useTestDocumentSelector((state) => state.presences),
      { wrapper: TestWrapper },
    );

    expect(result.current).toEqual([]);
    expect(Array.isArray(result.current)).toBe(true);
  });

  it('should select connection status', () => {
    const { result } = renderHook(
      () => useTestDocumentSelector((state) => state.connection),
      { wrapper: TestWrapper },
    );

    expect(result.current).toBe(StreamConnectionStatus.Disconnected);
  });

  it('should select update function', () => {
    const { result } = renderHook(
      () => useTestDocumentSelector((state) => state.update),
      { wrapper: TestWrapper },
    );

    expect(typeof result.current).toBe('function');
  });

  describe('Error Handling', () => {
    it('should throw error when used outside DocumentProvider', () => {
      expect(() => {
        renderHook(() =>
          useTestDocumentSelector((state) => state.root.counter),
        );
      }).toThrow('useDocument must be used within a DocumentProvider');
    });

    it('should propagate selector errors', () => {
      const errorSelector = () => {
        throw new Error('Selector error');
      };

      expect(() => {
        renderHook(() => useTestDocumentSelector(errorSelector), {
          wrapper: TestWrapper,
        });
      }).toThrow('Selector error');
    });

    it('should handle invalid property access at runtime', () => {
      const { result } = renderHook(
        () =>
          useTestDocumentSelector((state) => {
            // @ts-expect-error - Intentionally accessing non-existent property
            return state.root.nonExistentProperty;
          }),
        { wrapper: TestWrapper },
      );

      expect(result.current).toBeUndefined();
    });
  });

  describe('Complex Selector Pattern', () => {
    it('should handle computed values', () => {
      const { result } = renderHook(
        () =>
          useTestDocumentSelector(
            (state) => ({
              counter: state.root.counter,
              userName: state.root.user.name,
              userAge: state.root.user.age,
              // Computed values
              isAdult: state.root.user.age >= 18,
              itemCount: state.root.items?.length ?? 0,
              peerCount: state.presences.length,
            }),
            shallowEqual,
          ),
        { wrapper: TestWrapper },
      );

      expect(result.current).toEqual({
        counter: 0,
        userName: 'John',
        userAge: 25,
        isAdult: true,
        itemCount: 2,
        peerCount: 0,
      });
    });
  });
});
