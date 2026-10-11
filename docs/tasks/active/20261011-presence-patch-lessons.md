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
