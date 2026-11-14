# Read every name the install check lists as its bytes

**Created**: 2026-11-14

The agent toolchain's install check
(`.github/actions/agent-toolchain/check-install-inputs.mjs`) lists the
working tree, the runner's temp directory, `.git` and the directories around
the workspace, and reads link targets. Node decodes a listed name, and a link
target, as UTF-8 and puts U+FFFD where the bytes do not decode; a path built
from that string is encoded again and names a different entry, or none. So
for a name that is not valid UTF-8, every check was made on some other entry.

The property: every name and link target the checks read is exactly its
bytes. One that is not valid UTF-8 is refused; nothing in this repository
needs one.

## Plan

1. Reproduce on Linux (ext4 holds such names; APFS does not) with a test
   that skips, and says so, where the filesystem refuses them.
2. Read names and link targets as bytes everywhere the checker lists or
   reads them; decode strictly, keeping a leading byte-order mark; refuse
   anything that does not encode back to the same bytes.
3. Mutation-check each call site on Linux; verify; update the README.

## Checklist

- [x] Failing test at `HEAD` on Linux (`repo.test.mjs`), skipped on macOS
- [x] `listDir` and `linkText` at every listing and link read (6 + 5 sites)
- [x] Controls: U+FFFD as valid bytes, and a leading byte-order mark, are
      judged as themselves
- [x] Each call site reverted in turn fails the test on Linux
- [x] `.github/agent-harness/README.md` describes the rule
- [ ] Bring the same change to the copies in yorkie and wafflebase
- [ ] Archive this pair before the pull request merges
