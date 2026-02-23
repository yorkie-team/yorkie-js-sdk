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

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import {
  DocumentProvider,
  useDocument,
  useRevisions,
} from '../../src/DocumentProvider';
import type { Indexable, RevisionSummary } from '@yorkie-js/sdk';
import { renderHook } from '@testing-library/react';

interface TestDocumentRoot {
  counter: number;
}

interface TestPresence extends Indexable {
  name: string;
}

const mockRevision: RevisionSummary = {
  id: 'rev-1',
  label: 'v1.0',
  description: 'Initial version',
  snapshot: '{"counter":0}',
  createdAt: new Date('2025-01-01'),
};

const mockRevisions: Array<RevisionSummary> = [
  mockRevision,
  {
    id: 'rev-2',
    label: 'v2.0',
    description: 'Second version',
    snapshot: '{"counter":10}',
    createdAt: new Date('2025-01-02'),
  },
];

/**
 * Creates a mock document with subscribe, getRoot, getPresences, update,
 * and applySnapshot methods for testing hooks that depend on a Yorkie document.
 */
const createMockDocument = () => {
  const unsubscribeFns = {
    document: vi.fn(),
    presence: vi.fn(),
    connection: vi.fn(),
  };

  const mockDocument = {
    subscribe: vi
      .fn()
      .mockImplementation((eventTypeOrCallback?: string | (() => void)) => {
        if (typeof eventTypeOrCallback === 'string') {
          if (eventTypeOrCallback === 'presence') {
            return unsubscribeFns.presence;
          } else if (eventTypeOrCallback === 'connection') {
            return unsubscribeFns.connection;
          }
          return () => {};
        } else {
          return unsubscribeFns.document;
        }
      }),
    getRoot: vi.fn(() => ({ counter: 0 })),
    getPresences: vi.fn(() => []),
    update: vi.fn(),
    applySnapshot: vi.fn(),
  };

  return mockDocument;
};

/**
 * Creates a mock client with attach, detach, and revision management methods
 * for testing hooks that depend on a Yorkie client.
 */
const createMockClient = () => {
  const mockClient = {
    attach: vi.fn().mockResolvedValue(undefined),
    detach: vi.fn(),
    has: vi.fn(() => true),
    isActive: vi.fn(() => true),
    createRevision: vi.fn().mockResolvedValue(mockRevision),
    listRevisions: vi.fn().mockResolvedValue(mockRevisions),
    getRevision: vi.fn().mockResolvedValue(mockRevision),
    restoreRevision: vi.fn().mockResolvedValue(undefined),
  };

  return mockClient;
};

let currentMockDocument: ReturnType<typeof createMockDocument>;
let currentMockClient: ReturnType<typeof createMockClient>;

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
  // A JS constructor that returns an object overrides the default `new` instance,
  // so `new Document(...)` will return `currentMockDocument` instead.
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

/**
 * Helper to render useRevisions inside a DocumentProvider and wait for
 * the document to be fully attached (loading = false).
 */
async function renderUseRevisions() {
  let hookResult:
    | ReturnType<typeof useRevisions<TestDocumentRoot, TestPresence>>
    | undefined;
  let isLoading = true;

  /**
   * TestComponent is used to call useRevisions within the context of DocumentProvider.
   */
  function TestComponent() {
    const { loading } = useDocument<TestDocumentRoot, TestPresence>();
    hookResult = useRevisions<TestDocumentRoot, TestPresence>();
    isLoading = loading;
    return null;
  }

  render(
    <DocumentProvider
      docKey="test-doc"
      initialRoot={{ counter: 0 }}
      initialPresence={{ name: 'Alice' }}
    >
      <TestComponent />
    </DocumentProvider>,
  );

  await waitFor(() => {
    expect(isLoading).toBe(false);
  });

  return hookResult!;
}

