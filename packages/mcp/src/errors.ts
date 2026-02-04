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

/**
 * Error codes for MCP operations.
 */
export enum MCPErrorCode {
  /** Client is not activated */
  ClientNotActivated = 'CLIENT_NOT_ACTIVATED',
  /** Document is not attached */
  DocumentNotAttached = 'DOCUMENT_NOT_ATTACHED',
  /** Document already attached */
  DocumentAlreadyAttached = 'DOCUMENT_ALREADY_ATTACHED',
  /** Invalid document key */
  InvalidDocumentKey = 'INVALID_DOCUMENT_KEY',
  /** Invalid resource URI */
  InvalidResourceUri = 'INVALID_RESOURCE_URI',
  /** Unknown tool */
  UnknownTool = 'UNKNOWN_TOOL',
  /** Invalid arguments */
  InvalidArguments = 'INVALID_ARGUMENTS',
  /** Network error */
  NetworkError = 'NETWORK_ERROR',
  /** Authentication error */
  AuthenticationError = 'AUTHENTICATION_ERROR',
  /** Server error */
  ServerError = 'SERVER_ERROR',
}

/**
 * Base error class for MCP operations.
 * Provides structured error information for AI assistants.
 */
export class MCPError extends Error {
  /** Error code for programmatic handling */
  readonly code: MCPErrorCode;

  /** Suggested action to resolve the error */
  readonly suggestion: string;

  /** Additional context for debugging */
  readonly context?: Record<string, unknown>;

  constructor(
    code: MCPErrorCode,
    message: string,
    suggestion: string,
    context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'MCPError';
    this.code = code;
    this.suggestion = suggestion;
    this.context = context;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MCPError);
    }
  }

  /**
   * Convert error to a structured format for MCP response.
   * @returns Structured error object
   */
  toJSON(): Record<string, unknown> {
    return {
      error: true,
      code: this.code,
      message: this.message,
      suggestion: this.suggestion,
      ...(this.context && { context: this.context }),
    };
  }
}

/**
 * Error thrown when attempting to operate on a document that is not attached.
 */
export class DocumentNotAttachedError extends MCPError {
  constructor(documentKey: string) {
    super(
      MCPErrorCode.DocumentNotAttached,
      `Document '${documentKey}' is not attached.`,
      `Use yorkie_attach_document tool first to attach the document.`,
      { documentKey },
    );
    this.name = 'DocumentNotAttachedError';
  }
}

/**
 * Error thrown when client is not activated.
 */
export class ClientNotActivatedError extends MCPError {
  constructor() {
    super(
      MCPErrorCode.ClientNotActivated,
      'Yorkie client is not activated.',
      'Use yorkie_activate_client tool first to activate the client.',
    );
    this.name = 'ClientNotActivatedError';
  }
}

/**
 * Error thrown when an unknown tool is requested.
 */
export class UnknownToolError extends MCPError {
  constructor(toolName: string, availableTools: Array<string>) {
    super(
      MCPErrorCode.UnknownTool,
      `Unknown tool: '${toolName}'.`,
      `Available tools: ${availableTools.join(', ')}`,
      { toolName, availableTools },
    );
    this.name = 'UnknownToolError';
  }
}

/**
 * Error thrown when a resource URI is invalid.
 */
export class InvalidResourceUriError extends MCPError {
  constructor(uri: string) {
    super(
      MCPErrorCode.InvalidResourceUri,
      `Invalid Yorkie resource URI: '${uri}'.`,
      `Use format: yorkie://documents/{documentKey}`,
      { uri },
    );
    this.name = 'InvalidResourceUriError';
  }
}

/**
 * Error thrown when required arguments are missing or invalid.
 */
export class InvalidArgumentsError extends MCPError {
  constructor(message: string, args?: Record<string, unknown>) {
    super(
      MCPErrorCode.InvalidArguments,
      message,
      'Check the tool schema for required arguments.',
      args,
    );
    this.name = 'InvalidArgumentsError';
  }
}

/**
 * Error thrown when authentication fails.
 */
export class AuthenticationError extends MCPError {
  constructor(message?: string) {
    super(
      MCPErrorCode.AuthenticationError,
      message || 'Authentication failed.',
      'Check that YORKIE_API_KEY is set correctly.',
    );
    this.name = 'AuthenticationError';
  }
}

/**
 * Error thrown when a network operation fails.
 */
export class NetworkError extends MCPError {
  constructor(message: string, cause?: Error) {
    super(
      MCPErrorCode.NetworkError,
      message,
      'Check network connectivity and YORKIE_API_URL setting.',
      cause ? { cause: cause.message } : undefined,
    );
    this.name = 'NetworkError';
  }
}

/**
 * Wrap an unknown error into an MCPError.
 * @param error - The error to wrap
 * @returns MCPError instance
 */
export function wrapError(error: unknown): MCPError {
  if (error instanceof MCPError) {
    return error;
  }

  if (error instanceof Error) {
    // Check for common Yorkie error patterns
    const message = error.message.toLowerCase();

    if (message.includes('not activated')) {
      return new ClientNotActivatedError();
    }

    if (message.includes('not attached')) {
      // Try to extract document key from message
      const match = error.message.match(/['"]([^'"]+)['"]/);
      const key = match ? match[1] : 'unknown';
      return new DocumentNotAttachedError(key);
    }

    if (message.includes('unauthorized') || message.includes('401')) {
      return new AuthenticationError(error.message);
    }

    if (
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('timeout')
    ) {
      return new NetworkError(error.message, error);
    }

    // Generic server error
    return new MCPError(
      MCPErrorCode.ServerError,
      error.message,
      'Check server logs for more details.',
    );
  }

  // Unknown error type
  return new MCPError(
    MCPErrorCode.ServerError,
    String(error),
    'An unexpected error occurred.',
  );
}
