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
  project: ['id', 'name', 'summary', 'status', 'started_at', 'target_date', 'engagement_id'],
  decision: [
    'id',
    'title',
    'decision_type',
    'status',
    'rationale',
    'decided_at',
    'requires_client_approval',
  ],
  design: ['id', 'title', 'summary', 'preview_ref', 'status', 'updated_at'],
  release: ['id', 'name', 'status', 'released_at', 'summary', 'evidence_summary'],
  // A summary, never the rows: a client is owed the conclusion and the shape of the
  // proof, not our CI output.
  evidence_summary: ['dimension', 'outcome', 'checked_at'],
  change_request: ['id', 'title', 'description', 'status', 'requested_at', 'impact_summary'],
  acceptance: [
    'id',
    'scope',
    'promised_acceptance',
    'preview_ref',
    'evidence_summary',
    'accepted_by_name',
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
