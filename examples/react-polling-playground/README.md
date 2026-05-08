# react-polling-playground

Trending stocks leaderboard demo built on Yorkie's `SyncMode.Polling` Channel.
Each ticker is its own channel; `sessionCount` is the number of clients
currently watching that stock.

## Scenario

Imagine a trading site that wants to show "how many people are watching this
stock right now" — useful for surfacing hot tickers. One stock = one channel.
The leaderboard is a static directory: the list itself attaches no channels
and shows no per-row count. Click a ticker to enter its room, where the
heartbeat-driven `sessionCount` is displayed.

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

Open the printed URL in two tabs (with the same `?key=`). Enter the same
stock in both to see the count rise; send them into different stocks to see
each room hold `1`.

## Controls

- **Sync mode** — toggle between `Polling` (heartbeat-only) and `Realtime`
  (watch stream + heartbeat) to compare convergence behavior.
- **Heartbeat (ms)** — applied at attach time. While viewing a stock,
  changing it re-attaches that room's channel.

## Notes

- `channelHeartbeatInterval` is applied at attach. The `<ChannelProvider>`
  inside the stock detail view re-mounts when `syncMode` or
  `heartbeatInterval` changes (via its `key` prop), which is fine for a
  demo — production code should call `client.changeSyncMode(...)` for live
  transitions.
- Polling channels do not receive broadcast events; this is by design.
- Each browser tab counts as one session per stock channel. With two tabs
  in the same stock you'll see `2 watching` inside that room.
