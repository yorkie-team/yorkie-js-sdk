# Disable GC on Attach — JS SDK

**Goal:** Mirror the server-side `disable_gc` opt-out (yorkie PR #1822)
in the JS SDK so a client can attach a Counter / primitive document
without participating in `minVV` tracking or receiving the response
`VersionVector`.

**Spec:** This PR follows the Go-side spec at
`yorkie/docs/design/disable-gc-on-attach.md`. The wire contract is the
same. The JS SDK only needs to send the matching field on the right
RPCs and surface the option to user code.

## Plan

- [x] Sync `yorkie.proto` from the canonical yorkie repo — adds
      `bool disable_gc` on `AttachDocumentRequest` (field 4) and
      `PushPullChangesRequest` (field 5).
- [x] Regenerate `yorkie_pb.ts` via `pnpm sdk build:proto`.
- [x] Add `disableGC?: boolean` to `AttachOptions`.
- [x] Store the flag on `Attachment` (per-document state) so each
      subsequent `PushPullChanges` can carry it.
- [x] Set `disableGc` on `attachDocument` RPC from `opts.disableGC`.
- [x] Set `disableGc` on `pushPullChanges` RPC from `attachment.disableGC`.
- [x] Add an integration test under
      `packages/sdk/test/integration/disable_gc_test.ts` covering:
  - opt-out client attach + sync without error
  - mixed opt-in / opt-out clients converge on Counter value
  - re-attach without the option restores normal behavior
- [x] Verify `pnpm sdk build` clean.
- [ ] Verify `pnpm sdk test` against a yorkie server with the
      matching wire contract (released after the Go PR merges).

## Notes

- Server-side semantics (skip `UpdateMinVersionVector`, omit response
  VV) are validated in the yorkie repo's integration tests, so the
  SDK-side tests only verify the SDK plumbing — they pass either way
  because old servers ignore the unknown field and the doc converges.
- This SDK option controls only the wire contract with the server. It
  does **not** disable any local-only Document GC pass.
