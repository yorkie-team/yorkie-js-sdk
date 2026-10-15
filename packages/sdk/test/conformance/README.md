# Conformance Suite

The JS runner of the cross-SDK Tree convergence suite. The script format,
the canonical strings, the digests and the checks (I1-I4) are specified in
yorkie's [`test/conformance/README.md`](https://github.com/yorkie-team/yorkie/blob/main/test/conformance/README.md),
which is the source of truth. This runner and the Go runner there must
produce byte-identical step lines, xml and digests for the same script.

## Files

- `runner.ts`: replays a script in `off` and `minvv` GC modes and builds
  its record.
- `generator.ts`: mulberry32 and `gen(seed, fam, n, steps)`, seed for seed
  the same scripts as the Go generator.
- `tree_conformance_test.ts`: the corpus ledger, the parity fixtures and the
  opt-in large run.
- `tree/`: a copy of yorkie's `test/conformance/tree/`. Do not edit it here;
  change it in yorkie and run `sync.sh`. `tree/SOURCE` holds the yorkie
  commit it was copied from.

## Running

The suite needs no server and runs with the unit tests:

```sh
pnpm sdk test:unit
pnpm sdk exec vitest run test/conformance
```

- Corpus: a script whose `status.js` is `pass` must pass; one marked
  `known-diverge` must not. When a fix makes it pass, update `status.js` in
  yorkie and re-sync.
- Parity: each `tree/parity/{family}.json` is regenerated here and every
  row's `result`, `digest` and `xmlDigest` must match the Go runner's.

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
```
