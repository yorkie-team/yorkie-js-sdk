#!/usr/bin/env bash

# Sourced by pre-commit and pre-push. Not a hook itself — git runs hooks by
# name, so a sibling file in the hooks directory is inert.
#
# WHY THIS EXISTS. The `$GIT_DIR` snapshot `scripts/setup.sh` takes pins which
# hook script runs, not what it invokes: `pnpm exec lint-staged` loads the
# working tree's `lint-staged.config.mjs` and `eslint.config.mjs`, and
# `pnpm verify:fast` runs its package scripts and every test file. So without
# this check, `gh pr checkout` plus one commit would run an unread branch's
# code. It has to happen at hook-run time: the dangerous commit comes later
# than setup, in a branch that did not exist when setup ran.
#
# WHAT IS CHECKED is where the commits on top of the default branch CAME FROM,
# not a list of files — the gate's whole job is to run the tree, so any branch
# supplies code to it.
#
# "CAME FROM" IS NOT THE AUTHOR LINE. The author address is a field the
# branch's author writes (and `.mailmap` can rewrite), so it is a label, not a
# credential. The credential is the reflog: it lives in `$GIT_DIR`, only the
# local git writes it, and no fetched content can add to it. A commit this
# clone CREATED has a commit-writing entry; one it merely RECEIVED is known
# only through fetch, checkout, reset or a fast-forward — the `gh pr checkout`
# case. The author check stays underneath, to name a mismatch in the refusal.
#
# Commits reachable from the default branch are trusted by construction, so a
# branch rebased onto or merged with a fetched `main` does not trip this.
#
# THE COST: a commit you wrote on another machine, or one whose reflog entry
# has expired (90 days by default), presents the same evidence as a
# stranger's, and is refused. The bypass below is the answer.
#
# WHAT IT DOES NOT CATCH: a branch authored under YOUR address that you then
# rebase yourself — the rebase writes new commits here and the author matches.
# Read the diff before rebasing someone else's branch.

# Echo every trusted default-branch ref this clone has, one per line, or fail
# if it has none.
#
# `upstream/main` as well as `origin/main`: CONTRIBUTING.md has contributors
# work from a fork, where `origin` is the fork and its `main` usually lags.
# Rebasing onto `upstream/main` brings in commits this clone did not create,
# and they are no less the default branch for arriving by another remote.
# Only these two names — not every remote's `main`, since checking out a
# pull request can add a remote for the author's fork.
yorkie_upstream_refs() {
  local ref found=1
  for ref in refs/remotes/origin/main refs/remotes/upstream/main; do
    if git rev-parse --verify --quiet "$ref" >/dev/null; then
      printf '%s\n' "$ref"
      found=0
    fi
  done
  if [ "$found" -ne 0 ] &&
    git rev-parse --verify --quiet refs/remotes/origin/HEAD >/dev/null; then
    printf '%s\n' refs/remotes/origin/HEAD
    found=0
  fi
  return "$found"
}

