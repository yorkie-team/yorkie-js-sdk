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
 * `memory.ts` provides utility functions to estimate memory usage
 * and serialized size of various JS values and CRDT components.
 */

export const ptrSize = 8;

/**
 * `MemoryUsage` represents the estimated memory usage of a CRDT element,
 * separated into live and garbage-collected components.
 */
export class MemoryUsage {
  public live: number;
  public gc: number;
  public total: number;

  constructor(live: number, gc: number) {
    this.live = live;
    this.gc = gc;
    this.total = live + gc;
  }

  /**
   * `add` merges another MemoryUsage into this one.
   */
  add(other: MemoryUsage): void {
    this.live += other.live;
    this.gc += other.gc;
    this.total += this.live + this.gc;
  }
}

/**
 * `MemoryMeasurable` defines an interface for elements that can estimate their memory usage.
 */
export interface MemoryMeasurable {
  estimateMemoryUsage(): MemoryUsage;
}

/**
 * `estimateValueSize` returns an approximate size of various types.
 */
export function estimateValueSize(value: unknown): number {
  switch (typeof value) {
    case 'string':
      return new TextEncoder().encode(value).length * 2;
    case 'number':
      return 8;
    case 'boolean':
      return 4;
    case 'bigint':
      return new TextEncoder().encode(value.toString()).length * 2;
    case 'undefined':
      return 4;
    case 'object':
      return estimateObjectSize(value as Record<string, unknown>);
    default:
      return 0;
  }
}

/**
 * `estimateObjectSize` returns an approximate size in bytes of a plain object,
 * including keys and values.
 */
export function estimateObjectSize(obj: Record<string, unknown>): number {
  let size = 0;
  for (const [key, value] of Object.entries(obj)) {
    size += estimateValueSize(key) + estimateValueSize(value);
  }
  return size;
}
