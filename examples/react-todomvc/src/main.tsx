import ReactDOM from 'react-dom/client';
import App from './App';
import { DocumentProvider, YorkieProvider } from '@yorkie-js/react';
import { StrictMode } from 'react';

const initalRoot = {
  todos: [
    { id: 0, text: 'Yorkie JS SDK', completed: false },
    { id: 1, text: 'Garbage collection', completed: false },
    { id: 2, text: 'RichText datatype', completed: false },
  ],
};

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
