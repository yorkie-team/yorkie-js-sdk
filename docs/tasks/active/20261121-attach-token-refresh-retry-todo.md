# Retry attach once after refreshing an expired auth token

**Created**: 2026-11-21
Fixes #1563

A long-lived client replaces its auth token only when the server refuses a
request with `ErrUnauthenticated`. A client that sent nothing for longer than
the token lifetime (an idle viewer, or a device that slept) carries an expired
token into its next request. The sync loop and the Watch streams recover:
they refresh and retry. `attach` refreshed the token too, but then rethrew the
401, leaving the retry to the app. `@yorkie-js/react`'s `DocumentProvider`
only records the error, so the document stayed unopened until a reload.

Seen in production on wafflebase (10-minute tokens, enforcing auth webhook):
`AttachDocument` 401s right after a navigation, after
`ERR_NETWORK_IO_SUSPENDED`, with the token refresh succeeding and nothing
retrying the attach.

## Scope

1. `attach` answers a 401 on its attach RPC by refreshing the token through
   `authTokenInjector` and resending the RPC once
   (`Client.retryAfterTokenRefresh`).
   - Only the RPC is resent, not `attachOnce`: the store restore and the
     initial presence seeding before it are not idempotent.
   - Resending is safe: the server consults the auth webhook before it
     touches the document (`yorkieServer.AttachDocument` calls
     `auth.VerifyAccess` first). The schema-rebind check runs later, after
     the doc row and the client's attaching mark are written; a resend
     reuses both, as an app-driven retry did.
   - The session is checked before the refresh and before the resend.
   - A second 401 is thrown without asking the injector again; a rejection
     from the injector is thrown as before and not handled as a server
     error (`tokenRetryHandled`).
2. Update the `authTokenInjector` doc comment.

## Out of scope

- `detach`, `remove`, manual `sync` and `deactivate` keep rethrowing the 401
  after the refresh. They share the stale-token cause but not the symptom:
  the app already awaits and handles their errors, and the React provider
  swallows detach failures. Tracked as #1564, together with moving the retry
  into one shared layer so callers stop consulting `tokenRetryHandled`.
- A test of the store-backed attach retry (restore and presence seeding run
  once, the RPC twice). The resend wraps only the RPC inside `attachOnce`, so
  the restore cannot re-run; no test pins it. Added to #1564.

## Steps

- [x] Red: `should refresh token and retry attach once the token has expired`
      fails on main with `[unauthenticated]`.
- [x] Fix in `client.ts`; the existing manual-sync test no longer expects
      attach to throw.
- [x] `should throw the second unauthenticated error when the refreshed token
      is refused too` pins one injector call per attach and asserts the resend.
- [x] `webhook_test.ts` green 3 runs in a row against a local server.
- [x] `pnpm verify:fast` steps (lint with `.claude/**` excluded: stray
      worktrees there fail prettier) and the full `pnpm sdk test`: 146 files,
      3963 passed.
- [x] Self review with `/code-review` (high): 3 rounds, the last clean;
      logged in lessons.
- [x] File the out-of-scope issue (#1564).
- [ ] Open the PR.
