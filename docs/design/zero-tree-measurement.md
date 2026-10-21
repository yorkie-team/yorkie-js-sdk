# Zero Tree measurement report (2026-10-20)

> **Status: prototype, proposed as a Draft PR; not for merge as is.**
>
> Measured on 2026-10-20, before the protobuf format and ghost GC of 2026-10-21.
> Where this report says the Zero Tree exchange uses a JSON codec, or that GC
> after undo is handled with `purgedLedger`, [zero-tree.md](./zero-tree.md)
> §8, §9 and §11 describe the current state. The protobuf build was checked
> against the JSON one per script (same hashes).

The design is in [zero-tree.md](./zero-tree.md). The numbers in this report are
compared **only within this harness** (scripts and action ratios differ from
earlier harnesses, such as the "divergence 172/3000" one). The harness is
external (not in this repository).

## 1. Harness

- Per replica: one **real Zero editor** (`@se-zero/core` from a local worktree,
  on jsdom) + one Yorkie `Document`.
- Local edit = run a Zero command (`UPDATE_RANGE` +
  `WRITE`/`LINE_BREAK`/`BACKSPACE`/`DELETE`/`UPDATE`/…) → turn the Zero
  operations from `getLastOperations()` into CRDT operations:
  - **Zero Tree**: `zt.applyZeroOperations(ops)` as is
  - **Tree · Enter as two calls**: the plugin's `toTreeOperations` +
    `applyTreeOperation` as they are (the current plugin path: a text split is
    `editByPath(…, splitLevel 1)`, a paragraph split is `splitByPath`)
  - **Tree · Enter as one call**: same as above, but the split chain is a
    single `editByPath(textPath, textPath, undefined, chain length)`
- Receiving side: Zero Tree applies the Zero operations of the event
  (`zero-tree`) as they are with `OPERATE`. Tree uses the plugin's
  `toZeroOperations` → `withRemovedDataKeys` → `OPERATE`. After that, if
  editor ≠ CRDT, it is repaired with `diffContent` and counted as **"not
  reconciled by received operations alone"** (the real plugin on the Tree side
  does more repairs, such as split verification and re-reading — which means
  those repairs were needed).
- Undo: Yorkie `doc.history.undo()`. Zero Tree applies the undo event with
  OPERATE; Tree re-reads the tree and reconciles, as the plugin does.
- Exchange without a server (a network module in the external harness): push
  (encode) to a server log → pull (decode) → applied with
  `ChangePack.create(key, Checkpoint.of(0n,0), false, changes, vv)`; one's own
  changes are acked with the Checkpoint of the last clientSeq. Tree round-trips
  through `converter.toChangePack`/`fromChanges`, Zero Tree through
  `zero_tree_codec` (JSON, because protobuf had no messages for it yet) —
  **this difference is the limitation of the exchange on the Zero Tree side**
  (it does not go through protobuf or a server).
- GC on: at pull time, as the server does, `garbageCollect` is given **the
  minimum of the version vectors that all replicas reported at their last
  sync**.
- Random scripts (fixed seed `mulberry32`, `SEED*100000+k`): 8–16 actions,
  ratios character 30 · Enter 25 · Backspace 12 · Delete 5 · range delete 8 ·
  bold on/off 10 · alignment 4 · undo 6; after each action, a random replica
  syncs with 30% probability; at the end, everyone syncs twice. Positions are
  chosen "as a ratio within the current document of that replica's editor" (the
  same script of user actions). Two initial documents:
  - Default: `[abcdefgh] [ijkl]`
  - Link, image, formatting:
    `[ab, link(cdef), gh(bold)] [ij, image, kl](center aligned)`
- Invariants: I1 all replicas have the same CRDT model / I2 character ledger
  (only characters that disappeared through local actions count as deleted; all
  script characters are unique) / I3 paragraphs without a text node / I5
  editor = CRDT, reconciled by received operations alone / error = exception
  during apply.
- Sanity check: in 300 scripts without concurrency (everyone syncs after every
  action), all three systems have **0 divergence** — the exchange path is sound
  (Tree has empty paragraphs in 14% and `unacceptable path` errors in 4% even
  with a single editor — the same-boundary re-split defect).

## 2. Scenarios (S1–S8 + tables, links, formatting; single-user match)

✅ = converged, characters preserved, no empty paragraphs, paragraph count as
expected, editor = CRDT, no repairs or errors. Cells show the first replica's
shape (inline texts per paragraph).

