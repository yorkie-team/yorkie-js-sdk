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

/**
 * YSON (Yorkie Serialized Object Notation) module.
 *
 * This module provides utilities for parsing and working with YSON,
 * an extended JSON format that supports Yorkie CRDT types.
 *
 * @module yson
 */

export type {
  YSONValue,
  YSONText,
  YSONTree,
  YSONTextNode,
  YSONTreeNode,
  YSONInt,
  YSONLong,
  YSONDate,
  YSONBinData,
  YSONCounter,
} from './types';

export {
  isText,
  isTree,
  isInt,
  isLong,
  isDate,
  isBinData,
  isCounter,
  isObject,
} from './types';

export { parse, textToString, treeToXML } from './parser';
