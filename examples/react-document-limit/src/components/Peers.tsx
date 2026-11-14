import type { CSSProperties } from 'react';
import { useYorkie } from '@yorkie-js/react';
import { useDocumentSelector } from '../hooks/useDocumentSelector';

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
 * `Peers` shows one avatar per client attached to the document.
 */
export function Peers() {
  const { client } = useYorkie();
  const { presences } = useDocumentSelector(({ presences }) => ({
    presences,
  }));
  // Presences are keyed by the client's actor ID.
  const myActorID = client?.getActorID();

  return (
    <ul className="peers" aria-label="People on this document">
      {presences.slice(0, MAX_AVATARS).map(({ clientID, presence }) => {
        const isMe = clientID === myActorID;
        const name = String(presence.username ?? '');
        return (
          <li
            key={clientID}
            className={isMe ? 'peer peer--me' : 'peer'}
            style={{ '--peer': peerColor(clientID) } as CSSProperties}
            title={isMe ? `You (${name})` : name}
          >
            {name.slice(0, 1).toUpperCase()}
          </li>
        );
      })}
      {presences.length > MAX_AVATARS && (
        <li className="peer peer--more">+{presences.length - MAX_AVATARS}</li>
      )}
    </ul>
  );
}
