# Incremental DocStore Interface — Lessons (S1)

**Created**: 2026-09-16

Carried in from the design work that produced this task, so the reshape does
not quietly undo what measurement established. Findings from the
implementation get appended as they arrive.

## From the design phase

**A fixture built in one `update()` understates persistence cost by two orders
of magnitude.** Measuring `toBytes()` on documents assembled in a single
update showed a 20,000-character note at 59 KB; the same text typed one
character at a time is 6.60 MB. Offline there is no GC, so tombstones and
per-keystroke node splits accumulate, and a document is largest exactly while
it is being edited. Any benchmark added for S2 must build its fixture by
editing, not by constructing.

**The change size is constant in document size; that is the whole design.**
~471 B per change whether the sheet holds 1,000 cells or 16,000, against a
snapshot that grows to 5.66 MB. If a future change makes the append path scale
with the document, the design is gone and no threshold tuning will recover it.

**A fixed compaction threshold cannot work** — do not let one back in during
S2. An 8,000-cell sheet's log reaches its snapshot size after ~6,300 edits; a
5,000-character note's after ~50. Two orders of magnitude apart, so the rule
has to be relative to the snapshot.

**Presence-only changes must be persisted like any other.** Dropping them is
tempting — their content is worthless after a restore, since presence is
re-established on reconnect — but they consume a `clientSeq`, and
`restoreFromBytes` restores the persisted checkpoint and changeID verbatim
without renumbering. An omitted one leaves a hole, and the first restored push
is rejected for discontinuity. Excluding presence was correct only while every
change triggered a full snapshot.

**The envelope has an append-only extension rule, and it is load-bearing.**
`toBytes` packs length-prefixed blobs and `fromBytes` tolerates *fewer* than it
expects, nil-guarding each trailing one (this is how pre-epoch and pre-docID
envelopes still decode). Any new field goes last and stays optional. This PR
adds no field, and should not.

## From implementation

_Appended as the work proceeds._
