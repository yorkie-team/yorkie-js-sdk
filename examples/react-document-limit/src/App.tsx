import { YorkieProvider, DocumentProvider } from '@yorkie-js/react';
import DocumentLimits from './components/DocumentLimits';
import { Counter } from './components/Counter';

function App() {
  return (
    <YorkieProvider
      apiKey={import.meta.env.VITE_YORKIE_API_KEY}
      rpcAddr={import.meta.env.VITE_YORKIE_API_ADDR}
    >
      <div className="page-container">
        <DocumentProvider
          docKey="react-document-limit"
          initialRoot={{ counter: 0 }}
        >
          <Counter />
        </DocumentProvider>
        <DocumentLimits />
      </div>
    </YorkieProvider>
  );
}

export default App;
