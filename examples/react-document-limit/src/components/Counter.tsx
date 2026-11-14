import { useDocumentSelector } from '../hooks/useDocumentSelector';
import { statusOf } from './status';

/**
 * `Message` replaces the counter with a title, a message and a reload button.
 */
function Message({ title, message }: { title: string; message: string }) {
  return (
    <section className="panel counter" id="counter" aria-live="polite">
      <h1 className="counter__title">{title}</h1>
      <p className="counter__note">{message}</p>
      <button
        className="button"
        type="button"
        onClick={() => window.location.reload()}
      >
        Reload
      </button>
    </section>
  );
}

/**
 * `Counter` shows the shared counter, or why this tab can't use it.
 */
export function Counter() {
  const { root, update, loading, error, connection } = useDocumentSelector(
    ({ root, update, loading, error, connection }) => ({
      root,
      update,
      loading,
      error,
      connection,
    }),
  );
  const status = statusOf(loading, error, connection);

  if (status === 'full') {
    return (
      <Message
        title="This document is full"
        message="The project allows only a limited number of clients on this document. Close one of the other tabs, then reload."
      />
    );
  }
  if (status === 'error') {
    return (
      <Message
        title="Something went wrong"
        message={`Couldn't reach the Yorkie server at ${import.meta.env.VITE_YORKIE_API_ADDR}. Check that it's running, then reload.`}
      />
    );
  }

  return (
    <section className="panel counter" id="counter" aria-live="polite">
      <h1 className="counter__label">Shared counter</h1>
      <p className="counter__value" id="counter-value">
        {loading ? '–' : (root.counter ?? 0)}
      </p>
      <button
        className="button"
        id="increment"
        type="button"
        disabled={status !== 'connected'}
        onClick={() => update((root) => (root.counter += 1))}
      >
        Increment
      </button>
      {status === 'offline' && (
        <p className="counter__note">
          Live updates are paused. Yorkie keeps retrying.
        </p>
      )}
    </section>
  );
}
