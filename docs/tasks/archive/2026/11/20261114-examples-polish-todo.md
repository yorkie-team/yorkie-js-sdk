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
- [x] Shared look from the yorkie.dev design system ("The Shared Canvas"):
      warm neutrals, orange accent, peer hues for collaborators, Pretendard
- [x] Same header in every app: name, what to try, an "open another tab"
      link, connection status as text, and peer avatars where the app has
      presence
- [x] Connecting, offline and error states; no `alert()` or `confirm()`
- [x] Fix the per-app defects listed above
- [x] Remove debug logs, dead code and Vite boilerplate; set real titles
      and favicons
- [x] Rewrite every README in one shape; retake every thumbnail as a
      1200x750 `thumbnail.jpg`
- [x] Add root shortcut scripts for `react-page-view-counter` and
      `react-polling-playground`
- [x] `pnpm build:examples`, `pnpm lint:check`, two-tab sync check per app

## Review

Three independent reviewers read the branch diff. They found these
issues, all now fixed:

- The revision editor cut emoji surrogate pairs and dropped IME input.
- tldraw's throttled writer dropped changes.
- Kanban drops brought back cards a peer had already deleted.
- CodeMirror built a CSS string from a peer-controlled colour.
- The limit check matched any ResourceExhausted error.
- The yorkie.dev mobile page loaded a hidden second client.

## Out of scope

- Package-level bugs found on the way (for example, `@yorkie-js/prosemirror`
  does not reposition remote cursors on resize). File these as issues.
- yorkie.dev pages for the examples that are not listed there yet.
- Server: `ErrTooManyAttachments` has no Yorkie error code, so the SDK's
  `Code.ErrTooManyAttachments` branch never matches and apps must check the
  message.
- SDK: in `handleConnectError` the ResourceExhausted retry runs before the
  limit-code checks, so those checks never run.
- `@yorkie-js/prosemirror`: there is no ResizeObserver, labels use
  `clientID.slice(-2)` with white text, and colours are assigned in arrival
  order instead of coming from presence.
- Kanban: two people moving the same card to different lists at once leave
  two copies. Only a cross-array move or a flat data model avoids this.
- tldraw 1.x is not StrictMode-safe and logs React 19 and zustand warnings.
