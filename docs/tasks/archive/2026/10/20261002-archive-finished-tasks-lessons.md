# Lessons: archive the finished task records

- **A todo's "Out of scope" section is a dead-letter box.** Things written
  there in a PR that then merges are never read again. Defects go to issues
  before the archive step, and the merge gate now asks for it.
- **Check the thing the rule depends on.** The archive script only moves a
  todo with no unticked boxes, so a stale box (the publish-selection README
  item was done but unticked) keeps a finished task in active/ forever.
  Verify the box against the code before trusting it either way.
- **Cross-repo numbers look like ours.** The agent-pipeline todo's first
  `#N` is a yorkie server PR; a naive "first reference" lookup would have
  queried the wrong repository. Strip `yorkie #N` / `yorkie-team/yorkie#N`
  and prefer the line that says "Tracked as" / "Fixes" / "PR (#N)".
