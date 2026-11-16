# Spec for sign-off: grouped reference records + cross-project need identity

Status: DRAFT for Ali's approval. No code written against this yet. This is the "spine" half
of the Needs/Dossier work; the safe wins (editable answers, Section-plan removal, the
AI-redraft note) shipped separately.

## The two problems this solves (they share one root)

1. **"Needs you" is per-project and not deduped across projects.** `collectProjectNeeds` queries
   gaps `WHERE delivery_project_id = $1`, and resolving updates only that project's gaps. Answering
   writes a tenant-wide fact, but other projects pick it up only lazily on their next rebuild, and
   their need keys are project-local, so the "same" question is not one shared row. Ali wants the
   count to be a distinct cross-project list, and answering once to drop it everywhere it was asked.

2. **Grouping is not modeled.** A past-performance entry is Client + Scope + Period + Outcome as ONE
   record, repeated N times (see the Crash Records "Past Performance & References" draft: a dozen
   loose `[PLACEHOLDER]`s). The need loop is atomic-fact-only (kinds: fact, decision, confirm_rule,
   file, signature, setting, approval), so the drafter emits one placeholder per field and each
   becomes an independent field-need answered as a flat fact (`fact:client_1`, `fact:scope_1`), which
   never assembles into a coherent reference. The Dossier already HAS a grouped record
   (`gov_company_references`: client, scope, value, dates, contact) that the drafter cites as a unit;
   the need loop just does not use it.

**Shared root:** a need's identity is a project-local atomic placeholder. If a need's identity were
its **dossier target** (a tenant fact key, or "a reference record"), cross-project dedup (1) and
grouped records (2) both follow.

## Proposed design

### A. A grouped need kind: `record`

Add `record` to `HumanNeedKind`. A `record` need carries a `recordType` (`reference` | `personnel`)
and the field set it wants (for `reference`: client, scope, contractValue, dates, contact). The
drafter, when it lacks approved references for a past-performance section, raises ONE `record` need
("Add a past-performance reference") instead of N field placeholders. Answering a `record` need
routes to `addCompanyReference` / `addCompanyPersonnel` (the grouped Dossier tables), not
`addCompanyFact`. The resolve UI renders the grouped field form inline (the Dossier AddModal's
reference form, reused).

- Drafter change: `createProposalDraft` / `sectionDrafting` emit a single `[RECORD: reference]`
  marker for a repeating past-performance block, reconciled into one `record` gap, rather than
  per-field `[PLACEHOLDER]`s. When approved references exist, it writes them in and raises none.
- `routeNeedResolution`: new `record` branch -> store `library_reference` / `library_personnel`.
- `resolveProjectNeed`: on a `record` answer, call the grouped add, approved-vs-pending by actor.

### B. Need identity = dossier target (cross-project)

Give every need a stable **canonical key** derived from its dossier target, not the project:
- a `fact` need -> `fact:<cleanKey>` (already tenant-keyed via `cleanFactKey`)
- a `record` need -> `reference:<slot>` / `personnel:<slot>`

Then:
- **Cross-project list:** a new tenant-level aggregator unions open gaps across every delivery
  project on the tenant, deduped by canonical key, with a `usedIn` that spans projects. This backs a
  tenant "Needs you" view (and the per-project view stays, filtered).
- **Answer-once propagation:** resolving a canonical key closes the matching open gap in EVERY
  project (not just the current one) and auto-resumes each unblocked document. This is the eager
  version of what the dossier fact already does lazily.

## Open decisions for Ali (the reason this is a spec, not a PR)

1. **Propagation timing.** Eager (on answer, close + rebuild matching gaps in all projects now) vs
   lazy (leave other projects to pick it up on their next rebuild, just dedupe the *list*).
   Recommend: **dedupe the list now, rebuild eagerly only the current project, and mark the others
   "answered, rebuild pending"** so we never kick a storm of cross-project cycles on one answer.
2. **Where the cross-project list lives.** A new tenant-level "Needs across contracts" view, vs a
   banner on each project's Needs inbox ("12 of these are answered on another bid"). Recommend: the
   tenant view, linked from each project.
3. **Reference slots.** Does a solicitation ask for a fixed number of references (e.g. "three")?
   If so the drafter raises exactly that many `record` needs; if open-ended, it raises one "add a
   reference" need the user can repeat. Recommend: read the count from the blueprint when present,
   else one repeatable need.
4. **Migration.** Existing atomic `fact:client_1` style gaps on live contracts: leave them, or
   sweep them into `record` needs? Recommend: leave open ones; new drafts use `record`. No backfill.
5. **Personnel grouping.** Same treatment as references now, or references first and personnel in a
   follow-up? Recommend: references first (that is the screenshot), personnel next.

## Rough size

Backend: new `record` kind + routing + the grouped resolve + a tenant needs aggregator + the
drafter emitting grouped markers. Frontend: the grouped resolve form in the Needs inbox + a
tenant-level needs view. Migration: none if we take the "leave existing" recommendation. Est. 2-3
PRs, each independently shippable (kind + routing; drafter grouped markers; cross-project view).

Sign off on the five decisions (or edit them) and I will build it in that order.
