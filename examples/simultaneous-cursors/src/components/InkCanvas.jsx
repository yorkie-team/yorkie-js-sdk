import { useEffect, useRef } from 'react';
import { drawStroke } from '../ink';

/**
 * `useLayer` draws `strokes` on the canvas it returns, again whenever they
 * change or the window is resized. Nothing is redrawn between changes.
 */
function useLayer(strokes) {
  const canvasRef = useRef(null);
  const strokesRef = useRef(strokes);
  const redrawRef = useRef(() => {});

  useEffect(() => {
    const cnv = canvasRef.current;
    const ctx = cnv.getContext('2d');
    const redraw = () => {
      const w = window.innerWidth,
        h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      for (const stroke of strokesRef.current) drawStroke(ctx, stroke, w, h);
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
    return () => window.removeEventListener('resize', resize);
  }, []);

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
 */
export default function InkCanvas({ saved, live }) {
  const savedRef = useLayer(saved);
  const liveRef = useLayer(live);
  return (
    <>
      <canvas ref={savedRef} className="ink-canvas" />
      <canvas ref={liveRef} className="ink-canvas" />
    </>
  );
}
