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
- `corpus-digests.json`: the `digest` and `xmlDigest` the **Go** runner made
  of every corpus script at `tree/SOURCE`, with the commit it was taken at.
  It is what holds the two runners to the same step lines for the ops only
  the corpus has — `undo`, `redo`, `snapshot`, `removeStyle`, `update`,
  `contents` — which no generated script, and so no parity fixture,
  reaches. See [Regenerating the corpus digests](#regenerating-the-corpus-digests).

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
  whatever its status, and its `digest` and `xmlDigest` must be the ones
  `corpus-digests.json` holds, so the step lines, xml and shapes are held
  to the Go runner's byte for byte. I3 and I4 of diverging seeds are pinned
  by the parity rows' `checks`. A failed `expect` makes the result `fail`
  and its message names the step and replica.
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
in `origin/main`. `--check`, which CI runs, fetches yorkie's `main` from
GitHub and fails unless the commit in `tree/SOURCE` is a clean commit **on
that branch** — a fetch by SHA alone proves nothing, because GitHub serves
any commit in the fork network, including one pushed to a fork or an
unmerged pull request. It then fails if `tree/` differs from that commit's
`test/conformance/tree/`. Sync from a yorkie commit that is merged to main.
`YORKIE_REMOTE` overrides the repository `--check` fetches from.

### Regenerating the corpus digests

After a re-sync that moves `tree/SOURCE`, `corpus-digests.json` has to come
from the Go runner again. In a yorkie checkout at that commit, drop this in
`test/conformance/digestdump_test.go` and run
`go test ./test/conformance -run TestDigestDump`:

```go
func TestDigestDump(t *testing.T) {
	paths, _ := filepath.Glob(filepath.Join(corpusDir, "*.json"))
	out := map[string]map[string]string{}
	for _, p := range paths {
		s, err := LoadScript(p)
		require.NoError(t, err)
		rec := Run(s)
		out[filepath.Base(p)] = map[string]string{
			"digest": rec.Digest, "xmlDigest": rec.XMLDigest,
		}
	}
	b, _ := json.MarshalIndent(out, "", "  ")
	require.NoError(t, os.WriteFile("/tmp/go-corpus-digests.json", b, 0o600))
}
```

Then write `{"source": "<the SOURCE commit>", "runner": "go", "digests":
<that file>}` to `corpus-digests.json`. Never record what the JS runner
produced: a ledger this runner wrote for itself pins nothing.
