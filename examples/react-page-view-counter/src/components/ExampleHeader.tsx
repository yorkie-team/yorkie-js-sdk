import { useYorkie } from '@yorkie-js/react';

/**
 * `ExampleHeader` shows the example name, how to try it and whether the
 * client could reach the server. This example syncs manually, so there is no
 * live stream to report on: "Connected" means the client is activated.
 */
export function ExampleHeader() {
  const { loading, error } = useYorkie();
  const status = loading ? 'connecting' : error ? 'error' : 'connected';
  const label = loading ? 'Connecting…' : error ? 'Error' : 'Connected';

  return (
    <header className="example-header">
      <div className="example-header__intro">
        <p className="example-header__title">Page View Counter</p>
        <p className="example-header__hint">
          Every visit counts — open a topic here and in{' '}
          <a href={window.location.href} target="_blank" rel="noreferrer">
            another tab
          </a>{' '}
          to add views.
        </p>
      </div>
      <div className="example-header__meta">
        <span className="status" data-status={status}>
          <span className="status__dot" aria-hidden="true" />
          {label}
        </span>
      </div>
    </header>
  );
}
