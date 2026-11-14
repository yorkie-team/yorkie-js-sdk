import { useEffect, useMemo, useRef, useState } from 'react';
import {
  YorkieProvider,
  DocumentProvider,
  useDocument,
  useYorkie,
} from '@yorkie-js/react';
import Header from './components/Header';
import Cursor from './components/Cursor';
import CursorSelections from './components/CursorSelections';
import InkCanvas from './components/InkCanvas';
import {
  chunkPoints,
  decodePoints,
  encodePoints,
  fadeMs,
  inkScale,
  inkTools,
  maxStrokes,
  savedTools,
  toInk,
  touchesStroke,
} from './ink';
import './App.css';

const rpcAddr = import.meta.env.VITE_YORKIE_API_ADDR;
const names = ['Otter', 'Fox', 'Panda', 'Koala', 'Heron', 'Lynx', 'Robin'];
const peerColors = [
  '#fc8539',
  '#fdc433',
  '#23c176',
  '#3c9af1',
  '#f44954',
  '#855cf9',
];

// `peerColor` derives a colour from the client ID, so every tab agrees on
// which colour belongs to which peer.
function peerColor(clientID) {
  let hash = 0;
  for (const ch of clientID) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return peerColors[Math.abs(hash) % peerColors.length];
}

// `toolOf` names the tool a presence is holding.
function toolOf({ cursorShape, fadeEnabled }) {
  return cursorShape === 'pen' && fadeEnabled ? 'fading' : cursorShape;
}

// Each peer shares its pointer and tool in Presence, together with the
// stroke it is drawing right now. Since the whole stroke travels in every
// update, a peer that misses one still draws the line as it was drawn.
const initialPresence = {
  name: names[Math.floor(Math.random() * names.length)],
  cursorShape: 'cursor',
  fadeEnabled: false,
  // Position as a fraction (0–1) of the viewport, so peers with different
  // window sizes see each other's cursors in the same place.
  cursor: null,
  pointerDown: false,
  overInteractive: false,
  // `{ tool, points }` while drawing, `points` being `[x0, y0, x1, y1, ...]`
  // in ink coordinates (see `ink.js`).
  stroke: null,
};

// Finished strokes are committed to the document, so the ink stays on the
// canvas and a tab that joins later sees it: `{ tool, color, points }`,
// with `points` encoded as one string.
const initialRoot = { strokes: [] };

// Moves smaller than this fraction of the viewport are not sent.
const moveThreshold = 0.002;
// Points closer than this many pixels to the last one are not added.
const pointSpacing = 3;
// Presence is sent at most this often; peers glide in between.
const sendInterval = 40;
const interactiveSelector = 'button, input, select, a, [data-native-cursor]';

