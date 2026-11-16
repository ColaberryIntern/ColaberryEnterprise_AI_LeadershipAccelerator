# Session CC-20261116-jg2 — Needs/Dossier safe wins + spine spec

Ali reviewed the "Needs you" <-> Dossier loop and raised five points. Investigation found two were
already true, three were real gaps. He chose: ship the safe wins now, spec the architectural piece.

## What the investigation found (current code)
- Cross-project dedup (#1): NOT today. collectProjectNeeds is per-project; resolveProjectNeed closes
  only this project's gaps. Tenant fact helps others only lazily on their next rebuild. Real gap.
- Editable answers (#2): NOT today. No fact-update path existed (add + approve only). Real gap.
- Remove Section plan (#3): clear instruction.
- AI the wording, not word-for-word (#4): ALREADY true. Answer -> fact -> auto review cycle
  (resumeUnblocked) -> the drafter REDRAFTS the section. No literal placeholder substitution exists.
- Grouping (#5): NOT today. Need loop is atomic-fact-only; a past-performance record (Client/Scope/
  Period/Outcome) fragments into ungrouped field-needs. The Dossier HAS grouped references, unused by
  the loop. Root cause shared with #1: needs are keyed on project-local atomic placeholders.

## What shipped this PR (safe wins)
- Fact editing (#2): backend updateCompanyFact + POST .../dossier/library/fact/:id/update
  (value required, key/category optional, approval state unchanged); frontend updateDossierFact +
  an Edit button and EditFactModal on each fact row in GovDossierPanel. Editing an answered need's
  fact and rebuilding picks up the new wording.
- Remove Section plan (#3): removed the editor's authoring panel (ed-plan) from DraftVersions.tsx
  and all its locals; dropped ed-plan from the studio-parity contract. The backend saveSectionPlan
  route/service/API are left in place (now unused) for the spine cleanup, to keep this PR's blast
  radius small. Typography baseline lowered 6 -> 5 for DraftVersions (the panel's one JSX dash went
  with it); DASH total 2096 -> 2095.
- AI-redraft note (#4): a line in the Needs inbox stating the answer is rewritten into context, not
  pasted word-for-word, and reused on the next bid.

## Spec for sign-off (the spine; NO code yet)
docs/gov-proposal-studio/GROUPED_NEEDS_AND_CROSS_PROJECT_SPEC.md — a grouped `record` need kind for
references/personnel, and need identity = dossier target so cross-project dedup + answer-once
propagation fall out. Five open decisions for Ali (propagation timing, where the cross-project list
lives, reference slots, migration, personnel ordering).

## Verification (real CI gates)
- Backend tsc clean (only known local-only maxmind). jest.ci: govCompanyDossierRoutes (incl. new
  fact-update route tests) + govCompanyLibrary + frontendTypographyLint + frontendCopyLint all green.
- Frontend tsc 0. studioParity 56/56 (ed-plan dropped from the contract; no button named Approve).
  GovDossierPanel 6/6 (Edit button added, existing assertions intact).

## State
- Branch workstream/gov-needs-editable-and-cleanup off origin/main (kept OFF the proof-into-judges
  PR #4112 branch so they do not stack). PR to open. Merge is the human's click; backend + frontend,
  so a merged deploy is backend + nginx, registry mode.
- Not verified: a live edit-a-fact -> rebuild round-trip in prod (needs dossier content + an eyeball).
