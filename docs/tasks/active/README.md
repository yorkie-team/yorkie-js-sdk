---
updated: 2026-05-26
---

# Active Tasks

In-progress task files live here.

- Todo/review: `YYYYMMDD-<slug>-todo.md`
- Lessons: `YYYYMMDD-<slug>-lessons.md`

Each todo should open with a `**Created**: YYYY-MM-DD` line — both
the archive script and the index script read it (with a filename
fallback) to bucket and date entries.

A todo should also say, on one line, which number it is tracked by —
`Tracked as #N`, or `Fixes #N` — as soon as there is one. That line is
the only thing the `--remote` check below can ask GitHub about: a todo
without it is reported as *not checked*, and counted in the check's
closing line so the green never speaks for it. A run where no todo has
one examined nothing: that is an error on a bare `--remote`, and a note
when `--base` ran too, since todos nobody is touching are not something
the PR in front of the gate can fix.

When work is complete:

```sh
bash scripts/tasks-archive.sh  # moves the pair into archive/YYYY/MM/
bash scripts/tasks-index.sh    # regenerates ../README.md and ../archive/README.md
```

Before the PR merges, the pair has to be out of this directory, and any
defect it lists as out of scope has to have an issue.
`node scripts/tasks-check.mjs --base origin/main --remote` reports what is
still here and finished.

CI runs only the diff half of that check — `--base "origin/<base>"`, no
`--remote` — on every PR, because the step executes the pull request's own
copy of the script and so gets no GitHub token. The `--remote` half is the
maintainer's, on their own machine before the merge; see
[scripts/README.md](../../../scripts/README.md).
