# Read a presence value that is not JSON as its raw text

**Created**: 2026-11-19
Fixes #1509. Client side of yorkie-team/yorkie#2284 (server side: yorkie#2386)

`fromPresence` (`api/converter.ts`) runs `JSON.parse` on every presence value
with no guard. The wire contract (`docs/design/presence.md` in yorkie) says a
presence value is the JSON encoding of the value, but only the SDKs' write
side enforces it: a Go app calling `SetJSON` with non-JSON text, or a client
speaking the RPC API directly, can store `{"cursor": "moved"}`. One such value
throws `SyntaxError` out of `applyChangePack` before the checkpoint advances,
so the server redelivers the same change forever and the document never syncs
again on any JS peer. Snapshots go through the same function, so a stored
value also breaks a fresh attach.

yorkie#2386 makes the server JSON-encode such a value on decode. That only
protects clients talking to a server that has it; an older or self-hosted
server keeps sending the raw text.

## Scope

1. `fromPresence` decodes each value with `parseAttrValue`
   (`util/object.ts`), which already handles the same problem for Text and
   Tree attributes written raw by the Go SDK: parse as JSON, and fall back to
   the raw string when that throws.

The fallback reads the same value the server repair produces: the repaired
`"moved"` parses to `moved`, and the unrepaired `moved` falls back to it. Go's
`presence.DecodeValue` also returns non-JSON text as-is. Everything this SDK
writes goes through `JSON.stringify`, so the fallback is unreachable for
JS-authored values.

## Out of scope

- Rejecting or logging the value. A pull cannot act on a rejection, and the
  server is where the repair is recorded.
- The write side. `presence.set` already stringifies.

## Steps

- [x] Failing tests first: a pulled pack whose presence carries a bare-text
      value applies, keeps the other keys parsed, and advances the
      checkpoint; `fromPresence` decodes a non-JSON value to its raw text and
      a JSON-encoded string to the same text.
- [x] `fromPresence`: `JSON.parse` → `parseAttrValue`.
- [x] `pnpm verify:fast`.
