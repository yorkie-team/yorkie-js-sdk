**Created**: 2026-11-18

# React Chat Example Lessons

- `Channel` reports only session counts, so "who is in which channel" has to
  come from Document presence.
- `SyncMode.Manual` cancels the watch stream and clears the online set; a
  paused workspace document shows only the local client, and peers see it
  leave.
- `useYorkieDoc` creates its own client and exposes neither client nor
  document, and changing `DocumentProvider`'s `syncMode` prop re-attaches.
  Toggle offline imperatively with `client.changeSyncMode`.
- Nested per-person keys merge only if the parent object already exists.
  Two first reactions each set `reactions[emoji] = {…}` and the last write
  wins, losing one person; pre-create the parent objects and never delete
  them. Found by two headless clients reacting at once.
- A `Date.now()` number exceeds Yorkie's int32 and is stored as a Long
  that reads back as a bigint; keep timestamps as ISO strings.
- Reading `array[-1]` on a Yorkie array proxy throws
  (`out of index: tree size 1, index -1`); guard `i > 0` before `[i - 1]`.
- yorkie.dev builds examples from the release tag unless
  `YORKIE_JS_EXAMPLES_REF` pins a commit.
