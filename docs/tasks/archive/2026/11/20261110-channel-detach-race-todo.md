**Created**: 2026-11-10

# Channel detach removes a re-attached channel of the same key

`detachChannel` captures its attachment, then waits (`markDetaching` +
`waitForSyncComplete`) before its task calls `detachInternal(key)`, which
tears down **whatever attachment the key holds now**. A Channel of the same
key attached during that wait is the one removed: it stays `Detached` forever
when the old detach's task runs before its first refresh, or reports
`isAttached() === true` while the client no longer holds it (no heartbeat,
no Watch) when the refresh came first.

The Go SDK does not have this: `beginAttach` rejects a same-key attach while
the old resource is still attached, and its teardown is ordered by `syncMu`.

## Plan

- [x] Red: integration tests — detach + immediate re-attach of a new Channel
      with the same key; and the same with the old detach held on an
      in-flight refresh. Both must leave the new channel attached, held by
      the client and receiving broadcasts.
- [x] Fix: `detachInternal` tears down the attachment it is given (the one
      `detachChannel` captured) and clears key-scoped state only while the
      key still maps to it.
- [x] `pnpm verify:fast`, `pnpm sdk test` (own server via `TEST_RPC_ADDR`).
- [x] Self-review (max 3 rounds).

## Review

- Four integration tests in `channel_test.ts` (re-attach before the old
  detach's task / after the new channel's first refresh, detaching the new
  one while the old detach is held, detaching through a stale object): all
  four fail on `origin/main` and pass with the fix.
- `pnpm verify:fast` green; `pnpm sdk test` against a local yorkie main
  build: 144 files, 3939 tests passed.
- Self-review round 1 (correctness/tests): no blocking findings; loop stops.

## Out of scope

- Two live attachments of one key: `attachChannel` overwrites a same-key
  attachment that is not detaching, leaking the first (its Watch keeps
  reconnecting). The Go SDK's `beginAttach` rejects or retires it. Not made
  worse here; to be filed as an issue.
