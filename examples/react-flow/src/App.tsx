import { useCallback, useRef } from 'react';
import { JSONArray, useDocument } from '@yorkie-js/react';
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  NodeChange,
  EdgeChange,
  Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './App.css';

type Graph = {
  nodes: JSONArray<Node>;
  edges: JSONArray<Edge>;
};

function App() {
  const { root, update, loading, error } = useDocument<Graph>();
  // simple incremental id for new edges
  const edgeIdRef = useRef(0);

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
                if (idx !== -1) {
                  r.nodes[idx] = c.item;
                }
              }
              break;
            case 'remove':
              {
                const idx = r.nodes.findIndex((n) => n.id === c.id);
                if (idx !== -1) {
                  r.nodes.delete?.(idx);
                }
              }
              break;
            case 'position':
              {
                const idx = r.nodes.findIndex((n) => n.id === c.id);
                if (idx !== -1 && c.position) {
                  r.nodes[idx].position = c.position;
                }
              }
              break;
            case 'select':
              {
                const idx = r.nodes.findIndex((n) => n.id === c.id);
                if (idx !== -1) {
                  r.nodes[idx].selected = c.selected;
                }
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
                if (idx !== -1) {
                  r.edges[idx] = c.item;
                }
              }
              break;
            case 'remove':
              {
                const idx = r.edges.findIndex((e) => e.id === c.id);
                if (idx !== -1) {
                  r.edges.delete?.(idx);
                }
              }
              break;
            case 'select':
              {
                const idx = r.edges.findIndex((e) => e.id === c.id);
                if (idx !== -1) {
                  r.edges[idx].selected = c.selected;
                }
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

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      update((r) => {
        const already = r.edges.some(
          (e) =>
            e.source === connection.source &&
            e.target === connection.target &&
            e.sourceHandle === connection.sourceHandle &&
            e.targetHandle === connection.targetHandle,
        );
        if (already) return;
        const id = `e-${connection.source}-${
          connection.target
        }-${edgeIdRef.current++}`;
        r.edges.push({
          id,
          type: 'smoothstep',
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle,
          targetHandle: connection.targetHandle,
        });
      });
    },
    [update],
  );

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div style={{ position: 'fixed', inset: 0, height: '100vh' }}>
      <ReactFlow
        nodes={[...root.nodes].filter(Boolean) as Node[]}
        edges={[...root.edges].filter(Boolean) as Edge[]}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
      >
        <Background gap={10} size={1} color="silver" />
      </ReactFlow>
    </div>
  );
}

export default App;
