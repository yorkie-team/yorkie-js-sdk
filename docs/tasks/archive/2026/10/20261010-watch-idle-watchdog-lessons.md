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
- An E2E that passes once is not a proof: the first commit's run froze the
  stream right after attach and passed, while a run that idled for 5s first
  showed the aborted read never settling. Vary the timing before calling a
  recovery path verified.
- Don't make recovery wait for the transport to acknowledge an abort.
  Reconnect from the timer and ignore the old stream.

## Self review

- Round 1 (independent agent): no blocking findings. Applied: clear the
  timer at the top of `catch`.
- Round 2 (`/code-review`, 9 findings). Fixed five (see the todo's Review).
  Not changed, with reasons:
  - "Reconnect can hang before init on a dead HTTP/2 connection": plausible
    in browsers but not reproduced here; an init deadline conflicts with the
    auth webhook's retries, as the Go client decided. Left under Open.
  - "Overdue timer after a frozen page": one spurious reconnect, self-healing.
    Checking elapsed time cannot help, because the buffered heartbeats are
    not read yet either. Left under Open.
  - "Unrelated row in docs/tasks/README.md": `tasks-index.sh` regenerates
    the whole index. Leaving the row out by hand would make it wrong.
