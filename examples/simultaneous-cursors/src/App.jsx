import { useEffect, useRef, useState } from 'react';
import {
  YorkieProvider,
  DocumentProvider,
  useDocument,
  useYorkie,
} from '@yorkie-js/react';
import Header from './components/Header';
import Cursor from './components/Cursor';
import CursorSelections from './components/CursorSelections';
import './App.css';

const rpcAddr = import.meta.env.VITE_YORKIE_API_ADDR;
const names = ['Otter', 'Fox', 'Panda', 'Koala', 'Heron', 'Lynx', 'Robin'];
const peerColors = [
  '#fc8539',
  '#fdc433',
  '#23c176',
  '#3c9af1',
  '#f44954',
  '#855cf9',
];

// `peerColor` derives a colour from the client ID, so every tab agrees on
// which colour belongs to which peer.
function peerColor(clientID) {
  let hash = 0;
  for (const ch of clientID) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return peerColors[Math.abs(hash) % peerColors.length];
}

// Everything in this example lives in Presence: each peer shares its
// pointer and tool, and nothing is written to the document root. That is
// why the ink is a live trail: it disappears when its author leaves.
const initialPresence = {
  name: names[Math.floor(Math.random() * names.length)],
  cursorShape: 'cursor',
  fadeEnabled: false,
  // Position as a fraction (0–1) of the viewport, so peers with different
  // window sizes see each other's cursors in the same place.
  cursor: null,
  pointerDown: false,
  overInteractive: false,
};

// Moves smaller than this fraction of the viewport are not sent.
const moveThreshold = 0.002;
const interactiveSelector = 'button, input, select, a, [data-native-cursor]';

function useViewport() {
  const [size, setSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  useEffect(() => {
    const onResize = () =>
      setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

function CursorsCanvas() {
  const { client } = useYorkie();
  const { presences, update, loading, error, connection } = useDocument();
  const viewport = useViewport();
  const pendingRef = useRef(null);
  const lastSentRef = useRef({ x: 0, y: 0 });

  // Presences are keyed by actor ID; the local peer is this client's own.
  const myID = client?.getActorID();
  const me = presences.find((p) => p.clientID === myID)?.presence;

  useEffect(() => {
    if (loading || error) return;

    const position = (e) => ({
      x: e.clientX / window.innerWidth,
      y: e.clientY / window.innerHeight,
    });
    // Pointer events cover mouse, pen and touch alike.
    const onDown = (e) => {
      if (e.target.closest(interactiveSelector)) return;
      lastSentRef.current = position(e);
      update((_, p) =>
        p.set({
          cursor: position(e),
          pointerDown: true,
          overInteractive: false,
        }),
      );
    };
    const onUp = () => update((_, p) => p.set({ pointerDown: false }));
    const onMove = (e) => {
      pendingRef.current = {
        ...position(e),
        overInteractive: !!e.target.closest(interactiveSelector),
      };
    };
    const onLeave = () => {
      pendingRef.current = null;
      update((_, p) => p.set({ cursor: null, pointerDown: false }));
    };

    // Send at most one presence update per animation frame.
    let frameID;
    const loop = () => {
      const pending = pendingRef.current;
      if (pending) {
        const last = lastSentRef.current;
        const moved = Math.hypot(pending.x - last.x, pending.y - last.y);
        if (moved >= moveThreshold) {
          lastSentRef.current = pending;
          update((_, p) =>
            p.set({
              cursor: { x: pending.x, y: pending.y },
              overInteractive: pending.overInteractive,
            }),
          );
        }
        pendingRef.current = null;
      }
      frameID = requestAnimationFrame(loop);
    };
    frameID = requestAnimationFrame(loop);

    const root = document.documentElement;
    // The drawn cursor replaces the system one while the canvas is live.
    document.body.classList.add('drawn-cursor');
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('pointermove', onMove);
    root.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frameID);
      document.body.classList.remove('drawn-cursor');
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', onLeave);
    };
  }, [loading, error, update]);

  const peers = presences.map(({ clientID, presence }) => ({
    clientID,
    presence,
    color: peerColor(clientID),
    isMe: clientID === myID,
  }));

  return (
    <>
      <Header
        loading={loading}
        error={error}
        connection={connection}
        peers={peers}
      />
      {error && (
        <p className="error-message" role="alert">
          Couldn’t reach the Yorkie server at {rpcAddr}. Check that it’s
          running, then reload.
        </p>
      )}
      {peers.map(({ clientID, presence, color, isMe }) => (
        <Cursor
          key={clientID}
          shape={presence.cursorShape}
          fadeEnabled={presence.fadeEnabled}
          cursor={presence.cursor}
          pointerDown={presence.pointerDown}
          overInteractive={presence.overInteractive}
          color={color}
          viewport={viewport}
          animate={!isMe}
        />
      ))}
      {me && (
        <CursorSelections
          shape={me.cursorShape}
          fadeEnabled={me.fadeEnabled}
          onSelect={(cursorShape, fadeEnabled = false) =>
            update((_, p) => p.set({ cursorShape, fadeEnabled }))
          }
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <YorkieProvider
      apiKey={import.meta.env.VITE_YORKIE_API_KEY}
      rpcAddr={rpcAddr}
    >
      <DocumentProvider
        docKey="simultaneous-cursors"
        initialPresence={initialPresence}
      >
        <CursorsCanvas />
      </DocumentProvider>
    </YorkieProvider>
  );
}
