import { useEffect, useRef, useState } from 'react';
import './App.css';

import yorkie, { DocEventType } from 'yorkie-js-sdk';
import Cursor from './components/Cursor';
import CursorSelections from './components/CursorSelections';

const client = new yorkie.Client(import.meta.env.VITE_YORKIE_API_ADDR, {
  apiKey: import.meta.env.VITE_YORKIE_API_KEY,
});
// const client = new yorkie.Client('https://api.yorkie.dev', {
//   apiKey: 'cinr4o2bjhd62lidlji0',
// });

const doc = new yorkie.Document('vitecursortask');

const App = () => {
  const cursorRef = useRef(null);
  const [mousePos, setMousePos] = useState({});

  const [clients, setClients] = useState([]);
  const [currClient, setCurrClient] = useState('');
  const [selectedCursorShape, setSelectedCursorShape] = useState('cursor');

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
      try {
        await client.activate();

        doc.subscribe('presence', (event) => {
          // console.log('prescence ---------- ', event.type);
          // console.log(doc.getPresences())
          setClients(doc.getPresences());
          if (event.type !== DocEventType.PresenceChanged) {
            setClients(doc.getPresences());
            // console.log(doc.getPresences())
          }
        });
        doc.subscribe('my-presence', (event) => {
          setClients(doc.getPresences());
          // console.log('my-presence ---------- ', event.type);
          if (event.type === DocEventType.Initialized) {
            setClients(doc.getPresences());
            // console.log('doc.getPresences() -------- ', doc.getPresences());
          }
        });
        doc.subscribe('others', (event) => {
          setClients(doc.getPresences());
          // console.log('others ---------- ', event.type);
          // console.log(doc.getPresences())
          if (
            event.type === DocEventType.Watched ||
            event.type === DocEventType.Unwatched
          ) {
            setClients(doc.getPresences());
            // console.log(doc.getPresences())
          }
        });

        await client.attach(doc, {
          initialPresence: {
            cursorShape: 'cursor',
            cursor: {
              xPos: 0,
              yPos: 0,
            },
          },
        });

        // console.log(' ------- print marker 1');

        window.addEventListener('beforeunload', () => {
          // client.detach(doc);
          client.deactivate();
        });
        // console.log(' ------- print marker 2');
      } catch (error) {
        console.log(
          ' ------------------------------------------------------ error',
          error,
        );
        console.log(
          ' ------------------------------------------------------ error',
          error.message,
        );
      }
    };

    setup();

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

    window.addEventListener('mousemove', handleMouseMove);

    // what was this code here again? - ask GPT
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <div className="general-container">
      {/* {console.log('doc.getMyPresence() ------- ', doc.getMyPresence())} */}
      {/* {console.log('doc.getPresences() -------- ', doc.getPresences())} */}
      {/* {console.log(clients)} */}
      {doc.getPresences().map((user) => {
        return user.clientID !== client.getID() ? (
          <Cursor
            selectedCursorShape={user.presence.cursorShape}
            x={user.presence.cursor.xPos}
            y={user.presence.cursor.yPos}
          />
        ) : (
          <></>
        );
      })}
      {/* {doc.getPresences().map(user => 
        {console.log(user.clientID === client.getID(), user.presence.cursor.xPos, user.presence.cursor.yPos, user.presence.cursorShape)}
        // , user.presence.cursor.yPos, user.presence.cursorShape
      )} */}
      <Cursor
        selectedCursorShape={selectedCursorShape}
        x={mousePos.x}
        y={mousePos.y}
      />
      {clients.map((user) => (
        <p>
          {user.xPos} {user.yPos}
        </p>
      ))}
      <div>{clients.length}</div>
      The mouse is at position{' '}
      <b>
        ({mousePos.x}, {mousePos.y})
      </b>
      <b> ------ clients.length {clients.length}</b>
      <b> ------ clients.length {currClient}</b>
      <CursorSelections
        handleCursorShapeSelect={handleCursorShapeSelect}
        selectedCursorShape={selectedCursorShape}
        clients={clients}
      />
    </div>
  );
};

export default App;
