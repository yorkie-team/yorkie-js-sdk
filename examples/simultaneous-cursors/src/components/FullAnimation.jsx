import { useState } from 'react';
import SingleAnimation from './SingleAnimation';
import useInterval from '../hooks/useInterval';

// While the pointer is down, release a heart (or thumbs up) every 100ms.
export default function FullAnimation({ pointerDown, x, y, shape }) {
  const [bubbles, setBubbles] = useState([]);

  useInterval(() => {
    setBubbles((prev) => prev.filter((b) => b.timestamp > Date.now() - 4000));
  }, 1000);

  useInterval(() => {
    if (pointerDown) {
      setBubbles((prev) => prev.concat({ x, y, timestamp: Date.now() }));
    }
  }, 100);

  return bubbles.map((b) => (
    <SingleAnimation
      key={b.timestamp}
      x={b.x}
      y={b.y}
      timestamp={b.timestamp}
      shape={shape}
    />
  ));
}
