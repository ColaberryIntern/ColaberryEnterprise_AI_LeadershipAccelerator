# Case-study library cleanup notes

**Takeaway:** the library has 58 case studies (19 inside, 39 outside). The 2026-11-13 services sweep could
place 56 of them against a service. The four problems below make the evidence score lower than the work
deserves, and two of them make some records impossible to place. None of them needs code. Each is
fixed record by record on `/admin/case-studies` or in Intake.

Counts are as of 2026-11-13. The record-level list (titles and ids) stays private, in the Services
Upgrade Basecamp folder, because this repository is public.

| # | Problem | Count | Effect today | Fix |
|---|---|---|---|---|
| 1 | Inside case study with no summary | 17 | The suggestor matches on title and keywords alone, which gives weak or no matches | Write a 2-3 sentence summary, then re-run suggest for that record |
| 2 | Outside whitepaper with no year | 38 | Freshness scores 0, so the service's evidence score is held down even when proof is strong | Set the project year from the PDF |
| 3 | Duplicate or split records (one engagement stored as two) | a handful, flagged in the sweep | The same proof counts twice, or its parts each look too thin to match | Merge into one record, keep the richer analysis |
| 4 | Empty records | 2 | Nothing to match, so they stay blocked in Intake | Fill in or archive |

## Order

1. Fix #4 and #3 first. They change what is counted.
2. Then #1, because it changes which services a record is suggested for.
3. #2 last. It only moves scores, not links.

## How to verify

- Re-run the suggest pass for any record you edited. It is idempotent and never touches a link someone
  already decided.
- Run `tests/systemV2/ourServices.e2e.js` against production (read-only). The Intake card count and the
  pre-ticked count must still match the evidence-summary API.
