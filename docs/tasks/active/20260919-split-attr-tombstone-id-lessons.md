# Lessons — a split copies an attribute tombstone under the same id

**Created**: 2026-09-19

Mirrored from yorkie-team/yorkie#2002. The plan is in
`20260919-split-attr-tombstone-id-todo.md`.

## The mirror found the defect the original hid

Go and this SDK shared two defects; the third was this SDK's alone, and it
only became visible once the first two were fixed. `splitValue` replaced the
left node's value with a new object, so a GC pair registered before the split
purged an orphan and left the real tombstone in the list. On `main` the id
collision had already reduced the count to one, and that one entry purged the
orphan — so the ledger said zero and the content still held a tombstone,
agreeing with nothing.

What surfaced it was refusing to stop at the ledger. The count reached 2, the
gc size drained to `{0, 0}`, and every number said the repair was complete;
walking the actual `RHT`s afterwards is what showed one tombstone still
sitting there. A test that asserts a collector's own report has only checked
that the collector is self-consistent.

## Two rebuild paths, and only one of them works

The natural way to assert "size is a function of content" here is a snapshot
round-trip, which is what the neighbouring tests use. For text attributes it
reports nothing, because `toTextNodes` never writes `isRemoved` — the
tombstone comes back as a live attribute. Reaching for the in-memory
`root.deepcopy()` instead was not a workaround for a test-harness quirk; it
was the only way to separate the defect under repair from a second, larger one
underneath it. Both SDKs have the converter gap, and it is a content bug, not
an accounting one.

## `gcOnlySize` means what the parent's size accounting says it means

The field says "never counted in `docSize.live`", and for a tree attribute
that is literally true. For a text attribute it is false — `getDataSize`
counts removed attributes — and `gcOnlySize` is still the right flag, because
the original the copy was cloned from is carried in live the same way, and a
rebuilt root computes live from the same content. Matching the sibling beat
matching the field's description. Reading the flag's name instead of the two
`getDataSize` implementations would have produced a live/rebuilt divergence in
place of the gc one.

## Object identity is load-bearing in the GC map

Keying the map on (parent, child) needed a name for the parent, and none of
them has one. A `WeakMap` numbering the parents a root has seen supplies it
in a few lines, because the key only ever has to mean something inside one
root. The cost is real but bounded: the key is now tied to object identity, so
anything that replaces a parent object invalidates its registrations silently
— which is exactly the third defect above, arriving from the other direction.
