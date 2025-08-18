import { useEffect, useState } from 'react';
import {
  YorkieProvider,
  DocumentProvider,
  useDocument,
} from '@yorkie-js/react';
import Cursor from './components/Cursor';
import CursorSelections from './components/CursorSelections';
import './App.css';

const initialPresence = {
  cursorShape: 'cursor',
  cursor: { xPos: 0, yPos: 0 },
  pointerDown: false,
  color: '#000000',
  fadeEnabled: false,
  overInteractive: false,
};

function CursorsCanvas() {
  const { doc, presences, update, loading, error } = useDocument();
  const [fadeEnabled, setFadeEnabled] = useState(false);
  const [color, setColor] = useState('#000000');

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

    const onDown = () => update((_, p) => p.set({ pointerDown: true }));
    const onUp = () => update((_, p) => p.set({ pointerDown: false }));

    const interactiveSelector =
      'button, input, select, textarea, [role="button"], a, [data-native-cursor]';
    const onMove = (e) => {
      const overInteractive = !!(
        e.target.closest && e.target.closest(interactiveSelector)
      );

      update((_, p) =>
        p.set({
          cursor: { xPos: e.clientX, yPos: e.clientY },
          overInteractive,
        }),
      );
    };

    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mousemove', onMove);
    };
  }, [loading, error, update]);

  useEffect(() => {
    if (!doc) return;
    const my = doc.getMyPresence?.();
    if (my) {
      setFadeEnabled(my.fadeEnabled ?? false);
      setColor(my.color ?? '#000000');
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
      {presences.map(({ clientID, presence }) => {
        const {
          cursorShape,
          cursor,
          pointerDown,
          color: presColor = '#000000',
          fadeEnabled: presFade = false,
          overInteractive = false,
        } = presence;

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
