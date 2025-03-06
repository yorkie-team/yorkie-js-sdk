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

import type { JSONArray, JSONObject } from '@yorkie-js/sdk';

import { useYorkieDoc } from './useYorkieDoc';
import { YorkieProvider } from './YorkieProvider';
import {
  DocumentProvider,
  useDocument,
  useRoot,
  usePresences,
} from './DocumentProvider';

export type { JSONArray, JSONObject };
export {
  YorkieProvider,
  DocumentProvider,
  useDocument,
  useRoot,
  usePresences,
  useYorkieDoc,
};
