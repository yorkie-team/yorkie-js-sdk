import { useMemo, useState } from 'react';
import { YorkieProvider } from '@yorkie-js/react';
import { ExampleHeader } from './components/ExampleHeader';
import { Home } from './pages/Home';
import { TopicPage } from './pages/TopicPage';

export default function App() {
  const [topicId, setTopicId] = useState<string | null>(null);

  const apiKey = import.meta.env.VITE_YORKIE_API_KEY ?? '';
  const rpcAddr =
    import.meta.env.VITE_YORKIE_API_ADDR ?? 'http://localhost:8080';
  const yorkieOpts = useMemo(() => ({ apiKey, rpcAddr }), [apiKey, rpcAddr]);

  return (
    <YorkieProvider {...yorkieOpts} deactivateOnUnload={false}>
      <ExampleHeader />
      <main className="page">
        {topicId === null ? (
          <Home onSelect={setTopicId} />
        ) : (
          <TopicPage topicId={topicId} onBack={() => setTopicId(null)} />
        )}
      </main>
    </YorkieProvider>
  );
}
