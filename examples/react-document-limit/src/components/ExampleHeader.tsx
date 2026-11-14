import { useDocumentSelector } from '../hooks/useDocumentSelector';
import { Peers } from './Peers';
import { statusOf, type Status } from './status';

const statusLabels: Record<Status, string> = {
  connecting: 'Connecting…',
  connected: 'Connected',
  offline: 'Offline',
  error: 'Error',
  full: 'Document full',
};

/**
 * `ExampleHeader` shows the example name, how to try it, the connection
 * status and who is here. The "another tab" link opens this same URL, so the
 * next client attaches to the same document.
 */
export default function ExampleHeader() {
  const { loading, error, connection } = useDocumentSelector(
    ({ loading, error, connection }) => ({ loading, error, connection }),
  );
  const status = statusOf(loading, error, connection);

  return (
    <header className="example-header">
      <div className="example-header__intro">
        <p className="example-header__title">Document Limits</p>
        <p className="example-header__hint">
          Count together — open this page in{' '}
          <a href={window.location.href} target="_blank" rel="noreferrer">
            another tab
          </a>{' '}
          to add one more client.
        </p>
      </div>
      <div className="example-header__meta">
        <span className="status" data-status={status}>
          <span className="status__dot" aria-hidden="true" />
          {statusLabels[status]}
        </span>
        {status !== 'full' && status !== 'error' && <Peers />}
      </div>
    </header>
  );
}
