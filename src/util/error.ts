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
  Ok = 'ok',
  ClientNotActive = 'client-not-active',
  Unimplemented = 'unimplemented',
  Unsupported = 'unsupported',
  DocumentNotAttached = 'document-not-attached',
  DocumentNotDetached = 'document-not-detached',
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
