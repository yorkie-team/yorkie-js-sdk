import { StreamConnectionStatus } from '@yorkie-js/sdk';
import { useDocumentSelector } from '../hooks/useDocumentSelector';

/**
 * IncrementButton is a button component that increments the counter value
 */
export function IncrementButton() {
  const { update, connection } = useDocumentSelector(
    ({ update, connection }) => ({ update, connection }),
  );

  return (
    <button
      id="increment"
      disabled={connection === StreamConnectionStatus.Disconnected}
      onClick={() => update((root) => (root.counter += 1))}
    >
      Increment
    </button>
  );
}
