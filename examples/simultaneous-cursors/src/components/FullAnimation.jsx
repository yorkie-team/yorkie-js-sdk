import { useEffect, useState } from 'react';
import SingleAnimation from './SingleAnimation';
import useInterval from '../hooks/useInterval';

const FullAnimation = ({ pointerDown, xPos, yPos, selectedCursorShape }) => {
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
    if (pointerDown) {
      setSingleAnimation((singleAnimation) =>
        singleAnimation.concat([
          {
            point: { x: xPos, y: yPos },
            timestamp: Date.now(),
          },
        ]),
      );
    }
  }, bubbleRate);

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
