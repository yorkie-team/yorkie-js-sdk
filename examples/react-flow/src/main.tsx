import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DocumentProvider, YorkieProvider } from '@yorkie-js/react';
import '@xyflow/react/dist/style.css';
import './index.css';
import App from './App';

const initialNodes = [
  {
    id: '1',
    type: 'input',
    data: { label: 'Multiplayer' },
    position: { x: 250, y: 25 },
  },
  {
    id: '2',
    data: { label: 'Graph' },
    position: { x: 100, y: 125 },
  },
  {
    id: '3',
    data: { label: 'React Flow' },
    position: { x: 250, y: 225 },
  },
  {
    id: '4',
    type: 'output',
    data: { label: 'Yorkie' },
    position: { x: 100, y: 325 },
  },
];

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2', type: 'smoothstep' },
  { id: 'e2-3', source: '2', target: '3', label: 'with' },
  { id: 'e3-4', source: '3', target: '4', label: 'and', animated: true },
];

// The graph lives in the Yorkie document root, so every peer edits the same
// nodes and edges.
const initialGraph = {
  nodes: initialNodes,
  edges: initialEdges,
};

// Use `?key=<name>` for a separate graph, or today's shared one by default.
const docKey =
  new URLSearchParams(window.location.search).get('key') ||
  `react-flow-${new Date().toISOString().substring(0, 10).replace(/-/g, '')}`;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <YorkieProvider
      apiKey={import.meta.env.VITE_YORKIE_API_KEY}
      rpcAddr={import.meta.env.VITE_YORKIE_API_ADDR}
    >
      <DocumentProvider docKey={docKey} initialRoot={initialGraph}>
        <App />
      </DocumentProvider>
    </YorkieProvider>
  </StrictMode>,
);