# Echo the OIDs this clone CREATED, one per line.
#
# `%gs` is the reflog subject. Only entries that record git WRITING a commit
# count, matched on the whole subject rather than its first word:
#
#   - `commit`, `commit (amend)`, `commit (merge)`, `cherry-pick`, `revert`,
#     `am`, `applypatch`;
#   - a rebase step that writes one — `(pick)`, `(reword)`, `(edit)`,
#     `(squash)`, `(fixup)`, `(continue)` — whether git spells the action
#     `rebase` or `pull --rebase ...`, which is what `git pull --rebase` logs;
#   - a merge commit git made, `merge ...: Merge made by` or
#     `pull ...: Merge made by`.
#
# Everything else moves HEAD onto a commit that arrived from somewhere else:
# `checkout:`, `reset:`, `clone:`, anything ending in `Fast-forward`, and
# `(start)` / `(finish)` of a rebase. `(finish)` in particular names the
# commit HEAD lands on, which after a rebase that only fast-forwarded onto a
# fetched branch is somebody else's. An unrecognised subject is not creating,
# so a future git spelling fails closed rather than open.
#
# TWO REFLOGS. HEAD's reflog is per worktree; the current branch's reflog is
# shared by every worktree of the clone. Reading both keeps a branch you wrote
# in one worktree yours when you check it out in another.
yorkie_locally_created() {
  local branch
  {
    git reflog show HEAD --format='%H %gs' 2>/dev/null || true
    if branch=$(git symbolic-ref -q HEAD 2>/dev/null); then
      git reflog show "$branch" --format='%H %gs' 2>/dev/null || true
    fi
  } | awk '
    / Fast-forward$/ { next }
    $2 ~ /^(commit|cherry-pick|revert|am|applypatch)[:( ]/ { print $1; next }
    /^[0-9a-f]+ (rebase|pull)[^:]*\((pick|reword|edit|squash|fixup|continue)\):/ { print $1; next }
    /^[0-9a-f]+ (merge|pull)[^:]*: Merge made by/ { print $1; next }
  '
}

# Refuse to hand the working tree to `make` unless every commit this checkout
# carries on top of upstream was created by this clone, under the identity
# configured here.
#
# FAILS CLOSED on every way the question cannot be answered — no upstream ref,
# no `user.email`, an unreadable commit range — because "I could not tell whose
# code this is" and "it is yours" must not share an answer. The first two are
# one command away from fixed (`git fetch origin main`, `git config
# user.email`) and both are named in the refusal.
yorkie_require_own_work() {
  local hook="$1" runs="$2" upstreams upstream me commits untrusted

  if [ "${YORKIE_ALLOW_FOREIGN_TREE:-}" = "1" ]; then
    return 0
  fi

  if ! upstreams=$(yorkie_upstream_refs); then
    echo "$hook: no origin/main to tell your commits from a branch you are" >&2
    echo "        reviewing, and $runs runs this tree's code. Fetch it with" >&2
    echo "        'git fetch origin main', or see the bypass below." >&2
    yorkie_print_bypass "$hook"
    return 1
  fi

  me=$(git config --get user.email || true)
  if [ -z "$me" ]; then
    echo "$hook: no user.email is configured, so there is no identity to" >&2
    echo "        compare this branch's commits against. Set one with" >&2
    echo "        'git config user.email you@example.com', or see the bypass" >&2
    echo "        below." >&2
    yorkie_print_bypass "$hook"
    return 1
  fi

  # `upstream` names the trusted base in messages; the range excludes all of
  # them. Word-splitting `$upstreams` is safe: these are fixed ref names.
  upstream=$(printf '%s\n' "$upstreams" | head -n1)

  # Enumerated in its own command, and its status checked: `git log` at the
  # head of a pipeline would turn a range that failed to resolve into no
  # output, and no output into "no foreign commits".
  # shellcheck disable=SC2086
  if ! commits=$(git log --format='%H %aE' HEAD --not $upstreams 2>/dev/null); then
    echo "$hook: could not list this branch's commits against" >&2
    echo "        ${upstream#refs/remotes/}, so there is no way to tell whose code" >&2
    echo "        $runs would run. See the bypass below." >&2
    yorkie_print_bypass "$hook"
    return 1
  fi
  # An empty range — HEAD at or behind upstream — has nothing to distrust.
  if [ -z "$commits" ]; then
    return 0
  fi

  # `%aE` is the mailmap-resolved author address, compared case-insensitively
  # because git preserves the case a commit was made with and addresses are not
  # case-sensitive in practice. A commit with no author address at all
  # (`--author='A U Thor <>'`, which git accepts) yields an empty field: it is
  # reported as untrusted rather than silently compared equal to nothing, which
  # is how the earlier `grep -vFx` pipeline let it through.
  # The two lists are concatenated around a separator rather than passed as two
  # awk files, because the idiomatic `NR == FNR` split silently misreads an
  # EMPTY first file — and an empty first file is the interesting case here: a
  # clone whose reflog created nothing would have its first commit swallowed
  # into the created set and walk through. `--` cannot collide with an OID.
  untrusted=$(
    {
      yorkie_locally_created
      echo '--'
      printf '%s\n' "$commits"
    } | awk -v me="$me" '
      !past && $0 == "--" { past = 1; next }
      !past { if ($0 != "") created[$0] = 1; next }
      {
        if (!($1 in created)) { printf "  %s  not created by this clone\n", substr($1, 1, 9); next }
        if (NF < 2 || $2 == "") { printf "  %s  commit has no author address\n", substr($1, 1, 9); next }
        if (tolower($2) != tolower(me)) { printf "  %s  authored by %s\n", substr($1, 1, 9), $2 }
      }
    '
  )
  if [ -n "$untrusted" ]; then
    echo "$hook: this checkout carries commits on top of ${upstream#refs/remotes/} that" >&2
    echo "        this clone did not write:" >&2
    while IFS= read -r line; do
      echo "      $line" >&2
    done <<<"$untrusted"
    echo "        and $runs runs the WORKING TREE's code: that branch's package.json," >&2
    echo "        its lint configs, its test files. If you checked this branch out to" >&2
    echo "        review it, that is not what you want." >&2
    yorkie_print_bypass "$hook"
    return 1
  fi

  return 0
}

yorkie_print_bypass() {
  local hook="$1" verb="commit"
  if [ "$hook" = "pre-push" ]; then
    verb="push"
  fi
  echo "        Skip the gate with 'git $verb --no-verify', or, having read the diff:" >&2
  echo "          YORKIE_ALLOW_FOREIGN_TREE=1 git $verb ..." >&2
}
