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
 `isEmpty` returns whether parameter object is empty or not 
 */
export const isEmpty = (object: object) => {
  if (!object) {
    return true;
  }

  return Object.entries(object).length === 0;
};

/**
 * `stringifyObjectValues` makes values of attributes to JSON parsable string.
 */
export const stringifyObjectValues = <A extends object>(
  attributes: A,
): Record<string, string> => {
  const attrs: Record<string, string> = {};
  for (const [key, value] of Object.entries(attributes)) {
    attrs[key] = JSON.stringify(value);
  }
  return attrs;
};

/**
 `parseObjectValues` returns the JSON parsable string values to the origin states.
 */
export const parseObjectValues = <A extends object>(
  attrs: Record<string, string>,
): A => {
  const attributes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    attributes[key] = JSON.parse(value);
  }
  return attributes as A;
};
