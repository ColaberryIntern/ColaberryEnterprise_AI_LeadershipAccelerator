# Session CC-20261102-k9r4 (continued) — ADS-7 `utm_source` split fixed at the readers

**Date:** 2026-11-10
**Branch:** `workstream/ads7-canonicalize-utm-source` (cut from `origin/main`)
**Ticket:** ADS-7 https://app.basecamp.com/3945211/buckets/7463955/todos/10493942196
**Scope:** The one item the ADS handoff doc flagged as having a measured blast radius — both
`utm_source` shapes are written to `leads` and only canonicalized on read inside
`adSpend/utmSource.ts`, so every other consumer splits one campaign into two. Read-side fix only;
the writers and the stored column are deliberately untouched.

---

- [x] ADS-7: canonicalize `leads.utm_source` where it is grouped and tagged
  - Date: 2026-11-10
  - Session: CC-20261102-k9r4
  - What changed: Three source files and two test files, one commit (`7a90bb2e`), +112/-7.
    `backend/src/services/marketing/acquisitionFunnel.ts` now selects and groups on
    `lower(btrim(split_part(l.utm_source, '|', 1)))`, the SQL twin of `canonicalUtmSource`, with
    NULL surviving as NULL so an untagged lead stays untagged.
    `backend/src/services/leads/ghlProvenanceTags.ts` canonicalizes before `clean()`, so one
    source yields one CRM tag. `frontend/src/pages/admin/marketing/performance/performanceMetrics.ts`
    gained a local `canonicalSource` twin (the stacks share no module): `sourceLabel` canonicalizes
    before the label lookup, and `signupsBySource` buckets on the canonical source and carries it
    on the slice. Tests extended the two suites that already existed rather than adding new files.
  - Verification: **all seven CI gates green, zero failures**, on `7a90bb2e` — backend and frontend
    typecheck, backend and frontend unit tests, test-file typecheck, frontend build, Integration
    tier (Postgres), plus `Secret scan + route-auth lint`, `Static security scan` and
    `Scan new commits`. Merged as PR #3812
    https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3812 at
    2026-11-10 11:59:26Z (`3ea69dad`), and both fixes confirmed present on `main` afterward by
    re-reading the two files through the Contents API. **Not deployed** — the report keeps drawing
    Facebook twice until the images are rebuilt.
  - Notes: `tsc` and `jest` were **not** run locally and could not be. This machine's checkout sits
    on `workstream/chapter-quality-and-worker`, which predates `backend/src/services/marketing/`
    entirely, so the changed files are not on disk — a local typecheck would have been meaningless
    rather than merely inconvenient, and an early grep of the working tree for consumers was
    therefore against the wrong tree and had to be discarded. What was checkable without the suite
    was checked first: the `campaign()` test-helper arity, the type compatibility of
    `canonicalUtmSource(raw: string | null | undefined)` with `TaggableLead.utm_source`, and the
    pure label and folding logic against all ten asserted cases outside the suite. Committed
    through the GitHub **Git Data API** (blob → tree → commit → ref) as one commit over five files,
    because this machine cannot read its own git objects (`fatal: mmap failed: Invalid argument`,
    OneDrive placeholders); five Contents API PUTs would have produced five commits for one logical
    change. No local commit ran, so the gitleaks pre-commit hook did not — each file was scanned
    for token-shaped strings before upload and CI's two secret scans passed.

---

## The audit, and the six sites deliberately left alone

A read-only subagent audited `origin/main` for every path that reads `leads.utm_source`. Six sites
were affected; **five of them were downstream of a single `GROUP BY`** in `acquisitionFunnel.ts`,
which is the only query behind `/api/admin/marketing/funnel/acquisition`. That is why the fix is
three files rather than six: the donut (`performanceMetrics.ts:162`), the campaign table
(`CampaignTable.tsx:72`) and the per-campaign CRM-sync and opt-in rates all inherit the split from
that one query and need no change of their own.

Two findings worth keeping:

- **The totals stayed right while the parts were wrong.** The donut's center total was correct
  because it sums the same rows; only the slices were split. That is precisely why nobody reported
  it in the months it was live — it reads as data, not as a bug.
- **The `LIMIT 20` consequence was not in the audit and was found in the code.** `byCampaign` ends
  `ORDER BY signups DESC LIMIT 20`, so duplicate halves consumed slots and a genuinely distinct
  campaign could be pushed off the bottom of the list entirely. A split that merely double-counts
  is visible; one that silently drops a row is not.

**Checked and deliberately NOT changed** — these read the column for a single person, with no
grouping, filtering or counting, so the split costs nothing but a cosmetic label:
`adminOs/panels/acquisitionPanels.ts:113` (person Acquisition tab),
`personHistoryService.ts:168` (person-history drawer),
`AdminLeadDetailPage.tsx:438` (lead detail Tracking Data card),
`acceleratorService.ts:758/792` (roster tooltip only — the visible label comes from `page_url`),
`mayaReadTools.ts:292` (one subject per call), and
`leadService.ts:152` (`calculateLeadScore`, a substring test, so `pricing|paid` already scored).

## Open after this, each its own decision

- **Canonicalizing at the writers plus backfilling the column.** The permanent answer. ADS-7 fixed
  the readers, so the column still holds both shapes and every future reader starts with the same
  trap. Changes write paths and needs a data migration. Not filed.
- **GHL contacts already carrying `utm-fb-paid`.** The code emits one tag per source now; nothing
  merged the contacts tagged before the fix. Happens in GoHighLevel, not here. Not filed.
- **The admin lead CSV export** (`leadService.ts:603`), left raw on purpose — the honest fix is an
  added canonical column rather than overwriting a deliberate dump. Not filed.

## Decision recorded this session

**The Meta System User token will not be rotated** (Ali, 2026-11-10). Earlier revisions of the
handoff doc listed rotation as a pending action once the ad spend sync was proven; it is not
pending, and it should not be re-raised. The token carries `expires_at: never`, so nothing retires
it on its own — keep redacting it in log output and keep it out of tickets, channels and commits.
