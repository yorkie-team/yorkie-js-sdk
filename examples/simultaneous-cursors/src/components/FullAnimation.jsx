import { useState } from 'react';
import SingleAnimation from './SingleAnimation';
import useInterval from '../hooks/useInterval';

const FullAnimation = ({ pointerDown, xPos, yPos, selectedCursorShape }) => {
  const [singleAnimationsArray, setSingleAnimationsArray] = useState([]);

  const animationBubbleRate = 100;

  useInterval(() => {
    setSingleAnimationsArray((singleAnimationsArray) =>
      singleAnimationsArray.filter(
        (animation) => animation.timestamp > Date.now() - 4000,
      ),
    );
  }, 1000);

  useInterval(() => {
    if (pointerDown) {
      setSingleAnimationsArray((singleAnimationsArray) =>
        singleAnimationsArray.concat([
          {
            point: { x: xPos, y: yPos },
            timestamp: Date.now(),
          },
        ]),
      );
    }
  }, animationBubbleRate);

  return (
    <div
      style={{
        transform: `translateX(${xPos}px) translateY(${yPos}px)`,
      }}
    >
      {singleAnimationsArray.map((animation) => {
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
