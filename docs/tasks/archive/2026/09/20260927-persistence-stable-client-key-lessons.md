**Created**: 2026-09-27

# Lessons — offline persistence needs a stable `clientKey`

## Notes

- The bug is a composition bug, not a bug in any one component. `key` defaulting
  to a uuid is fine; the `restoreFromBytes` actor guard is fine; scoping the
  store key to `apiKey/clientKey/docKey` is fine. It is only the *combination*
  of a random-per-launch key with a durable store that is always wrong, which is
  why nothing on either side had reason to complain. That is the case for
  warning at the point where the two options meet — the constructor — rather
  than deeper in the restore path, where the damage is already done and the
  report reads as an unexplained `actor-mismatch`.

- Deliberately not implementing direction (3) (persist the generated key in the
  store). Two structural reasons beyond "it changes behaviour": `DocStore` is
  document-keyed and holds a snapshot + change log, with no slot for a
  client-scoped value; and the key is consumed synchronously by `storeKey()` and
  the session-lock scope during construction, while the whole `DocStore` surface
  is async — making the default stable would mean deferring client identity
  until after an await, which touches every store-backed path. The issue leaves
  the call to the maintainers and notes `yorkie-ios-sdk` must match, so
  documenting + warning is the part that is safe to land unilaterally.

## Review round 1 (panel)

- The guidance I wrote was worse than no guidance on two counts, both caught by
  the security lens. Suggesting "a user id, a device id" as the persisted key
  ignores that the key is an *unauthenticated identifier* — sent verbatim in
  `ActivateClientRequest.client_key`, with nothing proving the caller owns it —
  so a guessable one is claimable by any client of the same project; and a
  device-scoped one makes the `apiKey/clientKey/docKey` store namespace shared
  by every user of one browser, whose bytes `attach` rehydrates *before* the
  attach RPC. Now: an opaque `crypto.randomUUID()` minted once, scoped to the
  signed-in user, cleared on sign-out, with both reasons spelled out.

- I described a failure mode I had not traced to the end. The `actor-mismatch`
  / `LocalChangesDropped` diagnostic cannot fire in the scenario the JSDoc used
  it to describe: the store key *contains* the client key, so a new launch never
  addresses the old entries and `restoreFromBytes` is never called on them. The
  loss is silent, and the old namespace is stranded — `DocStore` has no
  enumeration or prune, so a durable backend accrues one dead namespace per
  launch. Documented as such; a reclaim API is follow-up needing the same
  cross-SDK agreement as direction (3).

## Self-review

`/self-review` was not run: this autonomous run is granted no tool that can
dispatch the reviewer subagent, and the skill's own rules forbid substituting a
self-read of the diff. Review is left to CI, `@claude review` and a human.

## Verification

- `pnpm verify:fast` (lint, license headers, doc links, SDK build, unit suites).
- Integration suites (`pnpm sdk test`) were **not** run: they need a Yorkie
  server and MongoDB, which this run does not stand up. The change touches no
  runtime behaviour beyond emitting one `console.warn`, so the risk to them is
  a test that asserts on a clean console.
