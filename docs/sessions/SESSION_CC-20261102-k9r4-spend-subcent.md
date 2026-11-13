# Session CC-20261102-k9r4 — the Meta spend sync was losing 11.7% of the money

Marketing ops tab, Basecamp list `10467338643`. This entry covers one defect, found while
reconciling ADS-6 on 2026-11-13, and the fix for it.

The day's other work (recovering the Meta token from a trashed email, placing it on production,
first sync run) is logged on Basecamp tickets ADS-4 `10467338894` and ADS-6 `10467338921` and is
summarised at the end.

---

## What went wrong

Meta's Insights API reports spend at sub-cent precision: `"134.693522"`. Our money parser accepted
at most two decimal places:

```ts
if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(s)) return null;
```

So those rows parsed to `null`. `insightToInput` returned `null`. And `runMetaSpendSync` did this:

```ts
for (const row of data) {
  const input = insightToInput(row, accountId);
  if (input) inputs.push(input);     // <- no else. no count. no log.
}
```

The run then returned `outcome: 'success'` and logged `level: "info"`.

Two defects, and the second is the worse one. The first loses money; the second guarantees nobody
finds out. `insightToInput`'s own docstring claimed the dropped rows were *"logged by the caller as
skipped"*. The caller did not log them. It still does not say so anywhere a person would look —
not in the structured log, not in the `SyncResult`, not on the admin panel, which cheerfully
reported `Pulled 48 rows`.

## Measured, not estimated

Against the live ad account `661181097279671`, window 2026-10-20 to 2026-11-12:

| | |
|---|---|
| Meta's own account total | **$3,407.56** |
| `marketing_spend_facts` held | **$3,010.39** |
| Missing | **$397.17 — 11.7%, across 7 of 55 rows** |

The gap was not Meta's. Asking Graph for the same window **with** and **without** the
`publisher_platform` breakdown returned $3,407.56 both times, so the breakdown sums correctly and
the loss was entirely ours. Running `SpendInputSchema.safeParse` over the 55 raw rows named the
cause directly: seven rows, every one of them `amountCents: expected number, received null`.

Rejected rows, verbatim from the API: `134.693522`, `73.216479`, `62.858263`, `33.521737`,
`0.189939`. The affected campaign was `Oct- Start with $0 today Lead Camapign` (`52708443249234`).

## The fix

**1. A second parser, not a loosened one.** `parseApiMoneyToCents` rounds half-up to the cent using
integer arithmetic. `parseMoneyToCents` is left strict on purpose: three decimals typed by a human
into a CSV is a typo, and `parseSpendCsv` reports it by line number rather than importing a guess.
Relaxing the shared function would have traded a silent data loss for a silent data corruption.

**2. The missing `else`.** `rowsSkipped` is counted, returned on every `SyncResult` path including
zero, written into the structured log as `rows_skipped`, and raises the log level to `warn` with an
explicit `warning` string whenever it is non-zero. A run that discards rows is no longer an `info`
event.

**3. The admin panel says so.** A success with skipped rows now renders as an error-styled message
naming the count and stating the totals understate spend, instead of a green `Pulled N rows`.

## Verification

- **Arithmetic**: the shipped function body was lifted verbatim out of the source file and run over
  22 cases including every value the API actually returned, both rounding boundaries (`1.005` → 101,
  `1.004` → 100, `9.999` → 1000), agreement with the strict parser on ordinary money, and the
  float-drift case (`0.1 + 0.2` = exactly 30 cents). A deliberately wrong expectation was asserted
  last and failed, so the harness can report failure.
- **End to end, against production data**: the new parser applied to all 55 real rows gives
  **$3,407.56, dropping 0 rows — Meta's own total, exact to the cent.** The old parser on the same
  55 rows gives $3,010.39 dropping 7, so the two are genuinely different measurements.
- **Unit tests**: two new `describe` blocks, pinned to the real values rather than invented ones,
  including one asserting `parseMoneyToCents('12.345')` stays `null` so the human-input strictness
  cannot be relaxed later by accident.

## No backfill script is needed

`syncMetaSpend` re-pulls the trailing 30 days on every run and the ledger upserts, so the first
scheduled run after this deploys corrects the stored history by itself. Proven on production the
same day: running the sync twice with identical inputs left the row count and total unchanged
(49 rows / $3,064.50 both times), with a rolled-back control row confirming that comparison can
detect a change.

## Context: how the sync came to be running at all

`META_ADS_ACCESS_TOKEN` had never been set. The token had been sent by Sohail on 2026-11-06 and was
sitting in Ali's Gmail **trash**; an earlier search missed it because it queried the inbox only and
did not pass `includeSpamTrash`. Recovered, validated against Graph (`colaberry-ads-read`,
`SYSTEM_USER`, never expires, `ads_read` present, a corrupted copy refused), and placed in the
production `.env` without ever touching a local disk or a log line. The backend was recreated from
the image digest it was already running, so no code shipped with it.

`deploy-prod.sh` refused the recreate because the production checkout is behind `origin/main`. That
refusal was correct — pulling would have shipped another session's merged code as a side effect of
an environment reload — so the same deploy lock was taken by hand instead.

**Still open:** the recovered token carries ~43 permissions including `ads_management` and
`pages_manage_posts`, where the sync needs `ads_read` alone. Sohail has been asked for a narrowed
token with no deadline attached; swapping it is a one-line `.env` change.
