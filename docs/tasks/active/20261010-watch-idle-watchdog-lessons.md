# Watch idle watchdog lessons

**Created**: 2026-10-10

- A half-open stream is reproducible locally with a TCP proxy that stops
  relaying the sockets whose first request names `/Watch`, leaving new
  connections alone. Freezing every socket instead also hangs the pooled
  unary connections and tests something else.
- The local `testTimeout` is `Infinity`, so a suite run against a server
  without the auth webhook hangs in `webhook_test.ts` instead of failing.
  Before blaming a change for a hang, rerun with `--testTimeout` and compare
  the same files on main.
- The integration lane cannot exercise the heartbeat while the CI server
  runs with it off (the default). The only end-to-end check that `client.ts`
  wires the interval in is the manual proxy run above.
