# Lessons: Identify "me" with getActorID() in the examples

**Created**: 2026-10-08

- A split of one id into two is a breaking change even when every signature
  stays the same: the call still compiles, still returns a string, and only the
  comparison against it changes meaning. Nothing in the type system or in the
  release notes caught it, so the first report came from a deployed example
  that rendered a blank page.
- The failure was only visible where the local user's presence was *read*
  (`profile-stack` dereferenced `myPresence.color`). Where it was only used to
  filter (`vanilla-quill`, `vanilla-codemirror6`, `vanilla-document-limit`) the
  page still worked and just showed the local user as a peer — the kind of
  wrong output no example's smoke test asserts on.
- The id the examples feed into `initialPresence` (`client.getID()!.slice(-2)`
  as a username, and the colour hashed from it) is the same identity question
  in disguise: a label derived from the session id does not match the id the
  document reports for that presence.
