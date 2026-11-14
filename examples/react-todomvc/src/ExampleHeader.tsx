import type { ReactNode } from 'react';

export type Status = 'connecting' | 'connected' | 'offline' | 'error';

const statusLabels: Record<Status, string> = {
  connecting: 'Connecting…',
  connected: 'Connected',
  offline: 'Offline',
  error: 'Error',
};

interface ExampleHeaderProps {
  title: string;
  status: Status;
  children?: ReactNode;
}

/**
 * `ExampleHeader` shows the example name, how to try it and the connection
 * status. The "another tab" link opens this same URL, so the second client
 * attaches to the same document.
 */
export default function ExampleHeader({
  title,
  status,
  children,
}: ExampleHeaderProps) {
  return (
    <header className="example-header">
      <div className="example-header__intro">
        <p className="example-header__title">{title}</p>
        <p className="example-header__hint">
          Edit together — open this page in{' '}
          <a href={window.location.href} target="_blank" rel="noreferrer">
            another tab
          </a>{' '}
          to see changes sync.
        </p>
      </div>
      <div className="example-header__meta">
        <span className="status" data-status={status}>
          <span className="status__dot" aria-hidden="true" />
          {statusLabels[status]}
        </span>
        {children}
      </div>
    </header>
  );
}
