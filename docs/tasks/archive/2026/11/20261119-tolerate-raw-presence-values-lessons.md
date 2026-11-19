# Lessons: read a presence value that is not JSON as its raw text

## The guard already existed, for attributes

`parseAttrValue` (`util/object.ts`) was written for the same failure on Text
and Tree attributes: the Go SDK's `Style` stores raw strings, and an unguarded
`JSON.parse` wedged the pull. Presence is the second instance of "a value the
wire contract says is JSON, written by a peer that does not enforce it". The
fix reuses the helper rather than adding a presence-specific copy; the name is
attribute-flavoured, but the contract it states (parse, else keep the raw
text, unreachable for JS-authored values) is exactly the one presence needs.

## Agreeing with the server repair is what makes the fallback safe

The server side (yorkie#2386) JSON-encodes a non-JSON value, so depending on
the server version a client receives either `moved` or `"moved"`. The
fallback reads the first as `moved` and `JSON.parse` reads the second as
`moved`, so peers on old and new servers see the same presence. A value that
happens to be valid JSON (`123`, `true`) parses on both sides, and the server
leaves it alone too, so there is no case where the two disagree. The test pins
this agreement directly rather than only the fallback.

## Self review

One inline round over the full diff (one function, one new test file); no
blocking findings. Checked: the fallback cannot change a JS-authored value
(everything goes through `JSON.stringify`); `fromPresenceChange` and
`fromPresences` (snapshots) both go through `fromPresence`, so pulls and
attach are covered by the one change; a `RangeError` from a deeply nested
value is caught by the same `catch`.
