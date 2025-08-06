import React, { useRef, useEffect} from 'react';

class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.lifetime = 0;
  }
}




function rdp(points, eps) {
  if (points.length < 3) return points;
  let maxD = 0, idx = 0;
  const [s, e] = [points[0], points[points.length - 1]];
  const dx = e.x - s.x, dy = e.y - s.y, mag = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const d = Math.abs(dy * p.x - dx * p.y + e.x * s.y - e.y * s.x) / mag;
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > eps) {
    const left  = rdp(points.slice(0, idx + 1), eps);
    const right = rdp(points.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [s, e];
}


function getSplinePoint(pts, t) {
  const [p0, p1, p2, p3] = pts;
  const t2 = t * t, t3 = t2 * t;
  return {
    x: 0.5 * (
      2 * p1.x +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
    ),
    y: 0.5 * (
      2 * p1.y +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
    ),
  };
}

const PenCursor = ({
  xPos,
  yPos,
  tool = 'pen',
  color = 'black',
  lineWidth = 6,
  resetTrail = false,
  maxTrail = 128,
  rdpEpsilon = 0,
  splineStep = 0.019,
  pointerDown = false,
}) => {
  const canvasRef  = useRef(null);
  const strokesRef = useRef([]);
  const drawingRef = useRef(false);
  const lastRef    = useRef({ x: null, y: null });


  useEffect(() => {
    if (resetTrail) {
      strokesRef.current = [];
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
  }, [resetTrail]);


  useEffect(() => {
    if (pointerDown) {
      if (!drawingRef.current) {

        strokesRef.current.push({
          tool,
          color,
          width: lineWidth,
          points: [new Point(xPos, yPos)],
        });
        drawingRef.current = true;
        lastRef.current   = { x: xPos, y: yPos };
      } else {
        const last = lastRef.current;
        const dx   = xPos - last.x;
        const dy   = yPos - last.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0) {
          const steps  = Math.ceil(dist / 15);
          const stroke = strokesRef.current.at(-1);
          for (let i = 1; i <= steps; i++) {
            const t  = i / steps;
            const ix = last.x + dx * t;
            const iy = last.y + dy * t;
            const pt = new Point(ix, iy);
            if (stroke.tool === 'eraser') pt.erase = true;
            if (stroke.tool === 'fading') pt.age   = 0;
            stroke.points.push(pt);
          }
          lastRef.current = { x: xPos, y: yPos };
        }
      }
    } else {

      drawingRef.current = false;
      lastRef.current    = { x: null, y: null };
    }
  }, [xPos, yPos, tool, lineWidth, pointerDown]);


  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    const dpr    = window.devicePixelRatio || 1;
    canvas.width  = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width  = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);


  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    let running  = true;

    function draw() {
      if (!running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      strokesRef.current.forEach(stroke => {
        let pts = stroke.points;


        if (stroke.tool === 'fading') {
          pts = stroke.points = pts
            .map(p => { p.age++; return p; })
            .filter(p => p.age < maxTrail);
        }

        if (pts.length < 2) return;
        const simple = rdp(pts, rdpEpsilon);


        ctx.save();
        ctx.lineWidth               = stroke.width;
        ctx.lineCap                 = 'round';
        ctx.lineJoin                = 'round';
        ctx.strokeStyle             = stroke.tool === 'eraser'
                                       ? 'rgba(0,0,0,1)'
                                       : stroke.color;
        ctx.globalCompositeOperation= stroke.tool === 'eraser'
                                       ? 'destination-out'
                                       : 'source-over';
        ctx.globalAlpha             = stroke.tool === 'highlighter'
                                       ? 0.3
                                       : 1;

        if (simple.length >= 4) {
          ctx.beginPath();
          ctx.moveTo(simple[0].x, simple[0].y);
          for (let i = 0; i <= simple.length - 4; i++) {
            for (let t = 0; t <= 1; t += splineStep) {
              const sp = getSplinePoint(
                [simple[i], simple[i+1], simple[i+2], simple[i+3]],
                t
              );
              ctx.lineTo(sp.x, sp.y);
            }
          }
          ctx.lineTo(simple.at(-1).x, simple.at(-1).y);
          ctx.stroke();
          ctx.closePath();
        } else {
          ctx.beginPath();
          ctx.moveTo(simple[0].x, simple[0].y);
          simple.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
          ctx.stroke();
          ctx.closePath();
        }
        ctx.restore();


        if (stroke.tool === 'pencil') {
          ctx.save();
          ctx.strokeStyle = stroke.color;
          ctx.lineWidth   = Math.max(1, stroke.width * 0.5);
          ctx.globalAlpha = 0.6;
          const density = 0.3;
          for (let i = 1; i < simple.length; i++) {
            if (Math.random() > density) continue;
            const p    = simple[i];
            const prev = simple[i - 1];
            const dx   = p.x - prev.x, dy = p.y - prev.y;
            const angle= Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.8;
            const len  = stroke.width * (0.8 + Math.random() * 0.4);
            const x1   = p.x + Math.cos(angle) * len/2;
            const y1   = p.y + Math.sin(angle) * len/2;
            const x2   = p.x - Math.cos(angle) * len/2;
            const y2   = p.y - Math.sin(angle) * len/2;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            ctx.closePath();
          }
          ctx.restore();
        }
      });

      requestAnimationFrame(draw);
    }

    draw();
    return () => { running = false; };
  }, [maxTrail, rdpEpsilon, splineStep]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        pointerEvents: 'none',
        zIndex: 999
      }}
    />
  );
};

export default PenCursor;
