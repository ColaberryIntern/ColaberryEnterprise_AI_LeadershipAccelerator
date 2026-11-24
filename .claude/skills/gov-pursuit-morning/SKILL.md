---
name: gov-pursuit-morning
description: Work the 7:30 CT "Gov pursuit morning" email down to zero - open each Bonfire opportunity so Ali can download the solicitation ZIPs, upload all of them to their qualification workspaces so the AI vetting runs overnight, and clear the "to read" pile by analysing every bid and asking Ali only the few questions that actually change the call. Invoke on "gov pursuit", "work the gov email", "clear the ZIPs", "the 7:30 email", or when the daily Gov Pursuit email from info@colaberry.com arrives. This is the gov arm of the inbox-zero morning routine.
---

# Gov pursuit morning

The 7:30 CT email lands with three piles. This works two of them to zero:

| Pile | What it means | Who clears it |
|---|---|---|
| **ZIPs to upload** | Passed the first check. Needs its solicitation ZIP fetched from Bonfire and uploaded, which starts the AI extraction. | Ali downloads, this skill uploads |
| **To read** | The AI could not call it, or someone already started it. | This skill analyses, Ali decides |
| Vetted / AI analysing | Already handled by the pipeline. | Not this skill |

**Done means both worked piles are at zero and `verifyRun.js` says so against the live
pipeline.** Not when the uploads returned 200.

> **The point of this skill is to stop the "to read" pile eating Ali's mornings.** The
> AI surfaces bids it could not decide; most of them are obvious passes to a human who
> knows what Colaberry does. Read all of them, then ask Ali only about the ones where
> his answer actually changes the verdict. On 2026-11-09 that was 11 bids reduced to
> **4 questions**, three of them genuine judgment calls and one batch confirmation.

---

## The rhythm

1. **Fetch and parse the email.** `fetchRunEmail.js` then `parseRunEmail.js` give you `run.json`.
2. **Open ONE Bonfire opportunity** so Ali can log in. Tell him how many tenants are involved.
3. **On his word, open the rest**, grouped by tenant.
4. **He downloads to `~/Downloads`.** Do not ask him to rename anything.
5. **Match** the ZIPs to bids (`matchZips.js`), and show him the matching before uploading.
6. **Upload** (`uploadZips.js`), dry run first, then one probe, then the batch.
7. **Analyse the "to read" pile and ask Ali the few real questions.**
8. **Record the decisions** (`recordDecisions.js`).
9. **Verify** (`verifyRun.js`). Only now is the run finished.
10. **Archive the email** from Ali's inbox (handled mail leaves).

---

## Step 1 - fetch and parse

```bash
cd "<repo>" && set -a && . ./.env && set +a
S=.claude/skills/gov-pursuit-morning/scripts
node $S/fetchRunEmail.js /tmp/gov/email.txt
node $S/parseRunEmail.js /tmp/gov/email.txt /tmp/gov/run.json
```

`fetchRunEmail.js` also writes `<out>.id` holding the Gmail message id, which step 10 needs.

**Why parse the email rather than read the API?** The pipeline API knows every bid but
**not which Bonfire tenant it came from**. The download links exist only in the email.
Most are wrapped in `track.colaberry.com`, whose `p=` param is base64url JSON carrying
the real destination; the parser decodes them.

Verified 2026-11-09: the parser reproduced all 25 bids (14 ZIP + 11 read) with exact
`gws` keys, tenants, opportunity numbers and deadlines, matched against a hand-built file.

## Step 2 and 3 - Bonfire, and the thing that surprises people

**The ZIPs span multiple Bonfire tenants and each one is a separate login.** On
2026-11-09, 14 ZIPs spanned **7 tenants**. Tell Ali the tenant count up front and group
the tabs by tenant so he signs in once per portal instead of bouncing between them.

Open one tab first, let him log in, then open the rest on his word.

```powershell
Start-Process "https://<tenant>.bonfirehub.com/opportunities/<opp>"
```

## Step 5 - match before you upload

`matchZips.js` matches on normalised title-token overlap, never on file order, and
every file must land on exactly one bid:

```bash
node $S/matchZips.js /tmp/gov/run.json "C:/Users/ali_m/Downloads"
```

