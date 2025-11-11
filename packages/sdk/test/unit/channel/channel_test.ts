/*
 * Copyright 2025 The Yorkie Authors. All rights reserved.
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

import yorkie from '@yorkie-js/sdk/src/yorkie';
import { describe, it, assert } from 'vitest';

describe('Channel', function () {
  it('should throw error when key is invalid', function () {
    // valid keys
    assert.doesNotThrow(() => {
      new yorkie.Channel('test');
      new yorkie.Channel('test-1.test-2');
      new yorkie.Channel('test_1.test,2.test-3');
    });

    // invalid keys
    assert.throws(() => new yorkie.Channel('.'));
    assert.throws(() => new yorkie.Channel('........'));
    assert.throws(() => new yorkie.Channel('.test'));
    assert.throws(() => new yorkie.Channel('.test.'));
    assert.throws(() => new yorkie.Channel('test.'));
    assert.throws(() => new yorkie.Channel('test..test'));
    assert.throws(() => new yorkie.Channel('test. test'));
  });

  it('should get first key path', function () {
    const firstKeyPath = new yorkie.Channel('test-1.test-2').getFirstKeyPath();
    assert.equal(firstKeyPath, 'test-1');
    const firstKeyPath2 = new yorkie.Channel(
      'test-1.test-2.test-3',
    ).getFirstKeyPath();
    assert.equal(firstKeyPath2, 'test-1');
  });
});
