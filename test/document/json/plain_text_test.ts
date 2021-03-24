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

import { assert } from 'chai';
import { PlainTextValue } from '../../../src/document/json/plain_text';
import { RichTextValue } from '../../../src/document/json/rich_text';

describe('TextValue', function () {
  it('grapheme cluster test', function () {
    const tests = [
      [4, 'abcd'],
      [2, '한글'],
      [5, 'अनुच्छेद'],
      [6, '🌷🎁💩😜👍🏳'],
      [5, 'Ĺo͂řȩm̅'],
    ] as Array<[number, string]>;
    for (const test of tests) {
      const [length, value] = test;

      const val = PlainTextValue.create(value);
      assert.equal(val.length, length, value);
      assert.equal(val.substring(2, length).length, length - 2);

      const richVal = RichTextValue.create(value);
      assert.equal(richVal.length, length, value);
      assert.equal(value.substring(2, length).length, length - 2);
    }
  });
});
