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

import { useRef, useSyncExternalStore } from 'react';
import { Store } from './createStore';

/**
 * `useSelector` is a custom hook that allows
 * users to select a slice of state from the store.
 * Only renders when the selected slice changes.
 */
export function useSelector<T, R = T>(
  store: Store<T>,
  selector?: (state: T) => R,
  equalityFn: (a: R, b: R) => boolean = Object.is,
): R {
  const selectorRef = useRef(selector);
  const equalityFnRef = useRef(equalityFn);
  const currentSliceRef = useRef<R | undefined>(undefined);

  selectorRef.current = selector;
  equalityFnRef.current = equalityFn;

  const getSelection = (): R => {
    const state = store.getSnapshot();
    const nextSlice = selectorRef.current
      ? selectorRef.current(state)
      : (state as unknown as R);

    if (
      currentSliceRef.current !== undefined &&
      equalityFnRef.current(currentSliceRef.current, nextSlice)
    ) {
      return currentSliceRef.current;
    }

    currentSliceRef.current = nextSlice;
    return nextSlice;
  };

  return useSyncExternalStore(store.subscribe, getSelection, getSelection);
}
