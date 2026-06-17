**Created**: 2026-06-16

# Presenceless Document Option — JS SDK

**Goal:** Mirror the server-side `disable_presence` Document option in
the JS SDK so a client can declare a presence-free document, send the
wire field on first attach, observe the server-fixated value from the
attach response, and gate local `Document.update` presence emits.

**Spec:** This PR follows the Go-side task plan at
`yorkie/docs/tasks/active/20260616-presenceless-document-option-todo.md`.
The wire contract is the same (`disable_presence` on
`AttachDocumentRequest` and `AttachDocumentResponse`, both field 5).
JS SDK only sends the wire field on first attach, reads it back from
the response, and arranges local SDK state and React-provider wiring
around the result. Server enforcement (strip on PushPull entry, empty
presence in snapshot, defensive read-path strip) lives in the yorkie
repo and is not duplicated here.

**Branch:** `feat/presenceless-document-option`

## Plan

### Wire contract

- [ ] Sync `yorkie.proto` from the canonical yorkie repo after the
      Go PR merges — adds `bool disable_presence = 5` on
      `AttachDocumentRequest` and `AttachDocumentResponse`.
      *Pending — TODO(yorkie/disable_presence) markers in client.ts
      flag the call sites to activate.*
- [ ] Regenerate `yorkie_pb.ts` via `pnpm sdk build:proto`. Do not
      hand-edit the generated file.
      *Pending — paired with the proto sync above.*

### SDK option surface

- [x] Add `disablePresence?: boolean` to `DocumentOptions`
      (`packages/sdk/src/document/document.ts`).
- [x] Add `disablePresence?: boolean` to `AttachOptions`
      (`packages/sdk/src/client/client.ts`).
- [x] Store the server-fixated value on `Document` with
      `setDisablePresence(boolean)` and `isPresenceDisabled()`
      accessors. Mirror the `setDisableGC` / `getDisableGC` shape that
      already exists on `Document`.
- [x] Store the server-fixated value on `Attachment`
      (`packages/sdk/src/client/attachment.ts`) for devtools /
      debugging visibility. `pushPullChanges` does **not** read it —
      the wire field is request-only, response-driven.
      *Constructor takes the new arg; client passes `false` until the
      proto sync surfaces `res.disablePresence`.*

### attachDocument flow

- [x] Resolve the effective option at attach time:
      `opts.disablePresence ?? doc.isPresenceDisabled() ?? false`.
- [x] Skip the initial `doc.update((_, p) => p.set(opts.initialPresence))`
      call when the resolved option is true (an opt-in client has no
      reason to push presence on attach).
- [ ] Send `disablePresence` on the `attachDocument` RPC payload.
      *TODO(yorkie/disable_presence) at the request-builder site.
      Activate once the proto field lands.*
- [ ] After the response: call `doc.setDisablePresence(res.disablePresence)`
      **before** `doc.applyChangePack(pack)` so any subsequent
      `Document.update` invocation sees the gating state already set.
      *Currently `doc.setDisablePresence(resolvedDisablePresence)` —
      the local-resolved value is wired in the correct place; replace
      with `res.disablePresence` once the proto field is available.*
- [ ] Construct the `Attachment` with the server-fixated value, not
      the local option.
      *Currently `false` placeholder for the Attachment field.
      `Document.disablePresence` already carries the gating state.
      Activate `res.disablePresence` once the proto field is
      available.*

### Document.update gating

- [x] Add `hasPresenceChange()`, `dropPresenceChange()`, and
      `clearReversePresence()` accessors on `ChangeContext`
      (`packages/sdk/src/document/change/context.ts`).
- [x] Inside `Document.update`, after the user callback runs and
      before schema validation: if `this.disablePresence &&
      ctx.hasPresenceChange()`, call `ctx.dropPresenceChange()` plus
      `ctx.clearReversePresence()` and emit a `logger.warn` once per
      document. A subsequent `ctx.hasChange()` returns false naturally
      when no operations remain, so the empty `Change` does not
      enqueue.
- [x] `Document.subscribe('presence', ...)` is left untouched — the
      server never emits presence on watch events for these documents,
      so the natural empty stream is the gate.

### React SDK wiring

- [x] Add `disablePresence?: boolean` prop to `DocumentProvider`
      (`packages/react/src/DocumentProvider.tsx`).
- [x] Pass it through `useYorkieDocument` into both the
      `new Document(key, { disablePresence })` constructor and the
      `client.attach(newDoc, { disablePresence, ... })` call.
- [x] Add `disablePresence` to the `useEffect` deps that own document
      lifetime, matching the `disableGC` pattern.

### Tests

- [x] Add unit coverage under `packages/sdk/test/unit/document/`:
      `DocumentOptions.disablePresence` round-trips through
      `Document.isPresenceDisabled`; `Document.update(p.set)` on a
      presenceless document drops the presence change, preserves
      operations on a mixed change, and warns once per document;
      `setDisablePresence` flip after construction takes effect on
      the next `update`.
      *Implemented in `packages/sdk/test/unit/document/
      disable_presence_test.ts` (9 cases, all passing).*
- [ ] Add an integration test under
      `packages/sdk/test/integration/disable_presence_test.ts`
      covering:
  - opt-in attach + sync without error
  - `doc.isPresenceDisabled() === true` after attach response
  - second client attaching to the same doc without the option
    receives `disablePresence: true` from the server (server-fixated
    value, matches the yorkie task doc Task 5)
  - presence emits from an opt-out client never reach an opt-in
    client subscribed to `'presence'`
  - re-attach with the opposite option still observes the
    fixated server value
  *Deferred — depends on the proto sync and a yorkie server that
  ships `disable_presence` end-to-end.*
- [x] Verify `pnpm sdk build` clean.
- [ ] Verify `pnpm sdk test` against a yorkie server built from the
      matching Go PR (or the released version after the Go PR merges).
      *Deferred — paired with the integration test above.*

### PR

- [x] Open in parallel with yorkie-team/yorkie#1841 — opened as
      yorkie-team/yorkie-js-sdk#1285. Wire send/receive call sites
      stay parked behind `TODO(yorkie/disable_presence)` until the
      server PR merges and `pnpm sdk build:proto` picks up the new
      field.
- [x] Title: `Add disablePresence option for presence-free Documents`
      (≤70 chars). Body links yorkie-team/yorkie#1841 and explains the
      parked TODOs.

## Notes

- Server enforcement is authoritative. Even an old JS SDK (no
  `disablePresence` knowledge) attaching to a presenceless document
  works correctly — its `presence.set` emits travel the wire and the
  server silently strips them. UX impact is "the other side never
  sees my presence," which is acceptable for the counter-only
  workloads this option targets.
- This option does not change `Document` API shape. `usePresences()`,
  `getPresence(actorID)`, and `subscribe('presence', ...)` continue
  to work as before; they simply observe a permanently empty presence
  map on opt-in documents.
- `pushPullChanges` carries no `disable_presence` field by design.
  Server reads the persisted `DocInfo.DisablePresence` on every call,
  so re-sending it would be redundant and would invite drift.
- Application adoption is a one-line change on `DocumentProvider`
  once the package is released. Apps that already rotate the document
  key on a schedule cut new documents over to the opt-in path
  naturally; existing documents stay on the default and age out.