It only considers archives written in the last 4 hours, so older unrelated ZIPs in
Downloads cannot be swept in. It reports confidence and margin per match, flags bids
with no file, and flags files that matched no bid. **Show Ali this table before
uploading.** On 2026-11-09 it correctly refused two unrelated Middlesex Glass archives
and caught that one bid had never been downloaded.

## Step 6 - upload (three calls, not one)

```bash
node $S/uploadZips.js /tmp/gov/matched.json scripts/.ali_admin_jwt.txt            # dry run
node $S/uploadZips.js /tmp/gov/matched.json scripts/.ali_admin_jwt.txt --only 6 --go   # probe one
node $S/uploadZips.js /tmp/gov/matched.json scripts/.ali_admin_jwt.txt --go       # the batch
```

Per bid:

1. `POST /api/admin/factory/qualification/{gws}` - **create the record first.**
2. `POST .../attest-zip` - multipart `document`, plus `biddingEntity`, `expectedVersion`, `mode=add`.
3. `POST .../extract-requirements` - multipart `document`. Returns `202 {jobId}`; this is the vetting.

### Three traps that each fail silently

- **Create before attest.** With no qualification record, `attest-zip` returns
  **404 "qualification not found"**, which reads like the opportunity is gone rather
  than like a step was skipped.
- **`biddingEntity` is part of the key.** The qualification is keyed on
  (opportunity, biddingEntity). The pipeline uses **`colaberry`**. Passing
  `Colaberry Inc.` creates a *parallel* record and makes later writes 404. On
  2026-11-09 this split the board into `colaberry: 60` and `Colaberry Inc.: 13`, and
  there is no rename endpoint, so the split is permanent. **Always read the entity off
  the existing record; only fall back to `colaberry` when creating fresh.**
- **`expectedVersion` is an optimistic-concurrency guard.** Re-read the record after
  creating and use the version the server reports.

Auth: `scripts/.ali_admin_jwt.txt`, an **admin** token, not the participant one in
`scripts/.ali_jwt.txt` (that one returns `403 Admin access required`). Ali gets it from
his logged-in admin browser console with `copy(localStorage.getItem('admin_token'))`.
It lasts about **4 hours**. Store it under a name matching `scripts/.*_jwt.txt`, which
is the existing gitignore rule; `.ali_jwt_admin.txt` does **not** match it and would be
committable.

## Step 7 - the analysis that saves the morning

Read every bid in the pile. For each, ask what work it actually is, not what the AI
labelled it. Then sort:

- **Obvious pass** - no software or workforce-development content at all. Construction,
  sewer, paving, blight remediation, AV installation, architectural and engineering
  services, financial advisory. Batch these into ONE confirmation question.
- **Genuinely in the lane** - ask individually, and make the question carry the fact
  that decides it.
- **Mis-scored by the AI** - the vetting scores every bid against Refactored.ai's
  *software* lane. Colaberry is also a TWC-licensed career school, so workforce and
  training bids get passed for the wrong reason. Surface these.

**Write questions that can move the answer, not questions that restate the summary.**
Good ones from 2026-11-09:

- *Maintenance, support and hosting of an already-deployed solution* is an incumbent
  re-compete. Saying so turned a "50% capability match, looks plausible" into a clear pass.
- *Is it a build or an integration?* decides whether a low capability match matters.
- *Does Colaberry's workforce-development side count as a capability?* is a standing
  policy question hiding inside a single bid.

Use `AskUserQuestion` with lettered options. Keep asking until every bid is classified
with high confidence; do not guess the last one to finish the batch.

## Step 8 - record the decisions

```bash
node $S/recordDecisions.js /tmp/gov/decisions.json scripts/.ali_admin_jwt.txt --go
```

`decisions.json` is one entry per bid with its **own** rationale:

```json
[{ "gws": "gws:...", "title": "...", "agency": "...", "decision": "no_bid",
   "rationale": "Why, in Ali's words. The rationale is what the next reviewer reads." }]
```

The script refuses a rationale under 20 characters. `no_bid` is the pass;
`needs_evidence` holds it; `pending_review` puts it back.

## Step 9 - verify against the server

```bash
node $S/verifyRun.js /tmp/gov/run.json scripts/.ali_admin_jwt.txt
```

Exits non-zero unless every ZIP shows `zipAttested` and every read carries a decision.

