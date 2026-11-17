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
- yorkie.dev builds examples from the release tag unless
  `YORKIE_JS_EXAMPLES_REF` pins a commit.
