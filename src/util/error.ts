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

  // ClientNotActive is returned when the client is not active.
  ClientNotActive = 'client-not-active',

  // Unimplemented is returned when the operation is not implemented.
  Unimplemented = 'unimplemented',

  // Unsupported is returned when the operation is not supported.
  Unsupported = 'unsupported',

  // DocumentNotAttached is returned when the document is not attached.
  DocumentNotAttached = 'document-not-attached',

  // DocumentNotDetached is returned when the document is not detached.
  DocumentNotDetached = 'document-not-detached',

  // DocumentRemoved is returned when the document is removed.
  DocumentRemoved = 'document-removed',
}

/**
 * `YorkieError` is an error returned by a Yorkie operation.
 */
export class YorkieError extends Error {
  name = 'YorkieError';
  stack?: string;

  constructor(readonly code: Code, readonly message: string) {
    super(message);
    this.toString = (): string =>
      `${this.name}: [code=${this.code}]: ${this.message}`;
  }
}
