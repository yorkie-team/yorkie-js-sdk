import React, { useRef, useEffect, useState } from 'react';
import './PenCursor.css';

class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.lifetime = 0;
  }
}

const PenCursor = ({ xPos, yPos }) => {
  const canvasRef = useRef(null);
  const [points, setPoints] = useState([]);

  const addPoint = (x, y) => {
    const point = new Point(x, y);
    points.push(point);
    setPoints(points);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const animatePoints = () => {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      const duration = (0.7 * (1 * 4000)) / 60; // Last 80% of a frame per point

      for (let i = 0; i < points.length; ++i) {
        const point = points[i];
        let lastPoint;

        if (points[i - 1] !== undefined) {
          lastPoint = points[i - 1];
        } else lastPoint = point;

        point.lifetime += 1;

        if (point.lifetime > duration) {
          points.shift();
        } else {
          const lifePercent = point.lifetime / duration;
          const spreadRate = 5;
          // const spreadRate = 7 * (1 - lifePercent);

          ctx.lineJoin = 'round';
          ctx.lineWidth = spreadRate;

          const red = 0;
          const green = 0;
          const blue = 0;
          ctx.strokeStyle = `rgb(${red},${green},${blue})`;

          ctx.beginPath();

          ctx.moveTo(lastPoint.x, lastPoint.y);
          ctx.lineTo(point.x, point.y);

          ctx.stroke();
          ctx.closePath();
        }
      }
      requestAnimationFrame(animatePoints);
    };

    animatePoints();
  }, [points]);

  useEffect(() => {
    addPoint(xPos, yPos);
  }, [xPos, yPos]);

  return (
    <canvas
      className={'pen-cursor-canvas'}
      ref={canvasRef}
      width={document.body.clientWidth}
      height={document.body.clientHeight}
    />
  );
};

export default PenCursor;
