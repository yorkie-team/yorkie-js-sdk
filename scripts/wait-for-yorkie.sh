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
# handlers are. This asks over the same Connect endpoint the tests use, so a
# positive answer means requests are being served and not merely accepted.
#
# Nothing in this repository pins what the server registers in its health
# checker -- the image is `yorkieteam/yorkie:latest` and its health service
# names are chosen in another repository -- so the probe never depends on a
# single answer. It tries, in order: the health service named for
# `yorkie.v1.YorkieService`, the health service for the server as a whole
# (the empty service name), and finally the RPC endpoint the suites
# themselves call. Any of the three answering is enough; a health checker
# that does not know the name, or that is not registered at all, degrades to
# the next probe instead of timing the whole lane out.
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

# Without this the first probe fails like every pre-boot one does and the
# script reports a server that never came up, which is the one diagnosis that
# sends the reader to the wrong machine.
if ! command -v curl >/dev/null 2>&1; then
  echo "[wait-for-yorkie] curl is required but not installed" >&2
  exit 2
fi

body_file="$(mktemp)"
trap 'rm -f "$body_file"' EXIT

# `post PATH BODY` echoes the HTTP status (000 when nothing answered) and
# leaves the response body in $body_file. `|| code=000` because a refused or
# dropped connection is the expected state while the server boots, and
# `set -e` would abort the wait on the first one.
post() {
  local code
  code=$(curl -sS --max-time 2 -o "$body_file" -w '%{http_code}' -X POST \
    -H 'Content-Type: application/json' -d "$2" "$ADDR/$1" 2>/dev/null) || code=000
  echo "${code:-000}"
}

# Two spellings are in the wild for the same enum value: the canonical
# `grpc.health.v1.HealthCheckResponse.ServingStatus` (google.golang.org/grpc)
# names it `SERVING`, while connectrpc.com/grpchealth's re-declaration prefixes
# it `SERVING_STATUS_SERVING`. Which one a server emits depends on which health
# implementation it registers, so accept either -- matching only one makes the
# probe time out against a server that is in fact serving. The `"status":`
# prefix is part of the pattern so `NOT_SERVING` and `SERVICE_UNKNOWN` cannot
# match; the numeric alternative covers a server that emits the enum by number
# instead of by name, and is closed off by a JSON delimiter so it cannot match
# the `1` inside some other value.
is_serving() {
  [[ "$1" == 200 ]] &&
    [[ "$(cat "$body_file")" =~ \"status\"[[:space:]]*:[[:space:]]*(\"SERVING\"|\"SERVING_STATUS_SERVING\"|1[[:space:]]*[,}]) ]]
}

# `SECONDS` is a wall-clock bound: counting attempts instead would overshoot
# the timeout by however long the probes themselves took (up to --max-time
# each), which on a server that accepts and never answers is many times over.
deadline=$((SECONDS + TIMEOUT))
attempt=0
how=''
response=''

while ((SECONDS < deadline)); do
  attempt=$((attempt + 1))

  code=$(post "grpc.health.v1.Health/Check" "{\"service\":\"$SERVICE\"}")
  if is_serving "$code"; then
    how="health check for $SERVICE"
  else
    response="$code $(cat "$body_file")"

    # The server as a whole, for a health checker that registers no per-service
    # entry under that name.
    code=$(post "grpc.health.v1.Health/Check" '{}')
    if is_serving "$code"; then
      how='health check for the server'
    else
      # No usable health service. Ask the RPC the suites themselves call: a
      # Connect handler that answers at all -- with success or with a
      # structured error such as invalid_argument -- is a registered,
      # serving handler, which is the whole question here. A 404/501 is the
      # mux answering for a route that is not mounted yet, so it keeps
      # waiting.
      code=$(post "$SERVICE/ActivateClient" '{}')
      case "$code" in
        200 | 400 | 401 | 403) how="$SERVICE/ActivateClient answering ($code)" ;;
      esac
    fi
  fi

  if [ -n "$how" ]; then
    echo "[wait-for-yorkie] $ADDR is serving -- $how (attempt $attempt)"
    exit 0
  fi

  sleep "$INTERVAL"
done

echo "[wait-for-yorkie] $ADDR did not answer any probe within ${TIMEOUT}s" >&2
echo "[wait-for-yorkie] last health response: ${response:-<none>}" >&2
echo "[wait-for-yorkie] last RPC response: ${code:-<none>} $(cat "$body_file" 2>/dev/null)" >&2

# The container logs are the only thing that separates "still booting" from
# "crashed on boot", and they are gone by the time anyone reads the failure.
compose_file="$(dirname "$0")/../docker/docker-compose-ci.yml"
if [ -f "$compose_file" ] && command -v docker >/dev/null 2>&1; then
  echo "[wait-for-yorkie] recent server logs:" >&2
  docker compose -f "$compose_file" logs --tail 50 yorkie >&2 || true
fi

exit 1
