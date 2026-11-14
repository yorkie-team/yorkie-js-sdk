import { useCallback, useMemo, useState } from 'react';
import { JSONArray, useDocument } from '@yorkie-js/react';
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  Panel,
  NodeChange,
  EdgeChange,
  Connection,
  useReactFlow,
  XYPosition,
} from '@xyflow/react';
import ExampleHeader, { type Status } from './ExampleHeader';

type Graph = {
  nodes: JSONArray<Node>;
  edges: JSONArray<Edge>;
};

function App() {
  const { root, update, connection, loading, error } = useDocument<Graph>();
  // Selection and measured sizes are local UI state: they are never written
  // to the shared document, so each peer selects independently.
  const [local, setLocal] = useState<
    Record<string, Pick<Node, 'selected' | 'measured'>>
  >({});

  const setLocalState = useCallback(
    (changes: Array<NodeChange | EdgeChange>) => {
      setLocal((prev) => {
        const next = { ...prev };
        for (const c of changes) {
          if (c.type === 'select') {
            next[c.id] = { ...next[c.id], selected: c.selected };
          } else if (c.type === 'dimensions' && c.dimensions) {
            next[c.id] = { ...next[c.id], measured: c.dimensions };
          }
        }
        return next;
      });
    },
    [],
  );

  const onNodesChange = useCallback(
    (changes: Array<NodeChange>) => {
      setLocalState(changes);
      update((r) => {
        for (const c of changes) {
          if (c.type === 'add') {
            r.nodes.push(c.item);
            continue;
          }
          if (c.type !== 'position' && c.type !== 'remove') continue;

          const idx = r.nodes.findIndex((n) => n.id === c.id);
          if (idx === -1) continue;
          if (c.type === 'remove') {
            r.nodes.delete(idx);
          } else if (c.position) {
            r.nodes[idx].position = c.position;
          }
        }
      });
    },
    [setLocalState, update],
  );

  const onEdgesChange = useCallback(
    (changes: Array<EdgeChange>) => {
      setLocalState(changes);
      update((r) => {
        for (const c of changes) {
          if (c.type !== 'remove') continue;
          const idx = r.edges.findIndex((e) => e.id === c.id);
          if (idx !== -1) r.edges.delete(idx);
        }
      });
    },
    [setLocalState, update],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      update((r) => {
        r.edges.push({
          // Random IDs keep edges created by different peers from colliding.
          id: crypto.randomUUID(),
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

  const addNode = useCallback(
    (position: XYPosition) => {
      update((r) => {
        r.nodes.push({
          id: crypto.randomUUID(),
          data: { label: `Node ${r.nodes.length + 1}` },
          position,
        });
      });
    },
    [update],
  );

  // Merge the local state into the shared nodes and edges. `root` is a new
  // object after every change, local or remote.
  const nodes = useMemo(
    () => root.nodes.map((n) => ({ ...n, ...local[n.id] })),
    [root, local],
  );
  const edges = useMemo(
    () => root.edges.map((e) => ({ ...e, ...local[e.id] })),
    [root, local],
  );

  let status: Status = 'offline';
  if (error) status = 'error';
  else if (loading) status = 'connecting';
  else if (connection === 'connected') status = 'connected';

  return (
    <div className="layout">
      <ExampleHeader title="React Flow" status={status} />
      {error ? (
        <p className="state-message" role="alert">
          Couldn't reach the Yorkie server at{' '}
          {import.meta.env.VITE_YORKIE_API_ADDR}. Check that it's running, then
          reload.
        </p>
      ) : loading ? (
        <p className="state-message">Loading the shared graph…</p>
      ) : (
        <main className="canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
            fitViewOptions={{ maxZoom: 1 }}
          >
            <Background gap={10} size={1} />
            <Controls />
            <AddNodeButton onAdd={addNode} />
          </ReactFlow>
        </main>
      )}
    </div>
  );
}

/**
 * `AddNodeButton` adds a node at the center of the visible canvas.
 */
function AddNodeButton({ onAdd }: { onAdd: (position: XYPosition) => void }) {
  const { screenToFlowPosition } = useReactFlow();

  return (
    <Panel position="top-left">
      <button
        type="button"
        className="button button--primary"
        onClick={(e) => {
          const pane = e.currentTarget
            .closest('.react-flow')!
            .getBoundingClientRect();
          onAdd(
            screenToFlowPosition({
              x: pane.x + pane.width / 2 - 75,
              y: pane.y + pane.height / 2 - 20,
            }),
          );
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M8 3v10M3 8h10"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        Add node
      </button>
    </Panel>
  );
}

export default App;
