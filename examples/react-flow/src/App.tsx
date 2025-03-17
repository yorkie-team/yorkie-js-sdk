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
  nodes: JSONArray<JSONObject<Node>>;
  edges: JSONArray<JSONObject<Edge>>;
};

function App() {
  const { root, update, loading, error } = useDocument<Graph>();

  const onNodesChange = useCallback(
    (changes: Array<NodeChange>) => {
      update((root) => {
        for (const c of changes) {
          switch (c.type) {
            case 'add':
              root.nodes.push(c.item);
              break;
            case 'replace':
              const replace = root.nodes.findIndex((n) => n.id === c.id);
              root.nodes[replace] = c.item;
              break;
            case 'remove':
              var remove = root.nodes.findIndex((n) => n.id === c.id);
              root.nodes.deleteByID!(root.nodes[remove].getID!());
              break;
            case 'position':
              var pos = root.nodes.findIndex((n) => n.id === c.id);
              root.nodes[pos].position = c.position!;
              break;
            case 'select':
              var select = root.nodes.findIndex((n) => n.id === c.id);
              root.nodes[select].selected = c.selected;
              break;
            default:
              break;
          }
        }
      });
    },
    [update, root],
  );

  const onEdgesChange = useCallback(
    (changes: Array<EdgeChange>) => {
      update(() => {
        for (const c of changes) {
          switch (c.type) {
            case 'add':
              root.edges.push(c.item);
              break;
            case 'replace':
              const replace = root.edges.findIndex((e) => e.id === c.id);
              root.edges[replace] = c.item;
              break;
            case 'remove':
              const remove = root.edges.findIndex((e) => e.id === c.id);
              root.edges.deleteByID!(root.edges[remove].getID!());
              break;
            case 'select':
              const select = root.edges.findIndex((e) => e.id === c.id);
              root.edges[select].selected = c.selected;
              break;
            default:
              break;
          }
        }
      });
    },
    [update, root],
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
