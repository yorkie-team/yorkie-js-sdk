import { useYorkie } from '@yorkie-js/react';
import type { PresenceType } from './App';

export type Status = 'connecting' | 'connected' | 'offline' | 'error';

const statusLabels: Record<Status, string> = {
  connecting: 'Connecting…',
  connected: 'Connected',
  offline: 'Offline',
  error: 'Error',
};

// A peer's colour comes from its client ID, so every tab agrees on it.
const peerColors = [
  '#fc8539',
  '#fdc433',
  '#23c176',
  '#3c9af1',
  '#f44954',
  '#855cf9',
];
const peerColor = (clientID: string) => {
  let hash = 0;
  for (const char of clientID) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return peerColors[Math.abs(hash) % peerColors.length];
};

const maxAvatars = 4;

export default function Header({
  status,
  presences,
}: {
  status: Status;
  presences: Array<{ clientID: string; presence: PresenceType }>;
}) {
  const { client } = useYorkie();
  // Presences are keyed by actor ID; put yourself first.
  const myID = client?.getActorID();
  const people = [...presences].sort(
    (a, b) => Number(b.clientID === myID) - Number(a.clientID === myID),
  );
  const hidden = people.length - maxAvatars;
  const shown = hidden > 0 ? people.slice(0, maxAvatars - 1) : people;

  return (
    <header className="header">
      <div className="header-text">
        <h1 className="title">Note with Revisions</h1>
        <p className="hint">
          Write together, save a revision, then restore it —{' '}
          <a href="" target="_blank">
            open this page in another tab
          </a>{' '}
          to see changes sync.
        </p>
      </div>
      <div className="header-side">
        <div className="status" data-state={status}>
          <span className="status-dot" />
          {statusLabels[status]}
        </div>
        {people.length > 0 && (
          <ul className="avatars" aria-label="People editing this note">
            {shown.map(({ clientID, presence }) => {
              const isMe = clientID === myID;
              return (
                <li
                  key={clientID}
                  className={isMe ? 'avatar me' : 'avatar'}
                  style={{ background: peerColor(clientID) }}
                  title={isMe ? 'You' : presence.name}
                  aria-label={isMe ? `${presence.name} (you)` : presence.name}
                >
                  {presence.name.charAt(0).toUpperCase()}
                </li>
              );
            })}
            {hidden > 0 && (
              <li className="avatar more" aria-label={`${hidden + 1} more`}>
                +{hidden + 1}
              </li>
            )}
          </ul>
        )}
      </div>
    </header>
  );
}
