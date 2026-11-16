/**
 * AF12.5. The one shared projection of a `CapabilityRecord` onto the wire.
 *
 * ## The defect this closes
 *
 * `GET /api/admin/agent-domains/:domainKey` and its builder-facing twin
 * `GET /api/admin/agent-domains-mine/:domainKey` both call `loadDomainMatrix(key)` and both use
 * only `m.accountable_human` and `m.researched_at` from the result. `m.capabilities` — the whole
 * record array — is loaded into a local variable and discarded. `buildAgentDomainSnapshot` does
 * the same: it takes `matrix` as input, derives `authority[]` from it, and never publishes the
 * records themselves.
 *
 * Meanwhile `agentDomainSnapshot.ts` tells every Command Center page that its capability source is
 * `GET /api/admin/agent-domains/<domain>`, and `agentDomainCommandCenterStory.ts` tells builders
 * the snapshot "carries the data for all six panels". Both are promises the platform publishes and
 * does not keep. Three builders reported the same missing data independently — Mihret Netsereab
 * (criterion 1), Victoria Spencer-Auber (criterion 3) and Sarbjit Kaur, 3 Nov 2026.
 *
 * ## Why an allow-list and never a spread
 *
 * `CapabilityRecord` ends in `readonly [extra: string]: unknown`. The research files carry
 * domain-specific extras, so `{ ...record }` would ship whatever a researcher invented, to every
 * caller, forever. One of those extras is specifically dangerous: `current_approved_autonomy`
 * appears in two of the ten files, is `unknown` in all 38 curriculum rows and set to
 * `autonomy:R0` in 15 learner_success rows, and `coverageMatrix.ts` exists in part to stop it
 * being read as an approval. Publishing it beside a real autonomy field would hand a page two
 * fields that look equally authoritative when only one is.
 *
 * So the field list is declared, frozen, and asserted by a test. Adding a field to the wire is a
 * deliberate edit here, not a side effect of a researcher adding a key to a JSON file.
 *
 * `ReleaseBehaviour` is a closed shape today with no index signature, and it is still projected
 * field by field for the same reason: the day somebody adds a field to it, that field should not
 * publish itself.
 *
 * ## Which panels this serves, and why nothing more is projected
 *
 * `agentDomainCommandCenterStory.ts` names the fields panel 2 needs: `name`, `classification`,
 * `implementation_state`, `requirement_validation_state`, `starting_autonomy`,
 * `max_permitted_autonomy`, and a clear mark where `human_decision` is true. Panel 4 asks for
 * `release_behaviour[]` by name, one entry per rung with its `behaviour` and
 * `acceptance_criteria`. `capability_id` joins the rows to everything else.
 *
 * That is the whole list. `max_autonomy_rationale` is NOT here because the snapshot already
 * publishes it as `authority[].ceiling_reason`, and two names for one value is how a page ends up
 * rendering it twice and disagreeing with itself. `blocked_by`, `source` and `supporting_evidence`
 * are not here because no panel asks for them; `/coverage` already serves `blocked_by`.
 *
 * ## File order is load-bearing
 *
 * The story is explicit for panel 2: "Sort by nothing clever: the order the records come in is the
 * order research recorded them." So this projection preserves file order and sorts nothing.
 *
 * That matters because the snapshot's own `authority[]` IS sorted, by `capability_id`. The two
 * arrays therefore do not line up positionally, and a page that joined `capabilities[i]` to
 * `authority[i]` would mis-attribute every row past the first difference. Join on
 * `capability_id`. A test pins both orders so neither can drift into the other.
 *
 * ## No clock
 *
 * `agentDomainSnapshot.ts` carries no wall-clock field on purpose: a timestamp in a file that
 * takes part in the sync comparison turns every sync into a commit whose only change is the time
 * it was written, which breaks the "unchanged implies no commit" guarantee (FR-026). This
 * projection feeds that file, so it adds no clock either, and it is pure: same records in, same
 * bytes out.
 *
 * ## Every projected field is guaranteed present
 *
 * `assertRecordContract` runs at load time and requires all nine of these fields on every record,
 * so a missing one fails the load rather than reaching here. The inner fields of a
 * `release_behaviour` entry are NOT contract-checked, so those are coerced to `null` rather than
 * shipped as `undefined` — `undefined` disappears through `JSON.stringify`, which hands a panel a
 * missing key that reads as a loading state instead of a labelled gap. Measured 15 Nov 2026: all
 * 966 entries across 444 capabilities are complete, and no capability has an empty
 * `release_behaviour[]`. The coercion is for the research file that changes tomorrow.
 */
