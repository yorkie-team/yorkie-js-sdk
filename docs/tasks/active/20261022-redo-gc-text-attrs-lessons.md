# Lessons — Redo after GC must keep the re-inserted text's attributes

## What the bug taught

A span set that is only ever *re-tombstoned* hides an incomplete payload.
`retombstoneSpans` was built for the undo direction, where only the identity
(createdAt + offset range) is read, so an empty attribute map passed every
test. The redo reuses the same span as restore content, and there the value
matters — but only on a replica that purged the node, because an
un-tombstone path reads the surviving node, not the span. Two independent
conditions had to line up for the divergence to show.

Rule of thumb: a payload that is sometimes identity-only and sometimes
content-bearing has to be built for the content-bearing case.

## Review rounds

Not run — `/self-review` is unavailable in this autonomous run (no reviewer
subagent is granted). The branch's reviewers are CI, `@claude review`, and a
human.
