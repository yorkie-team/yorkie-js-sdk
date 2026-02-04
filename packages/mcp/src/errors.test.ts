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

import { describe, expect, it } from 'vitest';
import {
  AuthenticationError,
  ClientNotActivatedError,
  DocumentNotAttachedError,
  InvalidArgumentsError,
  InvalidResourceUriError,
  MCPError,
  MCPErrorCode,
  NetworkError,
  UnknownToolError,
  wrapError,
} from './errors.js';

describe('MCPError', () => {
  it('should create error with all properties', () => {
    const error = new MCPError(
      MCPErrorCode.ServerError,
      'Test error',
      'Try again',
      { key: 'value' },
    );

    expect(error.code).toBe(MCPErrorCode.ServerError);
    expect(error.message).toBe('Test error');
    expect(error.suggestion).toBe('Try again');
    expect(error.context).toEqual({ key: 'value' });
    expect(error.name).toBe('MCPError');
  });

  it('should convert to JSON correctly', () => {
    const error = new MCPError(
      MCPErrorCode.ServerError,
      'Test error',
      'Try again',
      { key: 'value' },
    );

    const json = error.toJSON();

    expect(json).toEqual({
      error: true,
      code: MCPErrorCode.ServerError,
      message: 'Test error',
      suggestion: 'Try again',
      context: { key: 'value' },
    });
  });

  it('should omit context if not provided', () => {
    const error = new MCPError(
      MCPErrorCode.ServerError,
      'Test error',
      'Try again',
    );

    const json = error.toJSON();

    expect(json.context).toBeUndefined();
  });
});

describe('DocumentNotAttachedError', () => {
  it('should create error with document key', () => {
    const error = new DocumentNotAttachedError('my-doc');

    expect(error.code).toBe(MCPErrorCode.DocumentNotAttached);
    expect(error.message).toContain('my-doc');
    expect(error.suggestion).toContain('yorkie_attach_document');
    expect(error.context).toEqual({ documentKey: 'my-doc' });
    expect(error.name).toBe('DocumentNotAttachedError');
  });
});

describe('ClientNotActivatedError', () => {
  it('should create error with activation suggestion', () => {
    const error = new ClientNotActivatedError();

    expect(error.code).toBe(MCPErrorCode.ClientNotActivated);
    expect(error.suggestion).toContain('yorkie_activate_client');
    expect(error.name).toBe('ClientNotActivatedError');
  });
});

describe('UnknownToolError', () => {
  it('should create error with available tools', () => {
    const error = new UnknownToolError('bad_tool', ['tool1', 'tool2']);

    expect(error.code).toBe(MCPErrorCode.UnknownTool);
    expect(error.message).toContain('bad_tool');
    expect(error.suggestion).toContain('tool1, tool2');
    expect(error.context).toEqual({
      toolName: 'bad_tool',
      availableTools: ['tool1', 'tool2'],
    });
    expect(error.name).toBe('UnknownToolError');
  });
});

describe('InvalidResourceUriError', () => {
  it('should create error with URI format suggestion', () => {
    const error = new InvalidResourceUriError('bad://uri');

    expect(error.code).toBe(MCPErrorCode.InvalidResourceUri);
    expect(error.message).toContain('bad://uri');
    expect(error.suggestion).toContain('yorkie://documents/');
    expect(error.name).toBe('InvalidResourceUriError');
  });
});

describe('InvalidArgumentsError', () => {
  it('should create error with arguments context', () => {
    const error = new InvalidArgumentsError('Missing required field', {
      field: 'name',
    });

    expect(error.code).toBe(MCPErrorCode.InvalidArguments);
    expect(error.context).toEqual({ field: 'name' });
    expect(error.name).toBe('InvalidArgumentsError');
  });
});

describe('AuthenticationError', () => {
  it('should create error with API key suggestion', () => {
    const error = new AuthenticationError('Invalid token');

    expect(error.code).toBe(MCPErrorCode.AuthenticationError);
    expect(error.message).toBe('Invalid token');
    expect(error.suggestion).toContain('YORKIE_API_KEY');
    expect(error.name).toBe('AuthenticationError');
  });

  it('should use default message if not provided', () => {
    const error = new AuthenticationError();

    expect(error.message).toBe('Authentication failed.');
  });
});

describe('NetworkError', () => {
  it('should create error with network suggestion', () => {
    const cause = new Error('Connection refused');
    const error = new NetworkError('Failed to connect', cause);

    expect(error.code).toBe(MCPErrorCode.NetworkError);
    expect(error.suggestion).toContain('YORKIE_API_URL');
    expect(error.context).toEqual({ cause: 'Connection refused' });
    expect(error.name).toBe('NetworkError');
  });
});

describe('wrapError', () => {
  it('should return MCPError as-is', () => {
    const original = new DocumentNotAttachedError('doc1');
    const wrapped = wrapError(original);

    expect(wrapped).toBe(original);
  });

  it('should wrap "not activated" errors', () => {
    const original = new Error('Client is not activated');
    const wrapped = wrapError(original);

    expect(wrapped).toBeInstanceOf(ClientNotActivatedError);
  });

  it('should wrap "not attached" errors', () => {
    const original = new Error("Document 'my-doc' is not attached");
    const wrapped = wrapError(original);

    expect(wrapped).toBeInstanceOf(DocumentNotAttachedError);
    expect(wrapped.context?.documentKey).toBe('my-doc');
  });

  it('should wrap unauthorized errors', () => {
    const original = new Error('Unauthorized: 401');
    const wrapped = wrapError(original);

    expect(wrapped).toBeInstanceOf(AuthenticationError);
  });

  it('should wrap network errors', () => {
    const original = new Error('ECONNREFUSED');
    const wrapped = wrapError(original);

    expect(wrapped).toBeInstanceOf(NetworkError);
  });

  it('should wrap unknown errors as ServerError', () => {
    const original = new Error('Something went wrong');
    const wrapped = wrapError(original);

    expect(wrapped.code).toBe(MCPErrorCode.ServerError);
    expect(wrapped.message).toBe('Something went wrong');
  });

  it('should handle non-Error objects', () => {
    const wrapped = wrapError('string error');

    expect(wrapped.code).toBe(MCPErrorCode.ServerError);
    expect(wrapped.message).toBe('string error');
  });
});
