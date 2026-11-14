import type { Peer } from './hooks/useMultiplayerState';

const maxShown = 4;

/**
 * `Avatars` lists the people on this canvas in their peer colour, you first.
 */
export default function Avatars({ peers }: { peers: Array<Peer> }) {
  const sorted = [...peers].sort((a, b) => Number(b.isMe) - Number(a.isMe));
  const shown = sorted.slice(0, maxShown);
  const hidden = sorted.slice(maxShown);

  return (
    <ul className="avatars" aria-label="People on this canvas">
      {shown.map((peer) => (
        <li
          key={peer.id}
          className={peer.isMe ? 'avatar avatar--me' : 'avatar'}
          style={{ background: peer.color }}
          title={peer.isMe ? 'You' : peer.name}
        >
          {peer.name.charAt(0).toUpperCase()}
        </li>
      ))}
      {hidden.length > 0 && (
        <li
          className="avatar avatar--more"
          title={hidden.map((peer) => peer.name).join(', ')}
        >
          +{hidden.length}
        </li>
      )}
    </ul>
  );
}
