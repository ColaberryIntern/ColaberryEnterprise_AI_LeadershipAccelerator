# Voice AI Studio: Rollback drill

Rehearsed on a local throwaway Postgres with mock providers (no phone, no network, no customer data). The rollback is the operator command run as its own process while a caller asks for a provider every 50 ms and one call is live. The plan named the local docker-compose stack; Docker is not available on the build machine, so a local Postgres 16 was used instead. Not rehearsed on production.

- Started: 2026-11-25T21:02:59.995Z
- Command finished: 2026-11-25T21:03:00.685Z
- First new call on synthflow_legacy: 2026-11-25T21:03:00.706Z (0.71 s after the start)
- Result: PASS

| Check | Result | Measured |
|---|---|---|
| The operator command succeeded | PASS | exit 0 |
| New calls reach synthflow_legacy within 60 s of the command | PASS | 0.71 s |
| Every call after the command finished is legacy | PASS | 36 of 36 |
| Calls were going to the direct engine before | PASS | 36 calls |
| No call was refused, lost or errored | PASS | 84 of 84 |
| The live call was left alone | PASS | session_active |
| The rollback was audited once | PASS | 1 |

Command: `npm run voice:route:rollback -- --path <path key> --actor <admin id> --apply`. Repeat the drill: `npm run voice:rollback:drill`.
