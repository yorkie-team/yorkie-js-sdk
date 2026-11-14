import Link from 'next/link';

export type Status = 'connecting' | 'connected' | 'error';

const STATUS_LABEL: Record<Status, string> = {
  connecting: 'Connecting…',
  connected: 'Connected',
  error: 'Error',
};

interface HeaderProps {
  status: Status;
  // The room the "another tab" link opens, so both tabs land in the same room.
  roomKey?: string;
}

export default function Header({ status, roomKey }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-text">
        <h1>Presence Rooms</h1>
        <p>
          Join a room, then open it in{' '}
          <Link
            href={roomKey ? { query: { room: roomKey } } : '/'}
            target="_blank"
          >
            another tab
          </Link>{' '}
          to watch the count change.
        </p>
      </div>
      <div className={`status status-${status}`} role="status">
        <span className="status-dot" aria-hidden="true" />
        {STATUS_LABEL[status]}
      </div>
    </header>
  );
}
