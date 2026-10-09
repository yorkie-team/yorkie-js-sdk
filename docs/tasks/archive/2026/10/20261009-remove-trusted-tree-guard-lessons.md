# Lessons: Run the git hooks from .githooks/ and drop the trusted-tree guard

**Created**: 2026-10-09

- A guard whose override is an environment variable leaks into everything the
  guarded command spawns. `YORKIE_ALLOW_FOREIGN_TREE=1` reached the very test
  suite that pinned the guard's refusals, so the override could not be used
  for the one push it existed for.
- A trust check keyed on "commits this clone did not create" counts every bot
  commit on an agent-loop branch as foreign. Before shipping such a gate, list
  the everyday flows that will hit it; a gate that refuses those gets bypassed
  by reflex and protects nothing.
- A relative `core.hooksPath` is resolved per worktree, which is what makes
  one shared-config setting serve every worktree. An absolute path into
  `$GIT_DIR` needed a separate argument about which git dir survives.
- The git hooks and the Claude Code hooks look like the same install, but
  they differ on consent: git hooks run on an act you chose and can skip;
  Claude Code hooks run when a session opens. That is why only the first
  moved off the snapshot.
- Review round 1 (#1468): a migration cleanup ran `rm -rf` on a fixed path
  before the step that can refuse, and without checking the clone pointed
  there. A destructive step goes after every refusal and is gated on evidence
  that the target is ours (here, the old `core.hooksPath`, read before it is
  overwritten). Hook tests that run the script with `bash` prove the script,
  not git's dispatch to it; keep one test that makes a real `git commit`.
