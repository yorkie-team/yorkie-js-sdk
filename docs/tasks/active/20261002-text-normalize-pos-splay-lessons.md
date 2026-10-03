# Lessons: normalizePos walks the whole chain on every edit

**Created**: 2026-10-02

## The same walk costs differently per SDK, but it is still a walk

Go's version allocated per node, so it blew up first and was found first
(yorkie#2107). JS's `getLength()` is O(1), which hid the problem rather than
removing it: the walk is still O(n) per call, and JS calls it more often --
on remote Edits too, with no replay skip and no empty-stack guard on the
reconcile loop. At 40k nodes, applying a remote history took 86.6 s against
17.9 s for typing it locally. When one SDK fixes a hot path, measure the
same path in the other instead of assuming the cheaper primitive saves it.

## A cheap PRNG can quietly disable the branches a fuzz test needs

The first equivalence run used an LCG and took `% 10` of it. The low bits
of an LCG have a short period, so the undo branch ran 3 times in 4,500
steps and the test passed while barely touching undo. Use a PRNG with good
low bits (mulberry32), and assert lower bounds on how often each path ran so
a degenerate sequence fails instead of passing.

## The local server's in-memory backend is not what CI runs

`docker/docker-compose.yml` starts the server with the in-memory DB. CI
(`docker-compose-ci.yml`) uses MongoDB. `gc_test.ts > gc targeting nodes made
by deactivated client` fails on the in-memory backend with
`deactivateClient: change not found`, the same on `main` and this branch.
Against MongoDB it passes. Run the suite against a MongoDB-backed server
before calling a failure a regression.

Start that server through compose, with an override for the command
(`--mongo-connection-uri mongodb://host.docker.internal:27017`), not with a
bare `docker run`. `integration_helper.ts` decides the webhook host from the
compose labels; without them it picks `127.0.0.1`, the server cannot reach the
webhook, and the token-refresh tests retry until the run looks hung.

## Self review log

This is a record of what the author's own pass covered, not a verdict on the
change; review stands with the reviewer.

- Round 1 (correctness/tests): one round run, covering the invariant that
  every chain node is also in `treeByIndex`, and the test's mutation
  coverage. Two mutations the shipped test does not catch (dropping the splay
  after restore, or the weight update in `splitNode`) are redundant today: a
  later `indexOf` or the node constructor recomputes the same weight.

## Review panel, round 1

Two blocking findings, both about what `normalizePos` means for a pos whose
id only a floor lookup resolves. Both were fair: the old chain walk (and so
the first version of the test) added `rel` to the *start* of the floor node,
dropping the offset the id carries into that node and counting tombstones
between the pieces as live.

The resolution to copy next time: `normalizePos` must agree with
`findNodeWithSplit`, because that is what decides where the edit it is
reporting actually lands. That means `getAbsoluteID` plus
`findFloorNodePreferToLeft`, i.e. `posToIndex(pos, true)` - not the plain
floor lookup `posToIndex(pos, false)` uses, which disagrees at a split
boundary once a concurrent insertion has pushed the two pieces apart.

Two things the randomized harness surfaced only after the semantics changed:

- `purge` leaves a hole in the id space, so `absoluteOffset - node.offset`
  can run past the piece that survived. Clamp to its content length.
- Undo in the two-replica test throws on apply, because `garbageCollect` is
  driven by `maxVectorOf`, which claims both replicas have seen everything
  and purges nodes a peer's pending undo still anchors on. Not a product
  bug reachable this way; modelling it needs per-replica acked vectors that
  the stub `crossSync` does not carry. Left out, with a note in the test.
