import ReactDOM from 'react-dom/client';
import App from './App';
import { DocumentProvider, YorkieProvider } from '@yorkie-js/react';

const initalRoot = {
  todos: [
    { id: 0, text: 'Yorkie JS SDK', completed: false },
    { id: 1, text: 'Garbage collection', completed: false },
    { id: 2, text: 'RichText datatype', completed: false },
  ],
};

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <YorkieProvider
    apiKey={import.meta.env.VITE_YORKIE_API_KEY}
    rpcAddr={import.meta.env.VITE_YORKIE_API_ADDR}
  >
    <DocumentProvider
      docKey={`react-todomvc-${new Date().toISOString().substring(0, 10).replace(/-/g, '')}`}
      initialRoot={initalRoot}
    >
      <App />
    </DocumentProvider>
  </YorkieProvider>,
);
