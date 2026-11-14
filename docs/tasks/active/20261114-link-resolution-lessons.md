# Judge a symbolic link by where each step of its target leads — lessons

**Created**: 2026-11-14

- Node's default `realpathSync` is not the kernel's resolution. It joins a
  link's target to the link's directory with `path.resolve`, which settles
  every `..` as text before the components in front of it are followed.
  `realpathSync.native` asks the kernel. Where the answer is used to decide
  whether something is inside a directory, only the second is an answer.
- "Judged by text" carries a condition: reading a target as text is only
  sound while no component it passes through is a link. A text check that
  does not examine the components is a check of a different path.
- Two checks that share a blind spot are one check. The text half and the
  resolution half both read `..` the same way, so each passed what the other
  passed. The fix gives each half its own footing: the kernel for one, a
  walk that follows nothing for the other.
- Refuse a step that leaves, even when the path comes back. A target that is
  inside both as written and once followed can still pass through a place
  outside on the way, and what is there is not the tree's to vouch for.
- The guard that asks "was this file run or imported" is not a judgement of
  location. It has to agree with how the loader resolved the entry point, so
  it keeps the default function; changing it could make the two sides differ
  and the checks would be skipped silently.
- A mutation that swaps one call back needs a test whose two readings differ
  at that call. The paths the checks are handed (root, temp, exclude) needed
  their own rows: a path to each through a link and a `..`, with a decoy
  directory where the text reading lands.
