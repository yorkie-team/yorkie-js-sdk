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

type Subscriber<T> = (state: T) => void;

type Updater<T> = T | ((prevState: T) => T);

export type Store<T> = {
  subscribe: (callback: Subscriber<T>) => () => void;
  getSnapshot: () => T;
  setState: (newState: Updater<T>) => void;
  destroy: () => void;
};

/**
 * `createStore` creates a simple state management store.
 */
export function createStore<T>(initialState: T): Store<T> {
  type InternalSubscriber = Subscriber<T>;

  const subscribers = new Set<InternalSubscriber>();
  let currentState: T = initialState;

  const notify = () => {
    subscribers.forEach((callback) => callback(currentState));
  };

  const setState = (newState: Updater<T>) => {
    const prevState = currentState;
    currentState =
      typeof newState === 'function'
        ? (newState as (prevState: T) => T)(prevState)
        : newState;

    if (prevState !== currentState) {
      notify();
    }
  };

  const subscribe = (callback: InternalSubscriber) => {
    subscribers.add(callback);
    return () => subscribers.delete(callback);
  };

  const getSnapshot = () => currentState;

  const destroy = () => {
    subscribers.clear();
  };

  return {
    subscribe,
    getSnapshot,
    setState,
    destroy,
  };
}