/* eslint-disable jsdoc/require-jsdoc */
describe('useRevisions', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    currentMockDocument = createMockDocument();
    currentMockClient = createMockClient();
  });

  it('should throw when used outside DocumentProvider', () => {
    expect(() => {
      renderHook(() => useRevisions());
    }).toThrow('useRevisions must be used within a DocumentProvider');
  });

  it('should return all revision methods', async () => {
    const result = await renderUseRevisions();

    expect(result).toHaveProperty('createRevision');
    expect(result).toHaveProperty('listRevisions');
    expect(result).toHaveProperty('getRevision');
    expect(result).toHaveProperty('restoreRevision');
    expect(typeof result.createRevision).toBe('function');
    expect(typeof result.listRevisions).toBe('function');
    expect(typeof result.getRevision).toBe('function');
    expect(typeof result.restoreRevision).toBe('function');
  });

  describe('createRevision', () => {
    it('should delegate to client.createRevision with the document', async () => {
      const { createRevision } = await renderUseRevisions();

      const result = await createRevision('v1.0', 'Initial version');

      expect(currentMockClient.createRevision).toHaveBeenCalledWith(
        currentMockDocument,
        'v1.0',
        'Initial version',
      );
      expect(result).toEqual(mockRevision);
    });

    it('should work without description', async () => {
      const { createRevision } = await renderUseRevisions();

      await createRevision('v1.0');

      expect(currentMockClient.createRevision).toHaveBeenCalledWith(
        currentMockDocument,
        'v1.0',
        undefined,
      );
    });
  });

  describe('listRevisions', () => {
    it('should delegate to client.listRevisions with options', async () => {
      const { listRevisions } = await renderUseRevisions();

      const result = await listRevisions({
        pageSize: 20,
        offset: 0,
        isForward: true,
      });

      expect(currentMockClient.listRevisions).toHaveBeenCalledWith(
        currentMockDocument,
        { pageSize: 20, offset: 0, isForward: true },
      );
      expect(result).toEqual(mockRevisions);
    });

    it('should work without options', async () => {
      const { listRevisions } = await renderUseRevisions();

      await listRevisions();

      expect(currentMockClient.listRevisions).toHaveBeenCalledWith(
        currentMockDocument,
        undefined,
      );
    });
  });

  describe('getRevision', () => {
    it('should delegate to client.getRevision with revisionID', async () => {
      const { getRevision } = await renderUseRevisions();

      const result = await getRevision('rev-1');

      expect(currentMockClient.getRevision).toHaveBeenCalledWith(
        currentMockDocument,
        'rev-1',
      );
      expect(result).toEqual(mockRevision);
    });
  });

  describe('restoreRevision', () => {
    it('should delegate to client.restoreRevision with revisionID', async () => {
      const { restoreRevision } = await renderUseRevisions();

      await restoreRevision('rev-1');

      expect(currentMockClient.restoreRevision).toHaveBeenCalledWith(
        currentMockDocument,
        'rev-1',
      );
    });
  });

  describe('error handling', () => {
    it('should throw when client is not ready', async () => {
      const originalClient = currentMockClient;
      currentMockClient = undefined as any;

      let hookResult:
        | ReturnType<typeof useRevisions<TestDocumentRoot, TestPresence>>
        | undefined;

      function TestComponent() {
        hookResult = useRevisions<TestDocumentRoot, TestPresence>();
        return null;
      }

      render(
        <DocumentProvider
          docKey="test-doc"
          initialRoot={{ counter: 0 }}
          initialPresence={{ name: 'Alice' }}
        >
          <TestComponent />
        </DocumentProvider>,
      );

      await waitFor(() => {
        expect(hookResult).toBeDefined();
      });

      await expect(hookResult!.createRevision('v1.0')).rejects.toThrow(
        'Client or document is not ready',
      );

      await expect(hookResult!.listRevisions()).rejects.toThrow(
        'Client or document is not ready',
      );

      await expect(hookResult!.getRevision('rev-1')).rejects.toThrow(
        'Client or document is not ready',
      );

      await expect(hookResult!.restoreRevision('rev-1')).rejects.toThrow(
        'Client or document is not ready',
      );

      currentMockClient = originalClient;
    });

    it('should propagate errors from client methods', async () => {
      const { createRevision } = await renderUseRevisions();

      const error = new Error('Network error');
      currentMockClient.createRevision.mockRejectedValueOnce(error);

      await expect(createRevision('v1.0')).rejects.toThrow('Network error');
    });
  });
});
