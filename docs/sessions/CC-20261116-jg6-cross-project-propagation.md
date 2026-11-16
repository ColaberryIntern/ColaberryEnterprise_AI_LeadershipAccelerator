# Session CC-20261116-jg6 — Spine PR4: answer-once across the tenant's contracts

PR4 of the needs spine, the backend half of the cross-project work (spec §B, decision #1). PR1 (#4117)
added the `record` kind; PR2 (#4121) made the drafter produce record needs; PR3 (#4124) made them
answerable. All three are merged and LIVE in production (d2ee6908). This PR makes answering a need
once drop it from every bid that asked it.

Spec: docs/gov-proposal-studio/GROUPED_NEEDS_AND_CROSS_PROJECT_SPEC.md (§B + decision #1).

## The problem (spec problem #1)
`collectProjectNeeds` is per-project. A need's identity is its dossier target (a tenant-canonical fact
key, or a reference/personnel slot), so the SAME question can be open on several of a tenant's bids at
once. Answering it wrote a tenant-wide library fact, but the other bids' gaps stayed `open` and kept
asking until their own next rebuild. Ali wants: answer once, and it drops everywhere it was asked.

## Scope decision
The spec's remaining work is two coherent layers: (a) the data layer — answer-once propagation + a
cross-project aggregator; (b) the tenant "Needs across contracts" VIEW (decision #2). This PR is (a)'s
propagation, the piece that is independently valuable and observable in the EXISTING per-project inbox:
answering a canonical need in bid A immediately removes it from bid B's "Needs you" list. The tenant
aggregator + its endpoint + the view ship together as the next PR, where the membership/access model of
a cross-contract view is decided with the UI. One PR, one behavior. Not stacked (off fresh main d2ee6908).

## What shipped
- tenantProjects.ts (new): `siblingDeliveryProjectIds(projectId, GovQualification)` resolves the tenant
  from the project's latest qualification, then lists the tenant's OTHER delivery projects. Pure core
  `siblingIdsFromRows` (dedupe + exclude self) is unit-tested; the async wrapper is fail-soft (any read
  error -> []). Takes a minimal `QualificationReader` so it is trivially mockable.
- resolveProjectNeed.ts: after the current project's answer is recorded, a best-effort block closes the
  same `need_key`'s OPEN gaps on every sibling project, marked `answered` with resolution_payload flags
  `{ propagated: true, rebuild_pending: true, source_project }`. Siblings are NOT resumed — only the
  current project eager-rebuilds (the route's resumeUnblocked). This is exactly the eager-list /
  lazy-rebuild split Ali signed off on (decision #1: "dedupe the list now, rebuild eagerly only the
  current project, mark the others answered / rebuild pending").

## The array-bind trap (avoided deliberately)
The sibling UPDATE uses an explicit `IN (...)` with GENERATED positional binds (`$4, $5, ...`), never
`= ANY($1)` with a Sequelize array bind — that form has malformed the Postgres array and crash-looped
prod before. A test asserts the SQL contains `IN (` and does NOT match `ANY(`.

## What this does NOT do (next PR)
- The tenant "Needs across contracts" aggregator + endpoint + view (decision #2). The aggregator will
  union open needs across the tenant's projects deduped by canonical key; the endpoint's access model
  (a participant sees siblings they are a member of; admin sees the whole tenant) is decided with the UI.

## Verification (real CI gates)
- Backend tsc clean (only the known local-only maxmind TS2307).
- jest.ci: tenantProjects + resolveProjectNeedPropagation + resolveProjectNeedLibrary + aggregateNeeds +
  collectProjectNeeds + resolveNeed + placeholderNeeds = 7 suites / 55 tests pass. The two new suites:
  sibling resolution (dedupe, exclude self, fail-soft, empty-id short-circuit) and propagation (closes
  siblings with IN not ANY, excludes the current project, flags the payload, no-op with no siblings,
  best-effort 200 when the propagation UPDATE throws). No frontend files touched (frontend gates + the
  frozen typography/copy lints are backend-irrelevant here).

## State
- Branch workstream/gov-cross-project-needs off origin/main (d2ee6908, = main after PR3 #4124).
- Production is at d2ee6908 with PR1+PR2+PR3 live. This PR is backend-only and inert-safe: it changes
  resolve to ALSO close sibling gaps; with no siblings (single-bid tenants) it is a no-op.
- Next / final spine PR: the tenant "Needs across contracts" aggregator + endpoint + view (decision #2).
