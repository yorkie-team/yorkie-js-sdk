export function range(from: number, to: number): Array<number> {
  const list = [];
  for (let idx = from; idx < to; idx++) {
    list.push(idx);
  }
  return list;
}

export function shuffle<T>(array: Array<T>): Array<T> {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }

  return array;
}
