# Ask the server for Watch heartbeats at a chosen interval

**Created**: 2026-10-13
Tracked as #1479

The SDK half of yorkie-team/yorkie#2194; the server and Go client half is
yorkie-team/yorkie#2209.

## Problem

#1472 arms an idle watchdog from the heartbeat interval the server advertises.
Until #2209, a server heartbeats every stream or none, and defaults to none,
because a Go client up to v0.7.24 ends its watch on the first
`WatchHeartbeat`. A hosted server cannot vouch for every client version, so
it keeps the heartbeat off and the watchdog never arms.

#2209 makes the heartbeat opt-in per stream: `WatchRequest` carries
`heartbeat_interval_ms`, the server clamps it into its bounds (5s to 60s by
default) and advertises the result, and a request of 0 gets no heartbeats.
This SDK sends nothing yet, so it would stay unheartbeated.

## Plan

1. Protos: copy `yorkie.proto` from the #2209 branch and regenerate. The only
   change is `WatchRequest.heartbeat_interval_ms = 4`.
2. `ClientOptions.watchHeartbeatInterval` (ms), default `20000`; anything
   that is not a positive number sends `0` (no heartbeats). A fraction is
   rounded up so a tiny positive value is clamped by the server instead of
   opting out.
3. Send it on both Watch requests, document and channel.
4. No watchdog change: it already keys off the advertised (effective)
   interval.

## Acceptance criteria

- [x] Both Watch requests carry the configured interval; default 20000; 0,
      negative and NaN send 0. (`test/unit/client/watch_heartbeat_request_test.ts`)
- [x] Against a #2209 server: a document stream and a channel stream that ask
      for 1s are advertised the clamped minimum and receive a heartbeat; a
      stream that asks for 0 is advertised 0 and gets none. Each case reads
      the advertised interval and skips itself on a server image without
      #2209, so the suite does not depend on the CI image's version.
      (`test/integration/watch_heartbeat_test.ts`)
- [x] The rest of the integration suite passes against a #2209 server with
      the 20s default on every stream.

## Open

- The two heartbeat cases only run once the CI server image
  (`yorkieteam/yorkie:latest`) includes #2209; until then each reports itself
  skipped, with the server's advertised interval as the reason. They are not a
  merge blocker, but they prove nothing until the image is published, so
  re-run the suite then.
