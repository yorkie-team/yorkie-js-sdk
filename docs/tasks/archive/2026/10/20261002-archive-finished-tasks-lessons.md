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
- **A path's text is not where it goes.** Pinning the archive date to digits
  stopped `../`, but a committed `archive/2027 -> /tmp/x` symlink still sent
  `mkdir -p` and `git mv` (which does not refuse it) out of the repository.
  Resolve the destination physically before writing through it.
- **Cross-repo numbers look like ours.** The agent-pipeline todo's first
  `#N` is a yorkie server PR; a naive "first reference" lookup would have
  queried the wrong repository. Strip `yorkie #N` / `yorkie-team/yorkie#N`
  and prefer the line that says "Tracked as" / "Fixes" / "PR (#N)".
- **A gate the PR in front of it cannot clear is not a gate.** Refusing a
  green `--remote` run that resolved no todo is right in principle, but no
  todo in this repository's `active/` declares a tracking number, so as an
  error it was exit 1 on *every* merge for a reason belonging to records
  nobody was touching. The invariant is about the run, not the half: with
  `--base` alongside it the run did check something, so the untracked todos
  are a note (still named one by one, still counted in the closing line);
  a bare `--remote --strict` really did check nothing and still errors.
  Coverage comes from the other end — `agent-implement.yml` now has every
  new todo declare `Tracked as #N`.
