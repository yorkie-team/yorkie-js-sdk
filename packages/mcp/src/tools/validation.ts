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

import { z } from 'zod';
import { InvalidArgumentsError } from '../errors.js';

/**
 * Maximum length for document keys to prevent abuse.
 */
const maxDocumentKeyLength = 256;

/**
 * Maximum size for update objects (in characters when JSON stringified).
 */
const maxUpdateSize = 1024 * 1024; // 1MB

/**
 * Schema for document key validation.
 */
const documentKeySchema = z
  .string()
  .min(1, 'Document key cannot be empty')
  .max(
    maxDocumentKeyLength,
    `Document key cannot exceed ${maxDocumentKeyLength} characters`,
  )
  .regex(
    /^[a-zA-Z0-9_\-:.]+$/,
    'Document key can only contain letters, numbers, underscores, hyphens, colons, and periods',
  );

/**
 * Schema for sync mode validation.
 */
const syncModeSchema = z.enum(['realtime', 'manual']).optional();

/**
 * Schema for revision label validation.
 */
const revisionLabelSchema = z
  .string()
  .min(1, 'Revision label cannot be empty')
  .max(128, 'Revision label cannot exceed 128 characters');

/**
 * Schema for revision description validation.
 */
const revisionDescriptionSchema = z
  .string()
  .max(1024, 'Revision description cannot exceed 1024 characters')
  .optional();

/**
 * Schema for update message validation.
 */
const updateMessageSchema = z
  .string()
  .max(256, 'Update message cannot exceed 256 characters')
  .optional();

/**
 * Validation schemas for each tool.
 */
export const toolSchemas = {
  yorkie_get_client_status: z.object({}),

  yorkie_activate_client: z.object({}),

  yorkie_deactivate_client: z.object({}),

  yorkie_attach_document: z.object({
    documentKey: documentKeySchema,
    initialRoot: z.record(z.unknown()).optional(),
    syncMode: syncModeSchema,
  }),

  yorkie_detach_document: z.object({
    documentKey: documentKeySchema,
  }),

  yorkie_list_documents: z.object({}),

  yorkie_get_document: z.object({
    documentKey: documentKeySchema,
  }),

  yorkie_update_document: z.object({
    documentKey: documentKeySchema,
    updates: z.record(z.unknown()),
    message: updateMessageSchema,
  }),

  yorkie_sync_document: z.object({
    documentKey: documentKeySchema,
  }),

  yorkie_get_presences: z.object({
    documentKey: documentKeySchema,
  }),

  yorkie_create_revision: z.object({
    documentKey: documentKeySchema,
    label: revisionLabelSchema,
    description: revisionDescriptionSchema,
  }),

  yorkie_list_revisions: z.object({
    documentKey: documentKeySchema,
  }),
} as const;

export type ToolName = keyof typeof toolSchemas;

/**
 * Validates tool arguments against the schema.
 * @param toolName - Name of the tool
 * @param args - Arguments to validate
 * @returns Validated arguments
 * @throws InvalidArgumentsError if validation fails
 */
export function validateToolArgs<T extends ToolName>(
  toolName: T,
  args: Record<string, unknown>,
): z.infer<(typeof toolSchemas)[T]> {
  const schema = toolSchemas[toolName];

  if (!schema) {
    throw new InvalidArgumentsError(`Unknown tool: ${toolName}`);
  }

  const result = schema.safeParse(args);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('; ');
    throw new InvalidArgumentsError(`Invalid arguments: ${errors}`, args);
  }

  // Additional size check for update operations
  if (toolName === 'yorkie_update_document' && 'updates' in args) {
    const updateSize = JSON.stringify(args.updates).length;
    if (updateSize > maxUpdateSize) {
      throw new InvalidArgumentsError(
        `Update size (${updateSize} bytes) exceeds maximum allowed (${maxUpdateSize} bytes)`,
        { updateSize, maxSize: maxUpdateSize },
      );
    }
  }

  return result.data;
}

/**
 * Checks if a tool name is valid.
 * @param toolName - Name to check
 * @returns True if valid tool name
 */
export function isValidToolName(toolName: string): toolName is ToolName {
  return toolName in toolSchemas;
}
