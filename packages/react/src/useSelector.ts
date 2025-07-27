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