> **Pipeline rows are keyed on `key`, not `canonical_opportunity_id`.** Getting that
> wrong makes every lookup miss and reports a finished run as `0/14` and `0/11`, which
> looks like catastrophic failure instead of a bad field name. The script fails loudly
> if it sees no `gws:` keys at all, rather than reporting zeros. This happened on
> 2026-11-09 and was almost reported to Ali as a disaster.

## Step 10 - archive the email

Handled mail leaves Ali's inbox. Use the Gmail connector's `unlabel_thread` to remove
`INBOX`, or `.claude/skills/inbox-zero/scripts/gmailArchive.js`. The message id is in
`<emailfile>.id` from step 1.

---

## Environment notes

- **`node_modules` is not reliably readable.** The repo lives under OneDrive; when the
  cloud provider is down, every dehydrated package throws `ERR_INVALID_PACKAGE_CONFIG`
  while `ls` still shows the file. Every script here is dependency-free for that reason.
- **curl mangles MSYS paths** on multipart uploads here (`HTTP 000` with no request
  sent). The uploader uses Node's `fetch` with `FormData`/`Blob` instead.
- **The gov pursuit code may not be in the working tree.** It was not on
  `workstream/chapter-quality-and-worker`; read it from `origin/main`, with
  `MSYS_NO_PATHCONV=1` set or `git show rev:path/with/slashes` silently returns empty.

## Open follow-up

> **This section was wrong until 2026-11-11, in a way that would have sent you to edit the
> wrong file.** It said the vetting prompt "scores only the software lane" and that the fix
> was `govAiGoNoGo.ts`. Verified against the code and production data, neither is true.

**Where the two numbers in the email actually come from.** `Fit N` is `opportunity.fitScore`,
which arrives from the upstream feed (`oppPulseClient`) and is not computed here at all.
`N% capability match` is `vetting.coveragePct`, computed by **`govCapabilityFit.ts`**, not by
`govAiGoNoGo.ts` (which runs afterwards, only on requirements extracted from an uploaded ZIP,
and returns pursue/pass rather than a score).

**There is no hardcoded software lane.** `govCapabilityFit` assesses each required capability
against "our ACTIVE service catalog", passed in from `listServiceOfferings({status:'active'})`.
The lane is **data in `service_offerings`**, not wording in a prompt.

**Ali's 2026-11-09 decision is already implemented.** The catalog seeded 2026-10-01 carries four
workforce entries: *Workforce AI Upskilling & Architect Accelerator*, *Data Analytics & BI
Training with Job Placement*, *Data Talent Pipeline (Hire-Train-Deploy)* and *AI Agents &
Managed AI Workforce*. Nothing needs changing for workforce bids to score.

### The real defect: the catalog is silently filling with past bids' requirements

Of 23 active offerings on 2026-11-11, **10 are the real seeded services and 13 are generic
project-admin nouns added by hand since 2026-10-21** through the admin route (the only
creation path). Their descriptions give them away as requirements lifted out of individual
solicitations: *"Transferring existing data into the new work order management system"*,
*"tailored to asset management"*, *"for proposal development"*. They arrive a few per bid
(4 on Oct 21, 2 on Oct 27, 4 on Nov 5, 3 on Nov 10) and three are outright duplicates
(*Stakeholder Communication* x3, *Ongoing Support and Maintenance* x2, *Training and
Documentation* x2).

**This inflates the capability match on work Colaberry cannot do.** *Project Management*,
*Stakeholder Communication*, *Ongoing Support and Maintenance*, *Training and Documentation*
and *User Role Management* match virtually any solicitation, including construction. It is the
best explanation for the Ohio **Job Order Contracting** pool scoring **75% capability** on
2026-11-11 while being a construction procurement vehicle. Reaching for "the word Job fooled
it" is the tempting answer and it is not supported; the catalog is.

**The fix is catalog hygiene, not a prompt edit.** `retireServiceOffering` already exists, so
retiring is a reversible status change rather than a delete. It changes live bid scoring, so it
is Ali's call and has not been done.

## Related

- `docs/gov-pursuit-redesign/OPERATOR_GUIDE.md` and `FLOW.md` for what each pursuit stage means.
- `directives/government-pursuit-runbook.md`, section "The daily rhythm".
- The `inbox-zero` skill, of which this is the gov arm.
