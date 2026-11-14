export type PeerPresence = { username: string };

const NAMES = ['Ari', 'Bo', 'Cy', 'Dana', 'Eli', 'Fay', 'Gus', 'Hana'];
const PEER_COLORS = [
  '#fc8539',
  '#fdc433',
  '#23c176',
  '#3c9af1',
  '#f44954',
  '#855cf9',
];
const MAX_AVATARS = 4;

/**
 * `randomName` picks a display name for this tab.
 */
export function randomName(): string {
  return NAMES[Math.floor(Math.random() * NAMES.length)];
}

/**
 * `peerColor` derives a colour from the actor ID, so every tab shows the same
 * peer in the same colour.
 */
function peerColor(actorID: string): string {
  let hash = 0;
  for (const ch of actorID) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return PEER_COLORS[hash % PEER_COLORS.length];
}

/**
 * `displayPeers` renders one avatar per client attached to the document.
 */
export function displayPeers(
  elem: HTMLElement,
  peers: Array<{ clientID: string; presence: PeerPresence }>,
  myActorID: string,
) {
  // `presence` is whatever a peer set for itself, so names go in as text
  // nodes, never through `innerHTML`.
  elem.textContent = '';
  for (const { clientID, presence } of peers.slice(0, MAX_AVATARS)) {
    const isMe = clientID === myActorID;
    const name = String(presence.username ?? '');
    const avatar = document.createElement('li');
    avatar.className = isMe ? 'peer peer--me' : 'peer';
    avatar.style.setProperty('--peer', peerColor(clientID));
    avatar.title = isMe ? `You (${name})` : name;
    avatar.textContent = name.slice(0, 1).toUpperCase();
    elem.appendChild(avatar);
  }
  if (peers.length > MAX_AVATARS) {
    const more = document.createElement('li');
    more.className = 'peer peer--more';
    more.textContent = `+${peers.length - MAX_AVATARS}`;
    elem.appendChild(more);
  }
}
