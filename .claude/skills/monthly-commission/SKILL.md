---
name: monthly-commission
description: Process the monthly Mentor/Instructor/SMI commission — starts from Jackie's "<Month> Commission <Year>" email, ends with the email to accounting@colaberry.com. Renames the source workbook, computes the Staff Commission total, renders the staff commission table PNG, assembles the SMI + IPBC attachments, and sends. Invoke when Ali says "process the <Month> commission", forwards a commission email from Jackie, or accounting asks for the commission list for payroll.
---

# Monthly Commission (Mentor/Instructor/SMI)

## Runbook (copy-paste)

Set these two and the rest follows. Everything lands in one folder per month.

```bash
YM=2026-05; MON=May; YR=2026                     # the commission month
DIR="/c/Users/ali_m/Downloads/$MON $YR Commission"
REPO="/c/Users/ali_m/OneDrive/Business/Colaberry Novedea/AI Projects/Colaberry Enterprise AI Leadership Accelerator"
ARCHIVE="/c/Users/ali_m/OneDrive/Business/Colaberry Novedea/Stats/Commissions/SMI Comm"
mkdir -p "$DIR"

# 1. Jackie's LATEST workbook -> $DIR/<YYYY>_<MM>_ColaberryTrainingCommissions_Original.xlsx
#    (find the newest message first - she re-sends corrections under changed subjects)
# 2. staff total + table image
python "$REPO/scripts/commission/build_staff_png.py" \
       "$DIR/${YR}_05_ColaberryTrainingCommissions_Original.xlsx" \
       "$DIR/$MON $YR Staff Commission.png" "$MON"
# 3-4. pipeline -> json   5. build the month tabs   (see the numbered table below)
# 6. THE GATE - nothing sends unless this exits 0
python "$REPO/scripts/commission/preflight.py" --month $YM --dir "$DIR"
# 7. dry run, read the body, then send from inside accelerator-backend
node "$REPO/scripts/commission/send_commission_email.js" --dir "$DIR"
# 8. close the loop, then archive
python "$REPO/scripts/commission/preflight.py" --month $YM --dir "$DIR" --record
cp "$DIR/${YR}_05_SMI Commisions.xlsx" "$DIR/IPBC Group $MON $YR.xlsx" "$ARCHIVE/"
```

Keep the month folder path short. Windows still enforces a 260-character path limit and
`openpyxl` fails on longer ones; `~/Downloads/<Mon> <Year> Commission` is well inside it.

The recurring monthly payroll hand-off. It **always** starts with an email from
`jackie@colaberry.com` (historically `mika@colaberry.com`) and **always** ends with one
email from Ali to `accounting@colaberry.com`.

This is payroll. Every number in the outbound email must trace to a file, and two of the
five inputs come from outside this repo. **Never estimate, interpolate, or "reasonably
assume" a commission figure.** If an input is missing, stop and ask.

---

## The contract

**Inbound trigger** — email from `jackie@colaberry.com`, subject like `April Commission 2026`
or `Updated Ali Commission 2026`, body "Hi Ali / <Month> Commission is done.", with one
`.xlsx` attached. The same workbook is also posted to the Basecamp **New Leaders Group**
thread `(New Leaders Group) <Month> Commission <Year>`.

**Outbound deliverable** — one email:

| Field | Value |
|---|---|
| To | `accounting@colaberry.com` |
| Bcc | `ali@colaberry.com` |
| Subject | `<Mon> <Year> Commission (Mentor/Instructor/SMI)` — 3-letter month: `Feb`, `Mar`, `Apr` |
| Body line 1 | `Staff Commission: $<total>` |
| Body line 2 | `Ali Commission: $<total>` |
| Body | then the staff commission table image, inline |
| Signature | Ali's standard block (see below) |

Attachments (4):

1. `<YYYY>_<MM>_ColaberryTrainingCommissions_Original.xlsx`
2. `<YYYY>_<MM>_SMI Commisions.xlsx`  ← note the historical misspelling, keep it
3. `IPBC Group <Mon> <Year>.xlsx`
4. `<Mon> <Year> Staff Commission.png` (Feb was a separate attachment; Mar was inline `cid:`. Either is accepted.)

