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
import {
  DocumentNotAttachedError,
  InvalidResourceUriError,
} from '../errors.js';
import { YorkieManager } from '../yorkie-manager.js';
import { getResources, readResource } from './index.js';

// Mock YorkieManager
vi.mock('../yorkie-manager.js', () => {
  return {
    YorkieManager: vi.fn().mockImplementation(() => ({
      listAttachedDocuments: vi.fn(),
      getDocumentContent: vi.fn(),
      getDocumentPresences: vi.fn(),
    })),
  };
});

describe('getResources', () => {
  let mockManager: YorkieManager;

  beforeEach(() => {
    mockManager = new YorkieManager('http://localhost', 'test-key');
    vi.clearAllMocks();
  });

  it('should return empty array when no documents attached', async () => {
    vi.mocked(mockManager.listAttachedDocuments).mockReturnValue([]);

    const resources = await getResources(mockManager);

    expect(resources).toEqual([]);
  });

  it('should return resources for attached documents', async () => {
    vi.mocked(mockManager.listAttachedDocuments).mockReturnValue([
      { key: 'doc1', attachedAt: new Date(), hasLocalChanges: false },
      { key: 'doc2', attachedAt: new Date(), hasLocalChanges: true },
    ]);

    const resources = await getResources(mockManager);

    expect(resources).toHaveLength(2);
    expect(resources[0]).toEqual({
      uri: 'yorkie://documents/doc1',
      name: 'doc1',
      description: 'Yorkie document: doc1',
      mimeType: 'application/json',
    });
    expect(resources[1]).toEqual({
      uri: 'yorkie://documents/doc2',
      name: 'doc2',
      description: 'Yorkie document: doc2',
      mimeType: 'application/json',
    });
  });

  it('should encode document keys with special characters', async () => {
    vi.mocked(mockManager.listAttachedDocuments).mockReturnValue([
      {
        key: 'doc/with/slashes',
        attachedAt: new Date(),
        hasLocalChanges: false,
      },
    ]);

    const resources = await getResources(mockManager);

    expect(resources[0].uri).toBe('yorkie://documents/doc%2Fwith%2Fslashes');
    expect(resources[0].name).toBe('doc/with/slashes');
  });
});

describe('readResource', () => {
  let mockManager: YorkieManager;

  beforeEach(() => {
    mockManager = new YorkieManager('http://localhost', 'test-key');
    vi.clearAllMocks();
  });

  describe('document resource', () => {
    it('should return document content', async () => {
      vi.mocked(mockManager.getDocumentContent).mockReturnValue({
        title: 'Test Document',
        items: [1, 2, 3],
      });

      const result = await readResource(
        mockManager,
        'yorkie://documents/my-doc',
      );

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].uri).toBe('yorkie://documents/my-doc');
      expect(result.contents[0].mimeType).toBe('application/json');

      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.title).toBe('Test Document');
      expect(parsed.items).toEqual([1, 2, 3]);
    });

    it('should decode URL-encoded document keys', async () => {
      vi.mocked(mockManager.getDocumentContent).mockReturnValue({
        data: 'test',
      });

      await readResource(
        mockManager,
        'yorkie://documents/doc%2Fwith%2Fslashes',
      );

      expect(mockManager.getDocumentContent).toHaveBeenCalledWith(
        'doc/with/slashes',
      );
    });

    it('should throw DocumentNotAttachedError when document not found', async () => {
      vi.mocked(mockManager.getDocumentContent).mockReturnValue(undefined);

      await expect(
        readResource(mockManager, 'yorkie://documents/not-found'),
      ).rejects.toThrow(DocumentNotAttachedError);
    });
  });

  describe('presences resource', () => {
    it('should return presences for document', async () => {
      vi.mocked(mockManager.getDocumentPresences).mockReturnValue([
        {
          clientId: 'client1',
          presence: { name: 'User 1', cursor: { x: 10, y: 20 } },
        },
        {
          clientId: 'client2',
          presence: { name: 'User 2', cursor: { x: 30, y: 40 } },
        },
      ]);

      const result = await readResource(
        mockManager,
        'yorkie://documents/my-doc/presences',
      );

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].uri).toBe(
        'yorkie://documents/my-doc/presences',
      );

      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].clientId).toBe('client1');
    });

    it('should throw DocumentNotAttachedError when document not found', async () => {
      vi.mocked(mockManager.getDocumentPresences).mockReturnValue(undefined);

      await expect(
        readResource(mockManager, 'yorkie://documents/not-found/presences'),
      ).rejects.toThrow(DocumentNotAttachedError);
    });
  });

  describe('invalid URIs', () => {
    it('should throw InvalidResourceUriError for invalid scheme', async () => {
      await expect(
        readResource(mockManager, 'http://documents/my-doc'),
      ).rejects.toThrow(InvalidResourceUriError);
    });

    it('should throw InvalidResourceUriError for invalid path', async () => {
      await expect(
        readResource(mockManager, 'yorkie://invalid/path/structure'),
      ).rejects.toThrow(InvalidResourceUriError);
    });

    it('should throw InvalidResourceUriError for empty URI', async () => {
      await expect(readResource(mockManager, '')).rejects.toThrow(
        InvalidResourceUriError,
      );
    });
  });
});
