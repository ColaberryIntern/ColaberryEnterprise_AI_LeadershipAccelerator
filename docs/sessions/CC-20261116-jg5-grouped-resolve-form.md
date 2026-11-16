# Session CC-20261116-jg5 — Spine PR3: the grouped resolve FORM (record needs are answerable)

PR3 of the needs spine. PR1 (#4117) added the `record` kind; PR2 (#4121) made the drafter PRODUCE
record needs. Until now a `record` need had nothing to answer it in the UI. This PR makes a grouped
need answerable with its own fields, so Client/Scope/Period/Outcome (or Name/Role/Experience) are
entered and saved as ONE record. First user-visible spine piece.

Spec: docs/gov-proposal-studio/GROUPED_NEEDS_AND_CROSS_PROJECT_SPEC.md (section A, resolve half).

## Scope decision
The spec's "PR3 = cross-project view" bundled three things. I split it: THIS PR is the grouped resolve
form (the piece that makes the whole grouped-record feature usable end to end — PR1 route + PR2 drafter +
PR3 form). The cross-project aggregator + tenant "Needs across contracts" view (decisions #1 + #2) is the
next and final PR. Each is independently shippable, which is what the spec asked for.

## What shipped
Backend (forward the grouped field object; routeNeedResolution from PR1 still validates per-field):
- govProjectPortalRoutes.ts + admin/govContractsRoutes.ts: the resolve handlers built the submission by
  hand and dropped unknown fields, so a `record` object never reached resolveProjectNeed. Both now forward
  `record` when the body carries a plain object.

Frontend:
- govProjectPortalApi.ts: `GovNeedKind` += 'record'; new `GovRecordType`; `GovProjectNeed` += recordType +
  recordFields; `GovNeedSubmission` += record.
- needsHelpers.ts: `NeedControl` += 'record'; needControl returns 'record'; needKindLabel += record; new
  recordTypeLabel / recordFieldsFor / recordPrimaryField / recordFieldLabel / recordSubmission (pure, tested).
- NeedsInbox.tsx: a `RecordForm` rendered for the 'record' control inside the existing `need-control` slot —
  one labeled field per recordField (textarea for scope/summary), the primary field (client/name) required,
  a "Save record" button that posts `{ record: {...} }`. The type chip shows "Reference" / "Key person".
  Resolve plumbing refactored to one `submitResolve`; scalar `resolve` and grouped `resolveRecord` both call it.

## What this does NOT do (deliberate, noted for follow-up)
- "Edit my changes" (#2) for records: fact editing shipped in #4113 (Dossier). Editing an already-saved
  reference / key person is a Dossier-panel concern (GovDossierPanel has no reference/personnel edit yet) —
  a clean follow-up, out of this PR's scope.
- Cross-project dedup + the tenant needs view (#1, #2): the final spine PR.

## The answer is still AI-redrafted, not pasted
Answering a record kicks the same auto-resume review cycle as any need (resumeUnblocked on the route). The
agent rewrites the section to work the record in; it is never substituted verbatim. The inbox already says so.

## Verification (real CI gates)
- Backend tsc clean (only the known local-only maxmind). jest.ci: govProjectPortalRoutes + govContractsRoutes
  + frontendTypographyLint + frontendCopyLint = 8 suites / 139 tests pass (lints green: no new em/en dash, no
  "free"; the one pre-existing em dash in NeedsInbox kept as-is so the shrink-only baseline is untouched).
- Frontend tsc 0. needsHelpers 10/10 (new record-helper tests). studioParity 56/56 (the record form renders
  inside need-control; every required testid intact; no button named Approve).

## State
- Branch workstream/gov-grouped-resolve-form off origin/main (2fab7898, = main after PR2 #4121).
- Production is still at 62c4bde (the safe wins). PR1 + PR2 are merged but undeployed (inert without this UI).
  When THIS merges, one deploy (backend + nginx, registry mode) brings the whole spine — PR1 + PR2 + PR3 — live.
- Next / final spine PR: the cross-project needs aggregator (answer-once across the tenant's projects,
  decision #1 timing) + the tenant "Needs across contracts" view (decision #2).
