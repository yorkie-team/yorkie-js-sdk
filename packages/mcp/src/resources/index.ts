import { Resource } from '@modelcontextprotocol/sdk/types.js';
import {
  DocumentNotAttachedError,
  InvalidResourceUriError,
} from '../errors.js';
import { YorkieManager } from '../yorkie-manager.js';

/**
 * Get list of available resources (attached documents).
 * @param manager - The YorkieManager instance
 * @returns List of available MCP resources
 */
export async function getResources(
  manager: YorkieManager,
): Promise<Array<Resource>> {
  const documents = manager.listAttachedDocuments();

  return documents.map((doc) => ({
    uri: `yorkie://documents/${encodeURIComponent(doc.key)}`,
    name: doc.key,
    description: `Yorkie document: ${doc.key}`,
    mimeType: 'application/json',
  }));
}

/**
 * Read resource content.
 * @param manager - The YorkieManager instance
 * @param uri - Resource URI to read
 * @returns Resource contents
 */
export async function readResource(
  manager: YorkieManager,
  uri: string,
): Promise<{
  contents: Array<{ uri: string; mimeType: string; text: string }>;
}> {
  const parsedUri = parseYorkieUri(uri);

  if (!parsedUri) {
    throw new InvalidResourceUriError(uri);
  }

  switch (parsedUri.type) {
    case 'document': {
      const content = manager.getDocumentContent(parsedUri.key);

      if (content === undefined) {
        throw new DocumentNotAttachedError(parsedUri.key);
      }

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(content, null, 2),
          },
        ],
      };
    }

    case 'presences': {
      const presences = manager.getDocumentPresences(parsedUri.key);

      if (presences === undefined) {
        throw new DocumentNotAttachedError(parsedUri.key);
      }

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(presences, null, 2),
          },
        ],
      };
    }

    default:
      throw new InvalidResourceUriError(uri);
  }
}

interface ParsedUri {
  type: 'document' | 'presences';
  key: string;
}

/**
 * Parse a Yorkie URI into its components.
 * @param uri - The URI to parse
 * @returns Parsed URI components or undefined if invalid
 */
function parseYorkieUri(uri: string): ParsedUri | undefined {
  // yorkie://documents/{key}
  const documentMatch = uri.match(/^yorkie:\/\/documents\/([^/]+)$/);
  if (documentMatch) {
    return {
      type: 'document',
      key: decodeURIComponent(documentMatch[1]),
    };
  }

  // yorkie://documents/{key}/presences
  const presencesMatch = uri.match(
    /^yorkie:\/\/documents\/([^/]+)\/presences$/,
  );
  if (presencesMatch) {
    return {
      type: 'presences',
      key: decodeURIComponent(presencesMatch[1]),
    };
  }

  return undefined;
}
