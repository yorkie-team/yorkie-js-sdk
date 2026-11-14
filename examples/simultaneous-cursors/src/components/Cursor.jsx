import { useLayoutEffect, useRef } from 'react';
import FullAnimation from './FullAnimation';
import ColoredIcon from './ColoredIcon';

// Maps an icon's box to the point that should sit on the pointer (the nib
// of the pen or highlighter). Other icons are anchored at center-bottom.
const tipOffsets = {
  pen: { w: 36, h: 36, tipX: 18, tipY: 38 },
  highlighter: { w: 23, h: 24, tipX: 5, tipY: -8 },
};

// A critically damped spring: it settles in about 0.2s without overshoot.
// Unlike a CSS transition, which restarts a straight line at every update,
// the spring keeps its velocity, so a peer's cursor turns smoothly.
const stiffness = 480;
const damping = 2 * Math.sqrt(stiffness);

/**
 * `useSpringPosition` moves the element in `ref` towards (`x`, `y`) with a
 * spring, writing its transform directly instead of re-rendering each frame.
 * It jumps instead of gliding when the element first appears.
 */
function useSpringPosition(ref, x, y, anchor, enabled) {
  const springRef = useRef(null);
  const frameRef = useRef(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!enabled || !el) {
      springRef.current = null;
      return;
    }
    const place = (s) => {
      el.style.transform = `translate3d(${s.x}px, ${s.y}px, 0) ${anchor}`;
    };

    if (!springRef.current) {
      springRef.current = { x, y, vx: 0, vy: 0, tx: x, ty: y };
      place(springRef.current);
      return;
    }
    const spring = springRef.current;
    spring.tx = x;
    spring.ty = y;
    place(spring);
    cancelAnimationFrame(frameRef.current);

    let last = performance.now();
    const step = (now) => {
      const s = springRef.current;
      if (!s) return;
      // Cap the step so a backgrounded tab does not fling the cursor.
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      s.vx += (stiffness * (s.tx - s.x) - damping * s.vx) * dt;
      s.vy += (stiffness * (s.ty - s.y) - damping * s.vy) * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const settled =
        Math.hypot(s.tx - s.x, s.ty - s.y) < 0.1 &&
        Math.hypot(s.vx, s.vy) < 0.1;
      if (settled) Object.assign(s, { x: s.tx, y: s.ty, vx: 0, vy: 0 });
      place(s);
      if (!settled) frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
  }, [ref, x, y, anchor, enabled]);

  useLayoutEffect(() => () => cancelAnimationFrame(frameRef.current), []);
}

export default function Cursor({
  shape,
  fadeEnabled,
  cursor,
  pointerDown,
  overInteractive,
  color,
  viewport,
  animate,
}) {
  const ref = useRef(null);
  const tool = shape === 'pen' && fadeEnabled ? 'fading' : shape;
  const icon = shape === 'eraser' ? 'line' : tool;
  const off = tipOffsets[tool === 'fading' ? 'pen' : tool];
  const anchor = off
    ? `translate(${-(off.w / 2) + off.tipX}px, ${-off.h + off.tipY}px)`
    : 'translate(-50%, -100%)';

  // Presence carries the position as a fraction of the viewport.
  const x = cursor ? cursor.x * viewport.width : 0;
  const y = cursor ? cursor.y * viewport.height : 0;
  const visible = !!cursor && !overInteractive;
  useSpringPosition(ref, x, y, anchor, animate && visible);

  return (
    <>
      {visible && (
        <div
          ref={ref}
          className="cursor"
          // A peer's cursor is placed by the spring; our own follows the
          // pointer directly.
          style={
            animate
              ? undefined
              : { transform: `translate3d(${x}px, ${y}px, 0) ${anchor}` }
          }
        >
          <ColoredIcon type={icon} color={color} />
        </div>
      )}
      {cursor && (shape === 'heart' || shape === 'thumbs') && (
        <FullAnimation pointerDown={pointerDown} x={x} y={y} shape={shape} />
      )}
    </>
  );
}
