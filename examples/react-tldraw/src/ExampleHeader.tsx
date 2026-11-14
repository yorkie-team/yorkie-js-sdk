import type { ReactNode } from 'react';
import type { Status } from './hooks/useMultiplayerState';

const statusLabels: Record<Status, string> = {
  connecting: 'Connecting…',
  connected: 'Connected',
  offline: 'Offline',
  error: 'Error',
};

interface ExampleHeaderProps {
  title: string;
  status: Status;
  className?: string;
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
  className = '',
  children,
}: ExampleHeaderProps) {
  return (
    <header className={`example-header ${className}`}>
      <div className="example-header__intro">
        <h1 className="example-header__title">{title}</h1>
        <p className="example-header__hint">
          Draw together — open this page in{' '}
          <a href={window.location.href} target="_blank" rel="noreferrer">
            another tab
          </a>{' '}
          to see shapes and cursors sync.
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
