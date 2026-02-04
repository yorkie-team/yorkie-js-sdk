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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { YorkieManager } from './yorkie-manager.js';

// Mock the yorkie SDK
vi.mock('@yorkie-js/sdk', () => {
  const mockDocument = {
    getRoot: vi.fn(() => ({
      toJSON: () => ({ title: 'Test' }),
    })),
    getPresences: vi.fn(() => [
      { clientID: 'client-1', presence: { name: 'User 1' } },
    ]),
    hasLocalChanges: vi.fn(() => false),
    update: vi.fn((updater) => {
      const root: Record<string, unknown> = {};
      updater(root);
    }),
  };

  const mockClient = {
    isActive: vi.fn(() => true),
    getID: vi.fn(() => 'test-client-id'),
    activate: vi.fn(),
    deactivate: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
    sync: vi.fn(),
    createRevision: vi.fn(() => ({ id: 'rev-1' })),
    listRevisions: vi.fn(() => [
      {
        id: 'rev-1',
        label: 'v1.0',
        description: 'Initial version',
        createdAt: new Date('2026-01-01'),
      },
    ]),
  };

  return {
    default: {
      Client: vi.fn(() => mockClient),
      Document: vi.fn(() => mockDocument),
    },
    SyncMode: {
      Manual: 'manual',
      Realtime: 'realtime',
    },
  };
});

