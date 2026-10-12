# Lessons: tree element/text boundary

**Created**: 2026-10-12

- The JS `children` getter already filters tombstones, so the old
  `children[0] === node` check matched Go's `FirstChild()`. The existing
  `prevSibling` getter gives the previous visible sibling, which makes the
  port a one-liner with the same semantics as Go's loop.
- Porting the Go tests one to one, with the same actor IDs and base tree,
  gives the same XML on both SDKs, including the RGA tie-break order for two
  inserts at one boundary (`x|`). A port that matches those strings resolves
  the same positions as Go.
