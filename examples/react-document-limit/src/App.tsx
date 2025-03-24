import {
  YorkieProvider,
  DocumentProvider,
  useDocument,
  usePresences,
} from '@yorkie-js/react';
import DocumentLimits from './DocumentLimits';

function Peers() {
  const presences = usePresences();
  return (
    <div id="peers-container">
      <p>
        Peers:{' ['}
        {presences.map((presence) => (
          <span key={presence.clientID}>{presence.clientID.slice(-3)}, </span>
        ))}
        {']'}
      </p>
    </div>
  );
}

function Counter() {
  const { root, update, loading, error } = useDocument<{
    counter: number;
  }>();

  if (loading) return <p>Loading...</p>;
  if (error)
    return (
      <div id="error">
        <p>Error Name: {error.name}</p>
        <p>Error Message: {error.message}</p>
      </div>
    );

  return (
    <div id="counter-container">
      <h1 id="counter">Counter</h1>
      <div id="counter-value">{root.counter}</div>
      <button
        id="increment"
        onClick={() => update((root) => (root.counter += 1))}
      >
        Increment
      </button>
    </div>
  );
}

function App() {
  return (
    <YorkieProvider
      apiKey={import.meta.env.VITE_YORKIE_API_KEY}
      rpcAddr={import.meta.env.VITE_YORKIE_API_ADDR}
    >
      <div className="page-container">
        <div className="counter-side">
          <DocumentProvider docKey="react-document-limit" initialRoot={{ counter: 0 }}>
            <Peers />
            <Counter />
          </DocumentProvider>
        </div>
        <DocumentLimits />
      </div>
    </YorkieProvider>
  );
}

export default App;
