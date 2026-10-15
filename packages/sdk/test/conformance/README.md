# Conformance Suite

The JS runner of the cross-SDK Tree convergence suite. The script format
(v2; v1 scripts stay valid), the canonical strings, the digests and the
checks (I1-I4 and E, the expect steps) are specified in
yorkie's [`test/conformance/README.md`](https://github.com/yorkie-team/yorkie/blob/main/test/conformance/README.md),
which is the source of truth. This runner and the Go runner there must
produce byte-identical step lines, xml and digests for the same script.

## Files

- `runner.ts`: replays a script in `off` and `minvv` GC modes, with `log`
  or `exchange` delivery, and builds its record.
- `generator.ts`: mulberry32 and `gen(seed, fam, n, steps)`, seed for seed
  the same scripts as the Go generator.
- `tree_conformance_test.ts`: the corpus ledger, the loader rules, the
  exchange arrival order, the parity fixtures and the opt-in large run.
- `tree/`: a copy of yorkie's `test/conformance/tree/`. Do not edit it here;
  change it in yorkie and run `sync.sh`. `tree/SOURCE` holds the yorkie
  commit it was copied from.
- `tree/corpus-digests.json`: the Go runner's `result`, `checks`, `digest`
  and `xmlDigest` for every corpus script, synced with the rest of `tree/`.
  It is what holds the two runners to the same step lines for the ops only
  the corpus has — `undo`, `redo`, `snapshot`, `removeStyle`, `update`,
  `contents` — which no generated script, and so no parity fixture,
  reaches. yorkie regenerates it; never record what this runner produced.

## Running

The suite needs no server and runs with the unit tests:

```sh
pnpm sdk test:unit
pnpm sdk exec vitest run test/conformance
```

- Corpus: each script must give exactly the result its `status.js` names
  (`pass`, `known-diverge`, `known-error`, `known-fail` for `pass`,
  `diverged`, `error`, `fail`). Scripts load strictly, by the same rules as
  the Go runner: an unknown field, op, gen kind, status key or status
  value, a step without an integer `r` in range, or a step missing a field
  its op needs or carrying one it does not take fails, and so does a
  breach of the v2 rules (tree nodes, `update`, `exchange`, `expect`,
  `delivery`). When a change moves a result, update `status.js` in yorkie
  and re-sync. Every script's `expect` steps must hold and must have run,
  whatever its status. `tree/corpus-digests.json` must list exactly the
  corpus scripts, and every script's `result`, `checks`, `digest` and
  `xmlDigest` must be the ones it holds, so the step lines, xml and shapes
  are held to the Go runner's byte for byte. I3 and I4 of diverging seeds
  are pinned by the parity rows' `checks`. A failed `expect` makes the
  result `fail` and its message names the step and replica.
- Exchange orders: a correct CRDT converges whatever order packs arrive
  in, so no record shows whether `orders` reached the documents. The
  runner records each exchange's deliveries (`Replay.arrivals`, not part
  of the record) and the tests hold them, in off and minvv mode, exactly
  to what `orders` calls for, as the Go runner's `TestExchangeOrders` and
  `TestExchangeOrdersCorpus` do.
- Parity: each fixture family's `tree/parity/{family}.json` must exist; it
  is regenerated here, its header and row count must match, and every
  row's `result`, `checks` (I1..I4 and E as five `1`/`0` characters),
  `digest` and `xmlDigest` must match the Go runner's.

Large runs write the rows as JSON and compare nothing:

```sh
CONFORMANCE_FAM=all CONFORMANCE_RUNS=5000 CONFORMANCE_SEED0=1 \
CONFORMANCE_OUT=/tmp/js-all.json pnpm sdk exec vitest run test/conformance
```

`CONFORMANCE_FAM` is a fixture family: `is`, `del`, `merge`, `style`, `all`
or `all3`.

## Syncing

```sh
bash packages/sdk/test/conformance/sync.sh <path-to-yorkie-checkout>
bash packages/sdk/test/conformance/sync.sh --check
```

Syncing warns when the yorkie checkout has uncommitted changes under
`test/conformance/` (SOURCE gets a `-dirty` suffix) or when its HEAD is not
in `origin/main`. `--check`, which the `Conformance Sync` workflow
(`.github/workflows/conformance-sync.yml`) runs for changes under this
directory, fails unless the commit in `tree/SOURCE` is a clean commit **on
yorkie's main**, then fetches that commit and fails if `tree/` differs from
its `test/conformance/tree/`. A fetch by SHA alone proves nothing, because
GitHub serves any commit in the fork network, including one pushed to a fork
or an unmerged pull request; so `--check` asks the GitHub API to compare
the commit with `main` and accepts only `ahead` or `identical`. It sends
`GITHUB_TOKEN` (or `GH_TOKEN`) as a bearer token when one is set. Sync from a
yorkie commit that is merged to main.

`YORKIE_REMOTE` (a URL or a path to a yorkie checkout) makes `--check`
fetch from there instead, for testing a sync against an unmerged yorkie
commit. It skips the main check, says so on stderr, and is refused when
`CI` is set.

When a yorkie change moves a corpus record, yorkie regenerates
`tree/corpus-digests.json` in the same commit (see its README); re-sync
from that commit once it is merged.
