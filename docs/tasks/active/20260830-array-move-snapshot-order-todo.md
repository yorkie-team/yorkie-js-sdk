# Anchor RGATreeList.insert on position identity

**Created**: 2026-08-30

Server-side counterpart: yorkie#1958 (issue yorkie#1948). A replica that
rebuilt an array from a snapshot reversed a run of appended elements when
the array's last element had been moved into its slot. The server fix
landed in Go; this SDK carried the identical defect, so fixing only Go
would have turned a uniform cross-SDK bug into a permanent
server-vs-client divergence.

## Problem

`RGATreeList.insert` anchored the appended element on the last node's
ELEMENT identity (`this.last.getCreatedAt()`) instead of its POSITION
identity (`getLastCreatedAt()`).

The two are the same until the last element is moved. After a move they
diverge, and `insertAfter` resolves `nodeMapByCreatedAt` first — where
the element's createdAt still keys its now-dead original position node,
since dead positions are retained as stable anchors. So each append
landed after that stale dead slot instead of the tail. Because every
appended element carries the newest ticket, the RGA forward-skip in
`findNextBeforeExecutedAt` never advances, so each append landed
immediately after the same anchor and the appended run came out
reversed.

`fromArray` (`api/converter.ts`) is the only caller of `insert`, which is
why this surfaced solely on the snapshot restore path. `CRDTArray.deepcopy`
already anchored on `clone.getLastCreatedAt()`, so it was never affected —
the mirror image of Go, where `DeepCopy` went through the buggy `Add` and
was affected.

Concretely: a document holding `[14,15,26,66]` decoded from its own
snapshot as `[66,26,14,15]`.

## Tasks

- [x] Add a regression test that round-trips a moved-then-appended array
      through `objectToBytes`/`bytesToObject`
      (`test/unit/api/array_move_snapshot_test.ts`)
- [x] Anchor `RGATreeList.insert` on `getLastCreatedAt()`
- [x] Record why the anchor must be position identity, in the doc comment
- [x] Verify red-to-green: the test fails on `main` with
      `[66,26,14,15]` and passes with the fix
- [x] `pnpm sdk lint`, `pnpm sdk build`, unit suite (343 passed)
- [x] Full integration suite against a local server (2578 passed)

## Review

The fix is one line and mirrors yorkie#1958 exactly. The regression test
builds its fixture through the live document API (`doc.update`), which
anchors on position identity already, so the only `insert` calls are the
ones `fromArray` makes during restore. That keeps the test a genuine
reconstruction-only repro: the pre-snapshot document is correct and only
the restored copy diverges.
