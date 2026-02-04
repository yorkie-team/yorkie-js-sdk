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

import { describe, it, expect } from 'vitest';
import { validateToolArgs, isValidToolName } from './validation.js';
import { InvalidArgumentsError } from '../errors.js';

describe('validation', () => {
  describe('isValidToolName', () => {
    it('should return true for valid tool names', () => {
      expect(isValidToolName('yorkie_get_client_status')).toBe(true);
      expect(isValidToolName('yorkie_attach_document')).toBe(true);
      expect(isValidToolName('yorkie_update_document')).toBe(true);
    });

    it('should return false for invalid tool names', () => {
      expect(isValidToolName('invalid_tool')).toBe(false);
      expect(isValidToolName('')).toBe(false);
      expect(isValidToolName('yorkie_invalid')).toBe(false);
    });
  });

  describe('validateToolArgs', () => {
    describe('yorkie_get_client_status', () => {
      it('should accept empty object', () => {
        const result = validateToolArgs('yorkie_get_client_status', {});
        expect(result).toEqual({});
      });
    });

    describe('yorkie_attach_document', () => {
      it('should validate valid document key', () => {
        const result = validateToolArgs('yorkie_attach_document', {
          documentKey: 'my-document',
        });
        expect(result.documentKey).toBe('my-document');
      });

      it('should accept optional initialRoot', () => {
        const result = validateToolArgs('yorkie_attach_document', {
          documentKey: 'my-document',
          initialRoot: { title: 'Hello' },
        });
        expect(result.initialRoot).toEqual({ title: 'Hello' });
      });

      it('should accept optional syncMode', () => {
        const result = validateToolArgs('yorkie_attach_document', {
          documentKey: 'my-document',
          syncMode: 'manual',
        });
        expect(result.syncMode).toBe('manual');
      });

      it('should reject empty document key', () => {
        expect(() =>
          validateToolArgs('yorkie_attach_document', { documentKey: '' }),
        ).toThrow(InvalidArgumentsError);
      });

      it('should reject document key with invalid characters', () => {
        expect(() =>
          validateToolArgs('yorkie_attach_document', {
            documentKey: 'my document!',
          }),
        ).toThrow(InvalidArgumentsError);
      });

      it('should reject document key exceeding max length', () => {
        const longKey = 'a'.repeat(300);
        expect(() =>
          validateToolArgs('yorkie_attach_document', { documentKey: longKey }),
        ).toThrow(InvalidArgumentsError);
      });

      it('should accept document key with allowed special characters', () => {
        const result = validateToolArgs('yorkie_attach_document', {
          documentKey: 'my-doc_v1.0:test',
        });
        expect(result.documentKey).toBe('my-doc_v1.0:test');
      });

      it('should reject invalid syncMode', () => {
        expect(() =>
          validateToolArgs('yorkie_attach_document', {
            documentKey: 'my-doc',
            syncMode: 'invalid',
          }),
        ).toThrow(InvalidArgumentsError);
      });
    });

    describe('yorkie_update_document', () => {
      it('should validate valid update', () => {
        const result = validateToolArgs('yorkie_update_document', {
          documentKey: 'my-doc',
          updates: { title: 'Hello' },
        });
        expect(result.documentKey).toBe('my-doc');
        expect(result.updates).toEqual({ title: 'Hello' });
      });

      it('should accept optional message', () => {
        const result = validateToolArgs('yorkie_update_document', {
          documentKey: 'my-doc',
          updates: { title: 'Hello' },
          message: 'Update title',
        });
        expect(result.message).toBe('Update title');
      });

      it('should reject message exceeding max length', () => {
        const longMessage = 'a'.repeat(300);
        expect(() =>
          validateToolArgs('yorkie_update_document', {
            documentKey: 'my-doc',
            updates: { title: 'Hello' },
            message: longMessage,
          }),
        ).toThrow(InvalidArgumentsError);
      });

      it('should reject missing updates', () => {
        expect(() =>
          validateToolArgs('yorkie_update_document', {
            documentKey: 'my-doc',
          }),
        ).toThrow(InvalidArgumentsError);
      });

      it('should reject oversized updates', () => {
        const largeUpdate = { data: 'x'.repeat(1024 * 1024 + 1) };
        expect(() =>
          validateToolArgs('yorkie_update_document', {
            documentKey: 'my-doc',
            updates: largeUpdate,
          }),
        ).toThrow(InvalidArgumentsError);
      });
    });

    describe('yorkie_create_revision', () => {
      it('should validate valid revision', () => {
        const result = validateToolArgs('yorkie_create_revision', {
          documentKey: 'my-doc',
          label: 'v1.0',
        });
        expect(result.documentKey).toBe('my-doc');
        expect(result.label).toBe('v1.0');
      });

      it('should accept optional description', () => {
        const result = validateToolArgs('yorkie_create_revision', {
          documentKey: 'my-doc',
          label: 'v1.0',
          description: 'Initial release',
        });
        expect(result.description).toBe('Initial release');
      });

      it('should reject empty label', () => {
        expect(() =>
          validateToolArgs('yorkie_create_revision', {
            documentKey: 'my-doc',
            label: '',
          }),
        ).toThrow(InvalidArgumentsError);
      });

      it('should reject label exceeding max length', () => {
        const longLabel = 'a'.repeat(200);
        expect(() =>
          validateToolArgs('yorkie_create_revision', {
            documentKey: 'my-doc',
            label: longLabel,
          }),
        ).toThrow(InvalidArgumentsError);
      });

      it('should reject description exceeding max length', () => {
        const longDesc = 'a'.repeat(1100);
        expect(() =>
          validateToolArgs('yorkie_create_revision', {
            documentKey: 'my-doc',
            label: 'v1.0',
            description: longDesc,
          }),
        ).toThrow(InvalidArgumentsError);
      });
    });

    describe('yorkie_get_document', () => {
      it('should validate valid document key', () => {
        const result = validateToolArgs('yorkie_get_document', {
          documentKey: 'my-doc',
        });
        expect(result.documentKey).toBe('my-doc');
      });

      it('should reject missing document key', () => {
        expect(() => validateToolArgs('yorkie_get_document', {})).toThrow(
          InvalidArgumentsError,
        );
      });
    });

    describe('yorkie_sync_document', () => {
      it('should validate valid document key', () => {
        const result = validateToolArgs('yorkie_sync_document', {
          documentKey: 'my-doc',
        });
        expect(result.documentKey).toBe('my-doc');
      });
    });

    describe('yorkie_get_presences', () => {
      it('should validate valid document key', () => {
        const result = validateToolArgs('yorkie_get_presences', {
          documentKey: 'my-doc',
        });
        expect(result.documentKey).toBe('my-doc');
      });
    });

    describe('yorkie_list_revisions', () => {
      it('should validate valid document key', () => {
        const result = validateToolArgs('yorkie_list_revisions', {
          documentKey: 'my-doc',
        });
        expect(result.documentKey).toBe('my-doc');
      });
    });

    describe('yorkie_detach_document', () => {
      it('should validate valid document key', () => {
        const result = validateToolArgs('yorkie_detach_document', {
          documentKey: 'my-doc',
        });
        expect(result.documentKey).toBe('my-doc');
      });
    });

    describe('yorkie_list_documents', () => {
      it('should accept empty object', () => {
        const result = validateToolArgs('yorkie_list_documents', {});
        expect(result).toEqual({});
      });
    });

    describe('yorkie_activate_client', () => {
      it('should accept empty object', () => {
        const result = validateToolArgs('yorkie_activate_client', {});
        expect(result).toEqual({});
      });
    });

    describe('yorkie_deactivate_client', () => {
      it('should accept empty object', () => {
        const result = validateToolArgs('yorkie_deactivate_client', {});
        expect(result).toEqual({});
      });
    });
  });
});
