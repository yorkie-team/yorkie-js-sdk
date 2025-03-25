/**
 * Displays the counter in the element
 */
export function displayCounter(elem: HTMLElement, counter: number) {
  elem.innerHTML = `<b>${counter}</b>`;
}
