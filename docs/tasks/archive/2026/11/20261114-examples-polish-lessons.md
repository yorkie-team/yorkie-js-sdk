# Lessons: polish the example apps

**Created**: 2026-11-14

- Under `pnpm dev` the Yorkie Watch stream never goes idle, so Playwright's
  `networkidle` never fires. Wait for `load`, then for the app's own
  "connected" state.
- yorkie.dev shows each example in iframes of about 590x250. An app that only
  looks right full-screen looks broken there, so check that size too.
- The yorkie.dev deploy fetches examples from the release tag. A change here
  reaches the yorkie.dev example pages only after the next release and the
  homepage version bump. The live previews at
  `yorkie.dev/yorkie-js-sdk/examples/<name>/` are different: they redeploy
  on every merge to `main`.
- A prefix/suffix diff over a JavaScript string works in UTF-16 code units
  and can cut an emoji in half. Yorkie rejects such an edit. Move the cut
  points off surrogate pairs before calling `Text.edit`.
- Re-rendering a controlled textarea during IME composition drops the
  composed syllable. Queue remote edits until `compositionend`.
- `@react-hook/throttle` keeps only the last call's arguments. Collect
  per-call diffs before throttling the write.
- The smoke tests passed for every app. The issues above surfaced only in a
  diff review against the SDK source.
