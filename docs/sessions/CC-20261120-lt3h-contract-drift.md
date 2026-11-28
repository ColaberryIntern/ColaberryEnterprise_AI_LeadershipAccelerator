# CC-20261120-lt3h - CCPP and PaySimple contract drift report

- [x] Read-only report of placement contracts where CCPP and PaySimple disagree
  - Date: 2026-11-24
  - Session: CC-20261120-lt3h
  - What changed: added `services/billing/contractDrift.ts` (pure comparison), `contractDriftSource.ts`
    (SELECT and GET only) and `scripts/reportContractDrift.ts`.
  - Verification: 19 unit tests pass under `jest.ci.config.ts`; TypeScript 5.7.3 reports no error in the
    new files, with a planted control error caught in the same run. NOT yet run against live data.
  - Notes: assumptions: only CCPP status 1 is compared; a customer with several contracts is listed and
    not guessed at; app membership prices ($149, $199, $1,788) with no contract are expected; end dates
    may differ by 31 days. A partial read of either system throws instead of reporting. Not scheduled.
    Tracked at Basecamp todo 10543926849.
