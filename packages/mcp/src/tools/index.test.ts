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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MCPErrorCode } from '../errors.js';
import { YorkieManager } from '../yorkie-manager.js';
import { handleToolCall, tools } from './index.js';

// Mock YorkieManager
vi.mock('../yorkie-manager.js', () => {
  return {
    YorkieManager: vi.fn().mockImplementation(() => ({
      getClientStatus: vi.fn(),
      ensureClient: vi.fn(),
      deactivate: vi.fn(),
      attachDocument: vi.fn(),
      detachDocument: vi.fn(),
      listAttachedDocuments: vi.fn(),
      getDocumentContent: vi.fn(),
      updateDocument: vi.fn(),
      syncDocument: vi.fn(),
      getDocumentPresences: vi.fn(),
      createRevision: vi.fn(),
      listRevisions: vi.fn(),
    })),
  };
});

describe('tools', () => {
  it('should export all 12 tools', () => {
    expect(tools).toHaveLength(12);
  });

  it('should have unique tool names', () => {
    const names = tools.map((t) => t.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it('should have valid input schemas for all tools', () => {
    for (const tool of tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toBeDefined();
      expect(tool.inputSchema.required).toBeDefined();
    }
  });

  it('should include all expected tool names', () => {
    const expectedNames = [
      'yorkie_get_client_status',
      'yorkie_activate_client',
      'yorkie_deactivate_client',
      'yorkie_attach_document',
      'yorkie_detach_document',
      'yorkie_list_documents',
      'yorkie_get_document',
      'yorkie_update_document',
      'yorkie_sync_document',
      'yorkie_get_presences',
      'yorkie_create_revision',
      'yorkie_list_revisions',
    ];

    const actualNames = tools.map((t) => t.name);
    expect(actualNames).toEqual(expectedNames);
  });
});

describe('handleToolCall', () => {
  let mockManager: YorkieManager;

  beforeEach(() => {
    mockManager = new YorkieManager('http://localhost', 'test-key');
    vi.clearAllMocks();
  });

  describe('yorkie_get_client_status', () => {
    it('should return client status', async () => {
      vi.mocked(mockManager.getClientStatus).mockReturnValue({
        active: true,
        id: 'client-123',
      });

      const result = await handleToolCall(
        mockManager,
        'yorkie_get_client_status',
        {},
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.active).toBe(true);
      expect(parsed.id).toBe('client-123');
    });
  });

  describe('yorkie_activate_client', () => {
    it('should activate client and return status', async () => {
      vi.mocked(mockManager.ensureClient).mockResolvedValue({} as never);
      vi.mocked(mockManager.getClientStatus).mockReturnValue({
        active: true,
        id: 'client-123',
      });

      const result = await handleToolCall(
        mockManager,
        'yorkie_activate_client',
        {},
      );

      expect(mockManager.ensureClient).toHaveBeenCalled();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.active).toBe(true);
    });
  });

  describe('yorkie_deactivate_client', () => {
    it('should deactivate client', async () => {
      vi.mocked(mockManager.deactivate).mockResolvedValue();

      const result = await handleToolCall(
        mockManager,
        'yorkie_deactivate_client',
        {},
      );

      expect(mockManager.deactivate).toHaveBeenCalled();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });
  });

  describe('yorkie_attach_document', () => {
    it('should attach document and return content', async () => {
      vi.mocked(mockManager.attachDocument).mockResolvedValue({} as never);
      vi.mocked(mockManager.getDocumentContent).mockReturnValue({
        title: 'Test',
      });

      const result = await handleToolCall(
        mockManager,
        'yorkie_attach_document',
        {
          documentKey: 'test-doc',
          initialRoot: { title: 'Test' },
        },
      );

      expect(mockManager.attachDocument).toHaveBeenCalledWith('test-doc', {
        initialRoot: { title: 'Test' },
        syncMode: undefined,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.documentKey).toBe('test-doc');
      expect(parsed.content).toEqual({ title: 'Test' });
    });
  });

  describe('yorkie_get_document', () => {
    it('should return document content', async () => {
      vi.mocked(mockManager.getDocumentContent).mockReturnValue({
        data: 'test',
      });

      const result = await handleToolCall(mockManager, 'yorkie_get_document', {
        documentKey: 'test-doc',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.documentKey).toBe('test-doc');
      expect(parsed.content).toEqual({ data: 'test' });
    });

    it('should return error when document not attached', async () => {
      vi.mocked(mockManager.getDocumentContent).mockReturnValue(undefined);

      const result = await handleToolCall(mockManager, 'yorkie_get_document', {
        documentKey: 'not-attached',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe(true);
      expect(parsed.code).toBe(MCPErrorCode.DocumentNotAttached);
      expect(parsed.suggestion).toContain('yorkie_attach_document');
    });
  });

  describe('yorkie_update_document', () => {
    it('should update document and return new content', async () => {
      vi.mocked(mockManager.updateDocument).mockResolvedValue(true);
      vi.mocked(mockManager.getDocumentContent).mockReturnValue({
        updated: true,
      });

      const result = await handleToolCall(
        mockManager,
        'yorkie_update_document',
        {
          documentKey: 'test-doc',
          updates: { field: 'value' },
          message: 'Update field',
        },
      );

      expect(mockManager.updateDocument).toHaveBeenCalledWith(
        'test-doc',
        { field: 'value' },
        'Update field',
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it('should return error when document not attached', async () => {
      vi.mocked(mockManager.updateDocument).mockResolvedValue(false);

      const result = await handleToolCall(
        mockManager,
        'yorkie_update_document',
        {
          documentKey: 'not-attached',
          updates: {},
        },
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe(true);
      expect(parsed.code).toBe(MCPErrorCode.DocumentNotAttached);
    });
  });

  describe('yorkie_list_documents', () => {
    it('should return list of attached documents', async () => {
      vi.mocked(mockManager.listAttachedDocuments).mockReturnValue([
        { key: 'doc1', attachedAt: new Date(), hasLocalChanges: false },
        { key: 'doc2', attachedAt: new Date(), hasLocalChanges: true },
      ]);

      const result = await handleToolCall(
        mockManager,
        'yorkie_list_documents',
        {},
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.documents).toHaveLength(2);
    });
  });

  describe('yorkie_get_presences', () => {
    it('should return presences for document', async () => {
      vi.mocked(mockManager.getDocumentPresences).mockReturnValue([
        { clientId: 'client1', presence: { name: 'User 1' } },
      ]);

      const result = await handleToolCall(mockManager, 'yorkie_get_presences', {
        documentKey: 'test-doc',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.presences).toHaveLength(1);
      expect(parsed.presences[0].clientId).toBe('client1');
    });
  });

  describe('unknown tool', () => {
    it('should return error for unknown tool', async () => {
      const result = await handleToolCall(mockManager, 'unknown_tool', {});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe(true);
      expect(parsed.code).toBe(MCPErrorCode.UnknownTool);
      expect(parsed.context.availableTools).toBeDefined();
    });
  });
});
