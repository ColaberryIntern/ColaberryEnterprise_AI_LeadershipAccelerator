import { GrowthJourneyDecision } from '../../models';
import type { GrowthJourneyDecisionMode } from '../../models/GrowthJourneyDecision';
import type { GrowthJourneyWhyFound } from './classificationWhyService';

/**
 * "Why did the Governor decide this for this subject?" (Phase 3, T312).
 *
 * The same envelope Phase 2's classification Why established — a stated FOUND
 * or a stated ABSENT, `brand_id`, `tenant_id`, `subject_ref`, `trigger`, the
 * versions and the unavailable inputs — with the decision's own fields inside
 * it. The envelope is TAKEN from `GrowthJourneyWhyFound` by `Pick`, not
 * re-declared, so this is Phase 2's shape gaining the decision's fields and not
 * a third Why shape. `journey_program` is here because a decision belongs to a
 * programme and a classification proposes one.
 *
 * ─── STORED EVIDENCE ONLY ───────────────────────────────────────────────────
 *
 * Everything in the view is read from the `growth_journey_decisions` row as it
 * was written by `decisionService.ts`. Nothing is recomputed: no scorer, no
 * freshness gate, no contact policy, no strategy, no lead lookup. The Why says
 * what the pipeline saw at the time, which is the only thing a reviewer of a
 * shadow decision can learn anything from — a re-run against today's facts
 * would answer a different question. A source scan pins the import list.
 *
 * ─── EVERY SUPPRESSED CANDIDATE, OPAQUELY ───────────────────────────────────
 *
 * `candidates` and `suppressed` are handed through as stored, whole, and
 * untouched — every one, never a slice, never re-ordered. They are also never
 * READ: a candidate carries the ranking fields the one-arbitration-point guard
 * forbids every production file from consulting, and a view that sorted or
 * labelled by them would be a second comparator. The arbitration already
 * happened; this shows its record.
 *
 * ─── A SOURCELESS DIMENSION IS A GAP, NOT A ZERO ────────────────────────────
 *
 * T306's vector stores `value: null` for a dimension nothing in the repo
 * produces, and names the gap as `<key>:<reason>` in `score_gaps`. The view
 * keeps the null and attaches the named gap to its dimension. It never
 * defaults a missing value to 0, which would read as "measured, and low".
 *
 * Redaction is structural, as in Phase 2: the row holds rule names, reasons,
 * keys, counts and timestamps — no address, no message text — and the view
 * copies named fields only. A test asserts the rendered Why contains no `@`.
 */

/** Phase 2's Why envelope, reused field-for-field. */
type WhyEnvelope = Pick<
  GrowthJourneyWhyFound,
  'status' | 'created_at' | 'brand_id' | 'tenant_id' | 'subject_ref' | 'trigger' | 'versions' | 'inputs_unavailable'
>;

/** One stored score dimension with its named gap attached, when it has one. */
export interface WhyScoreDimension {
  key: string;
  label: string | null;
  /** Exactly as stored: `null` for a dimension with no source, never coerced. */
  value: number | null;
  source: string | null;
  /** The `<key>:<reason>` entry from the stored gaps, or null when the dimension was scored. */
  gap: string | null;
  factors: unknown[];
}

export interface WhyUnknownInput {
  value: string;
  /** Why the answer is what it is — for `unknown`, which source is missing. */
  reason: string | null;
}

export interface GrowthJourneyDecisionWhyFound extends WhyEnvelope {
  decision_id: string;
  classification_id: string | null;
  decision_date: string;
  mode: GrowthJourneyDecisionMode;
  /**
   * The programme the decision was made under. The row stores the programme's
   * id and the ruleset that decided; the programme's status at decision time
   * rides in the stored eligibility. The slug is not on the row and is not
   * looked up here — stored evidence only.
   */
  journey_program: { program_id: string | null; status: string | null; ruleset_version: string };
  answer: {
    selected_action: string | null;
    selected_path: string | null;
    selected_channel: string | null;
    reason: string;
    requires_human_review: boolean;
    decided_by: string;
  };
  /** Every candidate the strategy produced, as stored. Opaque. */
  candidates: unknown[];
  /** Every suppressed candidate with its reason, as stored. Opaque, and never a slice. */
  suppressed: unknown[];
  deferred_actions: unknown[];
  /** Programme status, the winner's offer decision, what each generator declined to emit, and the unavailable inputs. */
  eligibility: Record<string, unknown> | null;
  scores: {
    available: boolean | null;
    summary: number | null;
    computed_at: string | null;
    dimensions: WhyScoreDimension[];
  };
  score_gaps: string[];
  state_at_decision: string | null;
  overlays_at_decision: string[];
  contact_evidence: Record<string, unknown> | null;
  /** The two §7.3 inputs that have no source in this codebase, with the stored reason for each. */
  unknown_inputs: { human_conversation: WhyUnknownInput; sales_capacity: WhyUnknownInput };
  content: { selected: Record<string, unknown> | null; gaps: string[] };
  /**
   * T507: whether the row MAY execute and why - the ladder's answer, stamped at decision time. `mode` is null
   * for a row written before the stamp existed; such a row is shadow, and `mode` on the envelope says so.
   */
  execution: { executed: boolean; receipt: Record<string, unknown> | null; mode: WhyExecutionMode | null };
}

