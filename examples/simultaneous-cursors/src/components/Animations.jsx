import { useEffect, useState } from 'react';
import SingleAnimation from './SingleAnimation';
import useInterval from '../hooks/useInterval';
import '../index.css';
import '../App.css';

var CursorMode;
(function (CursorMode) {
  CursorMode[(CursorMode['Hidden'] = 0)] = 'Hidden';
  CursorMode[(CursorMode['Chat'] = 1)] = 'Chat';
  CursorMode[(CursorMode['ReactionSelector'] = 2)] = 'ReactionSelector';
  CursorMode[(CursorMode['Reaction'] = 3)] = 'Reaction';
})(CursorMode || (CursorMode = {}));

const Animations = ({
  pointerDown,
  pointerUp,
  xPos,
  yPos,
  selectedCursorShape,
}) => {
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
    if (state.mode === CursorMode.Reaction && state.isPressed) {
      setReactions((reactions) =>
        reactions.concat([
          {
            point: { x: xPos, y: yPos },
            value: state.reaction,
            timestamp: Date.now(),
          },
        ]),
      );
    }
  }, bubbleRate);

  useEffect(() => {
    if (pointerDown) {
      setState((state) =>
        state.mode === CursorMode.Reaction
          ? { ...state, isPressed: true }
          : state,
      );
    }

    if (pointerUp) {
      setState((state) =>
        state.mode === CursorMode.Reaction
          ? { ...state, isPressed: false }
          : state,
      );
    }
  }, [pointerDown, pointerUp]);

  return (
    <div
    //   id="reaction-container"
      style={{
        transform: `translateX(${xPos}px) translateY(${yPos}px)`,
      }}
    >
      {reactions.map((reaction) => {
        return (
          <SingleAnimation
            key={reaction.timestamp.toString()}
            x={reaction.point.x}
            y={reaction.point.y}
            timestamp={reaction.timestamp}
            selectedCursorShape={selectedCursorShape}
          />
        );
      })}
    </div>
  );
};

export default Animations;