| Scenario                                                                            | Zero Tree                                                | Tree one 2-level call                                                                                                                  | Tree two calls                                                                                                                         |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| S1 (2 paragraphs expected)                                                          | ✅ `["abcd"] ["efgh"]`                                   | ❌ empty para 1, paras 3≠2, repairs 2 — `["abcd"] [] ["","efgh"]`                                                                      | ❌ empty para 1, paras 3≠2, repairs 2 — `["abcd"] [] ["","efgh"]`                                                                      |
| S2 (2 paragraphs expected)                                                          | ✅ `["abcd"] ["BAefgh"]`                                 | ❌ divergence, empty para 1, paras 3≠2, repairs 2 — `["abcd"] [] ["B","Aefgh"] ∥ ["abcd"] ["B"] ["Aefgh"]`                             | ❌ divergence, empty para 1, paras 3≠2, repairs 2 — `["abcd"] [] ["B","Aefgh"] ∥ ["abcd"] ["B"] ["Aefgh"]`                             |
| S3 (3 paragraphs expected)                                                          | ✅ `["abcdefgh"] [""] [""]`                              | ❌ repairs 1 — `["abcdefgh"] [""] [""]`                                                                                                | ✅ `["abcdefgh"] [""] [""]`                                                                                                            |
| S4 (2 paragraphs expected)                                                          | ✅ `["abcdefgh"] [""]`                                   | ❌ empty para 1, paras 3≠2, repairs 2 — `["abcdefgh"] [] ["",""]`                                                                      | ❌ empty para 1, paras 3≠2, repairs 2 — `["abcdefgh"] [] ["",""]`                                                                      |
| S5a all separate (2 paragraphs expected)                                            | ✅ `["abcd"] ["DCBAefgh"]`                               | ❌ divergence, empty para 3, paras 5≠2, repairs 6 — `["abcd"] [] [] [] ["D","C","B","Aefgh"] ∥ ["abcd"] [] [] ["D","C","B"] ["Aefgh"]` | ❌ divergence, empty para 3, paras 5≠2, repairs 6 — `["abcd"] [] [] [] ["D","C","B","Aefgh"] ∥ ["abcd"] [] [] ["D","C","B"] ["Aefgh"]` |
| S5b Enter spreads first (2 paragraphs expected)                                     | ✅ `["abcd"] ["DCBAefgh"]`                               | ❌ empty para 3, paras 7≠2, repairs 6 — `["C"] ["B"] ["abcdDA"] [] [] [] ["","","","efgh"]`                                            | ❌ empty para 3, paras 9≠2, repairs 6 — `["abcd"] ["D"] ["C"] ["B"] ["A"] [] [] [] ["","","","efgh"]`                                  |
| S5c spreads one person at a time (5 paragraphs expected)                            | ✅ `["abcd"] ["D"] ["C"] ["B"] ["Aefgh"]`                | ❌ lost BCD, paras 2≠5, editor≠CRDT, repairs 3, errors 3 — `["abcd"] ["Aefgh"]`                                                        | ❌ lost BCD, paras 2≠5, editor≠CRDT, errors 3 — `["abcd"] ["Aefgh"]`                                                                   |
| S6 (2 paragraphs expected)                                                          | ✅ `["he"] ["llXo"]`                                     | ❌ repairs 1 — `["he"] ["llXo"]`                                                                                                       | ✅ `["he"] ["llXo"]`                                                                                                                   |
| S7                                                                                  | ✅ `["abYh"]`                                            | ❌ lost Y, repairs 2 — `["abh"]`                                                                                                       | ❌ lost Y — `["abh"]`                                                                                                                  |
| S8                                                                                  | ✅ `["abcdZefgh"]`                                       | ❌ repairs 2 — `["abcdZefgh"]`                                                                                                         | ✅ `["abcdZefgh"]`                                                                                                                     |
| S9 concurrent Enter, then one side undoes (2 paragraphs expected)                   | ✅ `["abcd"] ["efgh"]`                                   | ❌ lost efgh, empty para 1, editor≠CRDT, repairs 3, errors 2 — `["abcd"] [] <undefined>`                                               | ❌ lost efgh, empty para 1, editor≠CRDT, repairs 3, errors 2 — `["abcd"] [] <undefined>`                                               |
| S10 concurrent Enter, then both undo (1 paragraph expected)                         | ✅ `["abcdefgh"]`                                        | ❌ lost efgh, empty para 1, paras 2≠1, editor≠CRDT, repairs 4, errors 4 — `["abcd"] [] <undefined>`                                    | ❌ lost efgh, empty para 1, paras 2≠1, editor≠CRDT, repairs 4, errors 4 — `["abcd"] [] <undefined>`                                    |
| S11 concurrent Enter, then Backspace (1 paragraph expected)                         | ✅ `["abcdefgh"]`                                        | ❌ empty para 1, paras 3≠1, repairs 2 — `["abc"] [] ["","efgh"]`                                                                       | ❌ paras 2≠1, repairs 2 — `["abcd"] ["","efgh"]`                                                                                       |
| S12 Enter and input, then a late Enter at the same position (2 paragraphs expected) | ✅ `["abcd"] ["BACefgh"]`                                | ❌ divergence, empty para 1, paras 3≠2, repairs 2 — `["abcd"] [] ["BC","Aefgh"] ∥ ["abcd"] ["BC"] ["Aefgh"]`                           | ❌ divergence, empty para 1, paras 3≠2, repairs 2 — `["abcd"] [] ["BC","Aefgh"] ∥ ["abcd"] ["BC"] ["Aefgh"]`                           |
| T1 concurrent Enter in a table cell                                                 | ✅ `<table> [""]`                                        | ❌ empty para 1, repairs 2 — `<table> [""]`                                                                                            | ❌ empty para 1, repairs 2 — `<table> [""]`                                                                                            |
| T2 add row vs cell input                                                            | ✅ `<table> [""]`                                        | ✅ `<table> [""]`                                                                                                                      | ✅ `<table> [""]`                                                                                                                      |
| T3 delete row vs Enter in that row's cell                                           | ✅ `<table> [""]`                                        | ✅ `<table> [""]`                                                                                                                      | ✅ `<table> [""]`                                                                                                                      |
| L1 concurrent Enter inside a link                                                   | ✅ `["ab",<inline-hyperlink>] [<inline-hyperlink>,"gh"]` | ❌ empty para 1, repairs 2 — `["ab",<inline-hyperlink>] [] [<inline-hyperlink>,<inline-hyperlink>,"gh"]`                               | ❌ empty para 1, repairs 2 — `["ab",<inline-hyperlink>] [] [<inline-hyperlink>,<inline-hyperlink>,"gh"]`                               |
| F1 concurrent bold and italic on the same range                                     | ✅ `["formatting"," test"]`                              | ❌ repairs 1 — `["formatting",""," test"]`                                                                                             | ❌ repairs 1 — `["formatting",""," test"]`                                                                                             |
| F2 concurrent formatting on adjacent ranges                                         | ✅ `["칸","00"]`                                         | ❌ repairs 1 — `["칸","","00"]`                                                                                                        | ❌ repairs 1 — `["칸","","00"]`                                                                                                        |
| F3 one person, bold twice at a collapsed cursor                                     | ✅ `["ab","X","cd"]`                                     | ✅ `["ab","X","cd"]`                                                                                                                   | ✅ `["ab","X","cd"]`                                                                                                                   |
| T4 add row at the end of a table vs replace the whole body                          | ✅ `["새 본문"]`                                         | ✅ `["새 본문"]`                                                                                                                       | ✅ `["새 본문"]`                                                                                                                       |

