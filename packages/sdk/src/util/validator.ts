/*
 * Copyright 2024 The Yorkie Authors. All rights reserved.
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
 * `validateSerializable` returns whether the given value is serializable or not.
 */
export const validateSerializable = (value: unknown): boolean => {
  try {
    const serialized = JSON.stringify(value);

    if (serialized === undefined) {
      return false;
    }
  } catch (error) {
    return false;
  }
  return true;
};
