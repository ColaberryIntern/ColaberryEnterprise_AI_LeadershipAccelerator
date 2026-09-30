/**
 * clientVisibility — what a client may see. PURE, no I/O.
 *
 * Master plan §Gate 10: **client UI is not builder UI.** Five things must never reach a
 * client surface:
 *
 *   raw agent scratchpad · internal mentor notes · private builder assessment ·
 *   secrets · unnecessary engineering logs
 *
 * ## Why this is an allowlist and not a blocklist
 *
 * A blocklist protects against the fields that exist today. Every field added afterwards
 * is exposed by default, and the person adding it is thinking about the builder view, not
 * about a client reading it six months later. An allowlist inverts that: a new field is
 * invisible to clients until someone deliberately names it, and naming it is a reviewable
 * line in a diff.
 *
 * ## Why the shape differs rather than being filtered
 *
 * Gate 0's CLIENT_PORTAL_MAP is emphatic, and it is the difference between a control and
 * a decoration: a client-role check applied in React puts a mentor's private assessment of
 * an intern into a network payload that anyone can open DevTools and read. The projection
 * therefore happens server-side and produces a **different object**, and its tests assert
 * on the response body rather than on rendered DOM.
 *
 * ## The tripwire
 *
 * `findForbiddenFields` is deliberately redundant with the allowlist. The allowlist is the
 * control; the tripwire catches the case the allowlist cannot — someone adding
 * `internal_notes` *to* an allowlist without realising what it carries. Defence in depth
 * means the second layer assumes the first was edited by someone in a hurry.
 */

/** The eight destinations of the Client Review Room (master plan §Gate 10). */
export type ClientNavSection =
  | 'overview'
  | 'decisions'
  | 'design'
  | 'preview'
  | 'changes'
  | 'releases'
  | 'results'
  | 'documents';

export const CLIENT_NAV_SECTIONS: readonly ClientNavSection[] = [
  'overview',
  'decisions',
  'design',
  'preview',
  'changes',
  'releases',
  'results',
  'documents',
];

/**
 * What each section is for, in the client's language.
 *
 * None of these is a story board, a terminal, an agent log or a Kanban — that is the
 * point of the section list being fixed rather than derived from the builder navigation.
 */
export const CLIENT_NAV_PURPOSE: Record<ClientNavSection, string> = {
  overview: 'What this project is for and where it stands.',
  decisions: 'What was decided, why, and what still needs your approval.',
  design: 'What it will look like and how it will behave.',
  preview: 'The working thing, before it is released.',
  changes: 'What you asked to change, and what that would affect.',
  releases: 'What shipped, when, and what evidence supported it.',
  results: 'What it achieved against what was promised.',
  documents: 'The artifacts you were given.',
};

/** The five categories master plan §Gate 10 forbids on the client surface. */
export type ForbiddenCategory =
  | 'agent_scratchpad'
  | 'mentor_notes'
  | 'builder_assessment'
  | 'secrets'
  | 'engineering_logs';

export const FORBIDDEN_CATEGORIES: readonly ForbiddenCategory[] = [
  'agent_scratchpad',
  'mentor_notes',
  'builder_assessment',
  'secrets',
  'engineering_logs',
];

/**
 * Field-name fragments that indicate a forbidden category.
 *
 * Matched case-insensitively against key names anywhere in a payload. Fragments rather
 * than exact names because the risk is a field nobody on this list anticipated —
 * `agent_scratchpad`, `scratchpadText` and `raw_scratchpad` should all trip it.
 */
const FORBIDDEN_KEY_FRAGMENTS: Record<ForbiddenCategory, readonly string[]> = {
  agent_scratchpad: ['scratchpad', 'agent_trace', 'agenttrace', 'tool_use', 'tooluse', 'reasoning'],
  mentor_notes: ['mentor_note', 'mentornote', 'internal_note', 'internalnote', 'private_note'],
  builder_assessment: [
    'builder_assessment',
    'builderassessment',
    'intern_assessment',
    'performance_review',
    'competency_score',
  ],
  secrets: ['secret', 'token', 'api_key', 'apikey', 'password', 'credential', 'private_key'],
  engineering_logs: ['stack_trace', 'stacktrace', 'raw_log', 'rawlog', 'stderr', 'stdout'],
};