| Single-user action                     | Zero Tree                                                | Tree one 2-level call                                                | Tree two calls                                           |
| -------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------- |
| Enter in the middle                    | ✅ `["abcd"] ["efgh"]`                                   | ❌ repairs 1 — `["abcd"] ["efgh"]`                                   | ✅ `["abcd"] ["efgh"]`                                   |
| Enter at the end and at the start      | ✅ `[""] ["abcdefgh"] [""]`                              | ❌ repairs 1 — `[""] ["abcdefgh"] [""]`                              | ✅ `[""] ["abcdefgh"] [""]`                              |
| Enter at a formatting boundary         | ✅ `["ab"] ["","cd"]`                                    | ❌ repairs 1 — `["ab"] ["","cd"]`                                    | ✅ `["ab"] ["","cd"]`                                    |
| Partial bold → off                     | ✅ `["ab","cde","fgh"]`                                  | ✅ `["ab","cde","fgh"]`                                              | ✅ `["ab","cde","fgh"]`                                  |
| Bold at a collapsed cursor + input     | ✅ `["ab","X","cd"]`                                     | ✅ `["ab","X","cd"]`                                                 | ✅ `["ab","X","cd"]`                                     |
| Enter after paragraph alignment        | ✅ `["ab"] ["cd"]`                                       | ❌ repairs 1 — `["ab"] ["cd"]`                                       | ✅ `["ab"] ["cd"]`                                       |
| Backspace merge (different formatting) | ✅ `["ab","cd"]`                                         | ✅ `["ab","cd"]`                                                     | ✅ `["ab","cd"]`                                         |
| Backspace merge (same formatting)      | ✅ `["abcd"]`                                            | ✅ `["abcd"]`                                                        | ✅ `["abcd"]`                                            |
| Range delete across 3 paragraphs       | ✅ `["akl"]`                                             | ✅ `["akl"]`                                                         | ✅ `["akl"]`                                             |
| Select all and delete                  | ✅ `[""]`                                                | ✅ `[""]`                                                            | ✅ `[""]`                                                |
| Overwrite a selection                  | ✅ `["abZgh"]`                                           | ✅ `["abZgh"]`                                                       | ✅ `["abZgh"]`                                           |
| Paste paragraphs                       | ✅ `["ab"] ["X"] ["Y"] ["cd"]`                           | ❌ repairs 1 — `["ab"] ["X"] ["Y"] ["cd"]`                           | ✅ `["ab"] ["X"] ["Y"] ["cd"]`                           |
| Insert and delete an image             | ✅ `["abcd"]`                                            | ✅ `["abcd"]`                                                        | ✅ `["abcd"]`                                            |
| Enter after an image                   | ✅ `["ab",<inline-image>] ["cd"]`                        | ❌ repairs 1 — `["ab",<inline-image>] ["cd"]`                        | ✅ `["ab",<inline-image>] ["cd"]`                        |
| Enter inside a link                    | ✅ `["ab",<inline-hyperlink>] [<inline-hyperlink>,"gh"]` | ❌ repairs 1 — `["ab",<inline-hyperlink>] [<inline-hyperlink>,"gh"]` | ✅ `["ab",<inline-hyperlink>] [<inline-hyperlink>,"gh"]` |
| Insert a table + Enter in a cell       | ✅ `["y"] <table> [""]`                                  | ✅ `["y"] <table> [""]`                                              | ✅ `["y"] <table> [""]`                                  |
| Add and delete table rows              | ✅ `<table> [""]`                                        | ✅ `<table> [""]`                                                    | ✅ `<table> [""]`                                        |
| Enter, then undo and redo              | ✅ `["abcdefgh"]`                                        | ❌ repairs 1 — `["abcdefgh"]`                                        | ✅ `["abcdefgh"]`                                        |

