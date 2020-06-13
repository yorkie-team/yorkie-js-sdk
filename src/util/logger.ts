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
  Trivial = 0,
  Debug = 1,
  Info = 2,
  Warn = 3,
  Error = 4,
  Fatal = 5,
}

let level = LogLevel.Debug;
export function setLogLevel(l: LogLevel): void {
  level = l;
}

export const logger = {
  trivial: (message: string): void => {
    if (level > LogLevel.Trivial) {
      return;
    }

    if (typeof console != 'undefined') {
      console.log(`YORKIE T: ${message}`);
    }
  },

  debug: (message: string): void => {
    if (level > LogLevel.Debug) {
      return;
    }

    if (typeof console != 'undefined') {
      console.log(`YORKIE D: ${message}`);
    }
  },

  info: (message: string): void => {
    if (level > LogLevel.Info) {
      return;
    }

    if (typeof console != 'undefined') {
      console.log(`YORKIE I: ${message}`);
    }
  },

  warn: (message: string): void => {
    if (level > LogLevel.Warn) {
      return;
    }

    if (typeof console != 'undefined') {
      if (typeof console.warn !== 'undefined') {
        console.warn(`YORKIE W: ${message}`);
      } else {
        console.log(`YORKIE W: ${message}`);
      }
    }
  },

  error: (message: string): void => {
    if (level > LogLevel.Error) {
      return;
    }

    if (typeof console != 'undefined') {
      if (typeof console.error !== 'undefined') {
        console.error(`YORKIE E: ${message}`);
      } else {
        console.log(`YORKIE E: ${message}`);
      }
    }
  },

  fatal: (message: string): void => {
    if (typeof console != 'undefined') {
      if (typeof console.error !== 'undefined') {
        console.error(`YORKIE F: ${message}`);
      } else {
        console.log(`YORKIE F: ${message}`);
      }
    }

    throw new Error(`YORKIE F: ${message}`);
  },

  isEnabled: (l: LogLevel): boolean => {
    return level <= l;
  },
};
