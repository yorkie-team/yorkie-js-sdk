import { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Indexable } from '@yorkie-js/sdk';
import {
  DocumentNotAttachedError,
  UnknownToolError,
  wrapError,
} from '../errors.js';
import { YorkieManager } from '../yorkie-manager.js';

/**
 * Available MCP tools for Yorkie operations
 */
export const tools: Array<Tool> = [
  // Client Management
  {
    name: 'yorkie_get_client_status',
    description:
      'Get the current Yorkie client status including activation state and client ID',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'yorkie_activate_client',
    description:
      'Activate the Yorkie client to establish connection with the server',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'yorkie_deactivate_client',
    description:
      'Deactivate the Yorkie client and detach all documents. Use this for cleanup.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  // Document Management
  {
    name: 'yorkie_attach_document',
    description:
      'Attach to a Yorkie document for collaborative editing. Creates the document if it does not exist.',
    inputSchema: {
      type: 'object',
      properties: {
        documentKey: {
          type: 'string',
          description: 'Unique key/name for the document',
        },
        initialRoot: {
          type: 'object',
          description: 'Initial document content if creating new document',
        },
        syncMode: {
          type: 'string',
          enum: ['realtime', 'manual'],
          description:
            'Sync mode: realtime for automatic sync, manual for explicit sync calls',
          default: 'realtime',
        },
      },
      required: ['documentKey'],
    },
  },
  {
    name: 'yorkie_detach_document',
    description: 'Detach from a Yorkie document, stopping synchronization',
    inputSchema: {
      type: 'object',
      properties: {
        documentKey: {
          type: 'string',
          description: 'Key of the document to detach',
        },
      },
      required: ['documentKey'],
    },
  },
  {
    name: 'yorkie_list_documents',
    description: 'List all currently attached documents with their status',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'yorkie_get_document',
    description:
      'Get the current content of an attached document as JSON. Returns the full document state.',
    inputSchema: {
      type: 'object',
      properties: {
        documentKey: {
          type: 'string',
          description: 'Key of the document to read',
        },
      },
      required: ['documentKey'],
    },
  },
  {
    name: 'yorkie_update_document',
    description:
      'Update a document by setting key-value pairs on the root object. Changes are automatically synced in realtime mode.',
    inputSchema: {
      type: 'object',
      properties: {
        documentKey: {
          type: 'string',
          description: 'Key of the document to update',
        },
        updates: {
          type: 'object',
          description:
            'Object containing key-value pairs to set on the document root',
        },
        message: {
          type: 'string',
          description: 'Optional message describing the change',
        },
      },
      required: ['documentKey', 'updates'],
    },
  },
  {
    name: 'yorkie_sync_document',
    description:
      'Manually sync a document with the server. Required in manual sync mode.',
    inputSchema: {
      type: 'object',
      properties: {
        documentKey: {
          type: 'string',
          description: 'Key of the document to sync',
        },
      },
      required: ['documentKey'],
    },
  },

  // Presence
  {
    name: 'yorkie_get_presences',
    description:
      'Get all active user presences for a document. Shows who is currently viewing/editing.',
    inputSchema: {
      type: 'object',
      properties: {
        documentKey: {
          type: 'string',
          description: 'Key of the document',
        },
      },
      required: ['documentKey'],
    },
  },

  // Revisions
  {
    name: 'yorkie_create_revision',
    description:
      'Create a revision (checkpoint/snapshot) of the current document state',
    inputSchema: {
      type: 'object',
      properties: {
        documentKey: {
          type: 'string',
          description: 'Key of the document',
        },
        label: {
          type: 'string',
          description: 'Label/name for this revision',
        },
        description: {
          type: 'string',
          description: 'Optional description of this revision',
        },
      },
      required: ['documentKey', 'label'],
    },
  },
  {
    name: 'yorkie_list_revisions',
    description: 'List all revisions (checkpoints) for a document',
    inputSchema: {
      type: 'object',
      properties: {
        documentKey: {
          type: 'string',
          description: 'Key of the document',
        },
      },
      required: ['documentKey'],
    },
  },
];

/**
 * Handle tool calls from MCP clients.
 * @param manager - The YorkieManager instance
 * @param toolName - Name of the tool to execute
 * @param args - Arguments for the tool
 * @returns Tool execution result
 */
export async function handleToolCall(
  manager: YorkieManager,
  toolName: string,
  args: Record<string, unknown> | undefined,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    const result = await executeToolCall(manager, toolName, args ?? {});
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const mcpError = wrapError(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(mcpError.toJSON(), null, 2),
        },
      ],
    };
  }
}

