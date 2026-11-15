/**
 * `createLocal` holds a value that changes on every pointer event, faster
 * than React should re-render, and tells its listener when it does. Our own
 * cursor and stroke are drawn from it, straight from the pointer, while
 * presence carries them to peers at its own pace.
 */
export function createLocal(value) {
  let listener = null;
  return {
    get: () => value,
    set(next) {
      value = next;
      listener?.();
    },
    listen(fn) {
      listener = fn;
      return () => {
        if (listener === fn) listener = null;
      };
    },
  };
}
