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

import { EventEmitter } from 'events';
import { NextFn } from '../../src/util/observable';

import { ClientEvent } from '../../src/core/client';
import { DocEvent } from '../../src/document/document';

export function range(from: number, to: number): Array<number> {
  const list = [];
  for (let idx = from; idx < to; idx++) {
    list.push(idx);
  }
  return list;
}

export type Indexable = {
  [index: string]: any;
};

export function waitFor(
  eventName: string,
  listener: EventEmitter,
): Promise<void> {
  return new Promise((resolve) => listener.on(eventName, resolve));
}

export function createEmitterAndSpy(
  fn?: (event: ClientEvent | DocEvent) => string,
): [EventEmitter, NextFn<ClientEvent | DocEvent>] {
  const emitter = new EventEmitter();
  return [
    emitter,
    (event: ClientEvent | DocEvent) =>
      emitter.emit(fn ? fn(event) : event.type),
  ];
}
