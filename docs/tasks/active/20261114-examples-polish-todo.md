# Polish the example apps into one family

**Created**: 2026-11-14

The 17 apps under `examples/` grew one at a time. An audit on 2026-11-14 ran
each app in two headless tabs against a local server, at desktop, mobile and
yorkie.dev iframe sizes. Every app syncs, but most of them never say what to
try, have no loading or error state, and show peers as raw IDs. Each one
looks different: Vite starter CSS, Material blue, a dark theme, Times serif.
Several also have real defects:

- tldraw stays on "Loading..." forever under `pnpm dev` (StrictMode race)
  and leaks a client.
- TodoMVC editing opens an empty input, and pressing Enter deletes the todo.
- React Flow writes `selected` into the shared document.
- CodeMirror never draws remote cursors.
- The presence room list always shows "0 online".
- The document-limit apps never show a limit.
- The polling playground's absolute `pushState` paths break under the
  GitHub Pages base path.

## Plan

- [x] Audit all examples (build, two-tab sync, 1280/390/iframe screenshots,
      console, code, README)
- [ ] Shared look from the yorkie.dev design system ("The Shared Canvas"):
      warm neutrals, orange accent, peer hues for collaborators, Pretendard
- [ ] Same header in every app: name, what to try, an "open another tab"
      link, connection status as text, and peer avatars where the app has
      presence
- [ ] Connecting, offline and error states; no `alert()` or `confirm()`
- [ ] Fix the per-app defects listed above
- [ ] Remove debug logs, dead code and Vite boilerplate; set real titles
      and favicons
- [ ] Rewrite every README in one shape; retake every thumbnail as a
      1200x750 `thumbnail.jpg`
- [ ] Add root shortcut scripts for `react-page-view-counter` and
      `react-polling-playground`
- [ ] `pnpm build:examples`, `pnpm lint:check`, two-tab sync check per app

## Out of scope

- Package-level bugs found on the way (for example, `@yorkie-js/prosemirror`
  does not reposition remote cursors on resize). File these as issues.
- yorkie.dev pages for the examples that are not listed there yet.
