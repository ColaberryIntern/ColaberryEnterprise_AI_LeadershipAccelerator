---
name: monthly-commission
description: Process the monthly Mentor/Instructor/SMI commission — starts from Jackie's "<Month> Commission <Year>" email, ends with the email to accounting@colaberry.com. Renames the source workbook, computes the Staff Commission total, renders the staff commission table PNG, assembles the SMI + IPBC attachments, and sends. Invoke when Ali says "process the <Month> commission", forwards a commission email from Jackie, or accounting asks for the commission list for payroll.
---

# Monthly Commission (Mentor/Instructor/SMI)

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

Verified against the two known-good sends:
- `Feb 2026 Commission (Mentor/Instructor/SMI)` — 2026-06-06 — Staff $11,325 / Ali $1,907.19
- `Mar 2026 Commission (Mentor/Instructor/SMI)` — 2026-07-09 — Staff $10,000 / Ali $2,143.44

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
| F | `AliComm` = `TotalPaid × 0.1125` (**11.25%**) |
| G | `SalesRepComm` (`NULL` for SMI rows) |
| H–I | `MonthlyPaid`, `MonthlyPaidMinus25per` — the month total, repeated on every row |

Columns K–N hold the running summary: `Name | OrderMonth | OrderYear | Comm`, one row per
month, `Name = ALI`.

**Ali Commission = the month's `Comm` in that K:N block = SUM(column F) = month `TotalPaid` × 11.25%.**

Verified on both known months:
- Feb 2026: TotalPaid 16,952.80 × 0.1125 = **1,907.19** ✓ matches the sent email
- Mar 2026: TotalPaid 19,052.83 × 0.1125 = **2,143.4434** → **$2,143.44** ✓ matches

### Where the export comes from — UNRESOLVED

**Ask Ali for this file. Do not attempt to rebuild it from CCPP.**

An investigation on 2026-08-12 established that it is *not* reproducible from the database:

- No SQL module in CCPP mentions `AliComm`, `MonthlyPaid`, or `MonthlyPaidMinus25per`
  (`sys.sql_modules` search returned zero rows), and no table has those columns.
- The closest source, `vw_ADF_PaySimple`, reproduces most rows exactly (Betty Scott $2,060,
  Carol Gasva $649, Christian Fala $500, Joi-Damaris Blue $49 all match to the cent) but
  lands **$1,916.67 short** for March and **$1,922.67 short** for February.
- The gap is two students — `FIKRU CHEKLIE` and `Sharita Wright` — each appearing at exactly
  **2×** their PaySimple total. Their `SMIC_PaymentAmount` values (1000 and 916.67) equal the
  surplus precisely, so the report adds a scheduled ISA/SMI contract payment on top of actual
  payments. Which students qualify in a given month could not be pinned down: the
  schedule-window population is 44 students with multi-year windows, most long dormant, and
  summing them overshoots badly.

So the report applies selection logic that lives outside CCPP. Rebuilding it from a guess
would put a wrong number into payroll. **Get the export from Ali** (or whoever runs it), then
validate before use:

- The new tab's `MonthlyPaid` is identical on every row of the month.
- `SUM(F) == E-column total × 0.1125`, to the cent.
- The K:N `ALI` row for the month equals `SUM(F)` rounded to 2dp.
- Prior months' figures in K:N still match what was emailed for those months — if an old
  month changed, the basis was restated and that needs flagging, not silently shipping.

## Step 4 — IPBC Group workbook

`IPBC Group <Mon> <Year>.xlsx` is the supporting detail for the single `IPBC - Enrollment`
line in the SMI tab. Same pattern: one tab per month, newest first, columns straight out of
`vw_ADF_PaySimple` plus the `SMIC_*` join columns; rows are the `IPBC - Enrollment` invoices.

Cross-check: **the tab's `Amount Paid` must sum to the `IPBC - Enrollment` row's `TotalPaid`
in the SMI tab.** Verified for March 2026: `0.01 + 49 + 0.01 + 0.01 = 49.03`, matching the
SMI tab's `IPBC - Enrollment  49.03` exactly. If the two disagree, one of the exports is stale.

These rows *are* queryable from CCPP if the workbook needs rebuilding:

```sql
SELECT [Customer #], Source, [Order Date], Status, Total, [Amount Paid], [Balance Due],
       ModifiedDate, SMIC_SalesRep, SMIC_CommID, SMIC_UserID
FROM   vw_ADF_PaySimple
WHERE  [Order Date] >= @monthStart AND [Order Date] < @monthEnd
```

filtered to the IPBC enrolment customers. Run it from the prod backend (see below).

## Step 5 — Send

Compose from `ali@colaberry.com`. Body, plain and short — this is exactly what Feb and Mar said:

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

Amounts carry thousands separators and 2 decimals (`$11,325` was written `$11,325`, Ali's
figure as `$1,907.19`). No em-dashes in body copy — the `—` in the signature title is part of
the fixed block and stays.

**Preflight — all four must pass before sending:**

1. Staff total equals `SUM(Staff Commissions!T)` in the attached workbook.
2. Ali total equals the SMI tab's month `TotalPaid × 0.1125`, rounded to 2dp.
3. All 4 attachments present, named exactly as in the contract table.
4. The attached `..._Original.xlsx` is md5-identical to Jackie's latest attachment.

Then send, Bcc `ali@colaberry.com`.

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

| Script | Purpose |
|---|---|
| `scripts/commission/build_staff_png.py` | Reads `Staff Commissions`, prints the total, renders the table PNG. Self-validates against February. |
| `scripts/commission/gmail_dl.js` | Downloads a Gmail attachment by message id using the prod backend's Gmail credentials. |
