import { useEffect, useRef } from 'react';
import { drawStroke } from '../ink';

/**
 * `useLayer` draws `strokes` on the canvas it returns, again whenever they
 * change or the window is resized. Nothing is redrawn between changes.
 * With `local`, the stroke it holds is drawn on top, and redrawn at the
 * next frame each time it changes.
 */
function useLayer(strokes, local) {
  const canvasRef = useRef(null);
  const strokesRef = useRef(strokes);
  const redrawRef = useRef(() => {});

  useEffect(() => {
    const cnv = canvasRef.current;
    const ctx = cnv.getContext('2d');
    let frameID = 0;
    const redraw = () => {
      cancelAnimationFrame(frameID);
      frameID = 0;
      const w = window.innerWidth,
        h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      for (const stroke of strokesRef.current) drawStroke(ctx, stroke, w, h);
      const own = local?.get();
      if (own) drawStroke(ctx, own, w, h);
    };
    const schedule = () => {
      if (!frameID) frameID = requestAnimationFrame(redraw);
    };
    // Keep the canvas the size of the window (and sharp on HiDPI screens).
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      cnv.width = window.innerWidth * dpr;
      cnv.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    };
    redrawRef.current = redraw;
    resize();
    window.addEventListener('resize', resize);
    const unlisten = local?.listen(schedule);
    return () => {
      cancelAnimationFrame(frameID);
      unlisten?.();
      window.removeEventListener('resize', resize);
    };
  }, [local]);

  useEffect(() => {
    strokesRef.current = strokes;
    redrawRef.current();
  }, [strokes]);

  return canvasRef;
}

/**
 * `InkCanvas` draws every peer's ink in two layers: `saved` is the ink
 * committed to the document, and `live` the strokes peers are drawing now,
 * read from their presence. Live strokes change many times a second, so
 * they get a layer of their own and the saved ink is not redrawn with them.
 * Our own stroke in progress is `local`, drawn from the pointer rather than
 * from presence, so it keeps up with our cursor.
 */
export default function InkCanvas({ saved, live, local }) {
  const savedRef = useLayer(saved);
  const liveRef = useLayer(live, local);
  return (
    <>
      <canvas ref={savedRef} className="ink-canvas" />
      <canvas ref={liveRef} className="ink-canvas" />
    </>
  );
}
