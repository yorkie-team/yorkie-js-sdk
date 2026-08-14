# Lessons: mirroring the duplicate CRDTTreeNodeID rules

**Created**: 2026-08-15

## The same bug is louder on the server and quieter here

Go panics on an out-of-range slice; `String.slice` clamps. The identical
corrupted tree crashed the server — which at least produced a stack trace
and a 503 that someone filed an issue about — while the browser silently
skipped the split and edited at the wrong position. The failure that
takes a process down is the one that gets fixed; the one that quietly
writes the wrong content is the one that spreads.

Worth remembering when porting a guard: the JS side often needs the
guard *more*, precisely because nothing else will surface it.

## A rule on one side of the wire is a divergence, not a fix

Dropping duplicated content on the server keeps documents loadable, but a
client that kept the same content now disagrees with the server about
what the document contains, and about what its own positions mean. The
server fix was worth shipping first because it stopped a crash, but it
was not complete until the same rule ran here. Rules that decide which
node an ID names belong to the CRDT, not to one of its implementations.

## Reproducing the corruption beats simulating it

The tests build the duplicate by attaching a node directly to the index
tree and registering it, rather than by calling `edit` with a colliding
ID. Once `dropDuplicateContents` was in place, the edit path could no
longer create the state under test, and tests written that way would
have kept passing while testing nothing. Constructing the corrupted
state directly keeps them honest for documents that already carry it.

## Same-change collisions are legitimate

The first version of the server-side rule treated every colliding ID as
corruption and broke a test where an element split and an insert in one
change legitimately claim the same ID — the delimiters a split consumes
are simulated, not replayed. The discriminator is the content's lamport
and actor against the edit's own. Ported here without rediscovering it,
because the server's test suite had already paid for that lesson.
