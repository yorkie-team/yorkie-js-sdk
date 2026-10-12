# Lessons — presence patch upload

## Notes

- The motivating case in #1476 (a few hundred selected ids, ~7.4 KB) is itself
  over `maxPresenceBaseSize`, so criterion 6 keeps it on `PUT`. The saving
  lands on presences that stay under 4 KiB but carry one key much larger than
  the one a cursor move touches.
- Pending changes are persisted with `Change.toStruct()`, which is plain JSON
  of the presence change, so the local-only `full` copy survives a reload. That
  is what lets a restored patch still be rewritten into a `PUT`.

## Self review

Not run: this branch was produced by an autonomous run that is granted no tool
able to dispatch the reviewer subagent `/self-review` requires.

## Review panel round 1

- The `ErrPresenceBaseUnavailable` resend had been wired into push-pull alone,
  but attach, detach and remove push the same pack — and a queue restored from
  offline persistence still holds patches, so an attach could fail forever on
  a pack it never rebuilt. All four now go through
  `Client.pushWithPresenceBase`.
- The heal gated on "was patchable a moment ago", which is exactly false for a
  patch minted in an earlier session. The test is now only whether a patch is
  outstanding, and a restore sets that from the queue it rebuilt.
- The heal mints a change as a side effect of applying a pack, so it now asks
  `isMintable()` (the repo's documented check) rather than throwing
  `ErrRefused` out of pack application.
- `acknowledgePushedChanges` — the PushOnly/SyncOff reply path — learns the
  capability too: it is metadata about the server that took the push, not the
  remote state being skipped.
- `fromPresenceChange` decodes a wire `PATCH` instead of throwing. `full` is
  local-only, so a decoded patch has none and `Change.execute` folds its keys
  onto the presence held for that actor.
