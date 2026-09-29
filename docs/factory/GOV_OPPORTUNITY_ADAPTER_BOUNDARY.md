# Gov opportunity adapter boundary (Phase 1)

Status: **documented, not frozen.** Opportunity Pulse owns `gov-opportunity.v1` and is delivering the
machine-readable schema + fixtures in its Phase 1 handoff. Enterprise integrates the **exact agreed schema in
Phase 2**, after OP's artifact commit. This file records the consumer contract and the trust boundary so the
two sides stay compatible; it does not invent a competing schema.

## Where the boundary lives

`backend/src/services/factory/opportunities/oppPulseClient.ts` (`mapOpportunity`) is the single adapter. It
maps the upstream Bonfire row to `GovOpportunity` (`govOpportunity.ts`) via an **explicit allowlist** — the
whole upstream row is never forwarded to the browser.

## Allowlist consumed today (Phase 1)

| GovOpportunity field | Upstream source | Notes |
|---|---|---|
| `uuid` | `id` | canonical record key for our `gov-<uuid>` slug |
| `externalId` | `externalId` | **stable source id when provided; may be a title-derived ALIAS — not a dependable canonical key.** Do not dedup on it alone |
| `title`, `agency`, `category` | `title`, `agency`, `aiCategory` | display |
| `closeAt` | `closeDate` | **full source timestamp, verbatim.** OP flagged a tz-stripping parser; never silently shifted |
| `closeDate` | derived | display-only truncation of `closeAt` |
| `fitScore`, `priorityScore` | same | 0-100, nullable |
| `estimatedValue` | `estimatedValue` (BIGINT cents STRING) | ÷100 → dollars |
| `valueBasis` | `valueBasis` (absent upstream today) | defaults `'unverified'` → UI shows "Value unverified"; **never forecast revenue** |
| `pursuitStatus` | `pursuitStatus` | full enum none/pursuing/submitted/declined; `declined` stays distinct from `none` |
| `vetVerdict` + `vetVerdictPresent` | `vetVerdict` | **ABSENT vs null vs populated preserved.** null = unassessed, never approved |
| `freshness` | `enrichedAt`, `attachmentsFetchedAt` | enrichment freshness — **not** proof the live portal/amendments were re-checked |

## Deliberately NOT surfaced (unverified free text)

`overview`, `strategy`, `submissionRequirements`, `rawText` are source-generated and **unverified**. They are
not mapped into the browser response and must **not** become confirmed requirements. Verified requirements come
from document evidence in a later phase, not from these fields.

## Identity & versioning (Phase 2 target)

Keep three versions **separate**, do not collapse them:
- **schema version** — the `gov-opportunity.v<n>` contract shape (OP-owned).
- **source snapshot version** — the specific fetched payload retained as the decision's evidence (Enterprise).
- **enrichment version** — OP's `enrichmentVersion`/`enrichmentHash` describing how the row was enriched.

Canonical identity is the source's stable id; a title-derived `externalId` is an **alias**, resolved to the
canonical id, never used as the primary key on its own.

## Trust boundary at pursuit approval (Phase 2, SAME phase as approval)

At pursuit approval the backend **re-fetches the opportunity from OP by canonical id** and persists that
**source snapshot + schema/snapshot/enrichment versions + fetch timestamp** as the immutable evidence of the
decision. Browser-supplied `title`, `verdict`, `deadline`, and `eligibility` are **display only, never
authoritative** — approval validates against the server snapshot. (This snapshot capture is explicitly part of
the approval phase, not deferred.)

## Backward compatibility

A pre-v1 / partial payload (missing `noticeType`, `valueBasis`, populated `vetVerdict`, amendment fields) is
accepted but treated as **`qualification_completeness: partial`**: it can be discovered and researched but
**cannot reach "approved pursuit"** until the missing mandatory-decision inputs are supplied or a reviewer
records them. An old payload is **never** silently presented as fully qualified.

## Rules that hold across phases

- Mandatory requirements are **stage-specific**; unknowns may exist during research and are recorded as
  unknown, never a silent pass.
- An override may correct a **mistaken classification with evidence**; it may **not** waive an unmet mandatory
  prerequisite.
- Published contract values stay separate from estimated company revenue; `estimatedValue` is never a forecast.

## Fields Enterprise still needs OP to add in `gov-opportunity.v1`

`noticeType`, `procurementType`, `contractVehicle` (three separate fields), `setAside`, `naics`/`psc`,
`valueBasis` (published-ceiling vs estimate), `amendmentVersion` + history, and `vetVerdict` populated with
`reason` + `method`. (These are all present in OP's candidate `gov-opportunity.v1` — see the mapping below.)

## Ingestion boundary — what Phase 1 actually does (corrected)

Precise scope, without overclaiming:
- **Phase 1 preserves the LEGACY timestamp only.** `mapOpportunity` keeps OP's current `closeDate` string
  verbatim as `closeAt` (no reparse, no shift). It does **not** implement OP's structured `deadline` object —
  preserving a `closeAt` string does **not** establish support for `deadline.conflicts`, candidate instants, or
  `conservativePlanningUtc`. **Structured conflict retention is not implemented until an explicit v1 adapter and
  its tests prove it (Phase 2).**
- The read/normalization layer maps only the fields in the allowlist above; it is **not** a blanket "nothing is
  lost at the read layer" — unlisted upstream fields (and any nested verdict properties beyond the explicit
  `VetVerdict` allowlist) are intentionally dropped.
