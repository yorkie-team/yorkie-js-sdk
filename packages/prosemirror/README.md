# Yorkie ProseMirror

Yorkie ProseMirror is a library that provides ProseMirror bindings for building collaborative rich-text editors with [Yorkie](https://yorkie.dev).

## Features

- Two-way sync between ProseMirror and Yorkie Tree CRDT
- Mark support (bold, italic, code, link) via Yorkie wrapper elements
- Bidirectional position mapping between ProseMirror positions and Yorkie indices
- Cursor and presence sharing across clients
- Block-level and character-level diffing for efficient upstream sync

## Installation

```bash
npm install @yorkie-js/prosemirror
```

### Peer Dependencies

This package requires the following peer dependencies:

```bash
npm install prosemirror-model prosemirror-state prosemirror-view
```

## Usage

### Quick Start with `YorkieProseMirrorBinding`

```typescript
import { YorkieProseMirrorBinding } from '@yorkie-js/prosemirror';

const binding = new YorkieProseMirrorBinding(view, doc, 'tree', {
  markMapping: { strong: 'strong', em: 'em', code: 'code', link: 'link' },
  cursors: {
    enabled: true,
    overlayElement: document.getElementById('cursor-overlay'),
  },
});

binding.initialize();

// When done:
binding.destroy();
```

### Read-only viewers

A view made read-only the ProseMirror way still dispatches selection-only
transactions when the user clicks, so by default the binding would publish that
viewer's selection as presence. It does not: when `publishSelection` is
omitted, the binding follows `view.editable`, so a read-only viewer shares no
selection while still seeing everyone else's cursors.

```typescript
const view = new EditorView(host, { state, editable: () => canWrite });
```

The policy is re-read on every publish, so a view that flips to read-only
mid-session stops publishing — and the binding clears the selection it had
already published, on the next transaction, so peers drop that cursor instead
of rendering it where it was last seen.

Set the option explicitly to override that policy in either direction. It is
outbound only — the binding keeps subscribing to other clients' presence and
rendering their cursors either way.

```typescript
const binding = new YorkieProseMirrorBinding(view, doc, 'tree', {
  publishSelection: false, // never publish, even in an editable view
});
```

Use `cursors: { enabled: false }` instead if you also want to stop rendering
remote cursors.

### Lower-Level Utilities

You can also use the individual sync functions directly:

```typescript
import {
  syncToYorkie,
  syncToPMIncremental,
  syncToPM,
  diffDocs,
  buildPositionMap,
  pmPosToYorkieIdx,
  yorkieIdxToPmPos,
  pmToYorkie,
  yorkieToJSON,
  defaultMarkMapping,
  invertMapping,
} from '@yorkie-js/prosemirror';
```

## Contributing

See [CONTRIBUTING](../../CONTRIBUTING.md) for details on submitting patches and the contribution workflow.

## Contributors ✨

Thanks goes to these incredible people:

<a href="https://github.com/yorkie-team/yorkie-js-sdk/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=yorkie-team/yorkie-js-sdk" alt="Contributors" />
</a>
