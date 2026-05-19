# Directive: Government Bid Intake (Opportunity Pulse → Basecamp)

**Owner:** Ali Muwwakkil
**Last updated:** 2026-05-19
**Status:** Active

## Purpose

Standard intake procedure for any government contract opportunity Ali decides to bid on. Takes a downloaded RFP package + an Opportunity Pulse opportunity ID and produces a complete bid workspace in Basecamp (project "Gov Contracts", id 47346103): folder of files, To-Do List with rich game plan, all required tasks, and a kickoff message-board post — all linked together so the team can see status at a glance and find every artifact from one place.

## Inputs

- The opportunity exists in Opportunity Pulse at `http://95.216.199.47/admin/bonfire/<UUID>/submission-readiness` (i.e., it's already been scored and enriched).
- The RFP zip from the agency's Bonfire portal has been downloaded by Ali into `c:/Users/ali_m/Downloads/`.

## Steps

1. **Capture the opportunity UUID and zip filename.** Both come from Opportunity Pulse + the Downloads folder. Verify the zip extracts cleanly and contains the expected RFP attachments (varies per agency, typically 5-10 PDFs/DOCXs/XLSXs).

2. **Pull a fresh Basecamp token from CCPP via the prod VPS.**
   ```bash
   ssh root@95.216.199.47 'docker exec accelerator-backend node -e "
     const sql = require(\"mssql\");
     (async () => {
       await sql.connect({
         server: process.env.MSSQL_HOST, port: parseInt(process.env.MSSQL_PORT||\"1433\",10),
         user: process.env.MSSQL_USER, password: process.env.MSSQL_PASS,
         database: process.env.MSSQL_DATABASE || \"CCPP\",
         options: { encrypt: true, trustServerCertificate: true },
       });
       const r = await sql.query(\"SELECT TOP 1 AccessToken FROM Basecamp_AuthInfo WHERE IsActive = 1 ORDER BY BasecampAuthInfoID DESC\");
       await sql.close();
       let t = r.recordset[0].AccessToken;
       if (t.startsWith(\"Bearer \")) t = t.slice(7);
       console.log(\"TOKEN:\" + t);
     })().catch(e => console.error(\"ERR:\" + e.message));
   "'
   ```
   Token rotates every 2 weeks; always pull fresh.

3. **Edit `backend/src/scripts/processGovBid.js` `BID_CONFIG`** at the top of the file with:
   - `opportunity_uuid` — Opportunity Pulse UUID
   - `zip_path` — absolute path to the downloaded RFP zip
   - `display_title` — short scannable title that becomes the folder name AND list name (e.g., `"Detroit - AI for Muni-Code Search (RFP 544695)"`)
   - `phases` — adjust the 4-phase timeline if the close date isn't 24 days out
   - `fit_thesis` — one paragraph: why we're bidding (strategic fit)

4. **Dry-run first:**
   ```bash
   BASECAMP_ACCESS_TOKEN=<token> node backend/src/scripts/processGovBid.js --dry-run
   ```
   Verify: file count matches zip, task names look right, no scary errors.

5. **Live run:**
   ```bash
   BASECAMP_ACCESS_TOKEN=<token> node backend/src/scripts/processGovBid.js
   ```
   Captures the live URLs (folder, list, message). A summary JSON is written to `tmp/gov-bids/<safe-title>/basecamp-summary.json` for audit and downstream tools.

6. **Verify in Basecamp** (open project 47346103):
   - The folder exists under Docs & Files with all uploaded files
   - The list exists under To-Dos with the rich description rendering correctly (links work)
   - The 14 tasks are visible under the list
   - The kickoff message is on the Message Board

## What the script does

| Step | Output |
|---|---|
| Extract zip | `tmp/gov-bids/<safe-title>/files/*` |
| Fetch opportunity from OP API | Title, agency, value, deadline, fit score, etc. |
| Create vault sub-folder | One folder per bid under project root vault |
| Upload all RFP files ONCE | Stored once; referenced by URL everywhere else |
| Create To-Do List | Rich description (key facts, fit thesis, 4-phase plan, file links) |
| Create 14 tasks | One per RFP attachment + cross-cutting prep (POC, capability statement, executive summary, review, submit) |
| Post kickoff message | Subject `Bid kickoff: <display_title>`. Links to List and Folder. |
| Write summary JSON | Local audit + handoff for next-step automations |

## Idempotency

Script is idempotent: re-running with the same `BID_CONFIG` will:
- Reuse the vault folder if a folder with the same title exists.
- Skip files that already exist by filename in that folder.
- Update the list description if the list exists (PUT request).
- Skip tasks that already exist by content string.
- Skip the kickoff message if a message with the same subject already exists.

So you can safely re-run if a step fails partway, or to refresh the list description after editing the BID_CONFIG.

## Status updates (ongoing)

As the team progresses through tasks, post follow-up messages to the same Message Board with:
- Subject prefix `Status: <display_title>` (e.g., `Status: Detroit - AI for Muni-Code Search (RFP 544695)`)
- Body summarizing what phase completed, what's next, any blockers
- Link back to the To-Do List

The Message Board becomes the activity log; the List is the detail view. Anyone glancing at the Message Board sees current status without opening the List.

## After submission

- Post a final message: `Submitted: <display_title>` with the Bonfire submission confirmation
- Mark the "Submit via..." task complete with the submission timestamp + confirmation number in the comment
- Update Opportunity Pulse `pursuitStatus` to `submitted` via:
  ```
  PUT http://95.216.199.47/api/v1/bonfire/opportunities/<UUID>/pursuit  { "status": "submitted" }
  ```
  (verify exact endpoint; pattern may differ — check OP routes first)

## When NOT to use this

- Sole-source contracts (no zip, no Bonfire opportunity — they go directly to drafted proposal).
- Non-government bids — this is scoped to gov/muni RFPs that come through Bonfire and are enriched in Opportunity Pulse.
- Opportunities scored fit < 60 in Opportunity Pulse — those usually aren't worth the bid workspace overhead. Discuss with Ali first.

## Open issues / future improvements

- Auto-fetch the zip from Bonfire instead of requiring manual download. Would need Bonfire credentials per agency (every city/agency on Bonfire is a separate tenant).
- After submission, auto-update the Opportunity Pulse `pursuitStatus`. Endpoint exists but not yet wired.
- Generate an outline of the requirements matrix (one row per "shall" / "must" in the RFP) as a starting task asset. Could call OpenAI with the RFP PDF text.
