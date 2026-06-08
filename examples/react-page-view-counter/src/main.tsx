import ReactDOM from 'react-dom/client';
import { StrictMode } from 'react';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
