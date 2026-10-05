**Created**: 2026-09-27

# Offline persistence needs a stable, caller-supplied `clientKey`

Issue: yorkie-team/yorkie-js-sdk#1385

## Problem

`ClientOptions.key` is optional and `Client` mints a `uuid()` when it is
absent (`client.ts`). The server derives the stable actor from
project + client key, so an app that never sets `key` gets a **different actor
on every launch**.

That is harmless until `ClientOptions.store` is set. On attach,
`Document.restoreFromBytes` asserts the persisted `changeID`'s actor equals the
current actor — correctly, because restoring under a different actor would
stamp later edits with the current actor while the restored root keeps the
persisted one, diverging the CRDT. The mismatch makes attach treat the entry as
unusable: it emits `local-changes-dropped` with reason `actor-mismatch` and
clears the entry.

So for a store-backed client with no `key`, **every restart drops 100% of the
un-pushed offline edits** — exactly what offline persistence exists to protect
— and it does so silently (a `logger.warn` plus an event the app must already
have subscribed to).

The store key is also scoped `apiKey/clientKey/docKey`, so a fresh key does not
even find the previous launch's entry under most paths; either way the effect
is total loss of un-pushed work.

## Scope

The issue offers three directions in increasing intrusiveness. This task
delivers (1) and (2) and deliberately does **not** do (3):

1. **Document it** — `ClientOptions.key` and `ClientOptions.store` state that
   restart recovery requires a caller-supplied, persisted key.
2. **Warn at runtime** when `store` is set and `key` is not, since that
   combination cannot survive a restart by construction.
3. ~~Persist the generated key alongside the store~~ — out of scope. It changes
   the default's behaviour, it needs a place in `DocStore` to hold a non-document
   value (the interface is document-keyed and byte-oriented today), and the key
   is needed *synchronously* in the constructor (`storeKey()`, the session lock
   scope) while every `DocStore` method is async. The issue explicitly leaves
   it to the maintainers, and `yorkie-ios-sdk` has to agree on it first.

## Plan

- [x] Extend the `ClientOptions.key` JSDoc: the random default is per-instance,
      so a store-backed client must pass a stable key it persists itself.
- [x] Extend the `ClientOptions.store` JSDoc with the same requirement, next to
      the existing `deactivateOnUnload` note (the other non-obvious
      co-requirement of persistence).
- [x] Warn once in the `Client` constructor when `store` is set and
      `opts.key` is absent.
- [x] Note the requirement in `docs/design/offline-local-persistence.md`
      (Actor identity split + Risks table).
- [x] Unit tests in `packages/sdk/test/unit/client/client_options_test.ts`:
      warns for store-without-key; silent for store-with-key and for
      key-less-without-store.
- [x] `pnpm verify:fast`.

## Out of scope

- Any change to the `DocStore` interface.
- Any change to the `restoreFromBytes` actor guard — it is correct.
- Website docs (tracked separately; the JS docs have no offline-persistence
  section yet).
