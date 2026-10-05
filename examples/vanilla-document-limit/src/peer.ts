/**
 * Displays peers in the element
 */
export function displayPeers(
  elem: HTMLElement,
  peers: Array<{ clientID: string; presence: { username: string } }>,
  myClientID: string,
) {
  // `presence` is whatever a peer set for itself, so each username goes in as
  // a text node. Interpolating it into `innerHTML` let any collaborator run
  // script in every other participant's page just by attaching with a username
  // like `<img src=x onerror=...>`.
  elem.textContent = '';
  for (const { clientID, presence } of peers) {
    if (elem.childNodes.length) {
      elem.appendChild(document.createTextNode(', '));
    }
    const name = document.createElement(myClientID === clientID ? 'b' : 'span');
    name.textContent = String(presence.username);
    elem.appendChild(name);
  }
}