/**
 * Execute a tool call and return the result.
 * @param manager - The YorkieManager instance
 * @param toolName - Name of the tool to execute
 * @param args - Arguments for the tool
 * @returns Tool execution result
 */
async function executeToolCall(
  manager: YorkieManager,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (toolName) {
    // Client Management
    case 'yorkie_get_client_status':
      return manager.getClientStatus();

    case 'yorkie_activate_client': {
      await manager.ensureClient();
      return { success: true, ...manager.getClientStatus() };
    }

    case 'yorkie_deactivate_client': {
      await manager.deactivate();
      return { success: true };
    }

    // Document Management
    case 'yorkie_attach_document': {
      const { documentKey, initialRoot, syncMode } = args as {
        documentKey: string;
        initialRoot?: Indexable;
        syncMode?: 'realtime' | 'manual';
      };

      await manager.attachDocument(documentKey, { initialRoot, syncMode });
      return {
        success: true,
        documentKey,
        content: manager.getDocumentContent(documentKey),
      };
    }

    case 'yorkie_detach_document': {
      const { documentKey } = args as { documentKey: string };
      const success = await manager.detachDocument(documentKey);
      return { success, documentKey };
    }

    case 'yorkie_list_documents':
      return { documents: manager.listAttachedDocuments() };

    case 'yorkie_get_document': {
      const { documentKey } = args as { documentKey: string };
      const content = manager.getDocumentContent(documentKey);

      if (content === undefined) {
        throw new DocumentNotAttachedError(documentKey);
      }

      return { documentKey, content };
    }

    case 'yorkie_update_document': {
      const { documentKey, updates, message } = args as {
        documentKey: string;
        updates: Record<string, unknown>;
        message?: string;
      };

      const success = await manager.updateDocument(
        documentKey,
        updates,
        message,
      );

      if (!success) {
        throw new DocumentNotAttachedError(documentKey);
      }

      return {
        success: true,
        documentKey,
        content: manager.getDocumentContent(documentKey),
      };
    }

    case 'yorkie_sync_document': {
      const { documentKey } = args as { documentKey: string };
      const success = await manager.syncDocument(documentKey);

      if (!success) {
        throw new DocumentNotAttachedError(documentKey);
      }

      return { success: true, documentKey };
    }

    // Presence
    case 'yorkie_get_presences': {
      const { documentKey } = args as { documentKey: string };
      const presences = manager.getDocumentPresences(documentKey);

      if (presences === undefined) {
        throw new DocumentNotAttachedError(documentKey);
      }

      return { documentKey, presences };
    }

    // Revisions
    case 'yorkie_create_revision': {
      const { documentKey, label, description } = args as {
        documentKey: string;
        label: string;
        description?: string;
      };

      const result = await manager.createRevision(
        documentKey,
        label,
        description,
      );

      if (!result) {
        throw new DocumentNotAttachedError(documentKey);
      }

      return { success: true, documentKey, ...result };
    }

    case 'yorkie_list_revisions': {
      const { documentKey } = args as { documentKey: string };
      const revisions = await manager.listRevisions(documentKey);

      if (revisions === undefined) {
        throw new DocumentNotAttachedError(documentKey);
      }

      return { documentKey, revisions };
    }

    default:
      throw new UnknownToolError(
        toolName,
        tools.map((t) => t.name),
      );
  }
}
