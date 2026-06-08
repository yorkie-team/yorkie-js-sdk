# react-page-view-counter

A minimal example that uses a Yorkie `Counter` CRDT as a daily
page-view (PV) counter.

## Pattern

- `DocumentProvider` with `syncMode={SyncMode.Manual}` and `disableGC`
- Document key follows `pv-{topicId}-{YYYYMMDD}`, so a fresh document is
  used every 24 hours
- On topic-page mount, the client runs `counter.increase(1)` once and
  then calls `client.sync(doc)`
- No automatic sync afterwards — other users' increments are picked up
  on the next page entry

## Running

```sh
# From the repo root
pnpm i

# Start the Yorkie server
docker compose -f docker/docker-compose.yml up --build -d

# Start this example
pnpm --filter react-page-view-counter dev
```

To point at a different server or use an API key:

```sh
VITE_YORKIE_API_ADDR=http://localhost:8080 \
VITE_YORKIE_API_KEY=your-key \
pnpm --filter react-page-view-counter dev
```

## RPCs per entry

Each time you open a topic page:

1. `attach`: push (empty change pack) + pull (server snapshot) — 1 RPC
2. `client.sync(doc)`: push (+1) + pull (any concurrent +1s) — 1 RPC

Two RPCs total. A strict "1 push + 1 pull" pattern requires mutating
the document *before* attach (a single `client.attach()` call carries
both push and pull). That path is not exposed by `DocumentProvider`, so
this example uses the two-RPC variant.

## Known simplifications

- The date in `docKey` uses the client's local time. A real service
  should pin the boundary to a fixed timezone (typically UTC) so every
  client agrees on the rotation moment.
- No server-side de-duplication, bot filtering, or per-user unique
  visitor logic.
- React StrictMode's double-effect is guarded with a ref. In
  production, refresh/back-button double counts should be handled by
  server-side policy.
