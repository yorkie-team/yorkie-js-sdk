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
