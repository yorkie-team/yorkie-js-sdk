# Lessons: Stop retrying size-limit rejections and report them to the app

**Created**: 2026-10-08

- `handleConnectError` branches on the Connect code first and on the Yorkie
  error code second, so any new "do not retry" rule for a `ResourceExhausted`
  error has to go **above** the generic retry block. The existing
  `ErrTooManyAttachments` branch sits below it and is therefore unreachable
  whenever the server sends that error as `ResourceExhausted` — a reminder
  that order, not presence, decides these branches.
- Publishing the new event from `syncInternal`'s catch (next to the existing
  `SyncFailed`) covers both the sync loop and an explicit `sync(doc)` in one
  place, whereas `epoch-mismatch` is published at two call sites.

## Self review

Not run: this branch was produced by an autonomous run with no reviewer
subagent available. Review is left to CI, `@claude review` and a human.
