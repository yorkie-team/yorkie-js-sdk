# Lessons: archive the finished task records

- **A todo's "Out of scope" section is a dead-letter box.** Things written
  there in a PR that then merges are never read again. Defects go to issues
  before the archive step, and the merge gate now asks for it.
- **Check the thing the rule depends on.** The archive script only moves a
  todo with no unticked boxes, so a stale box (the publish-selection README
  item was done but unticked) keeps a finished task in active/ forever.
  Verify the box against the code before trusting it either way.
- **A trust boundary that covers `scripts/` but not `.claude/` covers
  nothing.** The pre-merge check runs `main`'s script against the PR's files,
  but the agent running it reads this skill, `CLAUDE.md` and
  `.claude/settings.json` from the working tree — a checkout of the PR
  rewrites the instructions, not just the code, and switching back to `main`
  does not unread them. The merge belongs in a session that never held the
  branch's tree.
- **Cross-repo numbers look like ours.** The agent-pipeline todo's first
  `#N` is a yorkie server PR; a naive "first reference" lookup would have
  queried the wrong repository. Strip `yorkie #N` / `yorkie-team/yorkie#N`
  and prefer the line that says "Tracked as" / "Fixes" / "PR (#N)".
