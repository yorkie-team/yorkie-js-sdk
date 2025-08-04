import { StreamConnectionStatus } from '@yorkie-js/sdk';
import { useConnection } from '@yorkie-js/react';
import { ConnectionStatus } from './ConnectionStatus';
import { Peers } from './Peers';
import { useDocumentSelector } from '../hooks/useDocumentSelector';
import { CounterNumber } from './CounterNumber';
import { IncrementButton } from './IncrementButton';

/**
 * Counter component that demonstrates the usage of Yorkie's document state management.
 */
export function Counter() {
  const { loading, error } = useDocumentSelector(({ loading, error }) => ({
    loading,
    error,
  }));

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
        <CounterNumber />
        <IncrementButton />
      </div>
      <div id="error">
        {connection === StreamConnectionStatus.Disconnected && (
          <p>Stream subscription is disconnected</p>
        )}
      </div>
    </div>
  );
}
