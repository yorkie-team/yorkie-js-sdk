---
title: Zero Tree
created: 2026-10-20
updated: 2026-10-21
target-version: 0.7.26
status: prototype
tags: [zero-tree, tree, rga, split, merge, concurrent-editing, undo-redo, gc]
---

# Zero Tree — a Yorkie data type for Zero documents (prototype design)

> **Status: prototype, proposed as a Draft PR; not for merge as is.**
>
> Prototype written 2026-10-20; storage and server added 2026-10-21. It
> consists of JS SDK v0.7.25 + protobuf messages + a Go server prototype (on
> top of yorkie v0.7.25, §11, §13). The server side covers model computation
> (`Marshal`), YSON (revisions, compaction) and schema rules. Migrating existing
> Tree documents is out of scope. Measurement results are in
> [zero-tree-measurement.md](./zero-tree-measurement.md).

## 0. Summary

A Zero document is stored as **one flat sequence of tokens: "open markers
(type, depth, attributes) + characters"**, and that sequence is put into the
RGA (`RGATreeSplit`) that Yorkie already makes converge. Enter (a chain of
splits in Zero) becomes **one insertion of a group of markers**, joining
paragraphs becomes **deleting one marker**, and formatting becomes **an LWW
attribute write on a marker**. The editor model is computed as **a pure
function of the live tokens only**. So concurrent Enter reduces to the same
problem as "concurrent character insertion at the same position" (concurrent
Enter at the same position collapses into one line through a boundary key), and
there is no decision at all that reads the tree at apply time (the §7.4 kind).

| Same harness, default document, 2 replicas, 3000 scripts | Zero Tree | Tree · Enter as one 2-level edit | Tree · Enter as two calls (current) |
| -------------------------------------------------------- | --------: | -------------------------------: | ----------------------------------: |
| I1 divergence                                            |     **0** |                             1147 |                                1206 |
| I2 character loss                                        |     **0** |                              489 |                                 483 |
| I3 paragraph without a text node                         |     **0** |                              679 |                                 918 |
| I5 not reconciled by received operations alone           |     **0** |                             2905 |                                1820 |
| Different result with GC on vs off                       |     **0** |                               19 |                                  21 |

Across 14,000 scripts in total, including the 4-replica, link/image document
and GC-on sets, Zero Tree is 0 on all of them
([measurement report](./zero-tree-measurement.md)). The numbers are compared
only within the same harness.

---

## 1. Problem and goals