Sends to date:
- `Feb 2026 Commission (Mentor/Instructor/SMI)` — 2026-06-06 — Staff $11,325 / Ali $1,907.19
- `Mar 2026 Commission (Mentor/Instructor/SMI)` — 2026-07-09 — Staff $10,000 / Ali $2,143.44
- `Apr 2026 Commission (Mentor/Instructor/SMI)` — 2026-08-12 — Staff $11,950.00 / Ali $2,077.45
  (first run of this skill end to end)

---

## Step 1 — Take the LATEST version of Jackie's workbook

Mentors dispute their own lines in the Basecamp thread and Jackie re-posts a corrected file.
**Always process the most recent attachment, not the first one.**

Real example (April 2026): Jackie sent the workbook 2026-08-10; Dozie replied "Please add the
April 28th class, the total should be $1900 and not $1700"; Jackie re-sent the corrected
workbook 2026-08-11 under the subject `Updated Ali Commission 2026`. Processing the 8/10 file
would have underpaid Dozie by $200.

Before continuing, search for later messages in both channels:

```
# Gmail (MCP): both the direct thread and any "Updated ..." subject
from:jackie@colaberry.com newer_than:30d
# Basecamp thread
subject:"(New Leaders Group)" <Month> Commission
```

Download the attachment (Gmail MCP has no attachment reader — use the prod backend's own
Gmail credentials):

```bash
scripts/commission/gmail_dl.js <messageId> /app/out.xlsx     # run inside accelerator-backend
```

Save it, renamed, to `~/Downloads/<Month> <Year> Commission/`:

```
<YYYY>_<MM>_ColaberryTrainingCommissions_Original.xlsx
```

This is a **pure rename — the bytes must not change.** Verified: `February Commission 2026.xlsx`
and `2026_02_ColaberryTrainingCommissions_Original.xlsx` are md5-identical, likewise March.
Confirm with `md5sum` before and after.

## Step 2 — Staff Commission total + the table image

The workbook has 7 sheets. Only **`Staff Commissions`** matters here: column A = `Name`,
column T = `Total Comm`.

**Staff Commission = SUM(column T).** Nothing else. Verified: March summed to exactly $10,000
and February to exactly $11,325, both matching the sent emails.

Run the bundled generator — it prints the total and renders the PNG in the established style
(white ground, 1px black grid, `Name | Total Comm` header, right-aligned `$X,XXX.00`, bold
`Total` row):

```bash
python scripts/commission/build_staff_png.py \
  "<...>/<YYYY>_<MM>_ColaberryTrainingCommissions_Original.xlsx" \
  "<...>/<Mon> <Year> Staff Commission.png" "<Mon>"
```

**Self-check before trusting it:** run the same script against
`~/Downloads/February Commission 2026.xlsx`; it must print `11325.00`. If it doesn't, the
sheet layout changed — stop and re-read the workbook rather than shipping a wrong total.

Ignore the `Mgmt` sheet. Manager Commission and Shveta's $390 were dropped from the email
after Jan 2026; Feb and Mar carry Staff + Ali only. Do not reintroduce them.

## Step 3 — SMI Commissions workbook  ⚠ OPERATOR INPUT REQUIRED

`<YYYY>_<MM>_SMI Commisions.xlsx` is a long-lived workbook (~5.5 MB, one tab per month back
to 2017). Each month a **new tab named `<Mon> <Year>`** is added at the front, holding a full
re-export, and the file is saved under the new month's name.

Tab layout, columns A–I (all pasted values — **there are no formulas anywhere in the file**):

| Col | Field |
|---|---|
| A | `SMIC_SalesRep` (`SMI` for nearly every row) |
| B | `SMIC_Name` (student; the IPBC invoices roll up to one row named `IPBC - Enrollment`) |
| C–D | `OrderMonth`, `OrderYear` |
| E | `TotalPaid` |
| F | `AliComm` (tiered — see below) |
| G | `SalesRepComm` (`NULL` for SMI rows; the export writes the literal string `NULL`) |
| H–I | `MonthlyPaid`, `MonthlyPaidMinus25per` — the month total, repeated on every row |

Columns K–N hold the running summary: `Name | OrderMonth | OrderYear | Comm`, one row per
month, `Name = ALI`.

**Ali Commission = the month's `Comm` in that K:N block = `ROUND(SUM(AliComm), 2)`.**

### The rate is TIERED — do not hardcode 11.25%

