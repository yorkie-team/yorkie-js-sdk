# Identify "me" with getActorID() in the examples, and say so in the CHANGELOG

**Created**: 2026-10-08
Tracked as #1457

## Problem

Since v0.7.20 (#1338) a client carries two ids:

- `client.getID()` is the per-session `clientId` used for RPC routing. It
  changes on every `activate()`.
- `client.getActorID()` is the actor the server derives from the project and
  the client key (`ActivateClientResponse.actorId`), falling back to the
  session id on an older server.

A document is stamped with the actor, so every id a document reports is the
actor: `doc.getPresences()[].clientID`, the `clientID` of a presence event, the
change author, and the argument of `doc.getPresence(id)`. Against a v0.7.20+
server `presence.clientID === client.getID()` is therefore never true.

The examples still identify the local user with `client.getID()`.
`examples/profile-stack` finds no presence of its own, so `myPresence` is
`undefined` and `renderPeerList()` throws `Cannot read properties of undefined
(reading 'color')` — the deployed https://yorkie.dev/examples/profile-stack
renders nothing. The other three list the local user as one of its own peers
instead of crashing.

The v0.7.20 CHANGELOG entry mentions only the persistence feature, so nobody
upgrading is told to migrate.

## Plan

- [ ] CHANGELOG: add a breaking-change note under v0.7.20 naming the id split
      and the migration (`getActorID()` / `doc.getMyPresence()`), plus an
      Unreleased entry for the example fix.
- [ ] `examples/profile-stack/main.js`: split peers from me with
      `client.getActorID()`.
- [ ] `examples/vanilla-codemirror6/src/main.ts`,
      `examples/vanilla-quill/src/main.ts`,
      `examples/vanilla-document-limit/src/main.ts`: pass the actor to
      `displayPeers`, derive the presence username/colour from it, and compare
      the presence `clientID` against it.
- [ ] `pnpm verify:fast`.

## Out of scope

- `docs/sdks/js-sdk.mdx:323` (`doc.getPresence(client.getID())`) lives in
  `yorkie-team/yorkie-team.github.io`, not in this repo; it needs its own PR
  there.
- Change messages such as `` `update content byA ${client.getID()}` `` are free
  text, not identity comparisons, and are left alone.
- Changing what `getID()` returns, or making the two ids one again.
