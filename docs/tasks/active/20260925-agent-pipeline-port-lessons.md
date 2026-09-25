# Port the `@claude` agent pipeline from yorkie — lessons

**Created**: 2026-09-25

- yorkie's pipeline is a port of wafflebase, not an original. For a pnpm repo,
  the pnpm-shaped pieces come from wafflebase; the security adaptations come
  from yorkie. Neither copy alone is the right base.
- `test/unit` was not server-free: one test in `document_test.ts` synced two
  clients through `withTwoClientsAndDocuments`. Run the suite with no server
  before calling anything a "unit" gate — the directory name is not evidence.
- `crdt_pbt/` needs a server too (it syncs clients), so it stays out of
  `verify:fast` despite looking like a pure property suite.
- ProseMirror's tests were not in CI at all. Porting a "what CI already
  proves" list means reading `ci.yml`, not the package list.
- `pnpm schema test --run` fails: pnpm rejects the flag before vitest sees
  it. `pnpm schema exec vitest run` works.
- Existing clones had `core.hooksPath=.husky/_`. Removing Husky leaves that
  pointing at an ignored directory whose runner exits 0 when the hook file is
  gone — a silent loss of the commit-msg check. `prepare` running
  `setup.sh --check` is what surfaces it.
