


var CursorMode;
(function (CursorMode) {
  CursorMode[(CursorMode['Hidden'] = 0)] = 'Hidden';
  CursorMode[(CursorMode['Chat'] = 1)] = 'Chat';
  CursorMode[(CursorMode['ReactionSelector'] = 2)] = 'ReactionSelector';
  CursorMode[(CursorMode['Reaction'] = 3)] = 'Reaction';
})(CursorMode || (CursorMode = {}));

const Example = ({ bubbleRate, selectedCursorShape }) => {
  const [state, setState] = useState({ mode: CursorMode.Hidden });
  const [reactions, setReactions] = useState([]);

  useInterval(() => {
    setReactions((reactions) =>
      reactions.filter((reaction) => reaction.timestamp > Date.now() - 4000),
    );
  }, 1000);

  useInterval(() => {
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
        setState({ mode: CursorMode.Hidden });
      } else if (e.key === 'e') {
        console.log('wutup');
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
    <>
      <div
        className="c5"
        onPointerDown={() => {
          setState((state) =>
            state.mode === CursorMode.Reaction
              ? { ...state, isPressed: true }
              : state,
          );
        }}
        onPointerUp={() => {
          setState((state) =>
            state.mode === CursorMode.Reaction
              ? { ...state, isPressed: false }
              : state,
          );
        }}
      >
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

        {/* {state.mode === CursorMode.ReactionSelector && (
          <ReactionSelector
            setReaction={(reaction) => {
              setReaction(reaction);
            }}
          />
        )} */}

        {cursor && (
          <div
            className="c1"
            style={{
              transform: `translateX(${cursor.x}px) translateY(${cursor.y}px)`,
            }}
          >
            {/* 이거는 cursor 따라다니는 emoji  */}
            {state.mode === CursorMode.Reaction && (
              <div className="c4">{state.reaction}</div>
            )}

            {/* 이 div 안에서 this happening takes place,   and this div is   tracks the x y movement */}

            {state.mode === CursorMode.Chat && (
              <>
                <div
                  className="c2"
                  onKeyUp={(e) => e.stopPropagation()}
                  style={{
                    borderRadius: 20,
                  }}
                >
                  {state.previousMessage && <div>{state.previousMessage}</div>}
                  <input
                    className="c3"
                    autoFocus={true}
                    onChange={(e) => {
                      setState({
                        mode: CursorMode.Chat,
                        previousMessage: null,
                        message: e.target.value,
                      });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setState({
                          mode: CursorMode.Chat,
                          previousMessage: state.message,
                          message: '',
                        });
                      } else if (e.key === 'Escape') {
                        setState({
                          mode: CursorMode.Hidden,
                        });
                      }
                    }}
                    placeholder={state.previousMessage ? '' : 'Say something…'}
                    value={state.message}
                    maxLength={50}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
};



