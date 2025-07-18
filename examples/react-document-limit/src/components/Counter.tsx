import { Indexable, StreamConnectionStatus } from '@yorkie-js/sdk';
import {
  useConnection,
  useDocument,
  createUseDocument,
  useDocumentSelector,
} from '@yorkie-js/react';
import { ConnectionStatus } from './ConnectionStatus';
import { Peers } from './Peers';

type PickedContext = {
  root: { counter: number };
  update: (updater: (root: { counter: number }) => void) => void;
  loading: boolean;
  error?: Error;
};

const selector = ({ root, update, loading, error }: PickedContext) => ({
  root,
  update,
  loading,
  error,
});

const useDocumentByFactory = createUseDocument<{ counter: number }>();

/**
 * Counter component that demonstrates the usage of Yorkie's document state management.
 */
export function Counter() {
  const { root, update, loading, error } = useDocument<{ counter: number }>();

  /* eslint-disable */
  // This is an temporary example code for only PR
  // Will be removed after review
  // ==================

  /**
   * 1. using `useDocument` to select specific parts of the document state
   * you need to provide all three type parameters to use selector with it
   * with proper type inference
   */
  const {
    root: r1,
    update: u1,
    loading: l1,
    error: e1,
  } = useDocument<{ counter: number }, Indexable, PickedContext>(selector);

  /**
   * 2. using `useDocumentSelector`
   * It has little better usability than `useDocument`
   * because positions of the 2nd and 3rd type parameters have been swapped.
   */
  const {
    root: r2,
    update: u2,
    loading: l2,
    error: e2,
  } = useDocumentSelector<{ counter: number }, PickedContext>(selector);

  /**
   * 3. using `createUseDocument` to create a custom hook
   * It can infer the selected type from the selector it self
   * But you need to create custom hook using factory function(see line:24)
   */
  const {
    root: r3,
    update: u3,
    loading: l3,
    error: e3,
  } = useDocumentByFactory(selector);

  // ============================
  /* eslint-enable */

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
