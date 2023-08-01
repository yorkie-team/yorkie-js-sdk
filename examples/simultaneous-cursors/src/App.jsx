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

  const [pointerDown, setPointerDown] = useState(false);
  const [pointerUp, setPointerUp] = useState(true);

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
        if (event.type !== DocEventType.PresenceChanged) {
          setClients(doc.getPresences());
        }
      });
      doc.subscribe('my-presence', (event) => {
        setClients(doc.getPresences());
        if (event.type === DocEventType.Initialized) {
          setClients(doc.getPresences());
        }
      });
      doc.subscribe('others', (event) => {
        setClients(doc.getPresences());
        if (
          event.type === DocEventType.Watched ||
          event.type === DocEventType.Unwatched
        ) {
          setClients(doc.getPresences());
        }
      });

      await client.attach(doc, {
        initialPresence: {
          cursorShape: 'cursor',
          cursor: {
            xPos: 0,
            yPos: 0,
            pointerDown: false,
            pointerUp: true,
          },
        },
      });

      window.addEventListener('beforeunload', () => {
        client.deactivate();
      });
    };

    setup();

    const handlePointerUp = () => {
      setPointerDown(false);
      setPointerUp(true);

      doc.update((root, presence) => {
        presence.set({
          cursor: {
            pointerDown: false,
            pointerUp: true,
          },
        });
      });
    };
    const handlePointerDown = () => {
      setPointerDown(true);
      setPointerUp(false);

      doc.update((root, presence) => {
        presence.set({
          cursor: {
            pointerDown: true,
            pointerUp: false,
          },
        });
      });
    };
    const handleMouseMove = (event) => {
      setMousePos({ x: event.clientX, y: event.clientY });
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

  // useEffect(() => {

  //   const interval = setInterval(() => {
  // console.log(doc.getPresences())
  // console.log(pointerDown)

  //     // doc.update((root, presence) => {
  //     //   presence.set({
  //     //     cursor: {
  //     //       pointerDown: pointerDown,
  //     //       pointerUp: pointerUp,
  //     //     },
  //     //   });
  //     // });

  //     if (pointerDown === false) { // pointerUp
  //       doc.update((root, presence) => {
  //         console.log(pointerDown)
  //         presence.set({
  //           cursor: {
  //             pointerDown: pointerDown,
  //             pointerUp: pointerUp,
  //           },
  //         });
  //       });
  //     }

  //   }, 2000); // 3000 milliseconds = 3 seconds

  //   // Cleanup function to remove the interval when the component unmounts
  //   return () => {
  //     clearInterval(interval);
  //   };
  // }, []);

  return (
    <div className="general-container">
      {/* {console.log(doc.getPresences())} */}
      {/* {console.log('pointerDown --------------------------- ', pointerDown)} */}
      {doc.getPresences().map((user) => {
        return user.clientID !== client.getID() ? (
          <Cursor
            selectedCursorShape={user.presence.cursorShape}
            x={user.presence.cursor.xPos}
            y={user.presence.cursor.yPos}
            pointerDown={user.presence.cursor.pointerDown}
            pointerUp={user.presence.cursor.pointerUp}
          />
        ) : (
          <></>
        );
      })}

      <Cursor
        selectedCursorShape={selectedCursorShape}
        x={mousePos.x}
        y={mousePos.y}
        pointerDown={pointerDown}
        pointerUp={pointerUp}
      />
      {clients.map((user) => (
        <p>
          {user.xPos} {user.yPos}
        </p>
      ))}

      <CursorSelections
        handleCursorShapeSelect={handleCursorShapeSelect}
        selectedCursorShape={selectedCursorShape}
        clients={clients}
      />
    </div>
  );
};

export default App;