- **Persistence:** the Phase 1 `/start` route persists no opportunity field, and there is no
  `deadline`/`close`/`due` column on any contract table. So a deadline (corrected or not) reaches the browser
  but never persistence. The loss point is the `/start` persistence boundary, not a `validateRow`.
- **Merge commit of record:** Phase 1 merged to `main` as merge commit
  `ba25060462b45af46e10cc30b9769f41a1c03e6c`; `2c13057b…` is the branch head that merge brought in (not the
  merge commit itself).

## gov-opportunity.v1 — field-to-consumer mapping and concrete incompatibilities (Phase 2 compat review)

Read against OP `ColaberryIntern/OpportunityPulse` commit `73f4e56a…` (NOT pinned as final — OP is finishing
standards-compliant validation; **pin the final artifact commit before integration**). `companyQualification`
is `const null` in v1 by design — bidding entity, capability match, pursuit decision, approval, effort budget
and build authorization are Enterprise-owned. Unknown source verdicts are valid: qualification depends on
Enterprise evidence, not on OP supplying a populated verdict.

| v1 field | Enterprise consumer | Compatibility |
|---|---|---|
| `canonicalOpportunityId` (`op:gov:<32hex>`) | canonical key for the project | **INCOMPAT:** our slug is `gov-<bonfire-uuid>`. Phase 2 must re-key on `canonicalOpportunityId`; the uuid becomes a `sourceAlias`. |
| `sourceRecordId` + `sourceAliases[]` | reconciliation across pipelines | our `externalId` is a partial analogue; adopt aliases for dedup. |
| `publisher.leadBuyer.name`+`jurisdiction` | `agency` (compose) | **INCOMPAT (flatten):** we hold a single `agency` string. |
| `publisher.officialSourceUrl` | `sourceUrl` ("Review source") | OK. `publisher.submissionPortal` is SEPARATE (often null) — never treat `sourceUrl` as a submission portal (Phase 1 already doesn't). |
| `notice.noticeType`/`procurementType`/`contractVehicle` | qualification inputs (RFI vs solicitation, resale/licensed-profession, vehicle) | **NEW:** we have none today; these drive the qualification gate. |
| `deadline{originalText,utc,utcConfidence,uncertaintyReason,conservativePlanningUtc,conflicts}` | `closeAt`/`closeDate` today | **INCOMPAT:** we consume a single string. Phase 2 consumes `utc` (only when `utcConfidence` high), keeps `conflicts` + `conservativePlanningUtc` (labeled a planning aid), and `utcConfidence:'unknown'`→`utc:null` blocks the submission gate. |
| `value.published{amountMinorUnits(cents),valueType,provenance}` vs `value.modelEstimate{notForRevenuePlanning:true}` | `estimatedValue` + `valueBasis` | **INCOMPAT:** we hold one number. Map `published` (valueType `ceiling`/`awarded`→`published_ceiling`) vs `modelEstimate`→never revenue. |
| `requirements[]{category,applicability,responsibleParty,dueStage,bindingStatus,evidenceRef}` | `contract_requirements` + stage gates | strong fit — `applicability:'unknown'` blocks; `dueStage` submission/award/delivery = the stage-timing; `bindingStatus` separates RFI questions from binding requirements. |
| `timestamps{sourceObservedAt,fetchedAt,enrichedAt,documentReviewedAt,lastVerifiedAtSource}` | `freshness` | we only carry `enrichedAt`/`attachmentsFetchedAt`; adopt `lastVerifiedAtSource` + `documentReviewedAt` (the "was the live portal actually re-checked" signals). |
| `sourceAssessment.legacyVerdict{status,disqualifier,label,method,evidence,scope}` | `vetVerdict` | **INCOMPAT (path):** our mapper reads a TOP-LEVEL `vetVerdict`; in v1 the verdict lives under `sourceAssessment.legacyVerdict`. Same fields (status/label/reason/disqualifier/method/evidence) — our explicit `VetVerdict` allowlist already matches; only the source path changes. |
| `legacy{fitScore,priorityScore,pursuitStatus,deprecation}` | Fit/Priority (now labeled legacy) + `pursuitStatus` | aligns — v1 confirms these are advisory/title-derived and on a deprecation path; `legacy.pursuitStatus:'declined'` does NOT oblige the consumer to decline. |
| `sourceAvailability{status,servingLastKnownSnapshot}` | `snapshotReason:'source_failed'` | aligns with our configured-but-failed banner. |
| `companyQualification` (`const null`) | Enterprise-owned | confirms the ownership boundary; nothing to consume. |
