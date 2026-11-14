# Lessons: keep simultaneous-cursors ink whole across peers

**Created**: 2026-11-15

## Rebuilding state from presence samples loses it

The old example drew a peer's ink from that peer's pointer position, one
sample per render. React batches the presence events that arrive between two
renders, so the receiver only ever saw some of the samples, and a missed
`pointerDown` toggle joined two strokes. Anything a receiver must not lose has
to be in the presence as a whole (the stroke so far), not as a stream of
deltas the receiver accumulates.

## A growing presence value needs a bound

A presence patch sends only the changed keys, but a key is sent whole: a
stroke kept in presence grows every update. Committing it to the document in
chunks of `chunkPoints`, in the same `update` that resets the presence stroke,
bounds each update without a visible seam, because the change carries both.

## Checks

- Empty `doc.update` calls are skipped (`ctx.hasChange()`), so the eraser's
  re-check against a not-yet-rendered `saved` sends nothing.
- A presence-only change publishes no `LocalChange`/`RemoteChange` event, so
  `root` in `useDocument` changes only with the ink, and the saved layer is
  not redrawn per presence update.

## Verification

Two and three headless Chromium tabs (Playwright, against a throwaway
`yorkieteam/yorkie` server on port 8091): a fast 80-move zigzag and six quick
dashes drawn in one tab match in a tab of a different size; a late joiner sees
the saved ink; an eraser in another tab removes the dashes; fading ink shows
while drawn and is gone 2s after release; "Clear canvas" empties every tab.
No page errors.

## Known

- A highlighter stroke long enough to be chunked draws its 30%-alpha caps
  twice at each chunk join, a slightly darker dot every `chunkPoints` points.
