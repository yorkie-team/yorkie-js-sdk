import { useRef, useEffect } from 'react';

const drawingTools = ['pen', 'fading', 'highlighter', 'eraser'];
const strokeWidth = 6;
// Fading ink disappears after this many frames (about two seconds).
const maxTrail = 128;
const splineStep = 0.019;

/**
 * `getSplinePoint` calculates a point on a Catmull-Rom spline.
 */
function getSplinePoint(pts, t) {
  const [p0, p1, p2, p3] = pts;
  const t2 = t * t,
    t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

/**
 * `distToSegment` calculates the distance from a point to a line segment.
 */
function distToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax,
    aby = by - ay;
  const ab2 = abx * abx + aby * aby || 1;
  const t = Math.min(1, Math.max(0, ((px - ax) * abx + (py - ay) * aby) / ab2));
  return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
}

/**
 * `PenCursor` draws one peer's ink. Every tab builds the strokes from that
 * peer's presence (pointer position + pointer down), so the trail appears
 * live everywhere, but nothing is stored in the document: a tab that joins
 * later starts blank, and the eraser removes only its own author's ink.
 */
export default function PenCursor({ tool, cursor, pointerDown, color }) {
  const canvasRef = useRef(null);
  // Points are kept as viewport fractions and scaled when drawn.
  const strokesRef = useRef([]);
  const lastRef = useRef(null);

  useEffect(() => {
    if (!pointerDown || !cursor || !drawingTools.includes(tool)) {
      lastRef.current = null;
      return;
    }
    const w = window.innerWidth,
      h = window.innerHeight;

    if (tool === 'eraser') {
      const px = cursor.x * w,
        py = cursor.y * h;
      const threshold = strokeWidth * 0.75;
      strokesRef.current = strokesRef.current.filter(({ points }) => {
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1],
            b = points[i];
          const d = distToSegment(px, py, a.x * w, a.y * h, b.x * w, b.y * h);
          if (d <= threshold) return false;
        }
        return true;
      });
      return;
    }

    const last = lastRef.current;
    if (!last) {
      strokesRef.current.push({ tool, color, points: [{ ...cursor, age: 0 }] });
      lastRef.current = cursor;
      return;
    }

    // Fill in a point every ~15px so a fading trail shrinks smoothly.
    const dist = Math.hypot((cursor.x - last.x) * w, (cursor.y - last.y) * h);
    const steps = Math.ceil(dist / 15);
    const stroke = strokesRef.current.at(-1);
    for (let i = 1; i <= steps; i++) {
      stroke.points.push({
        x: last.x + (cursor.x - last.x) * (i / steps),
        y: last.y + (cursor.y - last.y) * (i / steps),
        age: 0,
      });
    }
    lastRef.current = cursor;
  }, [cursor, tool, pointerDown, color]);

  // Keep the canvas the size of the window (and sharp on HiDPI screens).
  useEffect(() => {
    const cnv = canvasRef.current;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      cnv.width = window.innerWidth * dpr;
      cnv.height = window.innerHeight * dpr;
      cnv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');
    let frameID;

    function draw() {
      const w = window.innerWidth,
        h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      for (const stroke of strokesRef.current) {
        if (stroke.tool === 'fading') {
          stroke.points.forEach((p) => p.age++);
          stroke.points = stroke.points.filter((p) => p.age < maxTrail);
        }
        const pts = stroke.points.map((p) => ({ x: p.x * w, y: p.y * h }));
        if (pts.length < 2) continue;

        ctx.save();
        ctx.lineWidth = strokeWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = stroke.color;
        ctx.globalAlpha = stroke.tool === 'highlighter' ? 0.3 : 1;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        if (pts.length >= 4) {
          for (let i = 0; i <= pts.length - 4; i++) {
            for (let t = 0; t <= 1; t += splineStep) {
              const sp = getSplinePoint(pts.slice(i, i + 4), t);
              ctx.lineTo(sp.x, sp.y);
            }
          }
        } else {
          pts.slice(1, -1).forEach((p) => ctx.lineTo(p.x, p.y));
        }
        ctx.lineTo(pts.at(-1).x, pts.at(-1).y);
        ctx.stroke();
        ctx.restore();
      }
      frameID = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(frameID);
  }, []);

  return <canvas ref={canvasRef} className="ink-canvas" />;
}
