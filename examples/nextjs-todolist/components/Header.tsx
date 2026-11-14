import Link from 'next/link';

export type Status = 'connecting' | 'connected' | 'offline' | 'error';

export interface Peer {
  clientID: string;
  name: string;
  isMe: boolean;
}

const STATUS_LABEL: Record<Status, string> = {
  connecting: 'Connecting…',
  connected: 'Connected',
  offline: 'Offline',
  error: 'Error',
};

const STATUS_DOT: Record<Status, string> = {
  connecting: 'bg-gray-500',
  connected: 'bg-success',
  offline: 'bg-gray-500',
  error: 'bg-danger',
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

export default function Header({
  status,
  peers,
}: {
  status: Status;
  peers: Peer[];
}) {
  const shown = peers.slice(0, MAX_AVATARS);
  const hidden = peers.length - shown.length;
  const avatar =
    'grid size-6 place-items-center rounded-full border-2 border-card text-xs font-semibold text-primary-foreground box-content -ml-1';

  return (
    <header className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b bg-card px-4 py-2">
      <div>
        <h1 className="text-base leading-6 font-semibold">Todo List</h1>
        <p className="text-sm leading-[22px] text-muted-foreground [@media(max-height:420px)]:hidden">
          Add and check off todos, then open this list in{' '}
          <Link
            href="/"
            target="_blank"
            className="underline underline-offset-2 hover:text-foreground"
          >
            another tab
          </Link>{' '}
          to see changes sync.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span
          role="status"
          className="inline-flex items-center gap-1.5 text-sm leading-[22px] text-muted-foreground"
        >
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${STATUS_DOT[status]}`}
          />
          {STATUS_LABEL[status]}
        </span>
        {peers.length > 0 && (
          <ul className="flex pl-1" aria-label="People here">
            {shown.map((peer) => {
              const label = peer.isMe ? `${peer.name} (you)` : peer.name;
              return (
                <li
                  key={peer.clientID}
                  className={`${avatar} ${peer.isMe ? 'border-foreground' : ''}`}
                  style={{ background: peerColor(peer.clientID) }}
                  title={label}
                  aria-label={label}
                >
                  {peer.name[0]}
                </li>
              );
            })}
            {hidden > 0 && (
              <li
                className={`${avatar} bg-gray-200 text-[11px] text-gray-800`}
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
