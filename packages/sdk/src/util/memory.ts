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
 * `memory.ts` provides utility functions to memory usage and
 * serialized size of various JS values and CRDT components.
 */

export const PTRSize = 8;

/**
 * `MemoryUsage` represents the memory usage of a CRDT element,
 * separated into live and garbage-collected components.
 */
export class MemoryUsage {
  constructor(
    public meta: number = 0,
    public content: number = 0,
    public gc: number = 0,
  ) {}

  /**
   * `live` returns the total memory usage of metadata and content (excluding GC).
   */
  get live(): number {
    return this.meta + this.content;
  }

  /**
   * `total` returns the total memory usage, which is the sum of live and gc memory.
   */
  get total(): number {
    return this.live + this.gc;
  }

  /**
   * `merge` combines the memory usage of two CRDT elements.
   */
  merge(other: MemoryUsage): void {
    this.meta += other.meta;
    this.content += other.content;
    this.gc += other.gc;
  }

  /**
   * `transferLiveToGC` transfers the live (meta + content) usage of the given
   * element to the GC usage.
   */
  transferLiveToGC(other: MemoryUsage): void {
    this.meta -= other.meta;
    this.content -= other.content;
    this.gc += other.meta + other.content;
  }
}

/**
 * `MemoryMeasurable` defines an interface for elements that can calculate their memory usage.
 */
export interface MemoryMeasurable {
  calculateUsage(): MemoryUsage;
}

/**
 * `isMemoryMeasurable` checks if the given object implements MemoryMeasurable.
 */
export function isMemoryMeasurable(obj: unknown): obj is MemoryMeasurable {
  return (
    !!obj && typeof (obj as MemoryMeasurable).calculateUsage === 'function'
  );
}

/**
 * `calculateValueSize` returns the size of various types.
 */
export function calculateValueSize(value: unknown): number {
  switch (typeof value) {
    case 'string':
      return value.length * 2;
    case 'number':
      return 8;
    case 'boolean':
      return 4;
    case 'bigint':
      return value.toString().length * 2;
    case 'undefined':
      return 4;
    case 'object':
      return calculateObjectSize(value as Record<string, unknown>);
    default:
      return 0;
  }
}

/**
 * `calculateObjectSize` returns the size in bytes of a plain object,
 * including keys and values.
 */
export function calculateObjectSize(obj: Record<string, unknown>): number {
  let size = 0;
  for (const [key, value] of Object.entries(obj)) {
    size += calculateValueSize(key) + calculateValueSize(value);
  }
  return size;
}
