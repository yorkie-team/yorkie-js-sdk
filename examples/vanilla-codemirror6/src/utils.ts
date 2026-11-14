// Peer colours, picked from the client's actor ID so every tab agrees on
// which colour belongs to whom without any coordination.
export const PEER_COLORS = [
  '#fc8539',
  '#fdc433',
  '#23c176',
  '#3c9af1',
  '#f44954',
  '#855cf9',
];
// Darker steps of the same hues, for thin strokes such as carets on white.
const PEER_STROKES = [
  '#f27b2f',
  '#f5b103',
  '#10b266',
  '#208aed',
  '#e93d47',
  '#764af3',
];
const NAMES = ['Ari', 'Bo', 'Cy', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal', 'Ivy'];
const MAX_AVATARS = 4;

function hash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  // Mix the bits so IDs that differ only at the end still spread out.
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * `createPeer` returns the name and colour this client shares as presence.
 */
export function createPeer(actorID: string) {
  const h = hash(actorID);
  return {
    username: NAMES[(h >>> 8) % NAMES.length],
    color: PEER_COLORS[h % PEER_COLORS.length],
  };
}

/**
 * `strokeOf` returns the darker step of a peer colour, for thin lines.
 */
export function strokeOf(color: string): string {
  return PEER_STROKES[PEER_COLORS.indexOf(color)] ?? color;
}

/**
 * `getDocKey` reads the document key from `?key=`, or makes one per day so
 * everyone opening the example today lands on the same document.
 */
export function getDocKey(prefix: string): string {
  const date = new Date().toISOString().substring(0, 10).replace(/-/g, '');
  return new URLSearchParams(location.search).get('key') || `${prefix}-${date}`;
}

/**
 * `linkToDoc` points the "another tab" link at this document, so the second
 * tab opens the same document even if the day changes in between.
 */
export function linkToDoc(elem: HTMLAnchorElement, docKey: string) {
  const url = new URL(location.href);
  url.searchParams.set('key', docKey);
  elem.href = url.toString();
}

/**
 * `displayPeers` renders one avatar per peer in the peer's own colour.
 */
export function displayPeers(
  elem: HTMLElement,
  peers: Array<{
    clientID: string;
    presence: { username?: string; color?: string };
  }>,
  myClientID: string,
) {
  // Show yourself first, then everyone else in a stable order.
  const sorted = [...peers].sort(
    (a, b) =>
      Number(b.clientID === myClientID) - Number(a.clientID === myClientID),
  );

  // Usernames come from other clients, so they go in as text, never as HTML.
  elem.replaceChildren();
  for (const { clientID, presence } of sorted.slice(0, MAX_AVATARS)) {
    const isMe = clientID === myClientID;
    const name = presence.username ?? 'Anonymous';
    const avatar = document.createElement('li');
    avatar.className = isMe ? 'avatar is-me' : 'avatar';
    avatar.style.backgroundColor = presence.color ?? '';
    avatar.textContent = name.charAt(0);
    avatar.title = isMe ? 'You' : name;
    avatar.setAttribute('aria-label', isMe ? `${name} (you)` : name);
    elem.appendChild(avatar);
  }

  const rest = sorted.length - MAX_AVATARS;
  if (rest > 0) {
    const more = document.createElement('li');
    more.className = 'avatar more';
    more.textContent = `+${rest}`;
    more.title = `${rest} more`;
    elem.appendChild(more);
  }
}