## 3. Random scripts

### Default document, 2 replicas, GC off

| System                                     | Scripts | I1 divergence | I2 duplicates | I2 loss | I3 empty paragraphs | I5 not reconciled by received ops alone (scripts) | Errors (scripts) |
| ------------------------------------------ | ------: | ------------: | ------------: | ------: | ------------------: | ------------------------------------------------: | ---------------: |
| Zero Tree                                  |    3000 |             0 |             0 |       0 |                   0 |                                                 0 |                0 |
| Tree · Enter as one call (splitLevel 2)    |    3000 |          1147 |             0 |     489 |                 679 |                                              2905 |              110 |
| Tree · Enter as two calls (current plugin) |    3000 |          1206 |             0 |     483 |                 918 |                                              1820 |              106 |

Zero Tree event compiler: 74 of 145713 steps fell back to block replacement

### Default document, 2 replicas, GC on (server min version vector)

| System                                     | Scripts | I1 divergence | I2 duplicates | I2 loss | I3 empty paragraphs | I5 not reconciled by received ops alone (scripts) | Errors (scripts) |
| ------------------------------------------ | ------: | ------------: | ------------: | ------: | ------------------: | ------------------------------------------------: | ---------------: |
| Zero Tree                                  |    3000 |             0 |             0 |       0 |                   0 |                                                 0 |                0 |
| Tree · Enter as one call (splitLevel 2)    |    3000 |          1152 |             0 |     493 |                 681 |                                              2905 |              136 |
| Tree · Enter as two calls (current plugin) |    3000 |          1210 |             0 |     489 |                 920 |                                              1821 |              133 |

