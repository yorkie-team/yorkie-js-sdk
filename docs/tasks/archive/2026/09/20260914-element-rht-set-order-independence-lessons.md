# Lessons — ElementRHT.set order independence

**Created**: 2026-09-14

## Two gates on one decision must read the same clock

The bug is not that either check was wrong on its own. Evicting the occupant
and deciding the winner are two halves of one LWW resolution, and they read
different tickets off the same element. Any pair of conditions that must
agree should be written so they cannot drift — here, by putting the eviction
*inside* the branch that already decided the winner, which is how the Go
implementation reads and why it never had the defect.

## A latent order dependency needs a randomized peer to surface

`set` has been order-sensitive for as long as undo/redo has existed, and
every test in this repo passed, because every test fed it one order. What
made it a production incident was the server emitting members in Go map
order — so the same document decoded differently on different page loads.
Neither side is at fault alone: the server's output was unordered, the
client's input was order-sensitive, and only the pair produced a document
that lost a key 3 times in 4.

## Enumerate permutations; do not shuffle once

Both the unit-level and decoder-level tests run **every** ordering rather
than one arbitrary one. With two members that is two cases, and it is the
difference between asserting "this order works" and "order does not matter".
The decoder-level test is what proves the fix: it builds a real `Document`,
takes a real `undo`, and runs the real `converter`, so it fails with the
exact `{}` the production client saw.

## Match the reference implementation, and say so in the code

The Go `SetWithExecutedAt` carries a long comment explaining that it
deliberately does *not* reproduce this SDK's behavior. That comment was the
fastest route to the root cause, and the JS side now carries the mirror of
it. When two implementations of one protocol disagree, the disagreement
belongs in both files, not just the one that noticed.
