import { useEffect, useRef, useState } from 'react';
import './App.css';

import yorkie from 'yorkie-js-sdk';
import Cursor from './components/Cursor';
import CursorSelections from './components/CursorSelections';

const client = new yorkie.Client('https://api.yorkie.dev', {
  apiKey: 'cinr4o2bjhd62lidlji0',
  presence: {
    name: '',
    color: '',
  },
});

const doc = new yorkie.Document('simult-cursors'); // some work some don't

function App() {
  const cursorRef = useRef(null);

  const [mousePos, setMousePos] = useState({});

  const [clients, setClients] = useState([]);

  const [currClient, setCurrClient] = useState('');

  const [otherClients, setOtherClients] = useState([]);

  const [selectedCursorShape, setSelectedCursorShape] = useState('cursor');

  const handleCursorShapeSelect = async (cursorShape) => {
    setSelectedCursorShape(cursorShape);

    doc.update((root) => {
      const clientIdx = root.users.findIndex((obj) => {
        return obj.clientID === client.getID();
      });

      if (clientIdx !== -1) {
        root.users[clientIdx].cursorShape = cursorShape;
      }
    });
  };

  useEffect(() => {
    const setup = async () => {
      await client.activate();

      client.subscribe((event) => {
        console.log(event.type, ' ------------- ');

        if (event.type === 'peers-changed') {
          setClients(client.getPeersByDocKey(doc.getKey()));

          const getCommonValuesByProperty = (array1, array2, property) => {
            return array1.filter((item1) =>
              array2.some((item2) => item2[property] === item1[property]),
            );
          };

          doc.update((root) => {
            root.users = getCommonValuesByProperty(
              root.users,
              client.getPeersByDocKey(doc.getKey()),
              'clientID',
            );
          });
        }

        if (event.type === 'documents-changed') {
          doc.update((root) => {
            setOtherClients(root.users);
          });
        }
      });

      setCurrClient(client.getID());

      await client.attach(doc);

      doc.subscribe((event) => {
        if (event.type === 'remote-change') {
          doc.update((root) => {
            setOtherClients(root.users);
          });
        }
      });

      window.addEventListener('beforeunload', () => {
        client.deactivate();
      });
    };

    setup();

    const handleMouseMove = (event) => {
      setMousePos({ x: event.clientX, y: event.clientY });

      doc.update((root) => {
        root.users = [];
        console.log(root.users, ' ------------- root.users');

        const clientIdx = root.users.findIndex((obj) => {
          return obj.clientID === client.getID();
        });

        if (clientIdx !== -1) {
          root.users[clientIdx].xPos = event.clientX;
          root.users[clientIdx].yPos = event.clientY;
        } else {
          root.users.push({
            clientID: client.getID(),
            xPos: event.clientX,
            yPos: event.clientY,
          });
        }
      });
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <div>
      {otherClients.map((user) => {
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
      <b> ------ clients.length {currClient}</b>
      {/* <CursorSelections handleCursorShapeSelect={handleCursorShapeSelect} clients={client} /> */}
      <div className="cursor-selector-container">
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
      </div>
    </div>
  );
}

export default App;
