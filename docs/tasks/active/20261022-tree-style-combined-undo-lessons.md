# Lessons — Tree style with both halves must survive the wire

**Created**: 2026-10-22
Tracked as #1498

## Notes

- Earlier rounds of this PR made `execute` run both halves, split the reverse
  into per-node single-purpose ops, and touched CI. Each changed JS behavior
  away from Go, so they were reverted. A convergence fix in one SDK must keep
  the SDKs computing the same thing; a semantic change goes into both SDKs
  together.
- Go is the reference for the wire shape: `toTreeStyle` always writes both
  fields and `fromTreeStyle` reads both. Comparing against it first would have
  kept the fix to the converter.
- Shape-switching on "which field is non-empty" is the pattern to distrust
  whenever both fields can be set at once.
- Unrelated CI fixes go in their own PR (#1505), not on a bugfix branch.
