# Lessons — Redo after GC must keep the re-inserted text's attributes

## What the bug taught

A span set that is only ever re-tombstoned hides an incomplete payload. The
redo reuses the same span as restore content, and there the value matters,
but only on a replica that purged the node. A payload that is sometimes
identity-only and sometimes content-bearing has to be built for the
content-bearing case.

## Mirror PRs stay at parity

Review rounds added JS-only changes on top of the mirror: decoding span
attributes with `createdAt` instead of `executedAt`, and flattening every
captured span. Each was defensible alone, but Go stamps recreated attributes
with the restore's `executedAt` (`Text.Restore`), so the two SDKs would
rebuild a purged node differently. They were reverted. When a mirror PR finds
a divergence the reference SDK also has, file it against both SDKs instead of
fixing one side.
