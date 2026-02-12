---
title: prosemirror-binding
---

# ProseMirror Binding

## Summary

`@yorkie-js/prosemirror` provides a binding between ProseMirror and Yorkie's Tree CRDT, enabling real-time collaborative rich-text editing. The package handles bidirectional synchronization of document content, mark/formatting state, and remote cursor positions.

### Goals

- Provide a reusable, framework-agnostic binding between ProseMirror and Yorkie Tree.
- Support rich-text features: bold, italic, code, links, headings, lists.
- Enable concurrent editing with minimal conflicts through character-level diffing.
- Display remote cursors for presence awareness.
- Keep the API surface small: one binding class plus composable utilities.

### Non-Goals

- Supporting ProseMirror collaborative editing via `collab` module (we use Yorkie's CRDT instead).
- Supporting all ProseMirror node types (images, tables, etc. are not yet covered).
- Operational transformation — Yorkie's Tree CRDT handles conflict resolution.
- Schema migration or versioning.

## Proposal Details

### Architecture

```
 Local user keystrokes           Remote changes from server
        |                                  |
        v                                  v
  +-----------+   upstream   +----------+  |  downstream   +-----------+
  | PM Editor | -----------> | Yorkie   | -+- -----------> | PM Editor |
  | (view)    | syncToYorkie | Tree CRDT |  syncToPMIncr.  | (view)    |
  +-----------+              +----------+                  +-----------+
        |                         |
        v                         v
   dispatchTransaction     doc.subscribe('remote-change')
```

The binding (`YorkieProseMirrorBinding`) orchestrates both directions through:

- **Upstream sync**: ProseMirror transaction → Yorkie tree edits (`diff.ts`)
- **Downstream sync**: Yorkie remote operations → ProseMirror transaction (`sync.ts`)
- **Presence sync**: Local cursor → Yorkie presence → Remote cursor decorations

| File                  | Responsibility                                          |
|-----------------------|---------------------------------------------------------|
| `binding.ts`          | Orchestrator: wires upstream, downstream, presence, IME |
| `diff.ts`             | Upstream: PM doc diff → Yorkie `tree.edit()` calls      |
| `sync.ts`             | Downstream: Yorkie tree → PM doc diff → `view.dispatch()` |
| `convert.ts`          | Format conversion: PM JSON ↔ Yorkie tree JSON           |
| `position.ts`         | Bidirectional position mapping: PM positions ↔ Yorkie indices |
| `cursor.ts`           | DOM overlay for remote cursor carets                    |
| `selection-plugin.ts` | ProseMirror plugin for remote selection decorations     |
| `defaults.ts`         | Default mark mappings and cursor colors                 |

The binding bridges two different document models:

**ProseMirror**: Marks (bold, italic) are metadata on text nodes.
```text
paragraph > [text("hello", marks=[strong]), text(" world")]
```

**Yorkie Tree**: No mark concept — formatting is represented as wrapper elements.
```xml
<paragraph><strong><text>hello</text></strong><text> world</text></paragraph>
```

#### Mark-to-Element Mapping

A `MarkMapping` (e.g., `{ strong: 'strong', em: 'em' }`) defines how PM marks translate to Yorkie element types. The `invertMapping()` utility creates the reverse lookup for downstream conversion.

#### Span Wrapping

Yorkie requires a parent's children to be homogeneous (all text or all element). When a paragraph contains both bare text and mark wrapper elements, bare text nodes are wrapped in `<span>` elements to satisfy this constraint. These are unwrapped transparently during Yorkie→PM conversion.

#### Two-Level Diff (Upstream Sync: PM → Yorkie)

When the user edits in ProseMirror, `syncToYorkie()` uses a two-level diffing strategy:

1. **Block-level diff**: Compare top-level blocks to find which changed.
2. **Character-level diff**: If exactly one block changed and its structure (element types, nesting) is identical, perform character-level diffing within that block using `findTextDiffs()`. This produces minimal `tree.edit()` calls, which is optimal for concurrent editing (two users typing in the same paragraph won't overwrite each other).
3. **Full block replacement**: For structural changes (mark add/remove, paragraph splits/merges), replace the entire changed block range.

#### Position Mapper

PM positions and Yorkie flat indices diverge because marks create extra wrapper elements (and `<span>` wrappers) in the Yorkie tree. `buildPositionMap()` walks both trees in parallel, collecting each character's position in both coordinate systems. The resulting map enables `pmPosToYorkieIdx()` and `yorkieIdxToPmPos()` conversions for cursor synchronization.

#### Downstream Sync (Yorkie → PM)

On remote changes, `syncToPMIncremental()` performs a block-level diff between the current PM document and the new state derived from the Yorkie tree, then dispatches a minimal transaction that only touches changed blocks. This preserves cursor position (via ProseMirror step mapping), undo history, and avoids a full DOM re-render. The `diffDocs()` utility compares top-level children using `Node.eq()` and computes PM positions by summing `nodeSize`, returning a `DocDiff` describing the replacement range.

The full-rebuild `syncToPM()` is retained as a fallback (used on initialization and when incremental sync encounters an error). Both functions use `yorkieToJSON()` + `Node.fromJSON()` to avoid the "multiple versions of prosemirror-model" error that can occur when constructing PM nodes programmatically in bundled environments.

### API

#### Utility Functions (Composable)

```typescript
import {
  pmToYorkie,             // PM Node → Yorkie tree JSON
  yorkieToJSON,           // Yorkie tree JSON → PM-compatible JSON
  syncToYorkie,           // Upstream sync orchestrator
  syncToPMIncremental,    // Downstream sync (incremental block-level diff)
  syncToPM,               // Downstream sync fallback (full doc rebuild)
  diffDocs,               // Block-level doc differ (returns DocDiff)
  buildDocFromYorkieTree, // Yorkie tree → PM Node
  applyDocDiff,           // Apply a DocDiff to the PM view
  buildPositionMap,       // Bidirectional position map
  pmPosToYorkieIdx,       // PM position → Yorkie index
  yorkieIdxToPmPos,       // Yorkie index → PM position
  CursorManager,          // Remote cursor overlay manager
} from '@yorkie-js/prosemirror';
```

#### Binding Class (High-Level)

```typescript
import { YorkieProseMirrorBinding } from '@yorkie-js/prosemirror';

const binding = new YorkieProseMirrorBinding(view, doc, 'tree', {
  markMapping: { strong: 'strong', em: 'em', code: 'code', link: 'link' },
  cursors: {
    enabled: true,
    overlayElement: document.getElementById('cursor-overlay'),
  },
  onLog: (type, msg) => console.log(`[${type}] ${msg}`),
});

binding.initialize(); // Load/create tree, set up subscriptions
// ... user edits ...
binding.destroy();    // Clean up
```

#### Intra-Block Character-Level Diff (Downstream)

When a single block is replaced with a single block of the same type, `applyDocDiff()` tries `tryIntraBlockDiff()` before falling back to block-level replacement. This uses ProseMirror's `Fragment.findDiffStart()` / `findDiffEnd()` to find the minimal changed character range within the block, producing a precise `ReplaceStep` (e.g., "insert 5 characters at position 42").

**Why this matters for cursors**: ProseMirror's `StepMap` maps positions through transaction steps. A block-level `ReplaceStep(blockStart, blockEnd, ...)` maps all positions inside `[blockStart, blockEnd]` to the **end of the replacement** (default `assoc=1`). This causes remote cursors inside the same paragraph to jump to the end of the block. The intra-block diff produces a step that only touches the changed characters, so ProseMirror correctly shifts cursors that are before/after the edit point.

```
User A types in paragraph 1, User B's cursor is also in paragraph 1:

Block-level replacement:  ReplaceStep(0, 14, <p>hello world!</p>)
  → StepMap maps ALL positions in [0,14] to 14 → User B's cursor jumps to end

Intra-block diff:         ReplaceStep(12, 12, "!")
  → StepMap shifts positions after 12 by +1 → User B's cursor stays in place
```

#### Feedback Loop Prevention

Both sync directions can trigger each other if not guarded. Two mechanisms prevent infinite loops:

1. **`isSyncing` flag**: Set to `true` during both upstream and downstream sync. Both subscription handlers check this flag and skip if set.

2. **`'yorkie-remote'` transaction meta**: Downstream transactions are tagged with `tr.setMeta('yorkie-remote', true)`. The `dispatchTransaction` override checks this and skips upstream sync for remote transactions.

```
Local edit → dispatchTransaction
  → isSyncing = false, no 'yorkie-remote' meta → upstream sync executes
  → syncToYorkie sets isSyncing = true during doc.update()
  → Yorkie emits local change, but isSyncing blocks re-entry

Remote edit → doc.subscribe('remote-change')
  → isSyncing = false → downstream sync executes
  → syncToPMIncremental sets isSyncing = true
  → Dispatches transaction with 'yorkie-remote' meta
  → dispatchTransaction sees 'yorkie-remote' → skips upstream sync
```

#### IME Composition Guard

IME input (Korean, Chinese, Japanese) uses browser composition events. During active composition, the browser maintains a temporary text node that must not be disturbed by DOM mutations. If a remote transaction modifies the DOM during composition, the browser fires `compositionend` prematurely, breaking the input.

Rather than deferring all remote changes during composition, the binding inspects each remote change to determine whether it affects the composing block:

**On `compositionstart`**: Set `isComposing = true` and capture `composingBlockRange` (the PM position range of the top-level block containing the selection).

**When a remote change arrives during composition**:
1. Build the new PM doc from the Yorkie tree.
2. Compute the block-level diff against the current PM doc.
3. Check if `diff.fromPos..diff.toPos` overlaps `composingBlockRange`.
4. **No overlap**: Apply immediately. Update `composingBlockRange` in case positions shifted.
5. **Overlap**: Set `hasPendingRemoteChanges = true` to defer.

**On `compositionend`**: Flush pending changes via `requestAnimationFrame`. The `requestAnimationFrame` ensures we don't flush between a `compositionend` → `compositionstart` pair (common in Korean where syllables trigger back-to-back events). Deferring only affects the PM view render — the Yorkie document is always up-to-date. When multiple remote changes arrive during composition, `syncToPMIncremental` reads the latest Yorkie tree state on flush, so a single sync captures all accumulated changes.

#### Error Recovery

Both sync directions include fallback paths:

- **Upstream**: If `syncToYorkie` throws, the binding calls `syncToPM` to re-sync the PM view from the Yorkie tree (source of truth).
- **Downstream**: If `syncToPMIncremental` fails (e.g., the intra-block diff produces an invalid step), it falls back to `syncToPM` which does a full document rebuild.
- **Composition guard**: If the diff computation fails during composition, the binding defers the change (safe fallback) rather than risking a broken apply.

### Risks and Mitigation

| Risk | Mitigation |
|---|---|
| Remote changes may cause cursor jumps | Intra-block character-level diff (`tryIntraBlockDiff`) produces precise `ReplaceStep` so ProseMirror's `StepMap` correctly maps cursor positions; block-level replacement is only a fallback for structural changes |
| IME composition broken by remote changes | Fine-grained composition guard defers only changes that overlap the composing block; non-overlapping changes apply immediately |
| Position map is O(n) per character lookup | Acceptable for typical document sizes; can be optimized with binary search if needed |
| Mark wrapper elements increase Yorkie tree size | Minimal overhead for typical documents; only affects formatted text spans |
| Block-level replacement can overwrite concurrent edits in same block | Character-level diffing is used when possible; block replacement is only a fallback for structural changes |
