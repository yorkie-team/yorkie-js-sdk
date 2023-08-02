import { useEffect, useRef, useState, useCallback } from 'react';
import yorkie, { DocEventType } from 'yorkie-js-sdk';
import Cursor from './components/Cursor';
import CursorSelections from './components/CursorSelections';
import './App.css';

const client = new yorkie.Client(import.meta.env.VITE_YORKIE_API_ADDR, {
  apiKey: import.meta.env.VITE_YORKIE_API_KEY,
});
// const client = new yorkie.Client('https://api.yorkie.dev', {
//   apiKey: 'cinr4o2bjhd62lidlji0',
// });

const doc = new yorkie.Document('vitecursortask');

const App = () => {
  const [mousePos, setMousePos] = useState({});

  const [clients, setClients] = useState([]);
  const [selectedCursorShape, setSelectedCursorShape] = useState('cursor');

  const [pointerDown, setPointerDown] = useState(false); // try to make into a single variable

  const handleCursorShapeSelect = (cursorShape) => {
    setSelectedCursorShape(cursorShape);

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
        // console.log(
        //   'prescence event --- ',
        //   event.value.presence.cursor.pointerDown,
        // ); // .type 을 안해도, 무슨 value 가 같이 오는지 보는것도 중요
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
      setPointerDown(false);

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
      // console.log('handlePointerDown called 🤢'); // ctrl cmd space
      setPointerDown(true);

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
      // console.log('pointerDown ----- 😈 ', pointerDown);
      setMousePos({ x: event.clientX, y: event.clientY });
      doc.update((root, presence) => {
        // presence.get('cursor')
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
      {doc.getPresences().map((user) => {
        return user.clientID !== client.getID() ? (
          <Cursor
            selectedCursorShape={user.presence.cursorShape}
            x={user.presence.cursor.xPos}
            y={user.presence.cursor.yPos}
            pointerDown={user.presence.cursor.pointerDown}
          />
        ) : (
          <></>
        );
      })}

      {console.log(doc.getMyPresence())}
      {doc && (
        <Cursor
          selectedCursorShape={selectedCursorShape}
          x={mousePos.x}
          y={mousePos.y}
          pointerDown={pointerDown}
        />
      )}

      <CursorSelections
        handleCursorShapeSelect={handleCursorShapeSelect}
        selectedCursorShape={selectedCursorShape}
        clients={clients}
      />
    </div>
  );
};

export default App;
