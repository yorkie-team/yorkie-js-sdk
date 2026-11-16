# Keep `__yson_`-prefixed user keys out of the marker namespace

**Created**: 2026-11-15
Tracked as #1544

`preprocessYSON` rewrites a constructor literal into a plain JSON object
carrying `__yson_type` / `__yson_data` / `__yson_registers`, and
`postprocessValue` reads *any* object with a `__yson_type` key as one of those
markers. The tag therefore lives in the same key namespace as user data, so a
document whose data legitimately contains those keys is parsed as something
else, silently:

```ts
YSON.parse('{"x":{"__yson_type":"Int","__yson_data":7}}');
// → { x: { type: 'Int', value: 7 } }
```

This is the JS mirror of yorkie-team/yorkie#2364, fixed server-side in
yorkie-team/yorkie#2365 by escaping input keys that start with the reserved
prefix before the rewrite and unescaping them after, so such documents
round-trip instead of failing. The YSON wire format is unchanged either way.

The property: a key the input writes is the key the parse returns, whatever it
is spelled. Only the markers `preprocessYSON` itself emits are read as markers.

## Plan

1. Failing unit tests at `HEAD` for the issue's reproduction, for the
   JSON-escaped spellings of the same key (`"__yson_type"`), and for a
   key that collides with the escape prefix itself.
2. In the scanner, decode each string literal that sits in key position and,
   when it starts with `__yson_`, re-emit it escaped. Unescape in
   `postprocessValue`'s object branch and in the `attrs` maps of text and tree
   nodes, which are copied verbatim today.
3. Verify with `pnpm verify:fast`.

## Checklist

- [x] Failing tests at `HEAD` (`yson_test.ts`)
- [x] Keys escaped in `preprocessYSON`, unescaped in `postprocessValue`
- [x] JSON-escaped spellings of a reserved key round-trip
- [x] Escape prefix is injective: `__yson_esc_x` round-trips too
- [x] `attrs` keys on text and tree nodes unescaped
- [x] Constructor literals still parse unchanged
- [ ] Archive this pair before the pull request merges
