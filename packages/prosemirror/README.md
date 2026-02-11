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

await binding.initialize();

// When done:
binding.destroy();
```

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

See [CONTRIBUTING](CONTRIBUTING.md) for details on submitting patches and the contribution workflow.

## Contributors ✨

Thanks goes to these incredible people:

<a href="https://github.com/yorkie-team/yorkie-js-sdk/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=yorkie-team/yorkie-js-sdk" />
</a>
