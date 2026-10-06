/**
 * Displays the counter in the element
 */
export function displayCounter(elem: HTMLElement, counter: number) {
  // `counter` comes straight out of the document, and a Yorkie document is
  // untyped at runtime: another client can set `root.counter` to a string such
  // as `<img src=x onerror=...>`. Interpolating it into `innerHTML` would run
  // that in every participant's page, so the value goes in as a text node.
  elem.textContent = '';
  const $value = document.createElement('b');
  $value.textContent = String(counter);
  elem.appendChild($value);
}
