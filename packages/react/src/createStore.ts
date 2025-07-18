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