import type { CapabilityRecord, ReleaseBehaviour } from './capabilityRecord';

/**
 * The capability fields that reach the wire. Frozen, and asserted key-for-key by a test against
 * the projection's real output, so neither can drift without the other failing.
 */
export const PROJECTED_CAPABILITY_FIELDS: ReadonlyArray<string> = Object.freeze([
  'capability_id',
  'name',
  'classification',
  'implementation_state',
  'requirement_validation_state',
  'starting_autonomy',
  'max_permitted_autonomy',
  'human_decision',
  'release_behaviour',
]);

/** The `release_behaviour` entry fields that reach the wire. */
export const PROJECTED_RELEASE_BEHAVIOUR_FIELDS: ReadonlyArray<string> = Object.freeze([
  'autonomy',
  'behaviour',
  'acceptance_criteria',
]);

export interface ProjectedReleaseBehaviour {
  /** The rung this entry describes, e.g. `autonomy:R3`. `null` when the record does not say. */
  readonly autonomy: string | null;
  readonly behaviour: string | null;
  readonly acceptance_criteria: string | null;
}

export interface ProjectedCapability {
  readonly capability_id: string;
  readonly name: string;
  readonly classification: string;
  readonly implementation_state: string;
  readonly requirement_validation_state: string;
  readonly starting_autonomy: string;
  readonly max_permitted_autonomy: string;
  readonly human_decision: boolean;
  /** One entry per rung, in record order. Empty means no next rung is defined — which is itself
   * the finding panel 6 asks to be labelled, not a blank to be hidden. */
  readonly release_behaviour: ReadonlyArray<ProjectedReleaseBehaviour>;
}

/** A trimmed string, or `null`. Never `undefined`: see the header. */
function text(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

function projectReleaseBehaviour(r: ReleaseBehaviour): ProjectedReleaseBehaviour {
  return {
    autonomy: text(r?.autonomy),
    behaviour: text(r?.behaviour),
    acceptance_criteria: text(r?.acceptance_criteria),
  };
}

/**
 * One record onto the wire. Field by field; no spread, ever.
 *
 * `human_decision` is coerced with `=== true` rather than passed through, so a research file that
 * writes the string `"yes"` cannot reach a page as a truthy value that renders as a human gate
 * nobody recorded.
 */
export function projectCapability(c: CapabilityRecord): ProjectedCapability {
  const behaviours = Array.isArray(c?.release_behaviour) ? c.release_behaviour : [];
  return {
    capability_id: String(c?.capability_id ?? ''),
    name: String(c?.name ?? ''),
    classification: String(c?.classification ?? ''),
    implementation_state: String(c?.implementation_state ?? ''),
    requirement_validation_state: String(c?.requirement_validation_state ?? ''),
    starting_autonomy: String(c?.starting_autonomy ?? ''),
    max_permitted_autonomy: String(c?.max_permitted_autonomy ?? ''),
    human_decision: c?.human_decision === true,
    release_behaviour: behaviours.map(projectReleaseBehaviour),
  };
}

export interface ProjectedCapabilities {
  readonly capabilities: ReadonlyArray<ProjectedCapability>;
  /** How many rows this response carries. */
  readonly returned: number;
  /** How many the domain has in total, so truncation is never silent. */
  readonly total: number;
}

/**
 * Project a domain's records, optionally capped.
 *
 * **There is no default limit, deliberately.** Panel 2 is "one row per capability", so a default
 * cap would silently make a builder's own inventory wrong, and a wrong inventory that looks
 * complete is worse than a large payload. Measured 15 Nov 2026 the largest whole-domain projection
 * is marketing at 61.5 KB over 64 capabilities — the allow-list already drops 83-87% of the raw
 * file, so the unbounded case is bounded and known. `limit` exists for a caller that wants a
 * preview, and `returned` beside `total` is what makes the cut visible when it is used.
 *
 * `limit` is clamped at 0 rather than trusted: a negative slice index counts from the END of the
 * array, so `slice(0, -1)` would quietly return everything but the last row instead of nothing.
 */
export function projectCapabilities(
  capabilities: ReadonlyArray<CapabilityRecord>,
  limit?: number,
): ProjectedCapabilities {
  const all = Array.isArray(capabilities) ? capabilities : [];
  const rows = typeof limit === 'number' && Number.isFinite(limit)
    ? all.slice(0, Math.max(0, Math.floor(limit)))
    : all;
  return {
    capabilities: rows.map(projectCapability),
    returned: rows.length,
    total: all.length,
  };
}
