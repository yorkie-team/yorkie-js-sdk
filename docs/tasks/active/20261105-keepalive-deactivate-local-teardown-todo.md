**Created**: 2026-11-05
Tracked as #1521

# Tear down locally on `deactivate({ keepalive: true })` without the response

## Problem

`deactivate({ keepalive: true })` awaits the `DeactivateClient` response
before it does anything locally: `deactivateInternal()` (status
`Deactivated`, `cancelWatchStream()` on every attachment, docs `Detached`)
runs only after the response, and the returned Promise settles only then
too.

The keepalive option exists for exactly the case where the page is going
away, so the response is the one thing that may never be processed. A page
that calls it in `pagehide` and then enters the back/forward cache is frozen
before the response lands: in Safari the Promise never settles, even after
the page is restored, and in Chrome it settles only at the moment of
restore.

While it is pending the client still reports `isActive() === true`, so
`activate()` returns early and the app keeps using a session the server has
already deactivated. Worse, a late response then runs `deactivateInternal()`
against a client the app has since re-activated.

## Plan

- [x] In `Client.deactivate`, give `keepalive: true` its own path: send the
      `DeactivateClient` request, then tear down locally straight away and
      resolve, instead of awaiting the response.
- [x] Drop the late response and any error from that request — log at debug
      level only. They can only arrive after a restore, by which point the
      client may be a different, live session; `handleConnectError` and the
      auth-refresh retry must not run against it.
- [x] Keep the non-keepalive path exactly as it is: it still awaits the
      response, still refreshes the token on a 401, still throws.
- [x] Unit coverage in
      `packages/sdk/test/unit/client/keepalive_deactivate_test.ts` for the
      four cases in the issue: `isActive()` false immediately, the Promise
      settles with no response, `activate()` right after starts a new
      session, and a late response leaves the re-activated client active.
- [x] CHANGELOG: an Unreleased `Fixed` entry.

## Out of scope

- `detach({ keepalive: true })` (`client.ts`'s `detachInternal` caller at the
  bottom of the queue). The issue is only about `deactivate`; detach does not
  leave the whole client wedged.
- Registering the unload hook on `pagehide` as well as `beforeunload`. The
  issue notes both paths reach the same code, and the fix here is in that
  shared code.
- Anything server-side. The server already handles the request and replies in
  1ms; the bug is entirely in how the client waits for it.

## Verification

- `pnpm verify:fast`
- `pnpm sdk exec vitest run test/unit/client/keepalive_deactivate_test.ts`
- Integration suites not run here (no Yorkie server in this environment); CI
  runs them on the PR.
