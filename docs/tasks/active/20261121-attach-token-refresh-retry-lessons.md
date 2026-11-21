# Lessons: retry attach once after refreshing an expired auth token

## The 401 was handled; the retry was not

The SDK already refreshed the token on an attach 401. The contract was that a
one-shot call rethrows and the caller retries, and the integration test said
so (`// retry attach`). No caller did: the React provider turns the error
into state and stops. A contract that every real caller breaks is the bug,
so the retry moves into the SDK instead of into each app.

## Retry the RPC, not the closure around it

`attachOnce` looks like the natural retry unit (the epoch re-anchor already
re-runs it), but it also restores from the store and seeds the initial
presence. Re-running it on a 401 would replay both. The retry wraps only the
`pushWithPresenceBase` call, which rebuilds the pack from the unchanged
document.

## Count injector calls on the failure path

Without a guard, a second 401 reaches the attach `catch`, whose
`handleConnectError` asks the injector again. That is three calls per attach
for a revoked user. The second test pins two.

## Self review

One inline round over the full diff, no blocking findings. Checked: an
injector rejection still surfaces the injector's error with one call, as
before; a non-401 error from the retry still reaches `handleConnectError`, so
`ErrClientNotActivated` still tears the client down; a session lost during the
refresh abandons the retry through `assertSession`.
