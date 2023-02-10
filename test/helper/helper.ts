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
import { NextFn } from '@yorkie-js-sdk/src/util/observable';

import { ClientEvent } from '@yorkie-js-sdk/src/core/client';
import { DocEvent } from '@yorkie-js-sdk/src/document/document';
import {
  TextChange,
  TextChangeType,
} from '@yorkie-js-sdk/src/document/crdt/text';

export function range(from: number, to: number): Array<number> {
  const list = [];
  for (let idx = from; idx < to; idx++) {
    list.push(idx);
  }
  return list;
}

export type Indexable = Record<string, any>;

export function waitFor(
  eventName: string,
  listener: EventEmitter,
): Promise<void> {
  return new Promise((resolve) => listener.on(eventName, resolve));
}

export function delay(timeout: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
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

/**
 * TextView emulates an external editor like CodeMirror to test whether change
 * events are delivered properly.
 */
export class TextView {
  private value: string;

  constructor() {
    this.value = '';
  }

  public applyChanges(changes: Array<TextChange>, enableLog = false): void {
    const oldValue = this.value;
    const changeLogs = [];
    for (const change of changes) {
      if (change.type === TextChangeType.Content) {
        this.value = [
          this.value.substring(0, change.from),
          change.value?.content,
          this.value.substring(change.to),
        ].join('');
        changeLogs.push(
          `{f:${change.from}, t:${change.to}, c:${change.value || ''}}`,
        );
      }
    }

    if (enableLog) {
      console.log(
        `apply: ${oldValue}->${this.value} [${changeLogs.join(',')}]`,
      );
    }
  }

  public toString(): string {
    return this.value;
  }
}
