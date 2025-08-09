import { useEffect, useState } from 'react';
import yorkie from '@yorkie-js/sdk';
import Cursor from './components/Cursor';
import CursorSelections from './components/CursorSelections';
import './App.css';

const client = new yorkie.Client({
  rpcAddr: import.meta.env.VITE_YORKIE_API_ADDR,
  apiKey: import.meta.env.VITE_YORKIE_API_KEY,
});

const doc = new yorkie.Document('simultaneous-cursors', {
  enableDevtools: true,
});

export default function App() {
  const [clients, setClients]       = useState([]);
  const [fadeEnabled, setFadeEnabled] = useState(false);
  const [color,   setColor]         = useState('#000000');
  const [width,   setWidth]         = useState(6);

  const handleCursorShapeSelect = (cursorShape) => {
    setFadeEnabled(cursorShape === 'fading');
    doc.update((_, p) => p.set({ cursorShape }));
  };

  const handleColorChange = (newColor) => {
    setColor(newColor);
    doc.update((_, p) => p.set({ color: newColor }));
  };


  const handleWidthChange = (newW) => {
    setWidth(newW);
    doc.update((_, p) => p.set({ width: newW }));
  };

  useEffect(() => {
    const onDown  = () => doc.update((_, p) => p.set({ pointerDown: true  }));
    const onUp    = () => doc.update((_, p) => p.set({ pointerDown: false }));
    const onMove  = e => doc.update((_, p) =>
      p.set({ cursor: { xPos: e.clientX, yPos: e.clientY } })
    );

    async function setup() {
      await client.activate();
      await client.attach(doc, {
        initialPresence: {
          cursorShape: 'cursor',
          cursor:      { xPos:0,yPos:0 },
          pointerDown: false,
          color:       '#000000',
          width:       6,
        },
      });
      doc.subscribe('presence', () => setClients(doc.getPresences()));
      window.addEventListener('mousedown', onDown);
      window.addEventListener('mouseup',   onUp);
      window.addEventListener('mousemove', onMove);
    }
    setup().catch(console.error);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup',   onUp);
      window.removeEventListener('mousemove', onMove);
      doc.unsubscribe();
    };
  }, []);

  return (
    <div className="general-container">
      {clients.map(({ clientID, presence }) => {
        const {
          cursorShape,
          cursor,
          pointerDown,
          color: presColor = '#000000',
          width: presWidth  = 6,
        } = presence;
        return cursor && (
          <Cursor
            key={clientID}
            selectedCursorShape={cursorShape}
            x={cursor.xPos}
            y={cursor.yPos}
            pointerDown={pointerDown}
            fadeEnabled={cursorShape==='fading'}
            color={presColor}
            width={presWidth}
          />
        );
      })}

      <CursorSelections
        handleCursorShapeSelect={handleCursorShapeSelect}
        clientsLength={clients.length}
        fadeEnabled={fadeEnabled}
        onFadeToggle={() => setFadeEnabled(v => !v)}
        color={color}
        onColorChange={handleColorChange}
        width={width}
        onWidthChange={handleWidthChange}
      />
    </div>
  );
}
