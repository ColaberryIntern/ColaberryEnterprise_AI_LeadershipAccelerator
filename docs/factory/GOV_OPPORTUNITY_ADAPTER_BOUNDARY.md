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
`reason` + `method`. Everything else Enterprise needs is already present upstream (see the allowlist).
