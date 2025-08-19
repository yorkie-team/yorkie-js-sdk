import { useEffect, useState, useRef } from 'react';
import {
  YorkieProvider,
  DocumentProvider,
  useDocument,
} from '@yorkie-js/react';
import Cursor from './components/Cursor';
import CursorSelections from './components/CursorSelections';
import './App.css';

// `initialPresence` is the initial cursor state for each user.
const initialPresence = {
  cursorShape: 'cursor',
  cursor: { xPos: 0, yPos: 0 },
  pointerDown: false,
  color: '#000000',
  fadeEnabled: false,
  overInteractive: false,
};

// `pixcelThreshold` is the minimum distance to consider a cursor movement.
const pixcelThreshold = 2;

function CursorsCanvas() {
  const { doc, presences, update, loading, error } = useDocument();
  const [fadeEnabled, setFadeEnabled] = useState(false);
  const [color, setColor] = useState('#000000');
  const myClientIDRef = useRef(null);
  const pendingRef = useRef(null);
  const lastSentRef = useRef({ x: 0, y: 0 });
  const pointerDownRef = useRef(false);

  const handleCursorShapeSelect = (cursorShape) => {
    update((_, p) => p.set({ cursorShape }));
  };

  const handleFadeSet = (next) => {
    setFadeEnabled(next);
    update((_, p) => p.set({ fadeEnabled: next }));
  };
  const handleColorChange = (newColor) => {
    setColor(newColor);
    update((_, p) => p.set({ color: newColor }));
  };

  useEffect(() => {
    if (loading || error) return;
    const interactiveSelector =
      'button, input, select, textarea, [role="button"], a, [data-native-cursor]';

    const onDown = () => {
      pointerDownRef.current = true;
      update((_, p) => p.set({ pointerDown: true }));
    };
    const onUp = () => {
      pointerDownRef.current = false;
      update((_, p) => p.set({ pointerDown: false }));
    };
    const onMove = (e) => {
      const overInteractive = !!(
        e.target.closest && e.target.closest(interactiveSelector)
      );
      pendingRef.current = {
        x: e.clientX,
        y: e.clientY,
        overInteractive,
      };
    };

    let frameID;
    const loop = () => {
      const pending = pendingRef.current;
      if (pending) {
        const last = lastSentRef.current;
        const dx = pending.x - last.x;
        const dy = pending.y - last.y;
        const dist = Math.hypot(dx, dy);
        const forceSend = pointerDownRef.current;
        if (forceSend || dist >= pixcelThreshold) {
          lastSentRef.current = { x: pending.x, y: pending.y };
          update((_, p) =>
            p.set({
              cursor: { xPos: pending.x, yPos: pending.y },
              overInteractive: pending.overInteractive,
            }),
          );
        }
        pendingRef.current = null;
      }
      frameID = requestAnimationFrame(loop);
    };
    frameID = requestAnimationFrame(loop);

    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mousemove', onMove);

    return () => {
      cancelAnimationFrame(frameID);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mousemove', onMove);
    };
  }, [loading, error, update]);

  useEffect(() => {
    if (!doc) return;

    const myPresence = doc.getMyPresence?.();
    if (myPresence) {
      setFadeEnabled(myPresence.fadeEnabled ?? false);
      setColor(myPresence.color ?? '#000000');
    }
  }, [presences, doc]);

  if (loading) return <div className="general-container">Loading...</div>;
  if (error)
    return <div className="general-container">Error: {error.message}</div>;

  return (
    <div
      className="general-container"
      onMouseDown={(e) => {
        const tag = e.target.tagName;
        if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(tag)) return;
        e.preventDefault();
      }}
    >
      {presences.map(({ clientID, presence }, idx) => {
        const {
          cursorShape,
          cursor,
          pointerDown,
          color: presColor = '#000000',
          fadeEnabled: presFade = false,
          overInteractive = false,
        } = presence;

        if (idx === 0 && myClientIDRef.current === null) {
          myClientIDRef.current = clientID;
        }
        const isLocal = clientID === myClientIDRef.current;

        return (
          cursor && (
            <Cursor
              key={clientID}
              selectedCursorShape={cursorShape}
              x={cursor.xPos}
              y={cursor.yPos}
              pointerDown={pointerDown}
              fadeEnabled={presFade}
              color={presColor}
              overInteractive={overInteractive}
              animate={!isLocal}
            />
          )
        );
      })}

      <CursorSelections
        handleCursorShapeSelect={handleCursorShapeSelect}
        clientsLength={presences.length}
        fadeEnabled={fadeEnabled}
        onFadeSet={handleFadeSet}
        color={color}
        onColorChange={handleColorChange}
      />
    </div>
  );
}

export default function App() {
  return (
    <YorkieProvider
      apiKey={import.meta.env.VITE_YORKIE_API_KEY}
      rpcAddr={import.meta.env.VITE_YORKIE_API_ADDR}
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