export interface WhyExecutionMode {
  mode: GrowthJourneyDecisionMode;
  reason: string | null;
  resolved: string | null;
  channel: string | null;
  control_ids: string[];
}

export interface GrowthJourneyDecisionWhyAbsent {
  status: 'absent';
  reason: 'not_found';
  decision_id: string;
}

export type GrowthJourneyDecisionWhy = GrowthJourneyDecisionWhyFound | GrowthJourneyDecisionWhyAbsent;

/**
 * The columns the queue lists. The JSONB records (candidates, suppressed,
 * evidence, scores) belong to the Why, one row at a time; the list is for
 * finding the row. Pinned by a test so a blob cannot creep into the listing.
 */
export const DECISION_LIST_ATTRIBUTES = [
  'id',
  'tenant_id',
  'brand_id',
  'program_id',
  'subject_ref',
  'classification_id',
  'trigger',
  'decision_date',
  'mode',
  'selected_action',
  'selected_path',
  'selected_channel',
  'state_at_decision',
  'reason',
  'requires_human_review',
  'ai_involved',
  'model_version',
  'ruleset_version',
  'executed',
  'decided_by',
  'created_at',
] as const;

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asStrings = (v: unknown): string[] => asArray(v).filter((s): s is string => typeof s === 'string');
const asString = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** Read-only. The caller has already applied the brand guard to the row. */
export function decisionWhyFromRow(row: GrowthJourneyDecision): GrowthJourneyDecisionWhyFound {
  const eligibility = asRecord(row.eligibility);
  const scores = asRecord(row.scores);
  const contact = asRecord(row.contact_evidence);
  const gaps = asStrings(row.score_gaps);
  return {
    status: 'found',
    decision_id: row.id,
    classification_id: row.classification_id ?? null,
    created_at: row.created_at,
    brand_id: row.brand_id,
    tenant_id: row.tenant_id,
    subject_ref: row.subject_ref,
    trigger: row.trigger,
    decision_date: row.decision_date,
    mode: row.mode,
    journey_program: {
      program_id: row.program_id ?? null,
      status: asString(eligibility?.program_status),
      ruleset_version: row.ruleset_version,
    },
    answer: {
      selected_action: row.selected_action ?? null,
      selected_path: row.selected_path ?? null,
      selected_channel: row.selected_channel ?? null,
      reason: row.reason,
      requires_human_review: row.requires_human_review,
      decided_by: row.decided_by,
    },
    candidates: asArray(row.candidates),
    suppressed: asArray(row.suppressed),
    deferred_actions: asArray(row.deferred_actions),
    eligibility,
    scores: {
      available: typeof scores?.available === 'boolean' ? scores.available : null,
      summary: typeof scores?.summary === 'number' ? scores.summary : null,
      computed_at: computedAt(scores?.computed_at),
      dimensions: asArray(scores?.dimensions).map((d) => dimensionWithGap(d, gaps)),
    },
    score_gaps: gaps,
    state_at_decision: row.state_at_decision ?? null,
    overlays_at_decision: asStrings(row.overlays_at_decision),
    contact_evidence: contact,
    unknown_inputs: {
      human_conversation: { value: row.human_conversation, reason: asString(contact?.human_conversation_reason) },
      sales_capacity: { value: row.sales_capacity, reason: asString(contact?.sales_capacity_reason) },
    },
    content: { selected: asRecord(row.selected_content), gaps: asStrings(row.content_gaps) },
    execution: { executed: row.executed, receipt: asRecord(row.execution_receipt), mode: executionModeOf(eligibility?.execution_mode) },
    versions: { ruleset_version: row.ruleset_version, model_version: row.model_version ?? null, ai_involved: row.ai_involved },
    inputs_unavailable: asStrings(eligibility?.inputs_unavailable),
  };
}

/** A stored dimension, its value kept exactly as stored, with its named gap looked up by key. */
function dimensionWithGap(stored: unknown, gaps: string[]): WhyScoreDimension {
  const d = asRecord(stored) ?? {};
  const key = asString(d.key) ?? 'unknown';
  return {
    key,
    label: asString(d.label),
    value: typeof d.value === 'number' ? d.value : null,
    source: asString(d.source),
    gap: gaps.find((g) => g.startsWith(`${key}:`)) ?? null,
    factors: asArray(d.factors),
  };
}

/** The T507 stamp as stored, or null for a row from before it. A stamp whose mode is not a known mode is read as shadow. */
function executionModeOf(stored: unknown): WhyExecutionMode | null {
  const s = asRecord(stored);
  if (!s) return null;
  return {
    mode: s.mode === 'live' ? 'live' : 'shadow',
    reason: asString(s.reason),
    resolved: asString(s.resolved),
    channel: asString(s.channel),
    control_ids: asStrings(s.control_ids),
  };
}

/** JSONB gives the timestamp back as a string; a Date arrives only from an in-memory row. */
function computedAt(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString();
  return asString(v);
}

/**
 * Loads the row. Returns it raw so the controller can apply the brand guard
 * BEFORE anything is shaped — a 404 for another tenant's row must be
 * byte-identical to a genuine not-found.
 */
export async function loadDecisionRow(decisionId: string): Promise<GrowthJourneyDecision | null> {
  return GrowthJourneyDecision.findByPk(decisionId);
}

export function decisionWhyAbsent(decisionId: string): GrowthJourneyDecisionWhyAbsent {
  return { status: 'absent', reason: 'not_found', decision_id: decisionId };
}
