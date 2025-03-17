import { createRoot } from 'react-dom/client';
import { DocumentProvider, YorkieProvider } from '@yorkie-js/react';
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
    style: { borderColor: '#FF0072' },
  },
  {
    id: '4',
    type: 'output',
    data: { label: 'Yorkie' },
    position: { x: 100, y: 325 },
    style: { borderColor: '#944DFA' },
  },
];

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2', type: 'smoothstep' },
  { id: 'e2-3', source: '2', target: '3', label: 'with' },
  { id: 'e3-4', source: '3', target: '4', label: 'and', animated: true },
];

const initialGraph = {
  nodes: initialNodes,
  edges: initialEdges,
};

createRoot(document.getElementById('root')!).render(
  <YorkieProvider
    apiKey={import.meta.env.VITE_YORKIE_API_KEY}
    rpcAddr={import.meta.env.VITE_YORKIE_API_ADDR}
  >
    <DocumentProvider
      docKey={`react-flow-${new Date()
        .toISOString()
        .substring(0, 10)
        .replace(/-/g, '')}`}
      initialRoot={initialGraph}
    >
      <App />
    </DocumentProvider>
  </YorkieProvider>,
);
