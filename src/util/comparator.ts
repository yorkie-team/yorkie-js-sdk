export type Comparator<K> = (keyA: K, keyB: K) => number;

export const DefaultComparator = (a, b) => {
  if (a === b) {
    return 0;
  } else if (a < b) {
    return -1;
  } else {
    return 1;
  }
};
