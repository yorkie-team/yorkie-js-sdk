# Read-only viewers should not publish selection presence

**Created**: 2026-09-26

Issue #1371. `YorkieProseMirrorBinding` publishes the local selection as
presence for every selection-only transaction and once at the end of
`initialize()`. A view created with `editable: () => false` still dispatches
selection-only transactions on click, so a read-only viewer publishes presence
it should not publish. With an Auth Webhook that grants that client `r` only,
the presence-only PushPull is classified `rw` and rejected with 403 — and
because push and pull share the RPC, the viewer also stops *receiving* edits
for the rest of the session.

The only workaround today is overwriting the private `syncPresence` method.

## What to build

A public, outbound-only switch in `YorkieProseMirrorOptions`:

```ts
new YorkieProseMirrorBinding(view, doc, 'content', { publishSelection: false });
```

- `publishSelection: false` — never publish the local selection.
- `publishSelection: true` — always publish, even in a non-editable view.
- omitted (default) — follow `view.editable`: publish while the view is
  editable, stay quiet while it is not. This is the issue's "alternative or
  complement", and it is what makes the read-only case work with no config.

The receive side is untouched in every case: the binding still subscribes to
others' presence and renders their cursors.

## Tasks

- [ ] `packages/prosemirror/src/types.ts` — add `publishSelection?: boolean`
      with a doc comment that spells out the direction (outbound only).
- [ ] `packages/prosemirror/src/binding.ts` — store the option; add
      `shouldPublishSelection()`, evaluated at publish time (not at
      construction) so a view whose `editable` prop flips later is honoured.
      Guard both publish sites:
      - `syncPresence()` (selection-only transactions + `initialize()`),
      - the `presence.set({ selection })` inside the content-edit branch of
        `setupDispatchTransaction()`.
      Returning before `doc.update()` is what matters: no update, no change to
      push.
- [ ] `packages/prosemirror/test/unit/binding_test.ts` — new unit suite over a
      fake `EditorView` (the package's vitest runs in node, no DOM):
      - default + editable view publishes,
      - `publishSelection: false` publishes nothing on initialize or on a
        selection-only transaction,
      - non-editable view publishes nothing by default,
      - `publishSelection: true` on a non-editable view still publishes,
      - `publishSelection: false` still subscribes to others' presence.
- [ ] `packages/prosemirror/README.md` — document the option.

## Out of scope

`cursors.enabled` and `attach(doc, { disablePresence: true })` keep their
current meaning; this option is strictly about the local selection write.
