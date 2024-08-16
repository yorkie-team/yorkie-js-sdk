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

import { describe, it, assert } from 'vitest';
import { logger, setLogLevel, LogLevel } from '@yorkie-js-sdk/src/util/logger';

describe('logger', function () {
  it('Can log according to the level.', function () {
    setLogLevel(LogLevel.Info);
    assert.isFalse(logger.isEnabled(LogLevel.Debug));
    assert.isTrue(logger.isEnabled(LogLevel.Error));
  });
});
