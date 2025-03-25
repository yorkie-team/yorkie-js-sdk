/**
 * Displays peers in the element
 */
export function displayPeers(
  elem: HTMLElement,
  peers: Array<{ clientID: string; presence: { username: string } }>,
  myClientID: string,
) {
  const usernames: Array<string> = [];
  for (const { clientID, presence } of peers) {
    usernames.push(
      myClientID === clientID
        ? `<b>${presence.username}</b>`
        : presence.username,
    );
  }
  elem.innerHTML = usernames.join(', ');
}
