**Created**: 2026-11-03

# Lessons — Restore the full default export (#1519)

## Notes

- The default object and the `globalThis.yorkie` shim in `yorkie.ts` were two
  near-identical literals that had already drifted from each other
  (`Primitive` is in the default but not in the shim). Only the default is in
  scope here, so the shim is left alone; the drift is why the new test pins
  the default against the named exports rather than against a second list.
- `Presence` is `document/presence/presence`'s `Channel`, not
  `channel/channel`'s `Channel`. Re-exported under an alias, it is easy to
  read as a duplicate of `Channel` and drop.
- `@yorkie-js/react` and `@yorkie-js/prosemirror` have no default export at
  all, so nothing regressed there. The packaged check is written over
  whichever packages have a `default`, so it starts covering them the day one
  gains it.

## Self review

Not run: this task ran as a one-shot autonomous job with no reviewer subagent
available. Review is left to CI, `@claude review` and a human on the PR.
