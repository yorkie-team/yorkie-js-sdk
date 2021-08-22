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

import { ChangeContext } from '@yorkie-js-sdk/src/document/change/context';
import { JSONElement } from '@yorkie-js-sdk/src/document/json/element';
import { JSONObject } from '@yorkie-js-sdk/src/document/json/object';
import { JSONArray } from '@yorkie-js-sdk/src/document/json/array';
import { JSONPrimitive } from '@yorkie-js-sdk/src/document/json/primitive';
import { RichText } from '@yorkie-js-sdk/src/document/json/rich_text';
import { PlainText } from '@yorkie-js-sdk/src/document/json/plain_text';
import { ObjectProxy } from '@yorkie-js-sdk/src/document/proxy/object_proxy';
import { ArrayProxy } from '@yorkie-js-sdk/src/document/proxy/array_proxy';
import { TextProxy } from '@yorkie-js-sdk/src/document/proxy/text_proxy';
import { RichTextProxy } from '@yorkie-js-sdk/src/document/proxy/rich_text_proxy';
import { CounterProxy } from '@yorkie-js-sdk/src/document/proxy/counter_proxy';
import { Counter } from '@yorkie-js-sdk/src/document/json/counter';

/**
 * `createProxy` create a new instance of ObjectProxy.
 */
export function createProxy<T>(
  context: ChangeContext,
  target: JSONObject,
): T & JSONObject {
  return ObjectProxy.create(context, target) as T & JSONObject;
}

/**
 * `toProxy` returns a proxy based on element.
 */
export function toProxy(context: ChangeContext, elem?: JSONElement): any {
  if (elem instanceof JSONPrimitive) {
    const primitive = elem as JSONPrimitive;
    return primitive.getValue();
  } else if (elem instanceof JSONObject) {
    const obj = elem as JSONObject;
    return ObjectProxy.create(context, obj);
  } else if (elem instanceof JSONArray) {
    const array = elem as JSONArray;
    return ArrayProxy.create(context, array);
  } else if (elem instanceof PlainText) {
    const text = elem as PlainText;
    return TextProxy.create(context, text);
  } else if (elem instanceof RichText) {
    const text = elem as RichText;
    return RichTextProxy.create(context, text);
  } else if (elem instanceof Counter) {
    const counter = elem as Counter;
    return CounterProxy.create(context, counter);
  } else if (!elem) {
    return;
  } else {
    throw new TypeError(`Unsupported type of element: ${typeof elem}`);
  }
}
