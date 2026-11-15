# Keep `__yson_`-prefixed user keys out of the marker namespace — lessons

**Created**: 2026-11-15

- An internal tag that is a plain key in the output of a rewrite pass cannot
  be made unambiguous by picking an unlikely name. `__yson_type` is unlikelier
  than `type` — which is what bit the server in yorkie-team/yorkie#2364 — but
  the failure is the same and it is silent. The fix has to be an escape that
  is injective over all inputs, not a rarer name.
- The escape has to be decided on the *decoded* key, not the source text:
  `"__yson_type"` is the same key as `"__yson_type"` after `JSON.parse`,
  so a scanner that compares the raw slice lets the escaped spelling through
  and the bug survives verbatim.
- Escaping by prefix is only injective if keys that already start with the
  escape prefix are escaped too. `__yson_esc_` itself starts with `__yson_`,
  so the single "starts with the reserved prefix" rule covers it — a key
  `__yson_esc_x` becomes `__yson_esc___yson_esc_x` and strips back exactly.
- `postprocessTextNode` and `postprocessTreeNode` assign `node.attrs`
  verbatim, so they do not go through the object branch where keys are
  unescaped. Every place a map of user keys reaches the output needs the
  unescape, not just the generic one.
