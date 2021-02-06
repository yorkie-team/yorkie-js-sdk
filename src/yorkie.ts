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

import Long from 'long';
import { Client, ClientOptions } from './core/client';
import { Document } from './document/document';

export { Client, Document };
export { ActorID } from './document/time/actor_id';
export { JSONElement } from './document/json/element';
export { JSONObject } from './document/json/object';
export { JSONArray } from './document/json/array';
export { PlainText } from './document/json/plain_text';
export { RichText } from './document/json/rich_text';
export { Change, ChangeType } from './document/json/rga_tree_split';

/**
 * The top-level yorkie namespace with additional properties.
 *
 * In production, this will be called exactly once and the result
 * assigned to the `yorkie` global.
 *
 * e.g) `yorkie.createClient(...);`
 */
const yorkie = {
  createClient(rpcAddr: string, opts?: ClientOptions): Client {
    return new Client(rpcAddr, opts);
  },
  createDocument(collection: string, document: string): Document {
    return new Document(collection, document);
  },
  Long,
};

export default yorkie;
