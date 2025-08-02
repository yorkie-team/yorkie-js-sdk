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

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSelector } from './useSelector';
import { createStore } from './createStore';
import { shallowEqual } from './shallowEqual';

interface TestState {
  counter: number;
  user: {
    name: string;
    age: number;
  };
  items: Array<string>;
}

describe('useSelector', () => {
  let store: ReturnType<typeof createStore<TestState>>;
  const initialState: TestState = {
    counter: 0,
    user: {
      name: 'John',
      age: 25,
    },
    items: ['item1', 'item2'],
  };

  beforeEach(() => {
    store = createStore(initialState);
  });

  describe('Basic Behavior', () => {
    it('should return the entire state when selector is undefined', () => {
      const { result } = renderHook(() => useSelector(store));

      expect(result.current).toEqual(initialState);
    });

    it('should be able to select a partial state using a selector', () => {
      const { result } = renderHook(() =>
        useSelector(store, (state) => state.counter),
      );

      expect(result.current).toBe(0);
    });

    it('should be able to select a nested property with a selector', () => {
      const { result } = renderHook(() =>
        useSelector(store, (state) => state.user.name),
      );

      expect(result.current).toBe('John');
    });

    it('should be able to combine properties', () => {
      const { result } = renderHook(() =>
        useSelector(
          store,
          (state) => ({
            counter: state.counter,
            userName: state.user.name,
          }),
          shallowEqual,
        ),
      );

      expect(result.current).toEqual({
        counter: 0,
        userName: 'John',
      });
    });
  });

  describe('State Change Detection', () => {
    it('should re-render when the entire state changes', () => {
      const { result } = renderHook(() => useSelector(store));

      act(() => {
        store.setState({ ...initialState, counter: 1 });
      });

      expect(result.current.counter).toBe(1);
    });

    it('should only re-render when the selected value changes', () => {
      const renderSpy = vi.fn();
      const { result } = renderHook(() => {
        renderSpy();
        return useSelector(store, (state) => state.counter);
      });

      expect(renderSpy).toHaveBeenCalledTimes(1);

      act(() => {
        store.setState((prev) => ({ ...prev, counter: prev.counter + 1 }));
      });

      expect(result.current).toBe(1);
      expect(renderSpy).toHaveBeenCalledTimes(2);

      /**
       * Changing unrelated state should not cause re-render
       */
      act(() => {
        store.setState((prev) => ({
          ...prev,
          user: { ...prev.user, age: 26 },
        }));
      });

      expect(result.current).toBe(1);
      expect(renderSpy).toHaveBeenCalledTimes(2);
    });

    it('should detect changes in arrays correctly', () => {
      const { result } = renderHook(() =>
        useSelector(store, (state) => state.items),
      );

      act(() => {
        store.setState((prev) => ({
          ...prev,
          items: [...prev.items, 'item3'],
        }));
      });

      expect(result.current).toEqual(['item1', 'item2', 'item3']);
    });

    it('should detect changes in objects correctly', () => {
      const { result } = renderHook(() =>
        useSelector(store, (state) => state.user),
      );

      act(() => {
        store.setState((prev) => ({
          ...prev,
          user: { ...prev.user, name: 'Jane' },
        }));
      });

      expect(result.current).toEqual({ name: 'Jane', age: 25 });
    });
  });

  describe('Render Optimization', () => {
    it('should not re-render if the selected value remains the same', () => {
      const renderSpy = vi.fn();
      const { result } = renderHook(() => {
        renderSpy();
        return useSelector(store, (state) => state.counter);
      });

      expect(renderSpy).toHaveBeenCalledTimes(1);

      act(() => {
        store.setState((prev) => ({ ...prev, counter: 0 }));
      });

      expect(result.current).toBe(0);
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    it('should support using a custom equality function', () => {
      const customEqualityFn = vi.fn((a, b) => a.counter === b.counter);
      const renderSpy = vi.fn();

      renderHook(() => {
        renderSpy();
        return useSelector(
          store,
          (state) => ({ counter: state.counter, user: state.user }),
          customEqualityFn,
        );
      });

      expect(renderSpy).toHaveBeenCalledTimes(1);

      act(() => {
        store.setState((prev) => ({
          ...prev,
          user: { ...prev.user, name: 'Jane' },
        }));
      });

      expect(customEqualityFn).toHaveBeenCalled();
      /**
       * renderSpy should not be called again. since the counter did not change.
       */
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    it('should be able to change selector function', () => {
      let selectCounter = true;
      const { result, rerender } = renderHook(() =>
        useSelector(store, (state) =>
          selectCounter ? state.counter : state.user.name,
        ),
      );

      expect(result.current).toBe(0);

      selectCounter = false;
      rerender();

      expect(result.current).toBe('John');
    });

    it('should re-render independently for multiple consumers', () => {
      const renderSpy1 = vi.fn();
      const renderSpy2 = vi.fn();

      const { result: result1 } = renderHook(() => {
        renderSpy1();
        return useSelector(store, (state) => state.counter);
      });

      const { result: result2 } = renderHook(() => {
        renderSpy2();
        return useSelector(store, (state) => state.user.name);
      });

      expect(renderSpy1).toHaveBeenCalledTimes(1);
      expect(renderSpy2).toHaveBeenCalledTimes(1);

      act(() => {
        store.setState((prev) => ({ ...prev, counter: 1 }));
      });

      expect(result1.current).toBe(1);
      expect(result2.current).toBe('John');
      expect(renderSpy1).toHaveBeenCalledTimes(2);
      expect(renderSpy2).toHaveBeenCalledTimes(1);
    });
  });
});
