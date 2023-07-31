import { useEffect, useRef, useState, useCallback } from 'react';
import './App.css';

import yorkie, { DocEventType } from 'yorkie-js-sdk';
import Cursor from './components/Cursor';
import CursorSelections from './components/CursorSelections';

import FlyingReaction from './components/FlyingReaction';
import ReactionSelector from './components/ReactionSelector';
import useInterval from './hooks/useInterval';
import './index.css';

const client = new yorkie.Client(import.meta.env.VITE_YORKIE_API_ADDR, {
  apiKey: import.meta.env.VITE_YORKIE_API_KEY,
});
// const client = new yorkie.Client('https://api.yorkie.dev', {
//   apiKey: 'cinr4o2bjhd62lidlji0',
// });

const doc = new yorkie.Document('vitecursortask');

var CursorMode;
(function (CursorMode) {
  CursorMode[(CursorMode['Hidden'] = 0)] = 'Hidden';
  CursorMode[(CursorMode['Chat'] = 1)] = 'Chat';
  CursorMode[(CursorMode['ReactionSelector'] = 2)] = 'ReactionSelector';
  CursorMode[(CursorMode['Reaction'] = 3)] = 'Reaction';
})(CursorMode || (CursorMode = {}));

const App = () => {
  // ----------------------------------------------------------------------------- prescence & base cursor functionalities code

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
            },
          },
        });

        window.addEventListener('beforeunload', () => {
          // client.detach(doc);
          client.deactivate();
        });
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

  // ----------------------------------------------------------------------------- heart & thumbs animation code

  const [state, setState] = useState({ mode: CursorMode.Reaction });
  const [reactions, setReactions] = useState([]);

  const bubbleRate = 100;

  // Remove reactions that are not visible anymore (every 1 sec)
  useInterval(() => {
    setReactions((reactions) =>
      reactions.filter((reaction) => reaction.timestamp > Date.now() - 4000),
    );
  }, 1000);

  useInterval(() => {
    console.log('working');
    console.log('state.isPressed ----  ', state.isPressed);
    if (state.mode === CursorMode.Reaction && state.isPressed) {
      setReactions((reactions) =>
        reactions.concat([
          {
            point: { x: cursor.x, y: cursor.y },
            value: state.reaction,
            timestamp: Date.now(),
          },
        ]),
      );
    }
  }, bubbleRate);

  const [cursor, setCursor] = useState({ x: 0, y: 0 });

  useEffect(() => {
    function onKeyUp(e) {
      if (e.key === '/') {
        setState({ mode: CursorMode.Chat, previousMessage: null, message: '' });
      } else if (e.key === 'Escape') {
        // updateMyPresence({ message: "" });
        setState({ mode: CursorMode.Hidden });
      } else if (e.key === 'e') {
        setState({ mode: CursorMode.ReactionSelector });
      }
    }

    window.addEventListener('keyup', onKeyUp);

    function onKeyDown(e) {
      if (e.key === '/') {
        e.preventDefault();
      }
    }

    window.addEventListener('keydown', onKeyDown);

    const handleMouseMove = (event) => {
      const { clientX, clientY } = event;
      const newCursor = { ...cursor, x: clientX, y: clientY };
      setCursor(newCursor);
    };

    document.addEventListener('mousemove', handleMouseMove, false);

    return () => {
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <div
      className="general-container"
      onPointerDown={() => {
        console.log('downnnn');
        setState((state) =>
          state.mode === CursorMode.Reaction
            ? { ...state, isPressed: true }
            : state,
        );
      }}
      onPointerUp={() => {
        console.log('uppppp');
        setState((state) =>
          state.mode === CursorMode.Reaction
            ? { ...state, isPressed: false }
            : state,
        );
      }}
    >
      {/* simultaneous cursors display code & pen cursor display code  */}
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
      <CursorSelections
        handleCursorShapeSelect={handleCursorShapeSelect}
        selectedCursorShape={selectedCursorShape}
        clients={clients}
      />
      {/* bubbling animation code */}
      {cursor && (
        <div
          className="c76"
          id="reaction-container"
          style={{
            transform: `translateX(${cursor.x}px) translateY(${cursor.y}px)`,
          }}
        >
          {reactions.map((reaction) => {
            return (
              <FlyingReaction
                key={reaction.timestamp.toString()}
                x={reaction.point.x}
                y={reaction.point.y}
                timestamp={reaction.timestamp}
                selectedCursorShape={selectedCursorShape}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default App;
