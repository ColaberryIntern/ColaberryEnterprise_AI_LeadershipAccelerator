# CC-20261016-k4t7 — Colaberry path to profitability

- [x] Path-to-profitability plan for Ram
  - Date: 2026-10-21
  - Session: CC-20261016-k4t7
  - What changed: new `turnaroundData.js` (measured figures), `turnaroundPlan.js`
    (12 dated decisions, 4 irreversible), `buildTurnaroundPlan.js`, and a self-contained
    HTML plan at docs/COLABERRY_PATH_TO_PROFITABILITY.html.
  - Verification: 11 build guards pass, including that comp subscriptions are never
    counted as revenue, that exactly one engine claims revenue, that the retention offer
    is dated BEFORE the sunset notice, and that account 4300 is never described as an ISA
    book while 89% of it is unexplained. `checkAmericanSpelling` 198 files, 0 found.
    Rendered and inspected at 1000px across five slices.
  - Notes: the brief's central premise did not survive measurement. "4300 ISA Placement
    Income" is a PAYMENT PROCESSOR column, not a revenue type - the workbook organizes
    income by how cash arrived. Real ISA placement income is ~$2,150/month ending May
    2027; the ~$13.9k/month actually funding the company is 124 legacy subscriptions
    attached to the program being sunset. The risk is cancellation, not run-off.
    I also reported MRR as $5,372 before correcting it to $3,581: nine subscription rows
    read "active" with lapsed billing periods.
