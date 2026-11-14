# Move the agent harness onto the shared copy and a repository config — lessons

**Created**: 2026-11-14

- Derive the configuration from a recording of the old code, not from a
  draft. A draft written from memory had the server repository's coverage
  note, `examples/**` in the lens source globs (the adapted manifest had
  `packages/**` only) and was missing three policy entries and one
  CI-defining path that sat among the shared entries in the old lists. The
  recording caught all of them; reading would have caught some.
- Record before overwriting, and commit the recording alone. The diff of
  that one file across the move is then the whole behaviour change, small
  enough to read: one new entry, two reordered lists, one reworded line.
- "Main's `.npmrc`" came from the workspace's own git objects
  (`git show origin/main:.npmrc`). That stops being available by contract
  once the action is loaded from a sparse checkout of its own directory. A
  file needed from a trusted ref has to travel with the trusted code, and a
  test has to keep the copy equal to the original.
- A shared test that reads outside its own package encodes the first
  repository's layout. `git-env.test.mjs` walks `scripts/`; here that
  includes product tests that follow the rule it checks, by another route.
  A string match (`includes("git-env.mjs")`) cannot tell.
- A substring match on a repository name is only safe when no adopting
  repository's own name contains it. `yorkie` is a prefix of
  `yorkie-js-sdk`.
- The old glob matcher and the shared one disagree on `**/x/**` at the root
  and on `docs/**/*.md` directly under `docs/`. Neither changes an answer
  for a tracked file here, which only a run over every tracked path plus
  hostile ones shows.
- Flags are half of "runs nothing the branch wrote, writes nowhere else".
  The other half is the tree the tool is pointed at: links, and files that
  name other directories. Check the shape before running, check the result
  after, and run those checks in a test rather than reading them.
- "No scripts, no hooks" is not "runs nothing". An install does what its
  lockfile says, and a lockfile can name fetchers other than the registry's.
  List what main's files actually contain and allow exactly that; a list of
  things to refuse is always one spelling short.
- When each review finds another field of the same kind, stop listing
  fields. Three rounds found three families of input that become a path or
  a command. The fix that ended it does not read the input at all: it
  bounds what the process can write. Validation is then the second layer,
  and it can afford to be strict because it is not the only one.
- A check that runs before a fetch cannot see what the fetch brings. A
  registry package's own manifest is input too.
- A line-by-line check of YAML is a guess at how the line will be written.
  Read one style strictly and refuse the rest, and compare the reader with a
  real parser on the real file once.
- `stat` follows links, so `statSync(p).isSymbolicLink()` is never true.
  An assertion that cannot fail is found by breaking what it guards, which
  the first round did for the action and not for that line.
- A copy that must equal an original needs its check on the path the
  original changes through. The weekly run was the wrong place for it.
- A per-repository test file can follow the repository's own lint rules.
  Excluding it from ESLint would have made the coverage note's "eslint over
  the repository except…" sentence false by one file.