- In the general-purpose Tree, concurrent Enter at the same paragraph boundary
  (a) makes replicas diverge and (b) creates empty paragraphs without a text
  node. The root cause is §7.4 of `CRDTTreeNode.split()` (it reads the local
  tree at apply time to move empty elements; yorkie#2240/#2242/#2187).
- Goal: a data type whose **behavior exactly matches the Zero editor**. That is:
  1. When the Zero operations produced by one person running Zero commands are
     put in as they are, the model computed by the data type is **the same as
     Zero's own model**.
  2. On the receiving side, applying the events the data type emits (= Zero
     operations) as they are with OPERATE makes the editor **equal to its own
     CRDT model** (no repair needed).
  3. Concurrent edits converge regardless of arrival order.

## 2. Contracts the existing CRDTs follow (summarized from reading v0.7.25)

| Item               | Text (`CRDTText` + `RGATreeSplit`)                                                                                                    | Tree (`CRDTTree`)                                        | What the new type follows                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------- |
| Element            | Extends `CRDTElement`: `createdAt/removedAt/movedAt`, `deepcopy`, `toJSON`, `getDataSize`, `getGCPairs`                               | Same                                                     | Same (`CRDTZeroTree`)                       |
| JSON handle        | `initialize(context, crdt)`; on edit, **applied immediately to the clone CRDT** + `context.push(op)` → later `op.execute` on the root | Same                                                     | Same (`ZeroTree`)                           |
| Position           | `RGATreeSplitPos` (node id + relative offset, identity-based)                                                                         | `CRDTTreePos` (parent/left sibling id)                   | Identity-based position (`RGATreeSplitPos`) |
| Insert convergence | After the left origin + "skip tickets newer than mine"                                                                                | Sibling skipping + split rules (§7.4 etc.)               | Text's RGA rules as they are                |
| Delete             | Using the change's version vector, "only nodes whose creation was known"                                                              | Same                                                     | Same (+ the ledger in §8 below)             |
| Operation result   | `ExecutionResult {opInfos, reverseOp}`                                                                                                | Same                                                     | Same                                        |
| Undo               | Identity-based restore/retombstone spans                                                                                              | Node id reassignment (reconcileTreeNodeID) etc.          | Text's way (identity) — no position fix-up  |
| GC                 | Tombstones registered as `GCPair`, position barrier via `purgeBarrierAt`                                                              | Same                                                     | Text's RGA GC as it is                      |
| Event              | `edit/style` (index)                                                                                                                  | `tree-edit/tree-style` (from/to path, **no splitLevel**) | **List of Zero operations** (`zero-tree`)   |
| Storage            | protobuf (`converter`)                                                                                                                | protobuf                                                 | protobuf (§11)                              |

## 3. What Zero actually does (confirmed with probes)

We ran the Zero core headless on jsdom and printed `getLastOperations()`
(probe tests in the external harness, not in this repository).

| Action                                        | Zero operations                                                    | Resulting model                                               |
| --------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------- |
| `abcd\|efgh` Enter                            | `split [0,0,4]`, `split [0,1]`                                     | `[abcd] [efgh]`                                               |
| Enter at the end                              | `split [0,0,8]`, `split [0,1]`                                     | `[abcdefgh] [""]` ← **an empty line = one empty inline-text** |
| Enter at a formatting boundary `ab\|cd(bold)` | `split [0,0,2]`, `split [0,1]`                                     | `[ab] ["", cd]` ← an empty inline remains                     |
| Enter inside a link                           | `split [0,1,0,2]`, `split [0,1,1]`, `split [0,2]`                  | **3-level chain**                                             |
| Enter after an image                          | `split [0,2,0]`, `split [0,3]`, `delete [0,2] 1`                   | Chain + cleanup of the empty inline                           |
| Partial bold → turned off again               | `split…`, `update [0,1] {bold:true}` → `update [0,1] {bold:false}` | `[ab][cde bold:false][fgh]` ← **the boundaries remain**       |
| Backspace merge (same / different formatting) | `merge [1]` (+ `merge [0,1]` only when the same)                   | Inlines with different formatting stay separate               |
| `merge` of inlines with different formatting  | (when put in via OPERATE) **does nothing**                         | edit rule                                                     |
| Text delete offset                            | Handled with `substring` → a negative offset is clamped to 0       | `delete [b,i,-1] 1` = does nothing                            |

Two things here decided the design.

1. **inline-text boundaries depend on history.** Boundaries remain even with
   the same characters and the same formatting, and empty inline-texts remain
   too. A Peritext-style model that keeps formatting per character recomputes
   the model as "runs of characters with the same formatting", so it **cannot
   match the Zero model exactly**. → Inline boundaries also need identity
   (markers).
2. **Enter is a chain of 2–3 splits, depending on depth.** "One paragraph-break
   character" cannot express Enter inside a link or a table cell. → The whole
   chain is expressed as **one group of markers**.

## 4. Data structure

```
CRDTZeroTree
 └ RGATreeSplit<ZeroTokens>          ← same RGA as Text (node = group of tokens, split by offset)
     token = character | ZeroMarker
     ZeroMarker = { type, depth, attrs: Map<key, {value|null, updatedAt}> }   ← LWW per key
```

- Every Zero element node is **one open marker**. There are no close markers. A
  marker at depth d closes every node opened at depth ≥ d.
- The text of an `inline-text` is the characters that follow its marker. Atomic
  nodes such as `inline-image` are markers only (`data.*` attributes).
- Attribute keys are flat: `style.bold`, `attribute.provider`, `data.src` …
  (values are JSON strings, `null` = removed).
- The identity of a marker or character = the absolute offset in
  `RGATreeSplitNodeID(createdAt, offset)`.

Example:
`content > [paragraph > [inline-text "ab", inline-hyperlink > [inline-text "cd"], inline-text(bold) "gh"]]`

```
⟨paragraph:1⟩⟨inline-text:2⟩a b⟨inline-hyperlink:2⟩⟨inline-text:3⟩c d⟨inline-text:2 bold⟩g h
```

Tables are expressed directly by depth:
`table:1 > table-row:2 > table-cell:3 > table-cell-body:4 > paragraph:5 > inline-text:6`.

## 5. View model = a pure function of the live tokens

`buildView(liveTokens)` (`zero_tree_view.ts`) rebuilds the tree with a stack.
**It never reads a tombstone.**

Concurrent editing can leave tokens without the ancestors the schema requires
(for example, characters someone typed after the marker of an inline that
someone else deleted, or a paragraph whose inline markers were all deleted).
Those gaps are filled with **virtual nodes**.

| Situation                                                                     | Rule                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No live text marker before a character (start of a paragraph, after an image) | A virtual `inline-text` with default attributes                                                                                                                                                                                                                                                                                                                                                        |
| A container with no children (a paragraph etc.)                               | The schema's default child (`paragraph → inline-text ""`)                                                                                                                                                                                                                                                                                                                                              |
| No parent that can take the marker                                            | **Attach it under the nearest open ancestor that can take it.** Leaves (inline-text, image) take no children, so they are closed and we move up; if a container cannot take it directly, virtual nodes are filled in only when the chain of default children (cell → cell body → paragraph) can take it. Example: when a link marker is deleted, the inlines inside it become inlines of the paragraph |

Virtual nodes are also determined by the live tokens only. So **convergence of
the model = convergence of the sequence of live tokens**, and GC (which only
removes tombstones) cannot change the model. This is why #2242 (dependence on
GC timing) structurally does not happen.

