# Lessons: porting the DocSize container-removal fix from the Go SDK

**Created**: 2026-08-17

## A port is done when the numbers match, not when the shapes match

The Go fix was confirmed to apply here by running the same four scenarios
through this SDK and getting figures identical to Go's pre-fix output
(`{data:-2, meta:-48}` and so on), rather than by reading
`registerRemovedElement` next to `RegisterRemovedElementPair`. The same
standard closed the port: the six ported tests fail without the source change
and pass with it, with the same expected constants as the Go tests.

Reading two implementations side by side always invites "but the surrounding
paths differ." Executing both removes the argument.

## Port the invariant, not the diff

The Go change went through three shapes — a descendant walk, then a guard
keyed on the pair registry, then a second guard — before the underlying rule
was named. Porting the *final diff* mechanically would have carried none of
that reasoning, and the JS structure differs enough to matter:
`gcElementSetByCreatedAt` is a `Set` that looks like Go's `sizeInGC` but is
actually the equivalent of Go's `gcElementPairMap`. Reusing it for the charged
sizes would have broken `garbageCollect` and `getGarbageElementSetSize`.

Because the invariant was ported rather than the code, the right structure
here was a *new* map alongside the existing set, which is not what a
line-by-line port would have produced.

## TypeScript's structural types hid a wrong test until typecheck

The array-removal test first used `deleteByID`/`getElementByIndex`, which the
JSONArray proxy implements at runtime but which are absent from the declared
`Array<T>` type. The test passed. Only `tsc --noEmit` caught it, and the
correct idiom was the one the neighbouring test already used
(`delete root.arr[0]`).

Passing tests are not evidence that a test exercises what it claims when the
runtime object is a proxy with more surface than its type. Run the typechecker
on test files, not just on source.

## See Also

- [[20260817-docsize-container-gc-symmetry-todo]] — the port plan and the
  measured figures
