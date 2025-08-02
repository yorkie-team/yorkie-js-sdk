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
 *
 * incorporates code from Zustand - https://github.com/pmndrs/zustand
 */

/**
 * `isIterable` checks if the given object is iterable.
 */
function isIterable(obj: any): obj is Iterable<unknown> {
  return obj != null && typeof obj[Symbol.iterator] === 'function';
}

/**
 * `hasIterableEntries` checks if the given iterable has an `entries` method.
 */
function hasIterableEntries(
  value: Iterable<unknown>,
): value is Iterable<unknown> & { entries(): Iterable<[unknown, unknown]> } {
  return 'entries' in value && typeof (value as any).entries === 'function';
}

/**
 * `compareEntries` compares two iterables with `entries` methods for shallow equality.
 */
function compareEntries(
  valueA: { entries(): Iterable<[unknown, unknown]> },
  valueB: { entries(): Iterable<[unknown, unknown]> },
): boolean {
  const mapA = valueA instanceof Map ? valueA : new Map(valueA.entries());
  const mapB = valueB instanceof Map ? valueB : new Map(valueB.entries());

  if (mapA.size !== mapB.size) {
    return false;
  }

  for (const [key, value] of mapA) {
    if (!mapB.has(key) || !Object.is(value, mapB.get(key))) {
      return false;
    }
  }

  return true;
}

/**
 * `compareIterables` compares two general iterables for shallow equality.
 */
function compareIterables(
  valueA: Iterable<unknown>,
  valueB: Iterable<unknown>,
): boolean {
  const iteratorA = valueA[Symbol.iterator]();
  const iteratorB = valueB[Symbol.iterator]();

  let nextA = iteratorA.next();
  let nextB = iteratorB.next();

  while (!nextA.done && !nextB.done) {
    if (!Object.is(nextA.value, nextB.value)) {
      return false;
    }
    nextA = iteratorA.next();
    nextB = iteratorB.next();
  }

  return nextA.done === nextB.done;
}

/**
 * `comparePlainObjects` compares two plain objects for shallow equality.
 */
function comparePlainObjects(
  valueA: Record<string, unknown>,
  valueB: Record<string, unknown>,
): boolean {
  const keysA = Object.keys(valueA);
  const keysB = Object.keys(valueB);

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (const key of keysA) {
    if (
      !Object.prototype.hasOwnProperty.call(valueB, key) ||
      !Object.is(valueA[key], valueB[key])
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Performs a shallow equality check between two values.
 */
export function shallowEqual<T>(valueA: T, valueB: T): boolean {
  if (Object.is(valueA, valueB)) {
    return true;
  }

  if (
    typeof valueA !== 'object' ||
    valueA === null ||
    typeof valueB !== 'object' ||
    valueB === null
  ) {
    return false;
  }

  if (Object.getPrototypeOf(valueA) !== Object.getPrototypeOf(valueB)) {
    return false;
  }

  const isIterableA = isIterable(valueA);
  const isIterableB = isIterable(valueB);

  if (isIterableA !== isIterableB) {
    return false;
  }

  if (isIterableA && isIterableB) {
    if (hasIterableEntries(valueA) && hasIterableEntries(valueB)) {
      return compareEntries(valueA, valueB);
    }

    return compareIterables(valueA, valueB);
  }

  return comparePlainObjects(
    valueA as Record<string, unknown>,
    valueB as Record<string, unknown>,
  );
}
