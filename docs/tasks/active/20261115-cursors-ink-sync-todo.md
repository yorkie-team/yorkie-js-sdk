# Keep simultaneous-cursors ink whole across peers

**Created**: 2026-11-15

Issue #1386: in `examples/simultaneous-cursors`, a stroke drawn in one tab
shows up broken in another. Each tab rebuilt a peer's ink from that peer's
pointer position and `pointerDown`, so any presence state it never rendered
— updates that arrive between two React renders collapse into the last one —
became a straight jump in the line, and a missed `pointerDown` toggle joined
two strokes into one. A tab that joined later started blank.

## Design

- **While drawing**, the stroke itself is in Presence:
  `stroke: { tool, points }`, `points` a flat array of viewport fractions
  quantized to 1/10000. A receiver gets the whole stroke on every update, so
  a missed update no longer changes the line.
- **Bounded payload**: once the live stroke reaches `chunkPoints`, its points
  are committed to the Document and the stroke continues from its last
  point, in the same `update` so peers see it move from one to the other.
  Presence updates are sent at most every `sendInterval` ms.
- **On release**, the stroke is committed to `root.strokes` and the presence
  stroke cleared. Committed points never change, so they are stored as one
  string rather than an array of CRDT elements.
- **Fading pen** stays in Presence only: the author trims points older than
  `fadeMs`, and keeps trimming after release until the trail is empty.
- **Eraser** removes any committed stroke it touches (not only its own), and
  a "Clear canvas" button empties `root.strokes`. The oldest strokes beyond
  `maxStrokes` are dropped on commit so the shared document stays small.
- **Remote cursors** move with a critically damped spring driven by
  `requestAnimationFrame` instead of an 80ms linear CSS transition, following
  https://liveblocks.io/blog/how-to-animate-multiplayer-cursors: springs keep
  momentum across updates; splines are more exact but wait for extra points,
  and the ink already carries the exact path.
- **Rendering**: one canvas for committed ink (redrawn when the document
  changes) and one for live strokes (redrawn when presences change), instead
  of a canvas per peer redrawn every frame.

## Checklist

- [x] Presence `stroke` + Document `strokes`, chunked commit
- [x] Fading pen trimmed by the author
- [x] Eraser over all committed ink, "Clear canvas", `maxStrokes`
- [x] Spring cursor
- [x] Two-layer canvas
- [x] README and header copy describe the new behaviour
- [x] Verified in two browser windows, including a late joiner
- [x] `pnpm verify:fast`
- [ ] Archive this pair before the pull request merges
