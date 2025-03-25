import { useConnection, useDocument } from '@yorkie-js/react';
import { ConnectionStatus } from './ConnectionStatus';
import { Peers } from './Peers';
import { StreamConnectionStatus } from '../../../../packages/sdk/src/yorkie';

export function Counter() {
  const { root, update, loading, error } = useDocument<{
    counter: number;
  }>();

  const connection = useConnection();

  if (loading) return <p>Loading...</p>;
  if (error)
    return (
      <div id="error">
        <p>Error Name: {error.name}</p>
        <p>Error Message: {error.message}</p>
      </div>
    );

  return (
    <div className="counter-side">
      <ConnectionStatus />
      <Peers />
      <div id="counter-container">
        <h1 id="counter">Counter</h1>
        <div id="counter-value">{root.counter}</div>
        <button
          id="increment"
          disabled={connection === StreamConnectionStatus.Disconnected}
          onClick={() => update((root) => (root.counter += 1))}
        >
          Increment
        </button>
      </div>
      <div id="error">
        {connection === StreamConnectionStatus.Disconnected && (
          <p>Stream subscription is disconnected</p>
        )}
      </div>
    </div>
  );
}