Zero Tree event compiler: 74 of 145713 steps fell back to block replacement

### GC dependence (2 replicas)

| System                                     | Scripts compared | Scripts whose final content differs with GC on vs off |
| ------------------------------------------ | ---------------: | ----------------------------------------------------: |
| Zero Tree                                  |             3000 |                                                     0 |
| Tree · Enter as one call (splitLevel 2)    |             3000 |                                                    19 |
| Tree · Enter as two calls (current plugin) |             3000 |                                                    21 |

### Default document, 4 replicas, GC off

| System                                     | Scripts | I1 divergence | I2 duplicates | I2 loss | I3 empty paragraphs | I5 not reconciled by received ops alone (scripts) | Errors (scripts) |
| ------------------------------------------ | ------: | ------------: | ------------: | ------: | ------------------: | ------------------------------------------------: | ---------------: |
| Zero Tree                                  |    3000 |             0 |             0 |       0 |                   0 |                                                 0 |                0 |
| Tree · Enter as one call (splitLevel 2)    |    3000 |          1507 |             0 |     622 |                 760 |                                              2918 |               44 |
| Tree · Enter as two calls (current plugin) |    3000 |          1572 |             0 |     613 |                1125 |                                              2196 |               43 |

Zero Tree event compiler: 294 of 320261 steps fell back to block replacement

### Default document, 4 replicas, GC on (server min version vector)

| System                                     | Scripts | I1 divergence | I2 duplicates | I2 loss | I3 empty paragraphs | I5 not reconciled by received ops alone (scripts) | Errors (scripts) |
| ------------------------------------------ | ------: | ------------: | ------------: | ------: | ------------------: | ------------------------------------------------: | ---------------: |
| Zero Tree                                  |    3000 |             0 |             0 |       0 |                   0 |                                                 0 |                0 |
| Tree · Enter as one call (splitLevel 2)    |    3000 |          1507 |             0 |     626 |                 761 |                                              2918 |               53 |
| Tree · Enter as two calls (current plugin) |    3000 |          1572 |             0 |     616 |                1127 |                                              2196 |               52 |

Zero Tree event compiler: 294 of 320261 steps fell back to block replacement

### GC dependence (4 replicas)

| System                                     | Scripts compared | Scripts whose final content differs with GC on vs off |
| ------------------------------------------ | ---------------: | ----------------------------------------------------: |
| Zero Tree                                  |             3000 |                                                     0 |
| Tree · Enter as one call (splitLevel 2)    |             3000 |                                                     7 |
| Tree · Enter as two calls (current plugin) |             3000 |                                                     7 |

### Link/image/formatting document, 2 replicas, GC off

| System                                     | Scripts | I1 divergence | I2 duplicates | I2 loss | I3 empty paragraphs | I5 not reconciled by received ops alone (scripts) | Errors (scripts) |
| ------------------------------------------ | ------: | ------------: | ------------: | ------: | ------------------: | ------------------------------------------------: | ---------------: |
| Zero Tree                                  |    1000 |             0 |             0 |       0 |                   0 |                                                 0 |                0 |
| Tree · Enter as one call (splitLevel 2)    |    1000 |           350 |             0 |     257 |                 255 |                                               965 |               42 |
| Tree · Enter as two calls (current plugin) |    1000 |           344 |             0 |     235 |                 288 |                                               525 |               37 |

Zero Tree event compiler: 923 of 56119 steps fell back to block replacement

### Link/image/formatting document, 2 replicas, GC on

| System                                     | Scripts | I1 divergence | I2 duplicates | I2 loss | I3 empty paragraphs | I5 not reconciled by received ops alone (scripts) | Errors (scripts) |
| ------------------------------------------ | ------: | ------------: | ------------: | ------: | ------------------: | ------------------------------------------------: | ---------------: |
| Zero Tree                                  |    1000 |             0 |             0 |       0 |                   0 |                                                 0 |                0 |
| Tree · Enter as one call (splitLevel 2)    |    1000 |           350 |             0 |     257 |                 255 |                                               965 |               44 |
| Tree · Enter as two calls (current plugin) |    1000 |           344 |             0 |     235 |                 288 |                                               525 |               40 |

Zero Tree event compiler: 923 of 56119 steps fell back to block replacement

### GC dependence (link/image/formatting, 2 replicas)

