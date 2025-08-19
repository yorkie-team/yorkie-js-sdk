import { useEffect, useState, useRef } from 'react';
import {
  YorkieProvider,
  DocumentProvider,
  useDocument,
} from '@yorkie-js/react';
import Cursor from './components/Cursor';
import CursorSelections from './components/CursorSelections';
import './App.css';

// Generate a visually distinctive random color (pastel-ish for good contrast on white)
function generateRandomColor() {
  // HSL to hex conversion for consistent vivid colors
  const h = Math.floor(Math.random() * 360); // full hue range
  const s = 70; // saturation percentage
  const l = 55; // lightness percentage
  const toHex = (v) => v.toString(16).padStart(2, '0');
  // Convert HSL to RGB
  const c = (1 - Math.abs((2 * l) / 100 - 1)) * (s / 100);
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l / 100 - c / 2;
  let r1, g1, b1;
  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// `initialPresence` is the initial cursor state for each user.
const initialPresence = {
  cursorShape: 'cursor',
  cursor: { xPos: 0, yPos: 0 },
  pointerDown: false,
  // Assign a per-user random color (same value is used for both cursor stroke + pen drawing)
  color: generateRandomColor(),
  fadeEnabled: false,
  overInteractive: false,
};

// `pixcelThreshold` is the minimum distance to consider a cursor movement.
const pixcelThreshold = 2;

function CursorsCanvas() {
  const { doc, presences, update, loading, error } = useDocument();
  const [fadeEnabled, setFadeEnabled] = useState(false);
  const [color, setColor] = useState(initialPresence.color);
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
      // Keep local color state in sync if presence color updated elsewhere
      setColor(myPresence.color ?? initialPresence.color);
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
