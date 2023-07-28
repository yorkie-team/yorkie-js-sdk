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
  const [otherClients, setOtherClients] = useState([]);
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
          if (event.type !== DocEventType.PresenceChanged) {
            setClients(doc.getPresences());
            setOtherClients(doc.getPresences());
            console.log('doc.getPresences() -------- ');
            console.log(client.getID());
          }
        });
        doc.subscribe('my-presence', (event) => {
          console.log('my-presence ---------- ', event.type);
          if (event.type === DocEventType.Initialized) {
            console.log('doc.getPresences() -------- ', doc.getPresences());
            console.log(client.getID());
          }
        });
        doc.subscribe('others', (event) => {
          console.log('others ---------- ', event.type);
          if (
            event.type === DocEventType.Watched ||
            event.type === DocEventType.Unwatched
          ) {
            setOtherClients(doc.getPresences());
            setClients(doc.getPresences());
            console.log(doc.getPresences());
            console.log(client.getID());
          }
        });

        await client.attach(doc, {
          initialPresence: {
            cursorShape: 'cursor',
          },
        });

        console.log(' ------- print marker 1');

        window.addEventListener('beforeunload', () => {
          // client.detach(doc);
          client.deactivate();
        });
        console.log(' ------- print marker 2');
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
      {console.log('doc.getMyPresence() ------- ', doc.getMyPresence())}
      {/* {otherClients.map(user => 
        {return user.clientID !== client.getID() ?  <Cursor cursorShape={user.cursorShape} x={user.x} y={user.y} /> : <></> }
      )} */}
      <Cursor
        selectedCursorShape={selectedCursorShape}
        x={mousePos.x}
        y={mousePos.y}
      />
      {otherClients.map((user) => (
        <p>
          {user.xPos} {user.yPos}
        </p>
      ))}
      <div>{otherClients.length}</div>
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
