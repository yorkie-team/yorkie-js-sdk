import React, { useRef, useEffect} from 'react';

class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.lifetime = 0;
  }
}

function rdp(points, epsilon) {
  if (points.length < 3) return points;

  let maxDist = 0, index = 0;
  const [start, end] = [points[0], points[points.length - 1]];
  const dx = end.x - start.x, dy = end.y - start.y;
  const mag = Math.hypot(dx, dy);
  for (let i = 1; i < points.length - 1; i++) {

    const p = points[i];
    const dist = Math.abs(dy * p.x - dx * p.y + end.x * start.y - end.y * start.x) / mag;
    if (dist > maxDist) { maxDist = dist; index = i; }
  }
  if (maxDist > epsilon) {

    const left = rdp(points.slice(0, index + 1), epsilon);
    const right = rdp(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  } else {

    return [start, end];
  }
}

function getSplinePoint(pts, t) {
  const [p0, p1, p2, p3] = pts;
  const t2 = t * t, t3 = t2 * t;
  return {
    x: 0.5 * (
      2*p1.x +
      ( -p0.x + p2.x )*t +
      ( 2*p0.x - 5*p1.x + 4*p2.x - p3.x )*t2 +
      ( -p0.x + 3*p1.x - 3*p2.x + p3.x )*t3
    ),
    y: 0.5 * (
      2*p1.y +
      ( -p0.y + p2.y )*t +
      ( 2*p0.y - 5*p1.y + 4*p2.y - p3.y )*t2 +
      ( -p0.y + 3*p1.y - 3*p2.y + p3.y )*t3
    )
  };
}

const PenCursor = ({
  xPos, yPos,
  tool = 'normal',
  color = 'black',
  lineWidth = 6,
  resetTrail = false,
  maxTrail = 128,
  rdpEpsilon = 0,
  splineStep = 0.019
}) => {
  const canvasRef = useRef(null);
  const pointsRef = useRef([]);
  const lastRef = useRef({ x: null, y: null });


  useEffect(() => {
    if (resetTrail) {
      pointsRef.current = [];
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
  }, [resetTrail]);

  useEffect(() => {
    const last = lastRef.current;

    if (last.x === null) {
      lastRef.current = { x: xPos, y: yPos };
      pointsRef.current.push(new Point(xPos, yPos));
      return;
    }

    const dx = xPos - last.x;
    const dy = yPos - last.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 0) {

      const maxSeg = 15;
      const steps = Math.ceil(dist / maxSeg);


      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const ix = last.x + dx * t;
        const iy = last.y + dy * t;
        const pt = new Point(ix, iy);
        if (tool === 'eraser') pt.erase = true;
        if (tool === 'fading') pt.age = 0;
        pointsRef.current.push(pt);
      }


      if (pointsRef.current.length > maxTrail) {
        pointsRef.current.splice(
          0,
          pointsRef.current.length - maxTrail
        );
      }


      lastRef.current = { x: xPos, y: yPos };
    }
  }, [xPos, yPos, tool, maxTrail]);



  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width  = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);


  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas.getContext('2d');
    let running = true;

    function draw() {
      if (!running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);


      ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';

      let pts = pointsRef.current;


      if (tool === 'fading') {
        pts.forEach(p => p.age++);
        pts = pointsRef.current = pts.filter(p => p.age < maxTrail);
      }

      if (pts.length >= 2) {

        const simple = rdp(pts, rdpEpsilon);

        ctx.save();
        ctx.lineWidth = lineWidth;
        ctx.lineCap   = 'round';
        ctx.lineJoin  = 'round';
        ctx.strokeStyle = tool === 'eraser' ? 'rgba(0,0,0,1)' : color;
        ctx.globalAlpha = tool === 'highlighter' ? 0.3 : 1;


        if (simple.length >= 4) {
          ctx.beginPath();
          ctx.moveTo(simple[0].x, simple[0].y);
          for (let i = 0; i <= simple.length - 4; i++) {
            for (let t = 0; t <= 1; t += splineStep) {
              const sp = getSplinePoint([simple[i], simple[i+1], simple[i+2], simple[i+3]], t);
              ctx.lineTo(sp.x, sp.y);
            }
          }
          ctx.lineTo(simple[simple.length-1].x, simple[simple.length-1].y);
          ctx.stroke();
          ctx.closePath();
        } else {

          ctx.beginPath();
          ctx.moveTo(simple[0].x, simple[0].y);
          for (let i = 1; i < simple.length; i++) {
            ctx.lineTo(simple[i].x, simple[i].y);
          }
          ctx.stroke();
          ctx.closePath();
        }
        ctx.restore();
      }

      requestAnimationFrame(draw);
    }

    draw();
    return () => { running = false; };
  }, [color, lineWidth, tool, maxTrail, rdpEpsilon, splineStep]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed',
        left: 0,
        top: 0, pointerEvents: 'none',
        zIndex: 999 }}
    />
  );
};

export default PenCursor;
