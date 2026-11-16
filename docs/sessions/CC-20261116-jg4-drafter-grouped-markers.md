# Session CC-20261116-jg4 — Spine PR2: the drafter emits grouped `[RECORD]` markers

PR2 of the needs spine (PR1 = the `record` kind, merged as #4117). This makes the drafter actually
PRODUCE grouped records, so a past-performance reference or a key person flows through the existing
gap -> needs -> resolve chain as ONE `record` need instead of fragmenting into per-field placeholders.

Spec: docs/gov-proposal-studio/GROUPED_NEEDS_AND_CROSS_PROJECT_SPEC.md (section A, drafter half).

## The mechanism
The drafter already writes `[PLACEHOLDER: ...]` markers that `reconcilePlaceholderGaps` (on the write
path, runProposalDocumentChecks) turns into typed gaps. PR2 adds a parallel grouped marker:

- `placeholderNeeds.ts`: new pure `parseRecordNeeds` recognizes `[RECORD: reference]` / `[RECORD: personnel]`
  (optional `| slot=N` and `| fields=a,b,c`) and emits one `record`-kind HumanNeed per slot, keyed
  `reference:<slot>` / `personnel:<slot>` (the canonical cross-document key from the spec), numbered in order
  of appearance. Default fields: reference = client/scope/contractValue/dates/contact; personnel =
  name/role/summary. New `parseDraftNeeds` = placeholders + records together. `everyMarkerHasNeed` now also
  counts `[RECORD]` markers, so the "a marker is never left without an open need" invariant covers both.
- `govProposalGaps.ts`: `reconcilePlaceholderGaps` uses `parseDraftNeeds`, so a `[RECORD]` marker persists as
  ONE gap carrying a `record` need (recordType + fields). PR1's resolve path + collectProjectNeeds already
  handle a `record` need, so the whole chain works end to end once the marker exists.
- Drafter prompts (the enabling instruction, not CI-verifiable at runtime):
  - `govProposalDocumentDraftAI.ts` system prompt: for past-performance/references write ONE
    `[RECORD: reference]` per reference (exactly one if the solicitation states no number); for a key person
    `[RECORD: personnel]`; never split a record into per-field placeholders.
  - `sectionDrafting.ts` DOC_TYPE_TEMPLATES: past_performance, management, key_personnel reworded the same way.

## Decision #3 (reference slots) as it lands today
The blueprint (proposalBlueprintTypes.ts) has NO required-reference-count field yet, so decision #3's "read
the count from the blueprint when present" has nothing to read -> the "else one repeatable reference need"
branch is what ships: the prompt says "exactly one if the solicitation does not state a number", and the
parser numbers however many markers the model emits. Adding a blueprint reference-count is a clean future
enhancement that needs no change here — more `[RECORD: reference]` markers simply become reference:1..N.

## Graceful fallback
If the model emits per-field `[PLACEHOLDER]`s anyway (prompt not followed), behavior is exactly today's:
atomic fact needs. Nothing regresses; grouping is strictly additive.

## Known minor artifact (not fixed here, out of PR2 scope)
The legacy agent-panel `listOpenQuestions` (govProposalGaps, keyed by question TEXT) collapses multiple
reference slots that share the same ask text into one row. The NEEDS inbox (collectProjectNeeds ->
aggregateNeeds, keyed by need.key) keeps reference:1/reference:2 distinct, which is the path the
cross-project view (PR3) uses. Noted for PR3.

## Verification (real CI gates)
- Backend tsc clean (only the known local-only maxmind TS2307).
- jest.ci: placeholderNeeds + sectionDrafting + createProposalDraft + documentChecks green; full
  services/factory/proposal folder = 73 suites / 629 tests pass.
- Frontend untouched (no tsc/react-scripts/lint impact; typography + copy baselines unchanged).

## State
- Branch workstream/gov-drafter-grouped-markers off origin/main (920f307f, = main after PR1 #4117).
- Next: PR3 — the cross-project needs aggregator (dedupe by canonical key across the tenant's projects),
  the grouped resolve FORM in the Needs inbox (reference/personnel fields), and the tenant "Needs across
  contracts" view (decisions #1 + #2). PR3 is the first user-visible piece; a merged deploy then is
  backend + nginx. PR1 + PR2 are backend-only and inert until PR3 (nothing answers a record need via UI yet),
  so no prod deploy is warranted until PR3 ships the surface.
