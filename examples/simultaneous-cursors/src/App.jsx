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

const App = () => {
  const [clients, setClients] = useState([]);

  const handleCursorShapeSelect = (cursorShape) => {
    doc.update((_, presence) => {
      presence.set({ cursorShape });
    });
  };

  useEffect(() => {
    // Define handlers here so cleanup can reference them
    const handlePointerDown = () => {
      doc.update((_, presence) => {
        presence.set({ pointerDown: true });
      });
    };
    const handlePointerUp = () => {
      doc.update((_, presence) => {
        presence.set({ pointerDown: false });
      });
    };
    const handleMouseMove = (event) => {
      doc.update((_, presence) => {
        presence.set({
          cursor: { xPos: event.clientX, yPos: event.clientY },
        });
      });
    };

    const setup = async () => {
      try {
        // 1) Activate client to get a valid actor ID
        await client.activate();

        // 2) Attach document with initial presence under that actor ID
        await client.attach(doc, {
          initialPresence: {
            cursorShape: 'cursor',
            cursor: { xPos: 0, yPos: 0 },
            pointerDown: false,
          },
        });

        // 3) Subscribe to presence changes
        doc.subscribe('presence', () => {
          setClients(doc.getPresences());
        });

        // 4) Now that actor ID is valid, register window event listeners
        window.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('mouseup', handlePointerUp);
        window.addEventListener('mousemove', handleMouseMove);
      } catch (err) {
        console.error('Yorkie setup failed:', err);
      }
    };

    setup();

    return () => {
      // Cleanup event listeners and subscription
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('mousemove', handleMouseMove);
      doc.unsubscribe(); // optional: unsubscribes all handlers
    };
  }, []);

  return (
    <div className="general-container">
      {clients.map(
        ({ clientID, presence: { cursorShape, cursor, pointerDown } }) =>
          cursor && (
            <Cursor
              key={clientID}
              selectedCursorShape={cursorShape}
              x={cursor.xPos}
              y={cursor.yPos}
              pointerDown={pointerDown}
            />
          ),
      )}
      <CursorSelections
        handleCursorShapeSelect={handleCursorShapeSelect}
        clientsLength={clients.length}
      />
    </div>
  );
};

export default App;
