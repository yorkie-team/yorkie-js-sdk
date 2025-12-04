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
import { render, screen, act, waitFor } from '@testing-library/react';
import { StreamConnectionStatus } from '@yorkie-js/sdk';
import {
  createDocumentSelector,
  DocumentProvider,
} from '../../src/DocumentProvider';
import type { Indexable } from '@yorkie-js/sdk';

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
    id: string;
    name: string;
  };
}

let documentSubscribeCallback: (() => void) | undefined = undefined;
let presenceSubscribeCallback: (() => void) | undefined = undefined;
let connectionSubscribeCallback: ((event: any) => void) | undefined = undefined;

const createMockDocument = () => {
  let rootData: TestDocumentRoot = {
    counter: 0,
    user: { name: 'John', age: 25 },
    items: [],
  };
  let presences: Array<TestPresence> = [];

  const unsubscribeFns = {
    document: vi.fn(),
    presence: vi.fn(),
    connection: vi.fn(),
  };

  const mockDocument = {
    subscribe: vi
      .fn()
      .mockImplementation(
        (
          eventTypeOrCallback?: string | (() => void),
          callback?: () => void | ((event: any) => void),
        ) => {
          if (typeof eventTypeOrCallback === 'string') {
            if (eventTypeOrCallback === 'presence') {
              presenceSubscribeCallback = callback as () => void;
              return unsubscribeFns.presence;
            } else if (eventTypeOrCallback === 'connection') {
              connectionSubscribeCallback = callback as (event: any) => void;
              return unsubscribeFns.connection;
            }
            return () => {};
          } else {
            documentSubscribeCallback = eventTypeOrCallback as () => void;
            return unsubscribeFns.document;
          }
        },
      ),
    getRoot: vi.fn(() => rootData),
    getPresences: vi.fn(() => presences),
    update: vi.fn(),
    applySnapshot: vi.fn(),

    // test helpers
    _setRoot: (newRoot: TestDocumentRoot) => {
      rootData = newRoot;
    },
    _setPresences: (newPresences: Array<TestPresence>) => {
      presences = newPresences;
    },
    _triggerUpdate: () => {
      if (documentSubscribeCallback) documentSubscribeCallback();
    },
    _triggerPresenceUpdate: () => {
      if (presenceSubscribeCallback) presenceSubscribeCallback();
    },
    _triggerConnection: (status: StreamConnectionStatus) => {
      if (connectionSubscribeCallback) {
        connectionSubscribeCallback({
          type: 'status-changed',
          value: status,
        });
      }
    },
    _getUnsubscribeFns: () => unsubscribeFns,
  };

  return mockDocument;
};

const createMockClient = () => {
  const mockClient = {
    detach: vi.fn(),
    has: vi.fn(() => true),
    isActive: vi.fn(() => true),
  };

  return mockClient;
};

let currentMockDocument: ReturnType<typeof createMockDocument>;
let currentMockClient: ReturnType<typeof createMockClient>;

/**
 * mock useYorkie hook to use without YorkieProvider.
 */
vi.mock('../../src/YorkieProvider', () => ({
  useYorkie: () => ({
    client: currentMockClient,
    loading: false,
    error: undefined,
  }),
  useYorkieClient: () => ({
    client: currentMockClient,
    loading: false,
    error: undefined,
  }),
}));

vi.mock('@yorkie-js/sdk', () => ({
  Document: vi.fn(
    class {
      constructor() {
        return currentMockDocument;
      }
    },
  ),
  Client: vi.fn(() => currentMockClient),
  StreamConnectionStatus: {
    Connected: 'Connected',
    Disconnected: 'Disconnected',
  },
}));

