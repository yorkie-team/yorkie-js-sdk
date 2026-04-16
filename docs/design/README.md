# Design Documents

New design documents should be based on [TEMPLATE.md](TEMPLATE.md).

## Contents

- [Devtools Extension](devtools.md): Message flow between devtools extension and yorkie-js-sdk
- [ProseMirror Binding](prosemirror.md): Bidirectional sync between ProseMirror and Yorkie Tree CRDT
- [ProseMirror Native Split/Merge](prosemirror-native-split-merge.md): Use Tree.Edit splitLevel and boundary deletion for splits and merges instead of block replacement
- [Tree Split Undo/Redo](tree-split-undo-redo.md): Undo/redo support for Tree.Edit splitLevel=1 via boundary deletion reverse ops

## Guidelines

For significant scope and complex new features, it is recommended to write a
Design Document before starting any implementation work. On the other hand, we
don't need to design documentation for small, simple features and bug fixes.

Writing a design document for big features has many advantages:

- It helps new visitors or contributors understand the inner workings or the
  architecture of the project.
- We can agree with the community before code is written that could waste effort
  in the wrong direction.

While working on your design, writing code to prototype your functionality may
be useful to refine your approach.

Authoring Design document is also proceeded in the same
[contribution flow](../../CONTRIBUTING.md) as normal Pull Request such as
function implementation or bug fixing.
