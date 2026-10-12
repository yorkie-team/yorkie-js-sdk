# Send presence as a patch when the server advertises presence-patch

**Created**: 2026-10-11
Tracked as #1476

## Goal

Send only the changed top-level presence keys as a `CHANGE_TYPE_PATCH` while
the server advertises the `presence-patch` capability, and fall back to a full
`PUT` whenever a patch cannot be folded. Server side: yorkie-team/yorkie#2164
(design `docs/design/presence-patch.md`, target v0.7.25). The server folds each
patch into a full `PUT` before storing, so only the upload path changes.

## Plan

- [x] `PresenceChangeType.Patch` with `{ presence: Partial<P>, full: P }`. The
      `full` copy never goes on the wire; it is what `Change.execute` applies
      locally and what a fallback rewrite turns into a `PUT`.
- [x] `Channel.set` records a patch only while the document says it may.
      Accumulate the patched keys across several `set()` calls in one update,
      and stay on `PUT` once this context has emitted one (or a `clear()`).
- [x] `ChangePack.capabilities` + `hasCapability`, read from every returned
      pack in `Document.applyChangePack`.
- [x] A base `PUT` is required on attach, after restoring from offline
      persistence, and after `clear()`.
- [x] Refuse to patch a presence the server will not cache (4 KiB,
      64 B per key on top of key and value bytes).
- [x] When a returned pack drops the capability and we have patched, heal with
      a full `PUT` right away.
- [x] `ErrPresenceBaseUnavailable` on push: rewrite the earliest pending patch
      into a `PUT` of its `full`, then resend once. Every path that pushes a
      pack answers it, not push-pull alone — a queue restored from offline
      persistence still holds patches, so attach, detach and remove all go
      through `Client.pushWithPresenceBase` too.
- [x] `fromPresenceChange` decodes a wire `PATCH` rather than throwing. A
      pulled pack does not normally carry one (the server folds each patch into
      the base it holds before storing), but an echo of a pushed change, or a
      peer ahead of this SDK, must not fail the whole pack.
- [x] Unit tests.

## Out of scope

- `PresenceChange.removedKeys`: `set()` never removes a key, so the SDK has no
  producer for it yet. The field stays unwritten.
