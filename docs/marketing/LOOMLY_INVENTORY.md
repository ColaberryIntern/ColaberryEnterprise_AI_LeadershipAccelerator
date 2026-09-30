# Loomly retirement - Stage A inventory

Spec section 18 says: no flag-day replacement. Stage A is an inventory of what lives in Loomly
today and where each thing lands in this platform. Stage B (the importer) is built and tested
(`backend/src/scripts/importLoomlyExport.ts`); Stages C and D are gated on account connection
(ESC-001 / T003) and app review (T027), neither of which is done.

**State of this inventory on 2026-09-11: nothing has been exported yet.** There is no Loomly
reference anywhere in this repository - no export file, no API key, no prior mapping - and the
build has no Loomly login. Every row below is therefore a checklist with an owner, not a count.
It becomes an inventory the day someone with Loomly access fills the "Found" column in. Do not
read an empty "Found" as "none"; read it as "not yet looked".

## Who does what

| Role | Person | Why |
|---|---|---|
| Loomly admin (exports, user list) | Sohail | Runs the calendars day to day |
| Brand / account ownership decisions | Ali | Which calendars map to which brand, which accounts are kept |
| Import execution and exception triage | Aleem, with the runbook below | The importer is a script; the exceptions are a spreadsheet's worth of judgement calls |

## Stage A checklist

| # | Category (spec 18) | What to export from Loomly | Lands in | Found | Status |
|---|---|---|---|---|---|
| 1 | Brands / calendars | Name of every calendar, its timezone, who owns it | `brands` (one per calendar, or a `--calendar "Name=slug"` mapping when two calendars are one brand) | | not started |
| 2 | Connected accounts | Per calendar: network, page/profile name, whether the connection is currently healthy | `marketing_channel_accounts` - **does not exist** until ESC-001 clears; record the list in this doc for now | | not started |
| 3 | Users / roles / approval flows | Every user, their Loomly role, and which calendars require approval and from whom | `admin_users` + `mgmt_role` bridge for people; approval expectations become `content_approval_requests` policy (who is `required_approver_id`) | | not started |
| 4 | Labels / tags | The label vocabulary and how many posts carry each | `content_items.metadata.labels` on import; a labels-to-campaign mapping is a follow-up decision | | not started |
| 5 | Content / posts and media | The calendar export CSV (all statuses, all time) plus the media library download | `content_items` + `content_variants` (+ `external_publications` for published) via the importer; media URLs kept in metadata - **media bytes are not imported** (no object storage in this repo) | | not started |
| 6 | Recurring content / templates | Post templates and any recurring slots | `content_templates` (table exists, no importer; manual re-creation, list them here) | | not started |
| 7 | Scheduled queue | Everything scheduled in the future at export time | `content_items` in `draft` with `metadata.needsVerification = true` and the original time in `metadata.loomlyScheduledFor`; **not** queued | | not started |
| 8 | Post history / permalinks / status | Published posts with their permalink and network id where Loomly has them | `external_publications` (`metadata.mode = 'imported'`); rows without id or permalink are imported with `keyStrength = weak` and cannot be reconciled to the live post | | not started |
| 9 | Analytics exports | Whatever per-post metrics Loomly will export | **Not imported.** The spec says not to assume the export has full analytics; nothing on this platform will display a number it did not measure. Keep the export file for reference | | not started |
| 10 | Comments / notes | Internal notes on posts, where exportable | `content_items.metadata` (free text) on import if a Notes column exists; otherwise recorded as not exportable | | not started |

## Known unknowns (write the answer next to each when found)

- **Export format.** The importer maps columns by header alias, not position, and the first
  dry run prints every header it did not recognise. Expect to add aliases to
  `HEADER_ALIASES` in `backend/src/services/marketing/loomlyImport.ts` after that run.
- **Provider ids.** The spec warns Loomly exports may not carry network post ids. If they do
  not, history dedups on permalink; if neither, on content hash (flagged `weak_key`).
- **Timezones.** Which zone Loomly stamps its dates in. The importer parses whatever
  `Date.parse` accepts and stores UTC; a bare wall-clock string with no zone will be read as
  the machine's local zone, so run the dry run and check one known post's time before
  `--execute`.
- **Calendar-to-brand.** If a Loomly calendar name is neither a brand slug nor a brand name
  here, every row from it is skipped as `unknown_calendar` until mapped with `--calendar`.

## Runbook (Stage B, once an export exists)

1. Put the CSV somewhere outside the repo (it is customer data; never commit it).
2. Dry run: `cd backend && npx ts-node src/scripts/importLoomlyExport.ts <file.csv>`.
3. Read the exception report it names. Fix header aliases and calendar mappings; re-run
   until the only exceptions are ones you accept (`weak_key`, `unknown_column` for columns
   you do not need).
4. Spot-check three rows in the dry-run summary against Loomly by eye: timestamp, channel,
   text.
5. Apply: same command with `--execute`. Re-running it afterwards imports nothing
   (`duplicate_existing` for every row) - that is the check that it is safe.
6. Imported history is read-only in the composer (`ReadOnlyImport` 409 on any edit or
   transition). Imported schedules appear as drafts flagged "needs verification"; each one is
   re-scheduled by a person through the composer, never automatically.

## Exit criteria for Stage A

Every "Found" cell filled, the calendar-to-brand mapping decided by Ali, and one dry run
whose exception report contains no `missing_column` and no unexplained `unknown_channel`.
