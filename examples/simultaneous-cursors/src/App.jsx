import { useEffect, useRef, useState, useCallback } from 'react';
import yorkie, { DocEventType } from 'yorkie-js-sdk';
import Cursor from './components/Cursor';
import CursorSelections from './components/CursorSelections';
import './App.css';

const client = new yorkie.Client(import.meta.env.VITE_YORKIE_API_ADDR, {
  apiKey: import.meta.env.VITE_YORKIE_API_KEY,
});

const doc = new yorkie.Document('vitecursortask');

const App = () => {
  const [clients, setClients] = useState([]);

  const handleCursorShapeSelect = (cursorShape) => {
    doc.update((root, presence) => {
      presence.set({
        cursorShape,
      });
    });
  };

  useEffect(() => {
    const setup = async () => {
      await client.activate();

      doc.subscribe('presence', (event) => {
        setClients(doc.getPresences());
      });

      await client.attach(doc, {
        initialPresence: {
          cursorShape: 'cursor',
          cursor: {
            xPos: 0,
            yPos: 0,
          },
          pointerDown: false,
        },
      });

      window.addEventListener('beforeunload', () => {
        client.deactivate();
      });
    };

    setup();

    const handlePointerUp = () => {
      doc.update((root, presence) => {
        presence.set({
          pointerDown: false,
        });
      });
    };
    const handlePointerDown = () => {
      doc.update((root, presence) => {
        presence.set({
          pointerDown: true,
        });
      });
    };
    const handleMouseMove = (event) => {
      doc.update((root, presence) => {
        presence.set({
          cursor: {
            xPos: event.clientX,
            yPos: event.clientY,
          },
        });
      });
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <div className="general-container">
      {clients.map(({ presence: { cursorShape, cursor, pointerDown } }, index) => {
        return (
          <Cursor
            selectedCursorShape={cursorShape}
            x={cursor.xPos}
            y={cursor.yPos}
            pointerDown={pointerDown}
            key={index}
          />
        );
      })}

      <CursorSelections
        handleCursorShapeSelect={handleCursorShapeSelect}
        clientsLength={clients.length}
      />
    </div>
  );
};

export default App;