function useViewport() {
  const [size, setSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  useEffect(() => {
    const onResize = () =>
      setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

/**
 * `commitStroke` appends `points` to the document's ink, dropping the
 * oldest strokes past `maxStrokes`.
 */
function commitStroke(root, tool, color, points) {
  root.strokes.push({ tool, color, points: encodePoints(points) });
  while (root.strokes.length > maxStrokes) root.strokes.delete(0);
}

function CursorsCanvas() {
  const { client } = useYorkie();
  const { root, presences, update, loading, error, connection } = useDocument();
  const viewport = useViewport();

  // Presences are keyed by actor ID; the local peer is this client's own.
  const myID = client?.getActorID();
  const me = presences.find((p) => p.clientID === myID)?.presence;

  // Committed ink, decoded once per document change.
  const saved = useMemo(
    () =>
      Array.from(root.strokes ?? [], ({ tool, color, points }) => ({
        tool,
        color,
        points: decodePoints(points),
      })),
    [root],
  );
  // The strokes peers are drawing now, ourselves included.
  const live = useMemo(
    () =>
      presences
        .filter(({ presence }) => presence.stroke)
        .map(({ clientID, presence }) => ({
          ...presence.stroke,
          color: peerColor(clientID),
        })),
    [presences],
  );

  // The event handlers below are set up once, so they read what changes
  // through refs.
  const toolRef = useRef('cursor');
  const colorRef = useRef(peerColors[0]);
  const savedRef = useRef(saved);
  useEffect(() => {
    if (me) toolRef.current = toolOf(me);
    if (myID) colorRef.current = peerColor(myID);
    savedRef.current = saved;
  }, [me, myID, saved]);

  useEffect(() => {
    if (loading || error) return;

    const position = (e) => ({
      x: e.clientX / window.innerWidth,
      y: e.clientY / window.innerHeight,
    });
    // The latest pointer position not yet sent.
    let pending = null;
    let lastSent = { x: 0, y: 0 };
    let lastSentAt = 0;
    let erasing = false;
    // The local stroke: `{ tool, points, times, ended, dirty }`. `times`
    // holds when each point was drawn, for fading ink.
    let stroke = null;

    const addPoint = (pos) => {
      const { points } = stroke;
      // Fading ink held still can fade to nothing; then any point is new.
      if (points.length > 0) {
        const dx = (pos.x - points.at(-2) / inkScale) * window.innerWidth;
        const dy = (pos.y - points.at(-1) / inkScale) * window.innerHeight;
        if (Math.hypot(dx, dy) < pointSpacing) return;
      }
      points.push(toInk(pos.x), toInk(pos.y));
      stroke.times.push(performance.now());
      stroke.dirty = true;
    };

    // `erase` removes every committed stroke under the pointer, whoever
    // drew it. The cheap check against the last render comes first, so an
    // eraser moving over blank canvas sends nothing.
    const erase = (pos) => {
      const w = window.innerWidth,
        h = window.innerHeight;
      const px = pos.x * w,
        py = pos.y * h;
      if (!savedRef.current.some((s) => touchesStroke(s.points, px, py, w, h)))
        return;
      update((root) => {
        for (let i = root.strokes.length - 1; i >= 0; i--) {
          const points = decodePoints(root.strokes[i].points);
          if (touchesStroke(points, px, py, w, h)) root.strokes.delete(i);
        }
      });
    };

    // Pointer events cover mouse, pen and touch alike.
    const onDown = (e) => {
      if (e.target.closest(interactiveSelector)) return;
      const pos = position(e);
      const tool = toolRef.current;
      stroke = inkTools.includes(tool)
        ? {
            tool,
            points: [toInk(pos.x), toInk(pos.y)],
            times: [performance.now()],
            ended: false,
            dirty: false,
          }
        : null;
      erasing = tool === 'eraser';
      if (erasing) erase(pos);
      pending = null;
      lastSent = pos;
      lastSentAt = performance.now();
      update((_, p) =>
        p.set({
          cursor: pos,
          pointerDown: true,
          overInteractive: false,
          stroke: stroke && { tool: stroke.tool, points: stroke.points },
        }),
      );
    };

    // `finish` ends the stroke when the pointer is released or leaves.
    // Saved ink moves from presence to the document in one update; fading
    // ink stays in presence and keeps fading until it is gone.
    const finish = (extra) => {
      erasing = false;
      if (stroke && savedTools.includes(stroke.tool)) {
        const { tool, points } = stroke;
        stroke = null;
        update((root, p) => {
          commitStroke(root, tool, colorRef.current, points);
          p.set({ pointerDown: false, stroke: null, ...extra });
        });
        return;
      }
      if (stroke) stroke.ended = true;
      update((_, p) => p.set({ pointerDown: false, ...extra }));
    };
    const onUp = () => finish();
    const onLeave = () => {
      pending = null;
      finish({ cursor: null });
    };

    const onMove = (e) => {
      const pos = position(e);
      pending = {
        ...pos,
        overInteractive: !!e.target.closest(interactiveSelector),
      };
      if (stroke && !stroke.ended) addPoint(pos);
    };

    let frameID;
    const loop = (now) => {
      frameID = requestAnimationFrame(loop);

      // Fading ink: drop the points older than `fadeMs`. Once released and
      // empty, the stroke is gone.
      if (stroke?.tool === 'fading') {
        let drop = 0;
        while (drop < stroke.times.length && now - stroke.times[drop] > fadeMs)
          drop++;
        if (drop > 0) {
          stroke.times.splice(0, drop);
          stroke.points.splice(0, drop * 2);
          stroke.dirty = true;
        }
      }
      if (erasing && pending) erase(pending);

      if (now - lastSentAt < sendInterval) return;
      const patch = {};
      if (pending) {
        const moved = Math.hypot(
          pending.x - lastSent.x,
          pending.y - lastSent.y,
        );
        if (moved >= moveThreshold) {
          lastSent = pending;
          patch.cursor = { x: pending.x, y: pending.y };
          patch.overInteractive = pending.overInteractive;
        }
        pending = null;
      }

      let chunk = null;
      if (stroke?.dirty) {
        stroke.dirty = false;
        if (stroke.ended && stroke.points.length === 0) {
          stroke = null;
          patch.stroke = null;
        } else {
          // A long saved stroke is committed in chunks, so a presence update
          // never carries more than `chunkPoints` points. The stroke goes on
          // from the chunk's last point, so the line has no gap.
          if (
            savedTools.includes(stroke.tool) &&
            stroke.points.length >= chunkPoints * 2
          ) {
            chunk = stroke.points;
            stroke.points = chunk.slice(-2);
            stroke.times = stroke.times.slice(-1);
          }
          // Fading ink is capped the same way, dropping its oldest points.
          if (stroke.points.length > chunkPoints * 2) {
            const drop = stroke.points.length / 2 - chunkPoints;
            stroke.points.splice(0, drop * 2);
            stroke.times.splice(0, drop);
          }
          patch.stroke = { tool: stroke.tool, points: stroke.points };
        }
      }

      if (Object.keys(patch).length === 0) return;
      lastSentAt = now;
      const tool = stroke?.tool;
      update((root, p) => {
        if (chunk) commitStroke(root, tool, colorRef.current, chunk);
        p.set(patch);
      });
    };
    frameID = requestAnimationFrame(loop);

    const root = document.documentElement;
    // The drawn cursor replaces the system one while the canvas is live.
    document.body.classList.add('drawn-cursor');
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('pointermove', onMove);
    root.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frameID);
      document.body.classList.remove('drawn-cursor');
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', onLeave);
    };
  }, [loading, error, update]);

  const peers = presences.map(({ clientID, presence }) => ({
    clientID,
    presence,
    color: peerColor(clientID),
    isMe: clientID === myID,
  }));

  return (
    <>
      <Header
        loading={loading}
        error={error}
        connection={connection}
        peers={peers}
      />
      {error && (
        <p className="error-message" role="alert">
          Couldn’t reach the Yorkie server at {rpcAddr}. Check that it’s
          running, then reload.
        </p>
      )}
      <InkCanvas saved={saved} live={live} />
      {peers.map(({ clientID, presence, color, isMe }) => (
        <Cursor
          key={clientID}
          shape={presence.cursorShape}
          fadeEnabled={presence.fadeEnabled}
          cursor={presence.cursor}
          pointerDown={presence.pointerDown}
          overInteractive={presence.overInteractive}
          color={color}
          viewport={viewport}
          animate={!isMe}
        />
      ))}
      {me && (
        <CursorSelections
          shape={me.cursorShape}
          fadeEnabled={me.fadeEnabled}
          canClear={saved.length > 0}
          onSelect={(cursorShape, fadeEnabled = false) =>
            update((_, p) => p.set({ cursorShape, fadeEnabled }))
          }
          onClear={() =>
            update((root) => {
              root.strokes = [];
            })
          }
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <YorkieProvider
      apiKey={import.meta.env.VITE_YORKIE_API_KEY}
      rpcAddr={rpcAddr}
    >
      <DocumentProvider
        docKey="simultaneous-cursors"
        initialRoot={initialRoot}
        initialPresence={initialPresence}
      >
        <CursorsCanvas />
      </DocumentProvider>
    </YorkieProvider>
  );
}