The schema is **derived from the Zero schema configured in the editor** (plugin
`deriveZeroTreeSchema`, `configureZeroSchema` at `activate`). For each element
definition name and each semantic name (`table-cell-body` etc.), `allowed` =
`getChildrenConstraints().allowedChildTypes`, `defaultChild` = the first child
constraint with `min >= 1` (if none, the first constraint and its first allowed
type), and a type with no children that is not a text node is `atomic`. So
nodes added by plugins (the sample's `image-component > image > inline-image`)
are also filled by the same rules as the editor. Limitation:
`configureZeroSchema` is page-global, so if two editors with different schemas
are opened with Zero Tree on one page, the later one wins (a full
implementation would keep the schema on the tree object).

Explicit note on I3: in this model an "empty line" is **a paragraph with one
empty inline-text**, which is the same as a normal empty line in Zero.
Paragraphs without a text node are never created (a virtual inline fills them).

## 6. Mapping between operations and Zero operations

The data type's editing API is **the list of Zero operations itself**:
`zt.applyZeroOperations(data.getLastOperations())`.

| Zero operation                                  | Zero Tree operation                                                   | Notes                                                                                                                                                                                          |
| ----------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `insert [..,o] "text"`                          | Character insertion (`ZeroTreeEditOperation`)                         | The offset is clamped as `substring` does                                                                                                                                                      |
| `insert [..,i] [node…]`                         | Insertion of the nodes' group of tokens (one RGA node)                | Paste, image, table insertion                                                                                                                                                                  |
| `delete [..,o] n` (text)                        | Character range deletion                                              | `[clamp(o), clamp(o+n))`                                                                                                                                                                       |
| `delete [..,i] n` (node)                        | Deletion of the token range of n nodes                                |                                                                                                                                                                                                |
| `split` **chain** (`[..,i,o]` → `[..,i+1]` → …) | **Insertion of one group of markers** (outer marker first)            | Enter. Chain detection: next split path = parent of the previous path + (index+1)                                                                                                              |
| `split` alone                                   | Insertion of one marker (attributes copied from the node being split) | Partial formatting, boundary split                                                                                                                                                             |
| `merge [..,i]`                                  | Deletion of that node's one marker                                    | Joining paragraphs, joining inlines. First, a marker is inserted for that node's virtual child (Zero also moves empty children, so the target of a following `merge [b-1,k]` must still exist) |
| `update [..] {style,attribute,data}`            | LWW write of marker attributes (`ZeroTreeStyleOperation`)             | For a virtual node, a new marker is inserted to materialize it                                                                                                                                 |

One Enter = one `ZeroTreeEditOperation` = one RGA node
`[⟨paragraph⟩⟨inline-text⟩]`.

## 7. Concurrent merge rules — why arrival order does not matter

1. **Token sequence**: insertion and deletion follow the same `RGATreeSplit`
   rules as Text (left origin + skip newer tickets, delete only nodes known
   through the version vector, GC with tombstone barriers). Text already
   guarantees that this sequence converges.
2. **Attributes**: an LWW register per key on each marker. Commutative and
   associative. Writes also go to deleted markers (for the same reason as
   `canStyle`).
3. **Model**: a pure function of (1) and (2). Therefore it converges.

Why concurrent Enter goes away:

- A and B press Enter at the same position `abcd|efgh` → each inserts one
  `[⟨P⟩⟨I⟩]` node after `d`. The two nodes are only ordered by the RGA rules and
  **cannot interleave** (the tokens of one node are one block).
- **Concurrent Enter at the same position splits only one line** (behavior
  decided on 2026-10-20: "one side splits; if it is already split, the other
  side only moves the cursor"). The result is `[abcd] [efgh]` in any receiving
  order, both cursors are at the start of the second line, and text typed
  afterwards gathers on that line (S2 `[abcd][BAefgh]`). How:
  - Each split marker has a **boundary key** = the ids of the tokens to the
    left and right of the split position (+ the chain length). Only people who
    split the same position without knowing about each other have the same key
    — someone who has seen the earlier person's Enter sees that marker on the
    right, so the key differs and one more line is created (S5c).
  - Before building the model, `dealias`: a later group (in document order)
    with the same key and the same shape (type, depth) is **absorbed into the
    first group** — it opens nothing, its attribute registers are merged by
    LWW, and its ids go into the node's `group`. The later group may be
    anywhere after the first group (if it arrives after the first person typed
    text after their Enter, it is placed after that text). The model index is
    based on the list after absorption, and `indexToPos`, `posToIndex` and
    `idAt` map it to the actual token positions.
  - Joining (Backspace) deletes all markers in `group`, starting with the
    absorbed ones, **by id** — the overlapping Enter does not come back (S11).
    Undo deletes only one's own marker, so if only one side undoes, the other
    side's Enter remains and there are two lines; if both undo, one line (S9,
    S10).
  - Even if the representative marker changes (the one that comes first
    arrives late, or the representative is undone), the model is the same line.
    The compiler gives the new representative the old id (`sameSplitAs`), so
    the event is empty — the receiving side receives no operation and the cursor
    stays where it is.
  - Enter and a partial-formatting split at the same position have different
    chain lengths, so their keys differ (they do not absorb each other).
  - The registers of absorbed markers also go into the attributes of the
    representative node, so when one appears or is deleted, the attributes can
    change even though the tokens are the same. The compiler reconciles the
    remaining model difference once more at the end (`update`).
  - Absorbed markers are part of the line, so other edits must not sweep them
    along: the start of a range is moved to "just before that token" and the end
    to "just after the last token", so absorbed markers at either end of a range
    are not touched (deleting characters had deleted the marker of an
    overlapping Enter, and that marker's formatting disappeared). Conversely,
    when nodes are deleted as a whole, their absorbed markers are deleted
    together by id (if left at the end, the line comes back).
  - Formatting (`update`) is written to all markers of the node
    (representative + absorbed) — even if the owner of the representative
    marker undoes their Enter, the line's formatting remains.
- The problem in the general-purpose Tree came from "split reading the tree at
  apply time to decide where to put the empty piece". Here the only operations
  are **inserting tokens, deleting tokens and writing attributes**, and nothing
  decides by reading apply-time state. This avoids the common reason the
  rejected designs (turning §7.4 off, carrying the decision, deferring the
  move …) failed ("reading the apply-time tree, or fixing a decision made at
  one moment").
- Mapping to the remaining direction from the shared background ("give
  boundaries identity so that pieces of the same boundary end up in the same
  container regardless of arrival order"): boundary = marker token, its identity
  = token id, container = "the nearest live marker before it". A piece
  (character) gets its container only from which marker precedes it, so arrival
  order does not matter.

Semantic choices (questions of "intent", separate from convergence; confirmed
in measurements and scenarios):

| Situation                                                                             | Zero Tree result                                             | Explanation                                                  |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| Concurrent insertion at the same position (Enter at the end + character at the end)   | Larger ticket first                                          | Same as ordinary text CRDTs                                  |
| Concurrent input into a deleted container (delete row vs type in that row's cell, T3) | Characters survive and **attach to the preceding container** | Preserving characters comes first. Tree loses the characters |
| Joining paragraphs while the other side changes the formatting of the right inline    | The joined text has the left formatting                      | Zero's merge semantics (keep the left formatting)            |
| Formatting on an inline the other side split                                          | Does not spread to the split copy                            | Lineage propagation is a next step                           |
| Virtual nodes                                                                         | No attributes (schema default)                               | The cost of not reading tombstones                           |

## 8. Undo

- Reverse operations are **identity-based** as in Text: what was inserted is
  retombstoned, what was deleted is restored (span = createdAt + offset range +
  value). No position fix-up (reconcile) is needed. Attributes are an LWW write
  of the previous value.
- Events go through the same compiler, so **the events of undo and redo are
  also exact Zero operations** (something like Tree's "undo has empty operation
  info" (#1419) structurally cannot happen).

### A shared defect found and how it was fixed (RGATreeSplit, also in Text)

`RGATreeSplit.restore` **always revives** a node if it is a tombstone. It even
revives concurrent deletes the undoing side did not know about, so results
diverge depending on order. It reproduces with plain `yorkie.Text` too (a test
in the external harness, not in this repository: B deletes `d` and undoes, A
concurrently deletes `defgh` → A `abcd` / B `abc`). One more: because a remote
delete is "delete if the creation is known", it also deletes nodes that were
already dead on the deleter's screen (but are alive here because of an undo).

How it was fixed (prototype, `rga_tree_split.ts`):

- A **delete ledger** on each node: the deletes that deleted the node (`dels`),
  and the deletes canceled by undo (`cancels: [delete, cancel time]`).
  `removedAt` = the latest of the deletes that are not canceled.
- A **`removedBy` (the delete being undone)** on the restore span. Restore
  cancels only that one delete. Unknown concurrent deletes remain.
- A remote delete deletes only **nodes that were alive on the deleter's
  screen** (the creation is known, and all deletes the deleter knew about were
  canceled by cancels the deleter knew about).
- Redo (retombstone) is recorded as a new delete, and the `removedBy` of the
  next undo span is changed to that redo.

- When a piece removed by GC is needed again (an undo arrives after it was
  removed): Zero Tree does not take pieces out of the list — §9 ghost nodes.
  (The first version kept only the list of uncanceled deletes of the removed
  piece (`purgedLedger`) and recreated it, but with the real server's GC timing
  the position could differ or applying the change failed. The `purgedLedger`
  path remains only in the Text code.)

Spans without `removedBy` (Text's existing path) behave as before, so the 975
SDK unit tests pass unchanged. Applying this to Text as well needs one field in
the EditOperation redo path and in protobuf `TextRestoreSpan`.

## 9. GC

- Character and marker tombstones are registered as `GCPair` like Text, and the
  `RGATreeSplit.purgeBarrierAt` barrier is used as it is. What differs is **how
  they are removed**.
- **Ghost nodes**: Zero Tree's `RGATreeSplit` does not take nodes out on purge
  (`setGhostPurge`). It only replaces the characters with placeholders
  (`ZeroGhost`, Go `Ghost`) and keeps the position, id, delete ledger and
  markers (including the attribute LWW registers). When an undo revives it, it
  is refilled with the characters from the restore span — characters do not
  change after insertion, so the copy in the span is the original. Markers keep
  receiving concurrent formatting writes even after deletion, so they must not
  be dropped.
- Why this is needed (two defects that appeared when nodes were taken out; they
  show up only with the real server's GC timing = min synced VV):
  1. When an undo recreates a removed piece, it is placed "right before the next
     piece of the same insertion", so it goes after concurrent insertions in
     between (`c de | 가fgh` becomes `c | 가defgh`). This is the
     `findRestoreAnchor` rule shared with Text, so Text has it too.
  2. A marker that was not recreated because a concurrent delete still held it
     is undone by someone who does not know that delete, who then issues the
     next edit with that id → the replica that removed it cannot find the id
     and fails to apply the change (on a server, it cannot build that document's
     snapshot). With ghosts, a replica that removed pieces and one that did not
     differ only in the character values of deleted nodes, and those values are
     not used for any decision. So **GC timing cannot change the result**: 0
     divergence in 6,109 scripts of server-style GC replay and in end-to-end
     tests against a real server (§13).
- Cost: as many nodes as deleted pieces remain forever (the first version's
  `purgedLedger` also remained per piece). Two things were reduced: a ledger of
  "one removedAt, no cancels" is not stored, and times inside the element are
  written as indexes into an author table. A snapshot after typing 1000
  characters one at a time, deleting 900 and running GC went from 44,816 bytes
  in the first version (tombstones taken out) to 24,181 bytes now (schema
  included). Pasting 1000 characters and deleting 900: 1,385 → 1,691. To reduce
  further: merging neighboring ghosts (same insertion, consecutive offsets, same
  ledger) — effective for partial deletion after paste.
- Delete ledgers and ghosts are stored as they are in snapshots (protobuf).
  Swapping in the root from a snapshot gives the same per-script results (4
  replicas, GC, 3000).

## 10. Events the binding receives

```ts
type ZeroTreeOpInfo = {
  type: 'zero-tree';
  path: string;
  operations: Array<[op, path, data?]>;
};
```

- On the replica that executed the operation, looking at the live tokens before
  and after execution, it computes **the Zero operations that change that
  replica's editor model from before to after** (`compileEdit`/`compileStyle`).
  The receiving side applies them as they are with `COMMAND.OPERATE`.
- The compiler translates token changes step by step (deleted → inserted) into
  natural Zero operations, and **checks each step with a built-in applier that
  imitates Zero semantics**. It tries candidates in order and uses the first one
  that matches:
  - Inserting/deleting characters → `insert`/`delete`
  - Inserting a group of markers → the split chain at that position (including
    an end-offset split at the end of text) + `update` for whatever differs
    from the copied attributes
  - A whole new node → `insert [..] [node]`
  - A node deleted entirely, including its inside → one `delete [..] 1`
    (except text nodes — for text, the group of characters → marker, in that
    order). Deleting one token at a time passes through intermediate models the
    editor never has: a virtual `inline-image` without data stands in an empty
    `image`, and the receiving Zero rejected the `insert` that inserts it in
    validation, so the plugin repaired it (found in the browser image scenario,
    repairs 8 → 1)
  - Deleting a marker → `merge` (if formatting differs, **first align it with
    `update`, then** merge — Zero does not join inlines with different
    formatting, **nor nodes of different types (link ← inline-text)**), or
    `merge [b]` + `merge [b-1,k]` when the seam inline is joined too, `delete`
    if empty, `update` if a virtual node stands in its place
  - If no candidate matches, the changed range of top-level blocks is replaced
    with `delete`+`insert` (the result is exact, only the cursor is less
    natural)
- What can be removed from the plugin: the Zero↔Tree converter, splitLevel
  guessing, re-reading after split verification, and diffContent repair.

## 11. Storage format

`resources.proto` (the same file for JS and Go). JS `converter.ts` and Go
`api/converter/zero_tree.go` encode with the same rules, so **same state = same
bytes**.

| Message                                                     | Content                                                                                                                                                                                       |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Operation.ZeroTreeEdit` (body 12)                          | parent, from/to `TextNodePos`, `ZeroTokens content`, executed_at, restore/retombstone `ZeroRestoreSpan`, `RestoreMode`                                                                        |
| `Operation.ZeroTreeStyle` (body 13)                         | parent, `TextNodeID marker_id`, `repeated ZeroAttrWrite` (order preserved, is_removed = null), executed_at                                                                                    |
| `JSONElement.ZeroTree` (body 8), `ValueType.ZERO_TREE = 16` | nodes, created/moved/removed/revived, `repeated ZeroPurgedLedger` (empty for Zero Tree), **`ZeroSchema schema`**, **`repeated bytes actors`**. In a Set's `JSONElementSimple`, as bytes       |
| `ZeroTreeNode`                                              | id, value, removed_at, ins_prev_id, has_ledger, dels, cancels — all times are `ZeroTicket{lamport, delimiter, actor (= index into actors)}`                                                   |
| `ZeroSchema`                                                | text_type, text_types, scoped, single, grid, root_type, atomic, default_child, allowed — lists keep their order (it decides what fills an empty slot)                                         |
| `ZeroTokens` / `ZeroToken`                                  | `repeated ZeroToken` + scope / `oneof {string chars; ZeroMarker marker; uint32 ghost}` — consecutive characters are one string (split by code point), ghost is the number of ghost characters |
| `ZeroMarker` / `ZeroAttr`                                   | type, depth, `repeated ZeroAttr` (key, value, updated_at — updated_at_ref inside the element, is_removed), boundary                                                                           |
| `ZeroRestoreSpan`                                           | created_at, start, end, value, removed_by                                                                                                                                                     |

Decisions: **the schema is document state** — when the tree is created, the
configured schema is copied into the element (about 540 bytes), and readers
build the model with the stored schema (the server too). Times inside the
element are written as indexes into a sorted author table (each 12-byte author
id only once). Attributes are an ordered list, not a map (map order is not
defined, so the bytes would fluctuate); ins_prev only when it is a node already
emitted earlier; the default ledger (one removedAt, no cancels) is not stored;
purgedLedger is sorted. `zero_tree_codec.ts`, for the binding and relaying, is
the hex of protobuf `Change` bytes (64 lines).

## 12. Nested blocks (tables, links, captions)

- They are expressed directly by depth markers. Enter in a cell is the chain
  `split [t,r,c,0,p,i,o]` + `split [t,r,c,0,p+1]` →
  `[⟨paragraph:5⟩⟨inline-text:6⟩]`. Enter in a link is a 3-level chain →
  `[⟨paragraph:1⟩⟨inline-hyperlink:2⟩⟨inline-text:3⟩]`.
- All four rules are determined **by the live tokens only** (independent of GC
  and arrival order). The schema is derived from the editor (§5).

| Rule                                  | What                                                                                                                                                                                                                                                                                                                                          | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Several text types (`textTypes`)      | Not only `inline-text` but all semantic types with `data: "text-data"` (`caption-inline-text`, `inline-code-text` …) have their text as character tokens                                                                                                                                                                                      | The text container type is chosen in the order: the parent's default child → the text types it accepts. Before, `caption-inline-text` was classified as an atomic node, so caption text was a single value (when typed concurrently, one side disappeared)                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Removed with the container (`scoped`) | Whatever is put inside **block containers that are not paragraphs (paragraphs have joining)** — table, row, cell, cell body, image-component, caption etc. — is removed together when that container is deleted (a cell inserted into a row being deleted, text typed into a deleted cell or caption, a column inserted into a deleted table) | The inserted group of tokens carries the id of the nearest scoped marker enclosing it at that time (`ZeroTokens.scope`). If that marker is not in the model, the group is dropped too (`dealias`, once from the left). Text inside paragraphs and links lives on in the preceding container as before                                                                                                                                                                                                                                                                                                                                                                             |
| Only one (`single`)                   | Children with `max: 1` (image-component's image and caption, cell body). If two people add a caption concurrently, there is one                                                                                                                                                                                                               | The second one under the same parent (in document order) is dropped together with its contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Column identity (`grid`)              | Add row ∥ add column → the new row is filled with an empty cell; add row ∥ delete column → the new row's cell in that column is also dropped; add column ∥ add column → both                                                                                                                                                                  | A column key on cell markers (`zt.col`): one per column when a table is inserted, copied from the neighboring row when a row is inserted, and one key for one column addition (cell insertions at the same position in the same command). Deleting cells (= deleting a column) writes `zt.del.<key>` on the table marker **after all of that command's operations are applied**. Model: cells of deleted columns are dropped, and live columns missing from a row are filled with empty virtual cells (column order is the merge of the rows' orders). When an edit comes to a virtual cell, that cell's marker is inserted first. `zt.*` keys are not emitted as Zero attributes |

- Confirmed: 55 pairs of table commands in the harness (cell input, Enter,
  add/delete row/column, merge, cell background, table deletion, input outside
  the table) and 6 follow-up edits (input into a filled cell, undo of column/row
  deletion, undo of column addition ∥ input into that column, split after merge
  ∥ add column, input after each adds a column) **all pass** (the current
  plugin fails 3 and 2). All 8 caption cases pass (the current plugin fails
  concurrent caption adding). Browser sample 27/27.
- Remaining table semantics issues (same for both approaches): ① when two people
  do the same merge concurrently, the merged cell's text goes in twice ② merge ∥
  deleting a column in that range does not reduce colspan (the grid cell count
  is correct). Both happen because Zero's merge is "move text + span
  attribute", and they can only be solved by recognizing merge as an operation.

## 13. Out of scope — what is needed and rough size

| Item                                                        | Initial estimate                    | Now (lines of code, excluding comments)                                                                                                                                                                                              |
| ----------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Go `crdt.ZeroTree`                                          | 600~900                             | **Done** 354 (`pkg/document/crdt/zero_tree.go`)                                                                                                                                                                                      |
| Go operations                                               | 300~400                             | **Done** 206 (`pkg/document/operations/zero_tree.go`, execution, reverse operations, restore id validation)                                                                                                                          |
| Go RGATreeSplit ledger and ghosts                           | 200 + tests                         | **Done** 232 (`rga_tree_split.go`; Text also goes through the ledger path)                                                                                                                                                           |
| protobuf                                                    | proto 80, TS/Go conversion 300 each | **Done** proto 114, TS 496, Go 615 (591 + 24 for branches)                                                                                                                                                                           |
| Snapshot and size calculation                               | 200                                 | Included in the converter and DataSize                                                                                                                                                                                               |
| Cross tests                                                 | —                                   | Go `zero_tree_cross_test.go` 221, harness export, snapshot and end-to-end about 400                                                                                                                                                  |
| Go model computation (`buildView`, `dealias`, `toNodeJSON`) | 300                                 | **Done** 781 (`crdt/zero_tree_view.go`). `Marshal` = JS `toJSON` (6,109 scripts × 3 replay modes, identical)                                                                                                                         |
| YSON (`ZeroTree({"content":…,"schema":…})`)                 | —                                   | **Done**: content → tokens (port of `toTokens`, including table column keys) 366 (`crdt/zero_tree_content.go`), yson/json wiring about 50. Creating and restoring revisions, compaction rebuild and validation work on a real server |
| Schema ruleset `yorkie.ZeroTree`                            | —                                   | **Done**: schema language grammar (ANTLR regenerated), rule generation, JS validator, Go validator                                                                                                                                   |
| Migrating existing Tree documents                           | plugin 300 + procedure              | Not done                                                                                                                                                                                                                             |
| Plugin                                                      | net reduction                       | `applyZeroOperations` / `zero-tree` event instead of the converter and repairs (in the Zero plugin's working tree, not in this repository)                                                                                           |

Confirmed:

- JS protobuf version = JSON version: final content hashes per script are all
  the same for 40 scenarios, 5 random sets × 300, and 4 replicas with GC 3000;
  table and caption tests pass.
- JS↔Go: Go replayed the harness server log (6,109 scripts, 104,706
  operations) in server order → Zero Tree element snapshot bytes identical
  (three modes: no GC / minimum of each author's last VV / min synced VV at
  every sync), change re-encoding identical, Go round trip of JS snapshots
  identical.
- Real server (Go prototype, memory DB) + SDK `Client` + the real Zero editor:
  0 divergence, editor mismatch and late-attaching client mismatch in 650
  scripts of change sync and in 150 scripts with a setting where the server
  builds snapshots frequently.
- Existing Go tests (document, crdt, operations, converter, server/packs) and
  the 975 JS SDK unit tests pass.

## 14. Limitations and next steps

1. Performance: the prototype recomputes the model from scratch (O(n)) for each
   operation, and the compiler verifies each step. A full implementation would
   keep marker positions in an index tree (path ↔ token index in O(log n)) and
   run compiler verification only in debug.
2. Formatting lineage: formatting applied to an inline that the other side
   concurrently split does not spread to the copy. With `splitFrom` on split
   copies, applying formatting writes that did not know about that split to the
   copies too would spread it regardless of order.
3. Concurrent input into a deleted container (T3) and the table grid (§12).
4. The event compiler's fallback to replacing paragraphs: about 0.03% for the
   default document and around 2% for the link/image document. Most of what
   remains are shape changes that Zero operations cannot express (when the
   inline marker after a link is deleted, its text becomes text inside the
   link — Zero has no operation that changes a node's type). Inside tables, it
   would help to add a per-cell replacement candidate.
5. GC ghosts remain as many as deleted pieces (§9). Merging neighboring ghosts
   and removing them at compaction are the next candidates.
6. Unusual behaviors seen on the Zero side (Zero Tree imitates them as they
   are): ① forward-delete before an empty inline emits `delete [b,i,-1]` and
   deletes nothing. ② `merge` of nodes with different formatting or type is
   silently ignored. Zero operations were not changed this time — exact
   matching was obtained by imitating Zero's semantics as they are. ① is a
   "Delete does nothing" bug for users, so it is a candidate for a fix on the
   Zero side.

## 15. Code locations

JS (in this repository):

| File                                                                | Content                                                                    |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/sdk/src/document/crdt/zero_tree.ts`                       | `CRDTZeroTree`, `ZeroMarker`, `ZeroTokens` (ghosts, refilling), `toTokens` |
| `packages/sdk/src/document/crdt/zero_tree_view.ts`                  | Model computation (`buildView`), schema, Zero applier, event compiler      |
| `packages/sdk/src/document/operation/zero_tree_operation.ts`        | `ZeroTreeEditOperation`, `ZeroTreeStyleOperation`                          |
| `packages/sdk/src/document/json/zero_tree.ts`                       | `ZeroTree` (`applyZeroOperations`)                                         |
| `packages/sdk/src/api/yorkie/v1/resources.proto`, `converter.ts`    | protobuf messages and conversion                                           |
| `packages/sdk/src/api/zero_tree_codec.ts`                           | hex of `Change` bytes for the binding and relaying                         |
| `packages/sdk/src/document/crdt/rga_tree_split.ts`                  | Delete ledger, ghost purge                                                 |
| `root.ts`, `json/element.ts`, `operation/operation.ts`, `yorkie.ts` | Wiring                                                                     |

Go (a yorkie clone, local branch `zero-tree-proto` on top of v0.7.25, not
committed): `pkg/document/crdt/zero_tree.go`, `rga_tree_split.go`, `root.go`,
`pkg/document/operations/zero_tree.go`, `api/converter/zero_tree.go` (+
to_pb, from_pb, to_bytes, from_bytes branches), `api/yorkie/v1/resources.proto`,
cross test `pkg/document/zero_tree_cross_test.go` (`ZT_CASES=<jsonl>`).