describe('YorkieManager', () => {
  let manager: YorkieManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new YorkieManager('https://api.yorkie.dev', 'test-api-key');
  });

  describe('constructor', () => {
    it('should create manager with apiUrl and apiKey', () => {
      expect(manager).toBeInstanceOf(YorkieManager);
    });

    it('should create manager without apiKey', () => {
      const managerWithoutKey = new YorkieManager('https://api.yorkie.dev');
      expect(managerWithoutKey).toBeInstanceOf(YorkieManager);
    });
  });

  describe('getClientStatus', () => {
    it('should return inactive status when client not created', () => {
      const status = manager.getClientStatus();
      expect(status).toEqual({ active: false });
    });

    it('should return active status with id after ensureClient', async () => {
      await manager.ensureClient();
      const status = manager.getClientStatus();
      expect(status.active).toBe(true);
      expect(status.id).toBe('test-client-id');
    });
  });

  describe('ensureClient', () => {
    it('should create and activate client on first call', async () => {
      const client = await manager.ensureClient();
      expect(client).toBeDefined();
      expect(client.isActive()).toBe(true);
    });

    it('should reuse existing active client on subsequent calls', async () => {
      const client1 = await manager.ensureClient();
      const client2 = await manager.ensureClient();
      expect(client1).toBe(client2);
    });
  });

  describe('deactivate', () => {
    it('should do nothing if client not created', async () => {
      await expect(manager.deactivate()).resolves.toBeUndefined();
    });

    it('should detach all documents and deactivate client', async () => {
      await manager.ensureClient();
      await manager.attachDocument('doc1');
      await manager.attachDocument('doc2');

      await manager.deactivate();

      const status = manager.getClientStatus();
      expect(status.active).toBe(false);
      expect(manager.listAttachedDocuments()).toHaveLength(0);
    });
  });

  describe('attachDocument', () => {
    it('should attach document with default options', async () => {
      const doc = await manager.attachDocument('test-doc');
      expect(doc).toBeDefined();
      expect(manager.listAttachedDocuments()).toHaveLength(1);
    });

    it('should return existing document if already attached', async () => {
      const doc1 = await manager.attachDocument('test-doc');
      const doc2 = await manager.attachDocument('test-doc');
      expect(doc1).toBe(doc2);
      expect(manager.listAttachedDocuments()).toHaveLength(1);
    });

    it('should attach document with initialRoot', async () => {
      const doc = await manager.attachDocument('test-doc', {
        initialRoot: { title: 'Hello' },
      });
      expect(doc).toBeDefined();
    });

    it('should attach document with manual sync mode', async () => {
      const doc = await manager.attachDocument('test-doc', {
        syncMode: 'manual',
      });
      expect(doc).toBeDefined();
    });

    it('should attach document with realtime sync mode', async () => {
      const doc = await manager.attachDocument('test-doc', {
        syncMode: 'realtime',
      });
      expect(doc).toBeDefined();
    });
  });

  describe('getDocument', () => {
    it('should return undefined for non-existent document', () => {
      const doc = manager.getDocument('non-existent');
      expect(doc).toBeUndefined();
    });

    it('should return attached document', async () => {
      await manager.attachDocument('test-doc');
      const doc = manager.getDocument('test-doc');
      expect(doc).toBeDefined();
    });
  });

  describe('detachDocument', () => {
    it('should return false for non-existent document', async () => {
      const result = await manager.detachDocument('non-existent');
      expect(result).toBe(false);
    });

    it('should detach and remove document', async () => {
      await manager.attachDocument('test-doc');
      const result = await manager.detachDocument('test-doc');
      expect(result).toBe(true);
      expect(manager.getDocument('test-doc')).toBeUndefined();
    });
  });

  describe('listAttachedDocuments', () => {
    it('should return empty array when no documents attached', () => {
      const docs = manager.listAttachedDocuments();
      expect(docs).toEqual([]);
    });

    it('should return list of attached documents with metadata', async () => {
      await manager.attachDocument('doc1');
      await manager.attachDocument('doc2');

      const docs = manager.listAttachedDocuments();
      expect(docs).toHaveLength(2);
      expect(docs[0].key).toBe('doc1');
      expect(docs[0].attachedAt).toBeInstanceOf(Date);
      expect(docs[0].hasLocalChanges).toBe(false);
    });
  });

  describe('updateDocument', () => {
    it('should return false for non-existent document', async () => {
      const result = await manager.updateDocument('non-existent', {
        title: 'Test',
      });
      expect(result).toBe(false);
    });

    it('should update document with changes', async () => {
      await manager.attachDocument('test-doc');
      const result = await manager.updateDocument('test-doc', {
        title: 'Updated',
      });
      expect(result).toBe(true);
    });

    it('should update document with message', async () => {
      await manager.attachDocument('test-doc');
      const result = await manager.updateDocument(
        'test-doc',
        { title: 'Updated' },
        'Update title',
      );
      expect(result).toBe(true);
    });
  });

  describe('syncDocument', () => {
    it('should return false for non-existent document', async () => {
      const result = await manager.syncDocument('non-existent');
      expect(result).toBe(false);
    });

    it('should sync attached document', async () => {
      await manager.attachDocument('test-doc');
      const result = await manager.syncDocument('test-doc');
      expect(result).toBe(true);
    });
  });

  describe('getDocumentContent', () => {
    it('should return undefined for non-existent document', () => {
      const content = manager.getDocumentContent('non-existent');
      expect(content).toBeUndefined();
    });

    it('should return document content as JSON', async () => {
      await manager.attachDocument('test-doc');
      const content = manager.getDocumentContent('test-doc');
      expect(content).toEqual({ title: 'Test' });
    });
  });

  describe('getDocumentPresences', () => {
    it('should return undefined for non-existent document', () => {
      const presences = manager.getDocumentPresences('non-existent');
      expect(presences).toBeUndefined();
    });

    it('should return presence information', async () => {
      await manager.attachDocument('test-doc');
      const presences = manager.getDocumentPresences('test-doc');
      expect(presences).toHaveLength(1);
      expect(presences![0].clientId).toBe('client-1');
      expect(presences![0].presence).toEqual({ name: 'User 1' });
    });
  });

  describe('createRevision', () => {
    it('should return undefined for non-existent document', async () => {
      const result = await manager.createRevision('non-existent', 'v1.0');
      expect(result).toBeUndefined();
    });

    it('should create revision with label', async () => {
      await manager.attachDocument('test-doc');
      const result = await manager.createRevision('test-doc', 'v1.0');
      expect(result).toEqual({ revisionId: 'rev-1' });
    });

    it('should create revision with label and description', async () => {
      await manager.attachDocument('test-doc');
      const result = await manager.createRevision(
        'test-doc',
        'v1.0',
        'Initial release',
      );
      expect(result).toEqual({ revisionId: 'rev-1' });
    });
  });

  describe('listRevisions', () => {
    it('should return undefined for non-existent document', async () => {
      const revisions = await manager.listRevisions('non-existent');
      expect(revisions).toBeUndefined();
    });

    it('should return list of revisions', async () => {
      await manager.attachDocument('test-doc');
      const revisions = await manager.listRevisions('test-doc');
      expect(revisions).toHaveLength(1);
      expect(revisions![0].id).toBe('rev-1');
      expect(revisions![0].label).toBe('v1.0');
      expect(revisions![0].description).toBe('Initial version');
      expect(revisions![0].createdAt).toBeInstanceOf(Date);
    });
  });
});
