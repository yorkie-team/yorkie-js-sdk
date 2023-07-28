import React, { useRef, useEffect } from "react";
import "./PenCursor.css";

class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.lifetime = 0;
  }
}

const PenCursor = () => {
  const canvasRef = useRef(null);
  const points = [];

  const addPoint = (x, y) => {
    const point = new Point(x, y);
    points.push(point);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

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
          // If the point dies, remove it.
          points.shift();
        } else {
          // Otherwise animate it:

          // As the lifetime goes on, lifePercent goes from 0 to 1.
          const lifePercent = point.lifetime / duration;
          const spreadRate = 7 * (1 - lifePercent);

          ctx.lineJoin = "round";
          ctx.lineWidth = spreadRate;

          // As time increases decrease r and b, increase g to go from purple to green.
          // const red = Math.floor(190 - 190 * lifePercent);
          // const green = 0;
          // const blue = Math.floor(210 + 210 * lifePercent);
          const red = 0;
          const green = 0;
          const blue = 0;
          ctx.strokeStyle = `rgb(${red},${green},${blue}`;

          ctx.beginPath();

          ctx.moveTo(lastPoint.x, lastPoint.y);
          ctx.lineTo(point.x, point.y);

          ctx.stroke();
          ctx.closePath();
        }
      }
      requestAnimationFrame(animatePoints);
    };

    const handleMouseMove = ({ clientX, clientY }) => {
      addPoint(clientX - canvas.offsetLeft, clientY - canvas.offsetTop);
    };

    document.addEventListener("mousemove", handleMouseMove, false);

    animatePoints();

    return () => {
      document.removeEventListener("mousemove", handleMouseMove, false);
    };
  }, []);

  return (
    <canvas
      className={"pen-cursor-canvas"}
      ref={canvasRef}
      width={document.body.clientWidth}
      height={document.body.clientHeight}
    />
  );
};

export default PenCursor;