| System                                     | Scripts compared | Scripts whose final content differs with GC on vs off |
| ------------------------------------------ | ---------------: | ----------------------------------------------------: |
| Zero Tree                                  |             1000 |                                                     0 |
| Tree · Enter as one call (splitLevel 2)    |             1000 |                                                     0 |
| Tree · Enter as two calls (current plugin) |             1000 |                                                     1 |

### Link/image/formatting document, 4 replicas, GC off

| System                                     | Scripts | I1 divergence | I2 duplicates | I2 loss | I3 empty paragraphs | I5 not reconciled by received ops alone (scripts) | Errors (scripts) |
| ------------------------------------------ | ------: | ------------: | ------------: | ------: | ------------------: | ------------------------------------------------: | ---------------: |
| Zero Tree                                  |    1000 |             0 |             0 |       0 |                   0 |                                                 0 |                0 |
| Tree · Enter as one call (splitLevel 2)    |    1000 |           479 |             0 |     349 |                 359 |                                               966 |               18 |
| Tree · Enter as two calls (current plugin) |    1000 |           493 |             0 |     320 |                 396 |                                               660 |               17 |

Zero Tree event compiler: 2598 of 123953 steps fell back to block replacement

## 4. How to read and interpret

- **Zero Tree is 0 on I1, I2, I3, I5, errors and GC dependence in every set.**
  The receiving side only applied the Zero operations of the events as they are
  with OPERATE and never repaired. Steps that fell back to per-paragraph
  replacement are 0.05–0.09% for the default document and 1.6–2.1% for the
  link/image document (the result is exact, only the cursor is less natural —
  mostly shape changes that need "changing a node's type", which Zero
  operations do not have).
- Tree diverges in about 40% of the same scripts with 2 replicas and about 50%
  with 4 replicas. "Enter as one call (splitLevel 2)" has fewer empty
  paragraphs (I3) than "two calls", but almost the same divergence, and even
  fewer cases reconciled by received operations alone (the event has no
  splitLevel, so the receiving side does not know it).
- Tree's failures are not only a concurrency problem: even in the 300 scripts
  without concurrency there are empty paragraphs in 14% and `unacceptable path`
  in 4% ("same-boundary re-split": cutting the end of the text again at a
  boundary someone else split creates an empty `<i></i>` in the next paragraph
  — reproducible with Yorkie Tree alone).
- The numbers are not compared directly with the earlier harnesses (paragraph >
  inline > text 172 / paragraph > text 51 divergences). The scripts' action
  ratios, going through the real editor, and whether undo is included all
  differ.

## 5. What was found and fixed while measuring (Zero Tree side)

