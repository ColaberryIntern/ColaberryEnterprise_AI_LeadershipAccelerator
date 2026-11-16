# Session CC-20261116-jg3 — Spine PR1: the grouped `record` need kind + routing

Ali signed off the spine spec ("all recommended" — all 5 open decisions taken at their recommended
value). This is PR1 of the 2-3 the spec lays out: the backend `record` kind + routing + grouped
resolve. It is the atom the rest of the spine (drafter grouped markers; cross-project view) builds on.

Spec: docs/gov-proposal-studio/GROUPED_NEEDS_AND_CROSS_PROJECT_SPEC.md (section A).

## The 5 decisions, as approved
1. Propagation timing: dedupe the list now, rebuild eagerly only the current project, mark the others
   "answered, rebuild pending". (Lands in the cross-project PR, not PR1.)
2. Cross-project list: a tenant "Needs across contracts" view, linked from each project. (Cross-project PR.)
3. Reference slots: read the count from the blueprint when present, else one repeatable "add a reference"
   need. (Drafter PR.)
4. Migration: leave existing atomic gaps; new drafts use `record`. No backfill.
5. Personnel grouping: references first, personnel in a follow-up — but the kind handles BOTH now, so no
   second type is needed later; the drafter simply starts emitting reference records first.

## What shipped this PR (backend only — nothing emits a `record` need yet, so no behavior changes)
- proposalReviewTypes.ts: `record` added to `HumanNeedKind`; new `RecordType = 'reference' | 'personnel'`;
  `HumanNeed` gains optional `recordType` + `recordFields` (optional so every existing need literal and
  fixture stays valid).
- resolveNeed.ts (the pure router): `NeedSubmission.record?: Record<string,string>`; new `library_record`
  store; a `record` branch — validates recordType + the primary field (client for reference, name for
  personnel), trims and drops empty fields, approver -> approved / intern -> pending, exactly like a fact.
  The exhaustiveness `never` guard now forces every future kind to add a branch.
- resolveProjectNeed.ts: `answerSummary` summarizes a grouped record to its primary field (client/name);
  a new best-effort `library_record` close-the-loop branch resolves the tenant (GovQualification version
  DESC, same as the fact path) and writes the whole record via `addCompanyReference` / `addCompanyPersonnel`
  (approved iff the approver answered). The record is stored as ONE unit, so it never fragments into
  Client/Scope/Period facts and is reusable on the next bid.
- resolveNeed.test.ts: 4 new record tests (reference approved, intern pending, personnel requires name,
  missing recordType/fields rejected) + `record` added to the exhaustiveness kinds list.

## Why PR1 is safe to ship alone
Nothing emits a `record` need yet (the drafter still emits atomic `[PLACEHOLDER]`s — that is PR2), and no
UI answers one yet (the grouped resolve form is PR3). Adding a kind the system does not yet produce changes
no existing path. The fact/decision/file/signature/setting/approval/confirm_rule routes are byte-for-byte
unchanged; their tests pass unchanged.

## Verification (real CI gates)
- Backend tsc clean (only the known local-only maxmind TS2307 in enrichVisitorGeo.ts).
- jest.ci: resolveNeed + resolveProjectNeed + resolveProjectNeedLibrary + collectProjectNeeds = 27/27.
- Frontend untouched (no tsc/react-scripts/lint impact; typography + copy baselines unchanged).

## State
- Branch workstream/gov-grouped-record-needs off origin/main (62c4bde, which is both merged safe-win PRs
  #4112 + #4113). PR to open. Merge is Ali's click; backend-only, so a merged deploy is backend only.
- Next: PR2 (drafter emits grouped `[RECORD: reference]` markers, reconciled into one `record` gap; reads
  the blueprint slot count), then PR3 (cross-project needs aggregator + the grouped resolve form + the
  tenant "Needs across contracts" view).