export interface ForbiddenFieldHit {
  path: string;
  category: ForbiddenCategory;
  fragment: string;
}

/**
 * Walk a payload and report any key that looks like a forbidden category.
 *
 * Reports **every** hit rather than the first, because a payload that leaks one private
 * field usually leaks the whole sub-object it came from, and fixing them one test run at
 * a time is how the second one gets missed.
 *
 * Depth-limited so a cyclic structure cannot hang a request. A truncated walk is reported
 * as a hit on the truncation path rather than passing silently — an incomplete check that
 * returns "clean" is worse than no check.
 */
export function findForbiddenFields(value: unknown, maxDepth = 8): ForbiddenFieldHit[] {
  const hits: ForbiddenFieldHit[] = [];

  const walk = (node: unknown, path: string, depth: number): void => {
    if (node === null || typeof node !== 'object') return;
    if (depth > maxDepth) {
      hits.push({ path, category: 'engineering_logs', fragment: '(walk truncated)' });
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`, depth + 1));
      return;
    }

    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      const lowered = key.toLowerCase();
      for (const category of FORBIDDEN_CATEGORIES) {
        for (const fragment of FORBIDDEN_KEY_FRAGMENTS[category]) {
          if (lowered.includes(fragment)) {
            hits.push({ path: path ? `${path}.${key}` : key, category, fragment });
          }
        }
      }
      walk(child, path ? `${path}.${key}` : key, depth + 1);
    }
  };

  walk(value, '', 0);
  return hits;
}

/** Object kinds the client surface serves. */
export type ClientObjectKind =
  | 'brand'
  | 'engagement'
  | 'project'
  | 'decision'
  | 'design'
  | 'release'
  | 'evidence_summary'
  | 'change_request'
  | 'acceptance'
  | 'document';

/**
 * The allowlists. Anything not named here does not reach a client, including fields that
 * do not exist yet.
 *
 * Note what is absent as much as what is present: no `risk_level` (an internal delivery
 * judgement), no `execution_policy` (how we build is not what we owe), no
 * `builder_authority` (an assessment of a person), no story internals.
 */
export const CLIENT_FIELD_ALLOWLIST: Record<ClientObjectKind, readonly string[]> = {
  // The brand this engagement is delivered under. NAME ONLY, and that is the whole point:
  // a client room is not Colaberry's room, it is the room of whichever brand owns the
  // engagement - AI Flotation, Refactored.ai, CPN. Rendering a hardcoded identity here
  // would have to be undone the first time a non-Colaberry brand delivers a project.
  //
  // `default_theme_key` is now here, and the reason it was withheld is the reason it is
  // allowed: a theme registry exists and consumes it. Until 2026-09-02 there was none, so
  // projecting the key would have been shipping a promise instead of a feature.
  // `frontend/src/theme/deliveryBrandThemes.ts` is the consumer; a key it does not know
  // renders exactly the neutral surface that shipped before it, so adding a brand cannot
  // change what another brand's client sees.
  //
  // It is a KEY, not colours: an opaque string naming a theme, which leaks nothing about
  // the brand and lets the palette change without a schema change.
  //
  // Still absent: slug and status (internal), metadata (an open bag), tenant_id.
  brand: ['id', 'name', 'default_theme_key'],
  // The engagement a project belongs to. A client is shown its NAME because a project
  // without the engagement around it reads as an orphan - but almost nothing else.
  //
  // Deliberately absent, and the first one is the sharp one: `source_lead_id` links the
  // engagement back to the marketing lead it came from, which is our funnel record and
  // none of the client's business. Also absent: tenant_id, brand_id, organization_id,
  // every *_identity_id, `metadata` (an open JSON bag - anything could end up there),
  // `archived_at` and `engagement_type`, which is our commercial classification.
  engagement: ['id', 'name', 'status', 'start_at', 'target_end_at'],
  // `summary`, `started_at` and `target_date` were named here and DO NOT EXIST on
  // DeliveryProject. Because toClientShape skips undefined values, they vanished in
  // silence rather than failing, and the client saw a thinner project than intended.
  // These are the real columns; clientAllowlistContract.test.ts now pins them.
  project: [
    'id',
    'name',
    'status',
    'engagement_id',
    // The client's own problem statement and the product idea, both written for them.
    // `workflow_summary` and `existing_system_summary` are deliberately excluded: they
    // are our analysis of how they work today, not something they asked to be shown.
    'business_problem',
    'product_idea',
  ],
  // `title` and `requires_client_approval` were named here and DO NOT EXIST. The result
  // was worse than a missing label: the projection carried a status and a rationale but
  // NO STATEMENT OF WHAT WAS DECIDED - the one thing a decision record exists to say.
  decision: [
    'id',
    'decision_type',
    'status',
    // The three that actually carry the decision.
    'question',
    'recommendation',
    'final_decision',
    'rationale',
    'decided_at',
    // Deliberately absent: `options` (a JSON blob that can carry internal notes),
    // `affected_nodes`, and every *_identity_id - who decided is internal.
  ],
  design: ['id', 'title', 'summary', 'preview_ref', 'status', 'updated_at'],
  // `summary` was here and nothing supplies it - `delivery_releases` has no such column,
  // so it silently vanished on every projection. Removed rather than left as a field that
  // is always absent, which reads to a caller like data that happens to be missing.
  //
  // `name`, `released_at` and `evidence_summary` are NOT columns either: the table has
  // `version`, `approved_at`, `check_results` and `waived_categories`. `toClientRelease`
  // maps them, deliberately, so the client contract keeps the client's vocabulary instead
  // of inheriting ours. See clientReleaseProjection.ts.
  release: ['id', 'name', 'status', 'released_at', 'evidence_summary'],
  // A summary, never the rows: a client is owed the conclusion and the shape of the
  // proof, not our CI output.
  // `reason` carries a WAIVER's justification. A waived check is not a passed one, and the
  // reason is the only thing that makes the difference reviewable by the person signing.
  evidence_summary: ['dimension', 'outcome', 'checked_at', 'reason'],
  change_request: ['id', 'title', 'description', 'status', 'requested_at', 'impact_summary'],
  // `scope` and `accepted_by_name` were named here and DO NOT EXIST; the real columns
  // are `scope_kind` and `accepted_by_identity_id`. The identity id is NOT projected -
  // a client is owed the fact of acceptance, not our internal identifier for the person.
  acceptance: [
    'id',
    'scope_kind',
    'promised_acceptance',
    'preview_ref',
    'evidence_summary',
    'accepted_at',
    'comments',
    'exceptions',
    'status',
  ],
  document: ['id', 'title', 'kind', 'url', 'published_at'],
};

/**
 * Project one object to its client shape.
 *
 * Default-deny by construction: it builds a NEW object from the allowlist rather than
 * deleting keys from the input. Deleting keys leaves the original object's prototype,
 * getters and any key the deleting code forgot; building fresh cannot.
 *
 * `undefined` values are skipped so an absent field stays absent rather than becoming an
 * explicit `undefined` that a serializer might render as `null` and a reader might take
 * for a real value.
 */
export function toClientShape<T extends Record<string, unknown>>(
  kind: ClientObjectKind,
  source: T,
): Record<string, unknown> {
  const allowed = CLIENT_FIELD_ALLOWLIST[kind];
  const out: Record<string, unknown> = {};
  for (const field of allowed) {
    if (source[field] !== undefined) out[field] = source[field];
  }
  return out;
}

export function toClientShapes<T extends Record<string, unknown>>(
  kind: ClientObjectKind,
  sources: readonly T[],
): Array<Record<string, unknown>> {
  return sources.map((s) => toClientShape(kind, s));
}
