# react-polling-playground

Trending stocks leaderboard demo built on Yorkie's `SyncMode.Polling` Channel.
Each ticker is its own channel; `sessionCount` is the number of clients
currently watching that stock.

## Scenario

Imagine a trading site that wants to show "how many people are watching this
stock right now" — useful for surfacing hot tickers. One stock = one channel.
Opening this playground attaches every listed stock's channel via heartbeat
polling, so a new tab bumps every viewer count and the top three stocks light
up.

## Run

A local Yorkie server is expected (default `http://localhost:8080`):

```sh
docker compose -f ../../docker/docker-compose.yml up --build -d
```

From this directory:

```sh
pnpm install
VITE_YORKIE_API_ADDR=http://localhost:8080 \
VITE_YORKIE_API_KEY= \
pnpm dev
```

Open the printed URL in two tabs (with the same `?key=`) and watch the live
viewer counts converge across tabs at the chosen polling interval.

## Controls

- **Sync mode** — toggle between `Polling` (heartbeat-only) and `Realtime`
  (watch stream + heartbeat) to compare convergence behavior.
- **Heartbeat (ms)** — applied at attach time. Changing it re-attaches every
  channel.

## Notes

- `channelHeartbeatInterval` is applied at attach. The Leaderboard re-mounts
  when it changes (via the `key` prop on the parent), which is fine for a
  demo — production code should call `client.changeSyncMode(...)` for live
  transitions.
- Polling channels do not receive broadcast events; this is by design.
- Each browser tab counts as one session per stock channel. So with two tabs
  open you'll see `2 watching` on every row.
