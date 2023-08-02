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
        cursorShape: cursorShape,
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
            pointerDown: false,
          },
        },
      });

      window.addEventListener('beforeunload', () => {
        client.deactivate();
      });
    };

    setup();

    const handlePointerUp = () => {
      console.log('handlePointerUp called 😁');
      doc.update((root, presence) => {
        const prevCursor = doc.getMyPresence().cursor;
        presence.set({
          cursor: {
            ...prevCursor,
            pointerDown: false,
          },
        });
      });
    };
    const handlePointerDown = () => {
      doc.update((root, presence) => {
        const prevCursor = doc.getMyPresence().cursor;
        presence.set({
          cursor: {
            ...prevCursor,
            pointerDown: true,
          },
        });
      });
    };
    const handleMouseMove = (event) => {
      doc.update((root, presence) => {
        const prevCursor = doc.getMyPresence().cursor;
        presence.set({
          cursor: {
            ...prevCursor, // 위에 있는 as well      like here,    use spread operator, not copying in local state variables also try to think, why is the Yorkie state and local state different,    as well as then which one to use     maybe, only update Yorkie, then use that yorkie data to update local? so putting priority on Yorkie data over local data, i.e. local data Follows Yorkie data
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
      {clients.map(({ presence }) => {
        return (
          <Cursor
            selectedCursorShape={presence.cursorShape}
            x={presence.cursor.xPos}
            y={presence.cursor.yPos}
            pointerDown={presence.cursor.pointerDown}
          />
        );
      })}

      <CursorSelections
        handleCursorShapeSelect={handleCursorShapeSelect}
        clients={clients}
      />
    </div>
  );
};

export default App;
