import { useEffect, useState } from 'react';
import SingleAnimation from './SingleAnimation';
import useInterval from '../hooks/useInterval';

var CursorMode;
(function (CursorMode) {
  CursorMode[(CursorMode['Hidden'] = 0)] = 'Hidden';
  CursorMode[(CursorMode['Chat'] = 1)] = 'Chat';
  CursorMode[(CursorMode['ReactionSelector'] = 2)] = 'ReactionSelector';
  CursorMode[(CursorMode['Reaction'] = 3)] = 'Reaction';
})(CursorMode || (CursorMode = {}));

const FullAnimation = ({
  pointerDown,
  pointerUp,
  xPos,
  yPos,
  selectedCursorShape,
}) => {
  const [state, setState] = useState({ mode: CursorMode.Reaction });
  const [singleAnimation, setSingleAnimation] = useState([]);

  const bubbleRate = 100;

  // Remove singleAnimation not visible anymore (every 1 sec)
  useInterval(() => {
    setSingleAnimation((singleAnimation) =>
      singleAnimation.filter(
        (animation) => animation.timestamp > Date.now() - 4000,
      ),
    );
  }, 1000);

  useInterval(() => {
    if (state.mode === CursorMode.Reaction && state.isPressed) {
      setSingleAnimation((singleAnimation) =>
        singleAnimation.concat([
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
      style={{
        transform: `translateX(${xPos}px) translateY(${yPos}px)`,
      }}
    >
      {singleAnimation.map((animation) => {
        return (
          <SingleAnimation
            key={animation.timestamp.toString()}
            x={animation.point.x}
            y={animation.point.y}
            timestamp={animation.timestamp}
            selectedCursorShape={selectedCursorShape}
          />
        );
      })}
    </div>
  );
};

export default FullAnimation;
