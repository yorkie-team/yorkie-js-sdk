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

export enum LogLevel {
  Trivial,
  Debug,
  Info,
  Warn,
  Error,
  Fatal,
}

let level = LogLevel.Warn;

/**
 * `setLogLevel` sets log level.
 */
export function setLogLevel(l: LogLevel): void {
  level = l;
}

export const logger = {
  trivial: (...messages: Array<unknown>): void => {
    if (level > LogLevel.Trivial) {
      return;
    }

    if (typeof console != 'undefined') {
      console.log('YORKIE T:', ...messages);
    }
  },

  debug: (...messages: Array<unknown>): void => {
    if (level > LogLevel.Debug) {
      return;
    }

    if (typeof console != 'undefined') {
      console.log('YORKIE D:', ...messages);
    }
  },

  info: (...messages: Array<unknown>): void => {
    if (level > LogLevel.Info) {
      return;
    }

    if (typeof console != 'undefined') {
      console.log('YORKIE I:', ...messages);
    }
  },

  warn: (...messages: Array<unknown>): void => {
    if (level > LogLevel.Warn) {
      return;
    }

    if (typeof console != 'undefined') {
      if (typeof console.warn !== 'undefined') {
        console.warn('YORKIE W:', ...messages);
      } else {
        console.log('YORKIE W:', ...messages);
      }
    }
  },

  error: (...messages: Array<unknown>): void => {
    if (level > LogLevel.Error) {
      return;
    }

    if (typeof console != 'undefined') {
      if (typeof console.error !== 'undefined') {
        console.error('YORKIE E:', ...messages);
      } else {
        console.log('YORKIE E:', ...messages);
      }
    }
  },

  fatal: (message: string, ...messages: Array<unknown>): void => {
    if (typeof console != 'undefined') {
      if (typeof console.error !== 'undefined') {
        console.error('YORKIE F:', ...messages);
      } else {
        console.log('YORKIE F:', ...messages);
      }
    }

    throw new Error(`YORKIE F: ${message}`);
  },

  isEnabled: (l: LogLevel): boolean => {
    return level <= l;
  },
};