| Symptom (first measurement)                                                                                                                     | Cause                                                                                                                                                                                                                                                                                                            | Fix                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11 divergences in 300 scripts with undo                                                                                                         | `RGATreeSplit.restore` also revives unknown concurrent deletes (**reproduced with plain `yorkie.Text` too**: A `abcd` / B `abc`)                                                                                                                                                                                 | Per-node delete ledger + span `removedBy`; a remote delete deletes only nodes "alive on the deleter's screen"                                                                                                                                                                                  |
| 2 divergences with 4 replicas + GC                                                                                                              | When undo recreates a piece removed by GC, the other remaining deletes are forgotten                                                                                                                                                                                                                             | Remember the remaining deletes of the removed piece with `purgedLedger`                                                                                                                                                                                                                        |
| Not reconciled by received operations alone (a few %)                                                                                           | Zero ignores `merge` of nodes with different formatting or different types                                                                                                                                                                                                                                       | Compiler: align formatting with `update` first, then merge; if the types differ, use another candidate                                                                                                                                                                                         |
| Local model mismatch                                                                                                                            | Zero emits `delete [b,i,-1]` (negative offset) and ignores it through `substring`                                                                                                                                                                                                                                | Interpret it with the same semantics (offset clamping)                                                                                                                                                                                                                                         |
| Character loss in the link document                                                                                                             | When a link marker is deleted, the inlines inside become "children" of the preceding inline                                                                                                                                                                                                                      | Placement rule: under the nearest ancestor that can take it                                                                                                                                                                                                                                    |
| No target after joining                                                                                                                         | A virtual empty inline disappears on joining (Zero also moves empty children)                                                                                                                                                                                                                                    | Materialize the virtual child before joining                                                                                                                                                                                                                                                   |
| (Browser) repeated repairs on the receiving side in the image scenario (imageEditing 8 times)                                                   | The compiler translated an image block deleted as a whole one token at a time, and emitted an `insert` of the data-less virtual `inline-image` that stands in the empty `image` → the receiving Zero rolled it back in validation. The harness's random documents have no image **blocks**, so it was not caught | A node deleted entirely including its inside (except text nodes) becomes one `delete`. 6 cases in an image replay test (5 failed before the fix)                                                                                                                                               |
| (Browser) `width` and `size` of image `data` disappear only on the receiving side                                                               | The plugin applied the Tree-specific `_withRemovedDataKeys` (treat received data as a whole value and delete missing keys) to received operations. Zero Tree's operations are the other Zero's partial-merge UPDATE as is                                                                                        | Not applied on the Zero Tree path                                                                                                                                                                                                                                                              |
| (Browser) an orphan `table-row` at the top of the document after concurrent row addition + body replacement                                     | A row marker without an ancestor to take it was put at the top of the document                                                                                                                                                                                                                                   | Added to the placement rule: "fill containers virtually through the chain of default and allowed children" (`fillFor`)                                                                                                                                                                         |
| (Expected-behavior decision) concurrent Enter at the same position creates as many lines as Enters (S1, 3 paragraphs)                           | Enter chains had no boundary key. The key for a single split (left token + number of following markers) became equal to an Enter made **with knowledge** of the earlier one, once the earlier person typed text after their Enter (found in S5c)                                                                 | Key = ids of the left and right tokens (+ chain length); `dealias` absorbs later groups with the same key into the first group; joining deletes the group by id; when the representative changes, the id is inherited so there is no event. Added harness S9–S12 (undo, Backspace, late Enter) |
| (Random runs after the decision) not reconciled by received operations alone 0 → 21–103 scripts (formatting)                                    | When an absorbed marker appears or is deleted, the merged attributes of the representative node change, but the compiler translated only places where tokens changed into steps and did not emit this change                                                                                                     | At the end of compilation, reconcile the remaining model difference once more with `step` (`update` if only attributes differ)                                                                                                                                                                 |
| (Random runs after the above fix) not reconciled by received operations alone 0–2 scripts (alignment or formatting disappears on one side only) | The start of a character delete range was moved to "just after the previous token", so the absorbed markers in between (the other markers of an overlapping Enter) and their formatting were deleted too                                                                                                         | Move the range start to just before the token and the end to just after the token, separately. When deleting nodes as a whole, delete absorbed markers together by id. Formatting is written to all markers of the node                                                                        |
| (Browser) wrong repairs on the other side                                                                                                       | The plugin compared after converting the CRDT to the Tree shape and back (data objects etc. changed)                                                                                                                                                                                                             | Zero Tree compares the model as is                                                                                                                                                                                                                                                             |

After all fixes, the tables above were measured again from scratch. The SDK
unit tests (975) passed unchanged every time (the one remaining file,
`tree_schema_integration_test`, does not open because `antlr4ts` is missing in
this clone — unrelated to the change).

Schema: the harness uses the SDK default schema; the browser uses the schema
the plugin **derives from the schema configured in the editor**
(`deriveZeroTreeSchema`). Derived from the default Zero schema, it differs from
the SDK default in one thing — the cell body (`table-cell-body`) does not accept
`table` (the editor side is correct).

## 5.1 Real browser — sample app (collaborative-app) + plugin `backend: "zero-tree"`

- Setup: the sample app runs with a Vite config in the external harness (port
  5392), with the SDK swapped for this clone. Instead of a server, a local relay
  in the external harness (port 5391: change log, push/pull, min version vector,
  online participants) and a `RelayClient` shaped like `yorkie.Client` (push +
  pull every 150ms). The plugin is **unchanged** — only `backend` and
  `createClient` are passed. The plugin derives the schema from the editor. The
  DevTool tab shows Zero Tree in a Tree-shaped view.
- By hand: real key input in 4 tabs (4 participants) — four concurrent Enters at
  different positions `[ab][Bc][Ad][C][Defgh]`, range delete `[abQ]`, ⌘Z
  `[abQZefgh]`, **four concurrent Enters at the same position (`abcd|efgh`) +
  one character each → `[abcd][BDCAefgh]`** (only one line split, 0 repairs);
  in all of them the four tabs are the same and editor = CRDT.