/* eslint-disable jsdoc/require-jsdoc */
describe('Integration Test', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    currentMockDocument = createMockDocument();
    currentMockClient = createMockClient();

    documentSubscribeCallback = undefined;
    presenceSubscribeCallback = undefined;
    connectionSubscribeCallback = undefined;
  });

  describe('Integrate DocumentProvider through Store to Selector', () => {
    it('should subscribe to state correctly using createDocumentSelector', async () => {
      const useDocumentSelector = createDocumentSelector<
        TestDocumentRoot,
        TestPresence
      >();

      let counterValue: number | undefined;
      let userName: string | undefined;
      let renderCount = 0;

      function TestComponent() {
        renderCount++;
        counterValue = useDocumentSelector((state) => state.root.counter);
        userName = useDocumentSelector((state) => state.root.user.name);

        return (
          <div>
            <div data-testid="counter">{counterValue}</div>
            <div data-testid="username">{userName}</div>
            <div data-testid="render-count">{renderCount}</div>
          </div>
        );
      }

      render(
        <DocumentProvider
          docKey="test-doc"
          initialRoot={{ counter: 0, user: { name: 'John', age: 25 } }}
          initialPresence={{ user: { id: 'user1', name: 'John' } }}
        >
          <TestComponent />
        </DocumentProvider>,
      );

      await waitFor(() => {
        expect(counterValue).toBe(0);
        expect(userName).toBe('John');
      });

      expect(screen.getByTestId('counter')).toHaveTextContent('0');
      expect(screen.getByTestId('username')).toHaveTextContent('John');
    });

    it('should reflect document updates into the component', async () => {
      const useDocumentSelector = createDocumentSelector<
        TestDocumentRoot,
        TestPresence
      >();

      let counterValue: number | undefined;
      let renderCount = 0;

      function TestComponent() {
        renderCount++;
        counterValue = useDocumentSelector((state) => state.root.counter);
        return <div data-testid="counter">{counterValue}</div>;
      }

      render(
        <DocumentProvider
          docKey="test-doc"
          initialRoot={{ counter: 0, user: { name: 'John', age: 25 } }}
          initialPresence={{ user: { id: 'user1', name: 'John' } }}
        >
          <TestComponent />
        </DocumentProvider>,
      );

      await waitFor(() => {
        expect(counterValue).toBe(0);
      });

      const { Document } = await import('@yorkie-js/sdk');
      expect(Document).toHaveBeenCalled();

      const initialRenderCount = renderCount;

      act(() => {
        currentMockDocument._setRoot({
          counter: 5,
          user: { name: 'John', age: 25 },
          items: [],
        });
        currentMockDocument._triggerUpdate();
      });

      await waitFor(() => {
        expect(counterValue).toBe(5);
        expect(renderCount).toBe(initialRenderCount + 1);
      });

      expect(screen.getByTestId('counter')).toHaveTextContent('5');
    });
  });

  describe('Selective Re-rendering Performance Optimization', () => {
    it('should only re-render components that subscribe to updated state', async () => {
      const useDocumentSelector = createDocumentSelector<
        TestDocumentRoot,
        TestPresence
      >();

      let counterRenderCount = 0;
      let userRenderCount = 0;

      function CounterComponent() {
        counterRenderCount++;
        const counter = useDocumentSelector((state) => state.root.counter);
        return <div data-testid="counter">{counter}</div>;
      }

      function UserComponent() {
        userRenderCount++;
        const userName = useDocumentSelector((state) => state.root.user.name);
        return <div data-testid="username">{userName}</div>;
      }

      render(
        <DocumentProvider
          docKey="test-doc"
          initialRoot={{ counter: 0, user: { name: 'John', age: 25 } }}
          initialPresence={{ user: { id: 'user1', name: 'John' } }}
        >
          <CounterComponent />
          <UserComponent />
        </DocumentProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('counter')).toHaveTextContent('0');
        expect(screen.getByTestId('username')).toHaveTextContent('John');
      });

      const initialCounterRenderCount = counterRenderCount;
      const initialUserRenderCount = userRenderCount;

      act(() => {
        currentMockDocument._setRoot({
          counter: 10,
          user: { name: 'John', age: 25 },
          items: [],
        });
        currentMockDocument._triggerUpdate();
      });

      await waitFor(() => {
        expect(screen.getByTestId('counter')).toHaveTextContent('10');
      });

      expect(counterRenderCount).toBe(initialCounterRenderCount + 1);
      expect(userRenderCount).toBe(initialUserRenderCount);
    });
  });

  describe('Multiple State Updates Simultaneously', () => {
    it('should properly reflect Document, Connection, and Presence changes when updated simultaneously', async () => {
      const useDocumentSelector = createDocumentSelector<
        TestDocumentRoot,
        TestPresence
      >();

      let counter: number | undefined;
      let connection: StreamConnectionStatus | undefined;
      let presenceCount: number | undefined;

      function MultiStateComponent() {
        counter = useDocumentSelector((state) => state.root.counter);
        connection = useDocumentSelector((state) => state.connection);
        presenceCount = useDocumentSelector((state) => state.presences.length);

        return (
          <div>
            <div data-testid="counter">{counter}</div>
            <div data-testid="connection">{connection}</div>
            <div data-testid="presence-count">{presenceCount}</div>
          </div>
        );
      }

      render(
        <DocumentProvider
          docKey="test-doc"
          initialRoot={{ counter: 0, user: { name: 'John', age: 25 } }}
          initialPresence={{ user: { id: 'user1', name: 'John' } }}
        >
          <MultiStateComponent />
        </DocumentProvider>,
      );

      await waitFor(() => {
        expect(counter).toBe(0);
        expect(connection).toBe(StreamConnectionStatus.Disconnected);
        expect(presenceCount).toBe(0);
      });

      act(() => {
        currentMockDocument._setRoot({
          counter: 42,
          user: { name: 'John', age: 25 },
          items: ['item1', 'item2'],
        });
        currentMockDocument._triggerUpdate();

        currentMockDocument._triggerConnection(
          StreamConnectionStatus.Connected,
        );

        currentMockDocument._setPresences([
          { user: { id: 'user1', name: 'John' } },
          { user: { id: 'user2', name: 'Jane' } },
          { user: { id: 'user3', name: 'Bob' } },
        ]);
        currentMockDocument._triggerPresenceUpdate();
      });

      await waitFor(() => {
        expect(counter).toBe(42);
        expect(connection).toBe(StreamConnectionStatus.Connected);
        expect(presenceCount).toBe(3);
      });

      expect(screen.getByTestId('counter')).toHaveTextContent('42');
      expect(screen.getByTestId('connection')).toHaveTextContent('Connected');
      expect(screen.getByTestId('presence-count')).toHaveTextContent('3');
    });
  });

  describe('Memory Leak Prevention', () => {
    it('should properly cleanup subscriptions on unmount', async () => {
      const useDocumentSelector = createDocumentSelector<
        TestDocumentRoot,
        TestPresence
      >();

      function TestComponent() {
        const counter = useDocumentSelector((state) => state.root.counter);
        return <div data-testid="counter">{counter}</div>;
      }

      const { unmount } = render(
        <DocumentProvider
          docKey="test-doc"
          initialRoot={{ counter: 0, user: { name: 'John', age: 25 } }}
          initialPresence={{ user: { id: 'user1', name: 'John' } }}
        >
          <TestComponent />
        </DocumentProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('counter')).toHaveTextContent('0');
      });

      expect(currentMockDocument.subscribe).toHaveBeenCalledTimes(3);

      const unsubscribeFns = currentMockDocument._getUnsubscribeFns();

      unmount();

      expect(unsubscribeFns.document).toHaveBeenCalledTimes(1);
      expect(unsubscribeFns.presence).toHaveBeenCalledTimes(1);
      expect(unsubscribeFns.connection).toHaveBeenCalledTimes(1);
      expect(currentMockClient.detach).toHaveBeenCalledTimes(1);

      act(() => {
        currentMockDocument._setRoot({
          counter: 999,
          user: { name: 'John', age: 25 },
          items: [],
        });
        currentMockDocument._triggerUpdate();
      });

      expect(screen.queryByTestId('counter')).toBeNull();
    });
  });
});
