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

import { Trie } from '@yorkie-js-sdk/src/util/trie';
import { assert } from 'chai';

const philWords = ['phil', 'philosophy', 'philanthropy', 'philadelphia'];
const unWords = ['un', 'undo', 'unpack', 'unhappy'];
const otherWords = ['english', 'hello'];
const words = [...philWords, ...unWords, ...otherWords];
describe('Trie', function () {
  it('can find words with specific prefix', function () {
    const trie = new Trie<string>('');
    for (const word of words) {
      trie.insert(word.split(''));
    }
    const philResult = trie
      .find('phil'.split(''))
      .map((element) => element.join(''));
    const unResult = trie
      .find('un'.split(''))
      .map((element) => element.join(''));
    assert.deepEqual(philWords.sort(), philResult.sort());
    assert.deepEqual(unWords.sort(), unResult.sort());
  });

  it('can find prefixes', function () {
    const trie = new Trie<string>('');
    for (const word of words) {
      trie.insert(word.split(''));
    }
    const commonPrefixes = ['phil', 'un', ...otherWords];
    const prefixesResult = trie
      .findPrefixes()
      .map((element) => element.join(''));
    assert.deepEqual(commonPrefixes.sort(), prefixesResult.sort());
  });
});
