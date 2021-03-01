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

import { assert } from 'chai';
import { Document } from '../../src/document/document';
import { converter } from '../../src/api/converter';

describe('Converter', function () {
  it('should encode/decode bytes', function () {
    const doc = Document.create('test-col', 'test-doc');

    doc.update((root) => {
      root['k1'] = {
        'k1.1': true,
        'k1.2': 2147483647,
        // 'k1.3': yorkie.Long.fromString('9223372036854775807'),
        // 'k1.4': 1.79,
        'k1.5': '4',
        // 'k6': new Uint8Array([65,66]),
        // 'k7': new Date(),
      };

      root['k2'] = [
        true,
        2147483647,
        // yorkie.Long.fromString('9223372036854775807'),
        // 1.79,
        '4',
        // new Uint8Array([65,66]),
        // new Date(),
      ];

      const text = root.createText('k3');
      text.edit(0, 0, 'ㅎ');
      text.edit(0, 1, '하');
      text.edit(0, 1, '한');
      text.edit(0, 1, '하');
      text.edit(1, 1, '느');
      text.edit(1, 2, '늘');

      const counter = root.createCounter('k4', 0);
      counter.increase(1).increase(2).increase(3);
    });

    const bytes = converter.objectToBytes(doc.getRoot());
    const obj = converter.bytesToObject(bytes);
    assert.equal(doc.toSortedJSON(), obj.toSortedJSON());
  });

  it('convert hex string <-> byte array', function () {
    const hex_str = '0123456789abcdef01234567';
    const bytes = converter.toUint8Array(hex_str);
    assert.equal(bytes.length, 12);
    assert.equal(converter.toHexString(bytes), hex_str);
  });
});