`TotalPaidMinus25Per` is `TotalPaid × 0.75`, and the rate on it depends on `CompanyPaid`
(the month's SMI total):

| Row type | AliComm |
|---|---|
| `SMIC_SalesRep = 'SMI'`, CompanyPaid **< 20,000** | `TotalPaidMinus25Per × 0.15` → effective **11.25%** |
| `SMIC_SalesRep = 'SMI'`, CompanyPaid **20,000–50,999** | `TotalPaidMinus25Per × 0.17` → effective **12.75%** |
| `SMIC_SalesRep = 'SMI'`, CompanyPaid **≥ 51,000** | `TotalPaidMinus25Per × 0.20` → effective **15%** |
| Named sales rep (not SMI, not Job Referral) | `TotalPaidMinus25Per × 0.05` |
| Job Referral Sales Rep, or NULL | `(TotalPaid × 0.75) × 0.15` |

Every month sent so far has sat in the bottom tier, which is the only reason a flat 11.25%
appeared to work. **A month clearing $20,000 changes the rate.** Let the SQL decide; `preflight.py`
cross-checks the figure against the tier and shouts when the tier moves.

Measured 2026 (from CCPP on 2026-08-13) — note July:

| Month | CompanyPaid | Tier | Effective | AliComm |
|---|---|---|---|---|
| Jan | $18,810.80 | 0.15 | 11.25% | $2,116.22 |
| Feb | $16,952.80 | 0.15 | 11.25% | $1,907.19 |
| Mar | $19,052.83 | 0.15 | 11.25% | $2,143.44 |
| Apr | $18,466.26 | 0.15 | 11.25% | $2,077.45 |
| May | $15,104.44 | 0.15 | 11.25% | $1,699.25 |
| Jun | $17,478.02 | 0.15 | 11.25% | $1,966.28 |
| **Jul** | **$28,053.24** | **0.17** | **12.75%** | **$3,576.79** |

**July 2026 crosses the boundary.** At the old flat 11.25% it would come out $3,155.99 —
**$420.80 short**. March cleared the boundary by only $947, so this is genuinely volatile
month to month, not a one-off. Never carry a rate forward from last month.

These are point-in-time figures: late payments and reversals keep landing in past months, so
re-run rather than quoting this table. It is here to show the boundary is live, not as a source.

### The source query

`C:\Users\ali_m\OneDrive\Business\Colaberry Novedea\Stats\Commissions\SMI Comm\SMI Commission.sql`

That folder is also the archive — every month's `<YYYY>_<MM>_SMI Commisions.xlsx` and
`IPBC Group <Mon> <Year>.xlsx` lives there. **Copy the new month's files back into it** after
sending.

The file is **UTF-16LE**; decode before use (`open(p,'rb').read().decode('utf-16')`).

Three things to know before running it:

1. **Drop the hand-toggled filter.** The two trailing `SELECT`s carry
   `WHERE OrderMonth NOT IN (2,3,4,5)` — a leftover Ali edits by hand. Run the pipeline up to
   and including the `INTO #SMI_CommIII` statement, then supply your own unfiltered SELECTs.
   `scripts/commission/run_smi_pipeline.js` does exactly that.
2. **It depends on `GETDATE()`.** The `#AdjustAmount` block projects contracted payments
   forward for `DATEDIFF(MM, GETDATE(), SMIC_PayEndDate)` months, so *historical row counts
   shift between runs*. This is normal and visible in the archive — the Jan/Feb/Mar 2026 tabs
   hold 6,556 / 5,316 / 5,377 rows. **Monthly totals are stable even though row counts are
   not**; verified by reproducing Nov 2025 through Mar 2026 to the cent months later.
3. **`#AdjustAmount` is why a couple of students show at ~2× their actual payments.** Students
   with `SMIC_Status = 11` who paid more than once in a month get their contracted
   `SMIC_PaymentAmount` projected forward, and the `NOT IN` de-dup misses when the name join
   resolves differently — so the actual and contracted rows both land. It is longstanding
   behaviour baked into every prior month; do not "fix" it silently.

After building the tab, validate:

- The new tab's `MonthlyPaid` is identical on every row of the month.
- The K:N `ALI` row for the month equals `SUM(F)` rounded to 2dp.
- **Prior months in K:N still match what was emailed for those months.** This is the real
  regression test — Feb must be 1,907.19, Mar 2,143.44, Dec 2025 3,768.11, Nov 2025 1,177.93.
  If an old month moved, the basis was restated and that needs flagging, not shipping.
- Carried-over tabs survived the openpyxl round-trip unchanged (row count + `TotalPaid` sum).

## Step 4 — IPBC Group workbook

`IPBC Group <Mon> <Year>.xlsx` is the supporting detail for the single `IPBC - Enrollment`
line in the SMI tab. Same pattern: one tab per month, newest first, columns straight out of
`vw_ADF_PaySimple` plus the `SMIC_*` join columns; rows are the `IPBC - Enrollment` invoices.

Cross-check: **the tab's `Amount Paid` must sum to the `IPBC - Enrollment` row's `TotalPaid`
in the SMI tab.** Verified for March 2026: `0.01 + 49 + 0.01 + 0.01 = 49.03`, matching the
SMI tab's `IPBC - Enrollment  49.03` exactly. If the two disagree, one of the exports is stale.

These are the same rows the main query rolls up — the ones with no name match, which is what
makes them `IPBC - Enrollment`:

```sql
SELECT p.[Customer #], p.Source, p.[Order Date], p.Status, p.Total,
       p.[Amount Paid], p.[Balance Due], p.ModifiedDate,
       p.SMIC_SalesRep, p.SMIC_CommID, p.SMIC_UserID
FROM   [dbo].[vw_ADF_PaySimple] p
LEFT JOIN ( SELECT DISTINCT SMIC_Name, SMIC_ID, PS_CUSTOMERID
            FROM dbo.vw_ADF_Student_Marketing_SalesRepsCommSystem
            UNION ALL
            SELECT StudentName, SMIC_ID, PS_CustomerID
            FROM [dbo].[vw_ADF_Student_Marketing_SalesRepsIPBC_Signups] ) b
  ON p.[Customer #] = b.PS_CUSTOMERID
WHERE  p.[Amount Paid] > 0 AND b.SMIC_Name IS NULL
AND    Month(p.[Order Date]) = @mm AND Year(p.[Order Date]) = @yyyy
```

**If it returns nothing, the month still gets a tab** containing the single cell
`No Data for the month` — the established convention (see the Feb/Mar/May 2024 tabs). April
2026 was such a month: no IPBC enrolments, so no `IPBC - Enrollment` row in the SMI tab either.

## Step 5 — Preflight, then send

**Nothing goes to accounting until `preflight.py` exits 0.** It derives both figures from the
files rather than trusting anything typed, and it is the only thing that writes the
`send_manifest.json` the sender requires.

```bash
python scripts/commission/preflight.py --month 2026-05 --dir "~/Downloads/May 2026 Commission"
```

Six gates, any FAIL blocks the send:

| # | Gate | Catches |
|---|---|---|
| 1 | Idempotency vs `ledger.json` | Double-sending a month to accounting |
| 2 | All four attachments present, non-zero, under 20 MB | A missing or truncated file |
| 3 | Staff total re-derived from column T, header shape asserted | A moved column silently changing the total |
| 4 | Ali figure read from K:N, cross-checked against the tier | Pasting the wrong rows, or the wrong rate |
| 5 | Every prior month still computes to what was emailed | A restated basis |
| 6 | Carried-over month tabs survived the rebuild | openpyxl round-trip corruption |

Then dry-run, send, and close the loop:

```bash
node scripts/commission/send_commission_email.js --dir "<dir>"            # dry run, prints the body
node scripts/commission/send_commission_email.js --dir "<dir>" --send     # in accelerator-backend
python scripts/commission/preflight.py --month 2026-05 --dir "<dir>" --record
```

The sender carries **no figures of its own** — it reads the manifest, re-hashes all four
attachments against it, and aborts if any file changed since preflight. Verified by break test:
a one-byte change to an attachment aborts with exit 1; a missing manifest exits 2.

The body, exactly as Feb / Mar / Apr said it:

```
Staff Commission: $11,950.00
Ali Commission: $<from step 3>

<staff commission table image>

--
Ali Muwwakkil
Managing Director — AI Systems Architect
Colaberry Inc.
200 Chisholm Place, Suite 200 · Plano, TX 75075
ali@colaberry.com  enterprise.colaberry.ai
```

Amounts carry thousands separators and 2 decimals. No em-dashes in body copy — the `—` in the
signature title is part of the fixed block and stays; the sender asserts this.

## Step 6 — After sending

- Reply to any waiting nudge (Nazma/HR chases this for payroll — e.g. "Could you please send
  over the commission list? As we are approaching payroll").
- Keep the month's folder at `~/Downloads/<Month> <Year> Commission/` with all four artifacts.
- **Do not** add a PROGRESS.md entry. Per CLAUDE.md, outbound email sent on Ali's behalf and
  ad-hoc data pulls are explicitly out of scope for PROGRESS.md. Changes to *this skill* do
  belong there.

---

## Cast

| Who | Role |
|---|---|
| `jackie@colaberry.com` | Event Manager — produces the staff commission workbook (took over from `mika@colaberry.com` around Apr 2026) |
| `accounting@colaberry.com` | Destination; processes the payout |
| `nazma@colaberry.com` | Sr. HR Manager — chases for payroll |
| Basecamp New Leaders Group | Where mentors dispute lines and Jackie posts corrections |

## Running queries against CCPP

CCPP holds no credentials locally. Run read-only queries from the prod backend, which already
has `MSSQL_*` in its environment and the `mssql` package installed:

```bash
B64=$(base64 -w0 query.js)
ssh root@95.216.199.47 "echo '$B64' | base64 -d > /tmp/q.js \
  && docker cp /tmp/q.js accelerator-backend:/app/q.js \
  && docker exec -w /app accelerator-backend node q.js; \
  docker exec accelerator-backend rm -f /app/q.js; rm -f /tmp/q.js"
```

Clean up the script and any downloaded PII afterwards. Note the view's column names contain
spaces and must be bracketed: `[Customer #]`, `[Order Date]`, `[Amount Paid]`.

## Bundled scripts

Run in this order. The `.js` ones execute inside `accelerator-backend` (except a dry run, which
works anywhere).

| # | Script | Purpose |
|---|---|---|
| 1 | `gmail_dl.js` | Downloads Jackie's attachment by message id using the prod backend's Gmail credentials (the Gmail MCP connector cannot read attachments). |
| 2 | `build_staff_png.py` | Reads `Staff Commissions`, prints the staff total, renders the table PNG. Self-validates against February. |
| 3 | `extract_pipeline.py` | Decodes `SMI Commission.sql` (UTF-16LE) and cuts it at the end of the `INTO #SMI_CommIII` statement. Refuses to emit anything that still carries the hand-toggled `OrderMonth NOT IN` filter or is missing a temp table. |
| 4 | `run_smi_pipeline.js` | Runs that pipeline against CCPP; writes `smi_detail.json`, `smi_summary.json`, `ipbc_<mon>.json`. |
| 5 | `build_month_tabs.py` | Copies last month's SMI + IPBC workbooks, prepends the new `<Mon> <Year>` tab to each, saves under the new month's name. |
| 6 | **`preflight.py`** | **The gate.** Six checks, writes `send_manifest.json` on pass. Nothing sends without it. |
| 7 | `send_commission_email.js` | Reads the manifest, re-hashes every attachment, sends via Mandrill with the PNG inline as `cid:staffcomm`. Dry run by default. |
| 8 | `preflight.py --record` | Appends the month to `ledger.json` after a confirmed send. |
| — | `verify_month.py` | Standalone read-back, kept for ad-hoc inspection. `preflight.py` supersedes it in the flow. |
| — | `ledger.json` | Every month ever sent. Idempotency record, regression baseline, and tier history in one file. |

Step 7 uses raw nodemailer rather than `sendWithBcAttach`, which hard-requires a Basecamp
`ticketId`. This email has no originating ticket — Feb and Mar went straight from Outlook with
no BC attachment — and the helper's own guard directs that case to raw nodemailer.

## If a mentor disputes after the send

It happens (Dozie did it for April, before the send). The basis is Jackie's workbook, so:

1. Jackie issues a corrected workbook — she owns the staff numbers, not us.
2. Re-run from Step 1 with the new file into the **same** month folder.
3. `preflight.py` will refuse: the month is in the ledger. That is working as designed. Pass
   `--force` once you have confirmed a correction is genuinely intended.
4. Subject the correction clearly, e.g. `Apr 2026 Commission (Mentor/Instructor/SMI) - corrected`,
   and say in one line what moved and for whom. Do not resend a bare duplicate.
5. `--record` again afterwards; add a `note` on the ledger entry saying what changed.

Ali's own figure never changes in this scenario — it comes from CCPP, not from Jackie's sheet.
