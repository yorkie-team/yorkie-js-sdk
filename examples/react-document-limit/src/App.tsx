import {
  YorkieProvider,
  DocumentProvider,
  Counter as YorkieCounter,
} from '@yorkie-js/react';
import ExampleHeader from './components/ExampleHeader';
import { Counter } from './components/Counter';
import { LimitsInfo } from './components/LimitsInfo';
import { randomName } from './components/Peers';

// Each tab picks a display name once; peers see it through presence.
const username = randomName();

function App() {
  return (
    <YorkieProvider
      apiKey={import.meta.env.VITE_YORKIE_API_KEY}
      rpcAddr={import.meta.env.VITE_YORKIE_API_ADDR}
    >
      <DocumentProvider
        docKey="react-document-limit"
        initialRoot={{ counter: new YorkieCounter(0) }}
        initialPresence={{ username }}
      >
        <ExampleHeader />
        <main className="layout">
          <Counter />
          <LimitsInfo />
        </main>
      </DocumentProvider>
    </YorkieProvider>
  );
}

export default App;
