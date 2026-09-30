#!/usr/bin/env bash

# Copyright 2026 The Yorkie Authors. All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

set -euo pipefail

# Blocks until the Yorkie server answers its health RPC as SERVING.
#
# `docker compose up -d` returns once the container has *started*, not once
# the server inside it listens, and the integration suites open their first
# connection about a second later. Suites that happen to be scheduled into
# that window fail at activateClient with "other side closed" -- the socket
# connects and is dropped unanswered -- while suites scheduled a few seconds
# later pass, so the run looks flaky rather than unstarted.
#
# A TCP probe is not enough for the same reason: the port is bound before the
# handlers are. This asks the service the tests actually call, over the same
# Connect endpoint they use, so a SERVING answer means requests are being
# served and not merely accepted.
#
# The server-dependent package scripts (`sdk test`, `sdk test:ci`) run this
# first, so neither CI nor a local run has to remember to. `sdk test:unit` is
# deliberately left ungated: `verify:fast` calls it and must stay serverless.
#
# Usage: wait-for-yorkie.sh [timeout-seconds]   (default 60)
# Honours TEST_RPC_ADDR, the same address the integration suites read.

ADDR="${TEST_RPC_ADDR:-http://127.0.0.1:8080}"
TIMEOUT="${1:-60}"
INTERVAL=0.2
SERVICE="yorkie.v1.YorkieService"

if ! [[ "$TIMEOUT" =~ ^[0-9]+$ ]] || [ "$TIMEOUT" -eq 0 ]; then
  echo "[wait-for-yorkie] timeout must be a positive whole number of seconds, got '$TIMEOUT'" >&2
  exit 2
fi

attempts=$(awk -v t="$TIMEOUT" -v i="$INTERVAL" 'BEGIN { printf "%d", t / i }')
response=''

for ((attempt = 1; attempt <= attempts; attempt++)); do
  # `|| true` because a refused or dropped connection is the expected state
  # while the server boots, and `set -e` would abort the wait on the first one.
  response=$(curl -sS --max-time 2 -X POST \
    -H 'Content-Type: application/json' \
    -d "{\"service\":\"$SERVICE\"}" \
    "$ADDR/grpc.health.v1.Health/Check" 2>&1 || true)

  if [[ "$response" == *SERVING_STATUS_SERVING* ]]; then
    echo "[wait-for-yorkie] $ADDR is serving $SERVICE (attempt $attempt)"
    exit 0
  fi

  sleep "$INTERVAL"
done

echo "[wait-for-yorkie] $ADDR did not serve $SERVICE within ${TIMEOUT}s" >&2
echo "[wait-for-yorkie] last response: ${response:-<none>}" >&2

# The container logs are the only thing that separates "still booting" from
# "crashed on boot", and they are gone by the time anyone reads the failure.
compose_file="$(dirname "$0")/../docker/docker-compose-ci.yml"
if [ -f "$compose_file" ] && command -v docker >/dev/null 2>&1; then
  echo "[wait-for-yorkie] recent server logs:" >&2
  docker compose -f "$compose_file" logs --tail 50 yorkie >&2 || true
fi

exit 1
