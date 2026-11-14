# Judge a symbolic link by where each step of its target leads

**Created**: 2026-11-14

The agent toolchain's install check
(`.github/actions/agent-toolchain/check-install-inputs.mjs`) holds that no
symbolic link in the working tree leads out of the workspace's own files, by
the link's text and by where it resolves. Both halves read a `..` in a target
as text: the text check by design, and the resolution because Node's default
`realpathSync` joins a target to its directory before following it. When the
component in front of a `..` is itself a link, that reading and the kernel's
are different places, so the property did not hold for a target that passes
through another link.

Nothing on the runner follows a workspace path between the install and the
agent, so this closes a gap in a check rather than changing what a run does.

## Plan

1. Reproduce with a failing test: both the in-container tree check and the
   runner's walk after the install must refuse such a link.
2. Resolve with the kernel's resolution everywhere a location is judged.
3. Make the text judgement sound on its own: walk a target one component at
   a time, examining each without following it.
4. Mutation-check every changed call site; verify; update the README.

## Checklist

- [x] Failing test at `HEAD` (`repo.test.mjs`), refused by both checks after
- [x] `realpathSync.native` at every call site that judges a location; the
      direct-run guard keeps the default, with the reason beside it
- [x] `linkStrays`: the component-by-component walk, in `checkTree` and
      `checkLinks`
- [x] Variants as table rows, and the allowed controls
- [x] Each changed call site reverted in turn fails the suite
- [x] `.github/agent-harness/README.md` describes the rule as it now is
- [ ] Bring the same change to the copy in yorkie, where this file's twin
      lives
- [ ] Archive this pair before the pull request merges
