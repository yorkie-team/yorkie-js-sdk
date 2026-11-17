# React Chat

A Slack-like chat on Yorkie: channels, messages, emoji reactions, and
threads. A workspace Document holds the channel list and everyone's
presence; each channel is its own Document holding its messages.

## How to run

1. Start the Yorkie server (from the repo root):
   `docker compose -f docker/docker-compose.yml up --build -d`
2. Install and build (from the repo root): `pnpm install` then `pnpm sdk build`
   and `pnpm react build`
3. `pnpm react-chat dev`
4. Open the printed URL in two tabs.
