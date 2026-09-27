**Created**: 2026-09-27

# Diagnosable failure for a change that cannot be applied (#1367)

## Problem

`Document.applyChangePack` advances the checkpoint *after* applying the
changes, so a change that throws leaves the checkpoint where it was, the
server redelivers the same pack, and the client throws on the same bytes
forever. The only signal is whatever the failing operation happened to throw
(`SyntaxError` from `JSON.parse`, in the case that motivated #1367), with
nothing naming the document, the change or the operation.

## Scope

The issue lists three policies: fail loudly, quarantine the change, or bound
the retries. It also states the first is worth doing regardless of which of
the others is later chosen, and is small. This task implements only the
first — annotate and rethrow — and deliberately does not change which packs
are applied or how the checkpoint advances.

## Plan

- [x] Add `Code.ErrChangeApplyFailed` and a `ChangeApplyError` class to
      `util/error.ts` carrying the document key, the change ID, the failing
      operation index and its test string, and the original error as `cause`.
- [x] `Change.execute` — wrap each `operation.execute` so the failing
      operation's index and description are captured where they are known.
- [x] `Document.applyChange` — annotate with the document key on the way out
      (the existing catch already drops the contaminated clone).
- [x] `Document.applyChangePack` — log one `logger.error` line naming the
      document, the stuck checkpoint and the change, then rethrow, so the
      redelivery loop is diagnosable from a single log line.
- [x] Export `ChangeApplyError` from `yorkie.ts`.
- [x] Unit test: `test/unit/document/change_apply_error_test.ts`.
- [x] `pnpm verify:fast`.

## Non-goals

- Advancing the checkpoint past an unapplicable change (quarantine).
- A poison-pill retry counter.
- Any change to `client.ts` sync/retry behaviour.
