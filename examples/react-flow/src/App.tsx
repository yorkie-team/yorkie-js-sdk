import { useCallback } from 'react';
import { JSONArray, JSONObject, useDocument } from '@yorkie-js/react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Node,
  Edge,
  Background,
  NodeChange,
  EdgeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './App.css';

type Graph = {
  nodes: JSONArray<Node>;
  edges: JSONArray<Edge>;
};

function App() {
  const { root, update, loading, error } = useDocument<Graph>();

  const onNodesChange = useCallback(
    (changes: Array<NodeChange>) => {
      update((r) => {
        for (const c of changes) {
          switch (c.type) {
            case 'add':
              r.nodes.push(c.item);
              break;
            case 'replace':
              {
                const idx = r.nodes.findIndex((n) => n.id === c.id);
                r.nodes[idx] = c.item;
              }
              break;
            case 'remove':
              {
                const idx = r.nodes.findIndex((n) => n.id === c.id);
                r.nodes.delete?.(idx);
              }
              break;
            case 'position':
              {
                const idx = r.nodes.findIndex((n) => n.id === c.id);
                r.nodes[idx].position = c.position!;
              }
              break;
            case 'select':
              {
                const idx = r.nodes.findIndex((n) => n.id === c.id);
                r.nodes[idx].selected = c.selected;
              }
              break;
            default:
              break;
          }
        }
      });
    },
    [update],
  );

  const onEdgesChange = useCallback(
    (changes: Array<EdgeChange>) => {
      update((r) => {
        for (const c of changes) {
          switch (c.type) {
            case 'add':
              r.edges.push(c.item);
              break;
            case 'replace':
              {
                const idx = r.edges.findIndex((e) => e.id === c.id);
                r.edges[idx] = c.item;
              }
              break;
            case 'remove':
              {
                const idx = r.edges.findIndex((e) => e.id === c.id);
                r.edges.delete?.(idx);
              }
              break;
            case 'select':
              {
                const idx = r.edges.findIndex((e) => e.id === c.id);
                r.edges[idx].selected = c.selected;
              }
              break;
            default:
              break;
          }
        }
      });
    },
    [update],
  );

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div style={{ position: 'fixed', inset: 0, height: '100vh' }}>
      <ReactFlow
        nodes={root.nodes}
        edges={root.edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
      >
        <Background gap={10} size={1} color="silver" />
        <Controls orientation="horizontal" showInteractive={false} />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}

export default App;
