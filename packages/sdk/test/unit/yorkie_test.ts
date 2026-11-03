/*
 * Copyright 2026 The Yorkie Authors. All rights reserved.
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

import { describe, it, expect } from 'vitest';
import * as named from '@yorkie-js/sdk/src/yorkie';

describe('Public exports', function () {
  const members = Object.keys(named).filter((key) => key !== 'default');
  const defaults = named.default as unknown as Record<string, unknown>;

  it('should carry every runtime named export on the default', function () {
    // A consumer that imports the default must see what a namespace import
    // sees: before the `exports` map, Node, esbuild and webpack handed out
    // the whole `module.exports` as the default (#1519).
    expect(members.filter((key) => !(key in defaults))).toEqual([]);
  });

  it('should hand out the same value by both import shapes', function () {
    for (const key of members) {
      expect(
        defaults[key],
        `default.${key} differs from the named export`,
      ).toBe((named as unknown as Record<string, unknown>)[key]);
    }
  });

  it('should expose nothing on the default that has no name', function () {
    expect(
      Object.keys(defaults).filter((key) => !members.includes(key)),
    ).toEqual([]);
  });
});
