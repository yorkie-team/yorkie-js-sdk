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

### Risks and Mitigation

| Risk | Mitigation |
|---|---|
| Remote changes may cause cursor jumps | `syncToPMIncremental` dispatches minimal transactions so ProseMirror step mapping preserves cursor position; `syncToPM` (full rebuild) is only used on initialization and as an error fallback |
| Position map is O(n) per character lookup | Acceptable for typical document sizes; can be optimized with binary search if needed |
| Mark wrapper elements increase Yorkie tree size | Minimal overhead for typical documents; only affects formatted text spans |
| Block-level replacement can overwrite concurrent edits in same block | Character-level diffing is used when possible; block replacement is only a fallback for structural changes |