- Expected behavior for concurrent Enter at the same position (decided
  2026-10-20): "one side splits; if it is already split, the other side only
  moves the cursor" — design §7.
- All sample scenarios (`scenarios.run()`, 27, two editors on one page,
  including the caption plugin): **27 pass, 0 repairs**. "Concurrent Enter" (2
  paragraphs) and "concurrent Enter in a list" (3 items) pass under the
  same-position Enter behavior, and "concurrent table row/column operations"
  passes with column identity (design §12). The receiving side receives no
  operation at all for the other side's same-position Enter — and the cursor
  stays where it is.
- Real key input in captions: two editors offline type X and Y at different
  positions in the same caption `캡션글` → converges to `캡X션Y글`; screen, model
  and CRDT are the same, 0 repairs.
- Observation (not fixed this time): when a character someone else typed at the
  same position lands exactly at my cursor position, my cursor is pushed after
  it (in the 4 tabs above, all four show `BDCA|efgh`). This is cursor handling
  for remote input, unrelated to Enter.
- Receiving-side repairs (resync, the number of times the plugin fixed editor ≠
  CRDT): in one full run, a few dozen at first → 1–2 (table row/column) after
  fixing whole deletion of image blocks and filling data keys → **0** after
  adding column identity. The participant selection conversion warning
  (`the node of the given id should be found`) appears only right after the
  document is replaced as a whole while the other side holds a cursor pointing
  into the old document; Yorkie Tree throws in the same way with
  `cannot find node of CRDTTreePos` in the same situation (common to both
  backends; it goes away once the cursor moves again).

## 5.2 Focused table and caption tests (harness, Zero Tree vs current plugin)

| Set                                                                                                                                                                           |       Zero Tree problems |                                                     Current plugin problems |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----------------------: | --------------------------------------------------------------------------: |
| 55 concurrent pairs of table commands (cell input, Enter, add/delete row/column, merge, cell background, table deletion, input outside the table)                             | **0** (7 before the fix) | 3 (add row∥add column, add row∥delete column, cell Enter∥cell Enter repair) |
| 6 table follow-up edits (input into a filled cell, undo of column/row deletion, undo of column addition∥input, split after merge∥add column, input after each adds a column)  |                    **0** |                                                                           2 |
| 8 caption cases (concurrent input, same position, range delete, image size, image-component deletion, concurrent caption adding, caption adding∥size, caption deletion∥input) | **0** (3 before the fix) |                                  1 (concurrent caption adding → 2 captions) |

"Problem" = divergence, broken grid (different cell counts per row), repair,
error, or a result different from the expected one. The fixes are the four
rules in design §12 (several text types, removed with the container, only one,
column identity). What remains the same for both approaches: the same merge by
two people → merged cell text twice; merge ∥ deleting a column in that range →
colspan unchanged.

## 6. What this measurement does not show

- It does not go through the server (Go) or protobuf (JSON codec). The path
  where the server stores and snapshots Zero Tree changes is outside this
  verification.
- Remote cursor and selection preservation, IME composition, performance (the
  prototype recomputes the model for each operation).
- Semantics of concurrent table structure edits such as add column ∥ add row
  (design §12).
- Action kinds in random scripts: character, Enter, Backspace, Delete, range
  delete, bold, alignment, undo. Paste, image insertion, table commands and redo
  were covered only in scenarios and single-user checks.

## 7. Reproduction

These commands run in the external harness (not in this repository), from its
root directory.

```bash
cd <harness-root>/harness
./run.sh scenarios                      # S1–S8, single-user match, tables and links
N=3000 PEERS=2 INIT=plain ./run.sh random
N=3000 PEERS=4 INIT=plain GC=1 ./run.sh random
SERIAL=1 N=300 ./run.sh random          # sanity check without concurrency
./measure.sh && python3 summarize.py    # everything
./run.sh image-replay                   # image blocks in the sample schema: replay A's operations → event → B OPERATE
./run.sh table-matrix                   # 55 concurrent pairs of table commands + 6 follow-up edits (SYSTEMS=zt,tree2)
./run.sh caption                        # 8 caption cases (caption-block + image-component plugins)
./build_report.sh                       # rebuilds this report
# Browser: start the relay (5391) and the sample (5392), then run await scenarios.run() in the console of http://localhost:5392/?doc=<key>
node ../browser/relay.mjs
npx vite --config ../browser/vite.sample.config.mjs
```
