# Lessons: text inserted at a concurrent split boundary

**Created**: 2026-10-08
Tracked as #1436

## The two rules were pulling against each other

§7.3 (Boundary Insert Migration) says a concurrent insert at a split
boundary belongs on the *left* of it. §7.8 says concurrent splits of one
node at one boundary are ordered newest ticket first. The second minimum in
the issue is where the two cannot both hold: `u` is a concurrent insert at
the boundary, but RGA orders it *after* `r`, which the splitter deliberately
put on the right. Something has to give, and it is §7.3 — keeping the RGA
order of the content is what the other replica cannot be talked out of,
since it never had a boundary to migrate across.

So the rule that came out of this: §7.3 applies to the *run* of concurrent
inserts at the start of the right piece, and stops at the first node the
splitter knew. The fix is the same claim seen from the other side — when the
run is non-empty, the two boundaries are not the same boundary, so §7.8's
ticket order does not decide between them; content order does.

## Restricting the RGA crossing to text was not cosmetic

The first version of `advanceIntoSplitProducts` crossed into a concurrent
split product over any newer-ticket children. That broke eight existing
tests in `tree_split_order_test.ts` and `tree_split_sibling_cascade_test.ts`:
an element-level position would cross into the product and then
`orderSameBoundarySplit` would order the result again, with the two rules
disagreeing about where the boundary went. Element children at that boundary
are already §7.8's business. Crossing only a run of *text* children leaves
that path untouched, and all 905 unit tests pass.

## A deviation from a replicated contract needs a design doc, not a comment

The review panel's design-fit lens read the `NOTE(cross-implementation)` on
`boundaryInsertRunOf` and raised the obvious consequence: the branch changes
a replicated convergence contract in JS alone and knows it. The finding is
right, and nothing in this branch can close it — one gate item is an issue
on another repository, the other is a maintainer's call.

What *was* wrong was where the deviation lived. A source comment that
encodes merge policy goes stale the moment the policy changes, and a task
todo is archived once the task lands, taking the only record of the
deviation with it. So the measured state of the Go side (`tree.go`'s
`orderSameBoundarySplit` orders by ticket, with no boundary-insert run and
no counterpart to `advanceIntoSplitProducts`), the risk, and what a port has
to cover moved into `docs/design/split-boundary-insert-side.md`; the comment
now points there and the todo keeps only the two unticked gate items.

## Review rounds

`/self-review` was not run: this run is granted no tool that can dispatch
the reviewer subagent. Verification is the unit suites plus `verify:fast`;
the integration suites need a server this run does not stand up, so CI on
the PR is the first place they run.
