import { useMemo, useState } from 'react';
import { YorkieProvider } from '@yorkie-js/react';
import { Home } from './pages/Home';
import { TopicPage } from './pages/TopicPage';

export default function App() {
  const [topicId, setTopicId] = useState<string | null>(null);

  const apiKey = import.meta.env.VITE_YORKIE_API_KEY ?? '';
  const rpcAddr =
    import.meta.env.VITE_YORKIE_API_ADDR ?? 'http://localhost:8080';
  const yorkieOpts = useMemo(() => ({ apiKey, rpcAddr }), [apiKey, rpcAddr]);

  return (
    <div className="app">
      <header>
        <h1>📊 Page View Counter</h1>
        <p className="lede">
          Using a Yorkie Counter CRDT as a daily page-view counter. Manual
          sync + <code>disableGC</code>, with the docKey rotated every 24
          hours.
        </p>
      </header>
      <YorkieProvider {...yorkieOpts} deactivateOnUnload={false}>
        {topicId === null ? (
          <Home onSelect={setTopicId} />
        ) : (
          <TopicPage topicId={topicId} onBack={() => setTopicId(null)} />
        )}
      </YorkieProvider>
    </div>
  );
}
