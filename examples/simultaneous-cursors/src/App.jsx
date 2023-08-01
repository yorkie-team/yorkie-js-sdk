import { useEffect, useRef, useState, useCallback } from 'react';
import './App.css';

import yorkie, { DocEventType } from 'yorkie-js-sdk';
import Cursor from './components/Cursor';
import CursorSelections from './components/CursorSelections';

import FlyingReaction from './components/FlyingReaction';
import ReactionSelector from './components/ReactionSelector';
import useInterval from './hooks/useInterval';
import './index.css';
import Animations from './components/Animations';

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
              pointerDown: false,
              pointerUp: true
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
            // pointerDown: pointerDown,
            // pointerUp: pointerUp
          },
        });
      });
    };
    window.addEventListener('mousemove', handleMouseMove);

    const handlePointerDown = () => {
      setPointerDown(true)
      setPointerUp(false)

      doc.update((root, presence) => {
        presence.set({
          cursor: {
            pointerDown: true,
            pointerUp: false
          },
        });
      });
    }
    window.addEventListener('mousedown', handlePointerDown);

    const handlePointerUp = () => {
      setPointerDown(false)
      setPointerUp(true)

      doc.update((root, presence) => {
        presence.set({
          cursor: {
            pointerDown: false,
            pointerUp: true
          },
        });
      });
    }
    window.addEventListener('mouseup', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('mouseup', handlePointerDown);
    };
  }, []);

  // ----------------------------------------------------------------------------- heart & thumbs animation code

  // const [state, setState] = useState({ mode: CursorMode.Reaction });
  // const [reactions, setReactions] = useState([]);

  // const bubbleRate = 100;

  // // Remove reactions that are not visible anymore (every 1 sec)
  // useInterval(() => {
  //   setReactions((reactions) =>
  //     reactions.filter((reaction) => reaction.timestamp > Date.now() - 4000),
  //   );
  // }, 1000);

  // useInterval(() => {
  //   if (state.mode === CursorMode.Reaction && state.isPressed) {
  //     setReactions((reactions) =>
  //       reactions.concat([
  //         {
  //           point: { x: cursor.x, y: cursor.y },
  //           value: state.reaction,
  //           timestamp: Date.now(),
  //         },
  //       ]),
  //     );
  //   }
  // }, bubbleRate);

  // const [cursor, setCursor] = useState({ x: 0, y: 0 });

  // useEffect(() => {
  //   // function onKeyUp(e) {
  //   //   if (e.key === '/') {
  //   //     setState({ mode: CursorMode.Chat, previousMessage: null, message: '' });
  //   //   } else if (e.key === 'Escape') {
  //   //     // updateMyPresence({ message: "" });
  //   //     setState({ mode: CursorMode.Hidden });
  //   //   } else if (e.key === 'e') {
  //   //     setState({ mode: CursorMode.ReactionSelector });
  //   //   }
  //   // }

  //   // window.addEventListener('keyup', onKeyUp);

  //   // function onKeyDown(e) {
  //   //   if (e.key === '/') {
  //   //     e.preventDefault();
  //   //   }
  //   // }

  //   // window.addEventListener('keydown', onKeyDown);

  //   const handleMouseMove = (event) => {
  //     const { clientX, clientY } = event;
  //     const newCursor = { ...cursor, x: clientX, y: clientY };
  //     setCursor(newCursor);
  //   };

  //   document.addEventListener('mousemove', handleMouseMove, false);

  //   return () => {
  //     // window.removeEventListener('keyup', onKeyUp);
  //     // window.removeEventListener('keydown', onKeyDown);
  //     window.removeEventListener('mousemove', handleMouseMove);
  //   };
  // }, []);
















  return (
    <div
      className="general-container"
      onPointerDown={() => {
        // setState((state) =>
        //   state.mode === CursorMode.Reaction
        //     ? { ...state, isPressed: true }
        //     : state,
        // );



        // setPointerDown(true)
        // setPointerUp(false)

        // doc.update((root, presence) => {
        //   presence.set({
        //     cursor: {
        //       pointerDown: true,
        //       pointerUp: false
        //     },
        //   });
        // });

      }}
      onPointerUp={() => {
        // setState((state) =>
        //   state.mode === CursorMode.Reaction
        //     ? { ...state, isPressed: false }
        //     : state,
        // );



        // setPointerDown(false)
        // setPointerUp(true)
        // doc.update((root, presence) => {
        //   presence.set({
        //     cursor: {
        //       pointerDown: false,
        //       pointerUp: true
        //     },
        //   });
        // });



      }}
    >
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

      {/* <div
          className="c76"
          id="reaction-container"
          style={{
            transform: `translateX(${cursor.x}px) translateY(${cursor.y}px)`,
          }}
        >
          {reactions.map((reaction) => {
            {console.log('reactions.length ------------- ', reactions.length)}
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
        </div> */}

      {/* <Animations pointerDown={true} pointerUp={false} xPos={mousePos.x} yPos={mousePos.y} selectedCursorShape={selectedCursorShape} /> */}

    </div>
  );
};

export default App;
