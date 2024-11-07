/*
 * Copyright 2020 The Yorkie Authors. All rights reserved.
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

export enum Code {
  // Ok is returned when the operation completed successfully.
  Ok = 'ok',

  // ErrClientNotActivated is returned when the client is not active.
  ErrClientNotActivated = 'ErrClientNotActivated',

  // ErrClientNotFound is returned when the client is not found.
  ErrClientNotFound = 'ErrClientNotFound',

  // ErrUnimplemented is returned when the operation is not implemented.
  ErrUnimplemented = 'ErrUnimplemented',

  // ErrInvalidType is returned when the type is invalid.
  ErrInvalidType = 'ErrInvalidType',

  // ErrDummy is used to verify errors for testing purposes.
  ErrDummy = 'ErrDummy',

  // ErrDocumentNotAttached is returned when the document is not attached.
  ErrDocumentNotAttached = 'ErrDocumentNotAttached',

  // ErrDocumentNotDetached is returned when the document is not detached.
  ErrDocumentNotDetached = 'ErrDocumentNotDetached',

  // ErrDocumentRemoved is returned when the document is removed.
  ErrDocumentRemoved = 'ErrDocumentRemoved',

  // InvalidObjectKey is returned when the object key is invalid.
  ErrInvalidObjectKey = 'ErrInvalidObjectKey',

  // ErrInvalidArgument is returned when the argument is invalid.
  ErrInvalidArgument = 'ErrInvalidArgument',

  // ErrNotInitialized is returned when required initialization has not been completed.
  ErrNotInitialized = 'ErrNotInitialized',

  // ErrNotReady is returned when execution of following actions is not ready.
  ErrNotReady = 'ErrNotReady',

  // ErrRefused is returned when the execution is rejected.
  ErrRefused = 'ErrRefused',

  // ErrContextNotProvided is returned when a required React context is missing
  ErrContextNotProvided = 'ErrContextNotProvided',

  // ErrPermissionDenied is returned when the authorization webhook denies the request.
  ErrPermissionDenied = 'ErrPermissionDenied',

  // ErrUnauthenticated is returned when the request does not have valid authentication credentials.
  ErrUnauthenticated = 'ErrUnauthenticated',
}

/**
 * `YorkieError` is an error returned by a Yorkie operation.
 */
export class YorkieError extends Error {
  name = 'YorkieError';
  stack?: string;

  constructor(
    readonly code: Code,
    readonly message: string,
  ) {
    super(message);
    this.toString = (): string => `[code=${this.code}]: ${this.message}`;
  }
}
