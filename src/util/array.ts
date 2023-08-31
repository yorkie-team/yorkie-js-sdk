/*
 * Copyright 2023 The Yorkie Authors. All rights reserved.
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
 * `getUpperBound` returns lower bound of given key from array
 */
export function getUpperBound<T>(
  array: Array<T>,
  key: T,
  comparator: (a: T, b: T) => number,
): number {
  let left = 0;
  let right = array.length;

  while (left < right) {
    const mid = Math.floor((left + right) / 2);

    if (comparator(array[mid], key) <= 0) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  return left;
}
