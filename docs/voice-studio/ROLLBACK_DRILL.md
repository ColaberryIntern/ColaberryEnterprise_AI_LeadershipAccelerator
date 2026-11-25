# Voice AI Studio: Rollback drill

Rehearsed on a local throwaway Postgres with mock providers (no phone, no network, no customer data). The rollback is the operator command run as its own process while a caller asks for a provider every 50 ms and one call is live. The plan named the local docker-compose stack; Docker is not available on the build machine, so a local Postgres 16 was used instead. Not rehearsed on production.

- Started: 2026-11-25T20:20:23.072Z
- Command finished: 2026-11-25T20:20:23.697Z
- First new call on synthflow_legacy: 2026-11-25T20:20:23.723Z (0.65 s after the start)
- Result: PASS

| Check | Result | Measured |
|---|---|---|
| The operator command succeeded | PASS | exit 0 |
| New calls reach synthflow_legacy within 60 s of the command | PASS | 0.65 s |
| Every call after the command finished is legacy | PASS | 37 of 37 |
| Calls were going to the direct engine before | PASS | 37 calls |
| No call was refused, lost or errored | PASS | 85 of 85 |
| The live call was left alone | PASS | session_active |
| The rollback was audited once | PASS | 1 |

Command: `npm run voice:route:rollback -- --path <path key> --actor <admin id> --apply`. Repeat the drill: `npm run voice:rollback:drill`.
