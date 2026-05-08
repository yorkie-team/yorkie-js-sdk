# react-polling-playground

Interactive demo for `SyncMode.Polling` on both Channel and Document, driven
through `@yorkie-js/react` (`<ChannelProvider>` and `<DocumentProvider>`).

## What it verifies

- `<ChannelProvider syncMode={SyncMode.Polling} channelHeartbeatInterval={...}>`
  refreshes `sessionCount` via heartbeat and does not open a watch stream.
- `<DocumentProvider syncMode={SyncMode.Polling} documentPollInterval={...}>`
  delivers remote changes within the polling interval without a watch stream.
- Switching modes at runtime (Realtime / Polling / Manual) re-attaches the
  resource with the new mode — visible in the per-panel log.

## Run

A local Yorkie server is expected (default `http://localhost:8080`):

```sh
docker compose -f ../../docker/docker-compose.yml up --build -d
```

Then from this directory:

```sh
pnpm install
VITE_YORKIE_API_ADDR=http://localhost:8080 \
VITE_YORKIE_API_KEY= \
pnpm dev
```

Open two tabs of the printed URL; they share the same channel / document
session via the URL `?key=` parameter. Toggle modes from the top control
strip. In **Polling**, set the interval (default 2000ms) and watch the log
ticks line up with the chosen interval. In **Realtime**, remote changes
arrive immediately via the watch stream.

## Notes

- `channelHeartbeatInterval` and `documentPollInterval` are applied at
  attach time. Changing them re-attaches the resource (the `key` prop on
  the providers triggers this), which is fine for a demo but not what
  production code would want — runtime transitions should use
  `client.changeSyncMode(...)`.
- Polling Channel does not receive broadcast events; this is by design.
- Polling Document is invisible to other watchers (no `DocWatched`
  event).
