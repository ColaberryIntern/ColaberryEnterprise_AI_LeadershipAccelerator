# Session CC-20261116-jg7 — dossier batch: grouping fix + needs-across-contracts + Studio style pass

One batch, one PR, one deploy (Ali's explicit instruction: no back-and-forth). Three outstanding requests,
built ticket by ticket on top of the already-merged-and-LIVE spine (PR1-PR3 = d2ee6908) and the open PR4
(answer-once propagation, #4125) which this extends into the single batch PR.

## Ticket A — Proposal Studio style pass (format only), studio.css
The CSS-only restyle from Ali's `proposal-studio-style-prompt.md`: new calm-enterprise palette (navy accent,
purple agent, amber warn, green ok, red bad) in the four `.gps` token blocks + new tokens (line-strong,
shadow-sm/md, radius/-sm); a `/* v5 style pass */` override block for the left rail (white card, current-step
accent bar, done-step green connectors, "Needs you" alert row) and the right agent panel (the key fix: make
`.gps-ag` the only scroll container and PIN "Ask the agent" sticky to the bottom so it stops falling below the
fold; sticky header; capped activity log). No .tsx/.ts/test/markup touched; reduced-motion kept last.
Contrast (reported by the build): muted/white 5.74:1, warn/warn-soft 4.98:1, agent/agent-soft 6.41:1,
white/accent 9.70:1 — all >= 4.5:1.

## Ticket B — "They are still separate": past-performance grouping, end to end
Root cause was two-fold (diagnosed before touching code):
- **The live SECTION drafter never emitted records.** `runReviewCycle` uses the create-path
  (`draftProposalSectionAI` + `createFirstProposalDraft`), whose `SECTION_SYSTEM` only taught `[PLACEHOLDER]`
  and whose structured `gaps` are all `kind:'fact'`. PR2's `[RECORD:]` work lived only in the whole-doc
  drafter. So a past-performance need was always a flat fact carrying the raw question — exactly the stray
  "What specific projects have you completed..." general fact on Ali's live dossier.
  Fix: `SECTION_SYSTEM` now carries the grouped-record EXCEPTION ([RECORD: reference]/[RECORD: personnel] for
  a whole reference/person, never per-field, never listed in gaps). `assembleDraftHtml` now counts BOTH marker
  families (`parseDraftNeeds`) when deciding what is already represented, so a record the drafter wrote is never
  duplicated as an appended field placeholder. `reconcilePlaceholderGaps` already parses `[RECORD:]` -> record
  gap, so the path now completes.
- **The agent-panel "questions" rail was kind-blind and flattened records.** `listOpenQuestions` surfaced every
  open gap by question text; answering routed through `answerQuestionToLibrary` -> flat `category:'general'`
  fact, bypassing the `record`->`addCompanyReference` rail.
  Fix: `listOpenQuestions` now excludes `record`-kind gaps (`(need->>'kind') IS DISTINCT FROM 'record'`), so a
  reference/person is answered only through the Needs grouped form (PR3), which routes to the grouped Dossier
  tables. Facts still flow through the flat rail unchanged.

Note (no backfill, per spec decision #4): the ONE stray flat fact already on Ali's live tenant is left as-is;
new drafts group correctly. Ali can Edit it in the dossier; a fact Delete control is a clean follow-up.

## Ticket C — "Questions not synced in the dossier": Needs across contracts (decision #2)
- `tenantNeeds.ts` (new): `mergeTenantNeeds` (pure) unions every bid's open needs, deduped by canonical key,
  each tagged with the bids that ask it, fatal-first then most-shared; `collectTenantNeeds` collects per bid
  (fail-soft) and merges. Builds on the per-project `collectProjectNeeds`.
- `govCompanyDossierRoutes.ts`: new `GET /api/admin/factory/dossier/needs` — tenant-wide via
  `lookupGovContractsContainer`, scoped to the gov engagement's `delivery_projects`, 503 when unconfigured,
  500 (never a throw) on collect failure.
- `GovDossierPanel.tsx` + `adminGovDossierApi.ts`: a read-only "Questions across your contracts" section at the
  top of the dossier listing each open need, its severity/record tag, the bids it spans, and a bid count.
  Answering stays in each bid's Proposal Studio; answer-once propagation (PR4) then clears it everywhere.

## Verification (real CI gates)
- Backend `tsc` clean (only known maxmind). jest.ci: proposal suites 10/83, `govCompanyDossierRoutes` 18
  (incl. 3 new `/needs` tests), frozen `frontendTypographyLint` + `frontendCopyLint` 42 — all pass.
- Frontend `tsc` clean. react-scripts: `GovDossierPanel` 7 (incl. a record-need-across-bids test),
  `AdminGovServicesPage` pass, `proposalStudio` 7 suites / 93 (studio.css style pass, zero test changes).

## State
- Branch workstream/gov-cross-project-needs (PR #4125), off d2ee6908. This batch extends that PR so Ali merges
  ONE PR and I deploy ONCE (backend + nginx, registry mode). Production is at d2ee6908 (spine PR1-PR3 live);
  PR4 propagation + this batch deploy together on merge.
