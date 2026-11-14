// Ink is kept as viewport fractions so peers with different window sizes
// draw it in the same place. Fractions are quantized to integers in
// [0, inkScale] to keep presence updates and the document small.
export const inkScale = 10000;
export const strokeWidth = 6;
export const inkTools = ['pen', 'fading', 'highlighter'];
// Tools whose ink is committed to the document; fading ink never is.
export const savedTools = ['pen', 'highlighter'];
// A live stroke is committed and restarted once it holds this many points,
// so a presence update never carries more than this.
export const chunkPoints = 64;
// The document keeps at most this many strokes; the oldest go first.
export const maxStrokes = 400;
// Fading ink disappears this long after it is drawn.
export const fadeMs = 1500;

/**
 * `toInk` converts a viewport fraction to a quantized ink coordinate.
 */
export function toInk(fraction) {
  return Math.round(Math.min(1, Math.max(0, fraction)) * inkScale);
}

/**
 * `encodePoints` turns a flat `[x0, y0, x1, y1, ...]` array into the string
 * stored in the document. Committed points never change, so one string is
 * much lighter than an array holding a CRDT element per number.
 */
export function encodePoints(points) {
  return points.join(',');
}

/**
 * `decodePoints` reverses `encodePoints`.
 */
export function decodePoints(encoded) {
  return encoded ? encoded.split(',').map(Number) : [];
}

/**
 * `drawStroke` draws one stroke, smoothing it with quadratic curves through
 * the midpoints between its points.
 */
export function drawStroke(ctx, { tool, color, points }, width, height) {
  if (points.length < 2) return;
  const sx = width / inkScale,
    sy = height / inkScale;

  ctx.save();
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.globalAlpha = tool === 'highlighter' ? 0.3 : 1;
  ctx.beginPath();
  ctx.moveTo(points[0] * sx, points[1] * sy);
  if (points.length === 2) {
    // A single point: a dot.
    ctx.lineTo(points[0] * sx, points[1] * sy);
  }
  for (let i = 2; i + 2 < points.length; i += 2) {
    const x = points[i] * sx,
      y = points[i + 1] * sy;
    const nx = points[i + 2] * sx,
      ny = points[i + 3] * sy;
    ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
  if (points.length > 2) {
    ctx.lineTo(points.at(-2) * sx, points.at(-1) * sy);
  }
  ctx.stroke();
  ctx.restore();
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
 * `touchesStroke` reports whether the pixel point (`px`, `py`) is within
 * the eraser's reach of the stroke's line.
 */
export function touchesStroke(points, px, py, width, height) {
  const sx = width / inkScale,
    sy = height / inkScale;
  const reach = strokeWidth * 1.5;
  if (points.length === 2) {
    return Math.hypot(points[0] * sx - px, points[1] * sy - py) <= reach;
  }
  for (let i = 2; i < points.length; i += 2) {
    const d = distToSegment(
      px,
      py,
      points[i - 2] * sx,
      points[i - 1] * sy,
      points[i] * sx,
      points[i + 1] * sy,
    );
    if (d <= reach) return true;
  }
  return false;
}
