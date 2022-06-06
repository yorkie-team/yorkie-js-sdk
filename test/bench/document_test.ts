/*
 * Copyright 2021 The Yorkie Authors. All rights reserved.
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
import * as Benchmark from 'benchmark';
import { DocumentReplica } from '@yorkie-js-sdk/src/document/document';
import { assert } from 'chai';
import { InitialCheckpoint } from '@yorkie-js-sdk/src/document/change/checkpoint';
import { JSONArray } from '@yorkie-js-sdk/src/yorkie';

const suite = new Benchmark.Suite();

suite
  .add('constructor test', function () {
    for (let i = 0; i < 100; i++) {
      const doc = DocumentReplica.create<{ k1: JSONArray<string> }>(`test-doc`);
      assert.equal('{}', doc.toSortedJSON());
      assert.equal(doc.getCheckpoint(), InitialCheckpoint);
      assert.isFalse(doc.hasLocalChanges());
    }
  })
  .on('cycle', (event: Benchmark.Event) => {
    console.log(String(event.target));
  })
  .run();
