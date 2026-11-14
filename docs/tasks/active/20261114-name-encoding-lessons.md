# Read every name the install check lists as its bytes — lessons

**Created**: 2026-11-14

- A string from `readdirSync` or `readlinkSync` is a decoding of the bytes,
  not the bytes. Decoding is lossy for a name that is not valid UTF-8, and a
  path built from the result is a different path. Anything that lists a
  directory and then examines the entries by path has to keep the bytes, or
  refuse a name it cannot keep.
- `TextDecoder` drops a leading byte-order mark unless told `ignoreBOM:
  true`. A strict decoder used to keep names exact needs that too, or a name
  that starts with one is judged as the name without it.
- A test that needs a name the host filesystem refuses has to say it was
  skipped, and has to be run once where it does not skip. APFS refuses such a
  name with `EILSEQ`; an overlay on ext4 in a Linux container holds it.
- A probe that creates a name the checks refuse must not sit where the
  checks look. The first version made its probe beside the trees, the record
  of the runner lists the names around each tree, and every snapshot row was
  refused for the probe instead of for its own case. A mutation run showed
  it: two call sites survived until the probe moved.
