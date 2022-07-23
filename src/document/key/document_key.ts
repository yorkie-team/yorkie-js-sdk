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

/**
 * `DocumentKey` represents the key of the Document.
 */
export class DocumentKey {
  private collection: string;
  private document: string;

  constructor(collection: string, document: string) {
    this.collection = collection;
    this.document = document;
  }

  /**
   * `create` creates a new instance of DocumentKey.
   */
  public static of(collection: string, document: string): DocumentKey {
    return new DocumentKey(collection, document);
  }

  /**
   * `getCollection` return the collection string.
   */
  public getCollection(): string {
    return this.collection;
  }

  /**
   * `getDocument` return the document string.
   */
  public getDocument(): string {
    return this.document;
  }

  /**
   * `toIDString` returns the key string for this Document.
   */
  public toIDString(): string {
    return `${this.collection}$${this.document}`;
  }
}
