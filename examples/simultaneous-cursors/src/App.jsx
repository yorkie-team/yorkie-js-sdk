import { useEffect, useRef, useState } from 'react';
import './App.css';

import yorkie, { DocEventType } from 'yorkie-js-sdk';
import Cursor from './components/Cursor';
import CursorSelections from './components/CursorSelections';

// const client = new yorkie.Client(import.meta.env.VITE_YORKIE_API_ADDR, {
//   apiKey: import.meta.env.VITE_YORKIE_API_KEY,
// });
// const client = new yorkie.Client('https://api.yorkie.dev', {
//   apiKey: 'cinr4o2bjhd62lidlji0',
// });

// const doc = new yorkie.Document('test');

function App() {
  const cursorRef = useRef(null);

  const [mousePos, setMousePos] = useState({});

  const [clients, setClients] = useState([]);

  const [currClient, setCurrClient] = useState('');

  const [otherClients, setOtherClients] = useState([]);

  const [selectedCursorShape, setSelectedCursorShape] = useState('cursor');

  // const handleCursorShapeSelect = async (cursorShape) => {
  //   setSelectedCursorShape(cursorShape);

  //   doc.update((root) => {
  //     const clientIdx = root.users.findIndex((obj) => {
  //       return obj.clientID === client.getID();
  //     });

  //     if (clientIdx !== -1) {
  //       root.users[clientIdx].cursorShape = cursorShape;
  //     }
  //   });
  // };

  useEffect(() => {
    const setup = async () => {
      try {
        const client = new yorkie.Client('https://api.yorkie.dev', {
          apiKey: 'cinr4o2bjhd62lidlji0',
        });

        await client.activate();

        const doc = new yorkie.Document('test');

        // doc.subscribe('presence', (event) => {
        //   if (event.type !== DocEventType.PresenceChanged) {
        //     setClients(doc.getPresences());
        //     setOtherClients(doc.getPresences());
        //     // console.log('doc.getPresences() -------- ', );
        //     // console.log(client.getID());
        //   }
        // });
        // doc.subscribe('my-presence', (event) => {
        //   console.log('my-presence ---------- ', event.type);
        //   if (event.type === DocEventType.Initialized) {
        //     console.log('doc.getPresences() -------- ', doc.getPresences());
        //     console.log(client.getID());
        //   }
        // });

        // doc.subscribe('others', (event) => {
        //   console.log('others ---------- ', event.type);
        //   if (
        //     event.type === DocEventType.Watched ||
        //     event.type === DocEventType.Unwatched
        //   ) {
        //     setOtherClients(doc.getPresences());
        //     setClients(doc.getPresences());
        //     console.log(doc.getPresences());
        //     console.log(client.getID());
        //   }
        // });

        await client.attach(doc, {
          initialPresence: {
            name: '',
            color: '',
          },
        });

        console.log(' ------- print marker 1');

        window.addEventListener('beforeunload', () => {
          // client.detach(doc);
          client.deactivate();
        });
        console.log(' ------- print marker 2');
      } catch (error) {
        console.log(' --------- error', error);
        console.log(' --------- error', error.message);
      }
    };

    setup();

    // const handleMouseMove = (event) => {
    //   setMousePos({ x: event.clientX, y: event.clientY });

    //   doc.update((root) => {
    //     root.users = [];
    //     // console.log(root.users, ' ------------- root.users');

    //     const clientIdx = root.users.findIndex((obj) => {
    //       return obj.clientID === client.getID();
    //     });

    //     if (clientIdx !== -1) {
    //       root.users[clientIdx].xPos = event.clientX;
    //       root.users[clientIdx].yPos = event.clientY;
    //     } else {
    //       root.users.push({
    //         clientID: client.getID(),
    //         xPos: event.clientX,
    //         yPos: event.clientY,
    //       });
    //     }
    //   });
    // };

    // window.addEventListener('mousemove', handleMouseMove);

    // return () => {
    //   window.removeEventListener('mousemove', handleMouseMove);
    // };
  }, []);

  return (
    <div>
      {/* {otherClients.map((user) => {
        return user.clientID !== client.getID() ? (
          <Cursor cursorShape={user.cursorShape} x={user.x} y={user.y} />
        ) : (
          <></>
        );
      })}
      <Cursor cursorShape={selectedCursorShape} x={mousePos.x} y={mousePos.y} />
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
      <b> ------ clients.length {currClient}</b> */}
      {/* <CursorSelections handleCursorShapeSelect={handleCursorShapeSelect} clients={client} /> */}
      {/* <div className="cursor-selector-container">
        <div className="cursor-selections-container">
          <img
            onClick={() => handleCursorShapeSelect('heart')}
            className={
              selectedCursorShape === 'heart'
                ? 'cursor-shape-selected'
                : 'cursor-shape-not-selected'
            }
            src="src/assets/icons/icon_heart.svg"
          />
          <img
            onClick={() => handleCursorShapeSelect('thumbs')}
            className={
              selectedCursorShape === 'thumbs'
                ? 'cursor-shape-selected'
                : 'cursor-shape-not-selected'
            }
            src="src/assets/icons/icon_thumbs.svg"
          />
          <img
            onClick={() => handleCursorShapeSelect('pen')}
            className={
              selectedCursorShape === 'pen'
                ? 'cursor-shape-selected'
                : 'cursor-shape-not-selected'
            }
            src="src/assets/icons/icon_pen.svg"
          />
          <img
            onClick={() => handleCursorShapeSelect('cursor')}
            className={
              selectedCursorShape === 'cursor'
                ? 'cursor-shape-selected'
                : 'cursor-shape-not-selected'
            }
            src="src/assets/icons/icon_cursor.svg"
          />
        </div>

        <div className="num-users-container">
          {clients.length !== 1 ? (
            <p>{clients.length} users are here</p>
          ) : (
            <p> 1 user here </p>
          )}
        </div>
      </div> */}
    </div>
  );
}

export default App;
