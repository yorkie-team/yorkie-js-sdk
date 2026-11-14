import Link from 'next/link';
import styles from './styles/page.module.css';
import type { Peer, Status } from './types';

const STATUS_LABEL: Record<Status, string> = {
  connecting: 'Connecting…',
  connected: 'Connected',
  offline: 'Offline',
  error: 'Error',
};

// Peer colours are picked from the client ID, so every tab agrees on them.
const PEER_COLORS = [
  '#fc8539',
  '#fdc433',
  '#23c176',
  '#3c9af1',
  '#f44954',
  '#855cf9',
];

function peerColor(clientID: string) {
  let hash = 0;
  for (const char of clientID) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return PEER_COLORS[Math.abs(hash) % PEER_COLORS.length];
}

const MAX_AVATARS = 4;

interface HeaderProps {
  docKey: string;
  status: Status;
  peers: Peer[];
}

export default function Header({ docKey, status, peers }: HeaderProps) {
  const shown = peers.slice(0, MAX_AVATARS);
  const hidden = peers.length - shown.length;

  return (
    <header className={styles.header}>
      <div>
        <h1 className={styles.title}>Scheduler</h1>
        <p className={styles.subtitle}>
          Add events to the calendar, then open it in{' '}
          <Link href={{ query: { key: docKey } }} target="_blank">
            another tab
          </Link>{' '}
          to see them sync.
        </p>
      </div>
      <div className={styles.headerRight}>
        <span className={styles.status} data-status={status} role="status">
          <span className={styles.statusDot} aria-hidden="true" />
          {STATUS_LABEL[status]}
        </span>
        {peers.length > 0 && (
          <ul className={styles.avatars} aria-label="People here">
            {shown.map((peer) => {
              const label = peer.isMe
                ? `${peer.userName} (you)`
                : peer.userName;
              return (
                <li
                  key={peer.clientID}
                  className={styles.avatar}
                  data-me={peer.isMe || undefined}
                  style={{ background: peerColor(peer.clientID) }}
                  title={label}
                  aria-label={label}
                >
                  {peer.userName[0]}
                </li>
              );
            })}
            {hidden > 0 && (
              <li
                className={`${styles.avatar} ${styles.avatarMore}`}
                aria-label={`${hidden} more`}
              >
                +{hidden}
              </li>
            )}
          </ul>
        )}
      </div>
    </header>
  );
}
