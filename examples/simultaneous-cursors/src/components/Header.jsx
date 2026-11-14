import { useEffect, useState } from 'react';

const maxAvatars = 4;

function useStatus({ loading, error, connection }) {
  // The watch stream starts after the document is attached, so stay on
  // "Connecting…" until it has connected once.
  const [hasConnected, setHasConnected] = useState(false);
  useEffect(() => {
    if (connection === 'connected') setHasConnected(true);
  }, [connection]);

  if (error) return { key: 'error', label: 'Error' };
  if (connection === 'connected')
    return { key: 'connected', label: 'Connected' };
  if (loading || !hasConnected)
    return { key: 'connecting', label: 'Connecting…' };
  return { key: 'offline', label: 'Offline' };
}

export default function Header({ loading, error, connection, peers }) {
  const status = useStatus({ loading, error, connection });
  // List the local peer first so "You" never ends up behind "+N".
  const sorted = [...peers].sort((a, b) => b.isMe - a.isMe);
  const shown = sorted.slice(0, maxAvatars);
  const hidden = sorted.length - shown.length;

  return (
    <header className="header" data-native-cursor>
      <div className="header-row">
        <h1 className="header-title">Simultaneous Cursors</h1>
        <span className="status" data-status={status.key}>
          <span className="status-dot" aria-hidden="true" />
          {status.label}
        </span>
        {peers.length > 0 && (
          <ul className="avatars" aria-label={`${peers.length} online`}>
            {shown.map(({ clientID, presence, color, isMe }) => (
              <li
                key={clientID}
                className="avatar"
                data-me={isMe}
                style={{ background: color }}
                title={isMe ? 'You' : presence.name}
              >
                {presence.name?.[0]}
              </li>
            ))}
            {hidden > 0 && (
              <li className="avatar avatar-more" title={`${hidden} more`}>
                +{hidden}
              </li>
            )}
          </ul>
        )}
      </div>
      <p className="header-hint">
        Move, press and draw together:{' '}
        <a href={window.location.href} target="_blank" rel="noreferrer">
          open this page in another window
        </a>{' '}
        and watch both cursors. Ink is a live trail shared through Presence, so
        it isn’t saved.
      </p>
    </header>
  );
}
