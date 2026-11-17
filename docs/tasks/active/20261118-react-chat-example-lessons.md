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
- `crypto.randomUUID` is missing outside secure contexts: an iframe in an
  `about:blank` wrapper, or the dev server opened over a LAN IP, rendered
  a blank page. Use a fallback id.
- Picking an identity once on join is not enough: panes opened together
  cannot see each other yet. Recheck on every presence change and let the
  later joiner (`joinedAt`, then `userId`) move, so all panes agree.
- Two watch streams per tab hit Chrome's six-connections-per-host limit over
  HTTP/1.1 at three tabs: one tab stays on "Opening…" and presence never
  converges. api.yorkie.dev is HTTP/2. Test many local clients in separate
  browser contexts.
- `Array.isArray` is false for a Yorkie array (a Proxy): a defensive reader
  that checked it read every thread as empty. Test for iterability, and
  test readers against a real Document root, not plain objects.
- `DocumentProvider` detaches on unmount only if the attach had finished,
  so leaving a channel mid-attach leaves it attached and a later attach of
  the same key fails. The example holds the rail while a channel opens;
  the provider itself needs a fix (follow-up).
- yorkie.dev builds examples from the release tag unless
  `YORKIE_JS_EXAMPLES_REF` pins a commit.
