import { GrowthJourneyClassification } from '../../models';
import { STEP_ORDER, type StepName } from './classification/types';

/**
 * "Why was this subject classified this way?" (Phase 2, T229). The Explorer
 * Why's shape — a stated FOUND or a stated ABSENT, nothing recomputed — with
 * Phase 2's own fields. Not a rename of `ExplorerWhy` (AD-1): the types are
 * this module's.
 *
 * Everything here is read from the row as written. The per-step trace the
 * ladder produced rides in `evidence` as `trace:<step>:<outcome>:<note>`;
 * this parses it back, so the view shows what each step did at the time,
 * not a reconstruction from today's rules. The override chain is walked up
 * through `override_of`, bounded.
 *
 * Redaction is structural: a classification row never held a person's text
 * or address (evidence strings are rule names and outcomes), so the view has
 * nothing to redact — and a test asserts that for a fixture whose lead email
 * is known.
 */

export interface WhyStep {
  step: number;
  name: StepName;
  outcome: 'answered' | 'abstained' | 'skipped' | 'unavailable' | 'unrecorded';
  note: string | null;
}

export interface GrowthJourneyWhyFound {
  status: 'found';
  classification_id: string;
  created_at: Date;
  brand_id: string;
  tenant_id: string;
  subject_ref: string;
  trigger: string;
  answer: {
    brand_relationship: string | null;
    journey_program: string | null;
    primary_path: string | null;
    secondary_paths: string[];
    intent: string | null;
    confidence: number | null;
    status: string;
    requires_human_review: boolean;
    locked: boolean;
  };
  decided_by_step: { step: number; name: StepName | null };
  steps_considered: WhyStep[];
  /** Evidence strings other than the trace: rule names and outcomes. */
  evidence: string[];
  eligibility: Record<string, unknown> | null;
  referral_target_brand_id: string | null;
  versions: { ruleset_version: string; model_version: string | null; ai_involved: boolean };
  /** The rows this one supersedes, walked up through `override_of`, nearest first. */
  override_chain: Array<{ classification_id: string; decided_by: string | null; locked: boolean; status: string; created_at: Date }>;
  inputs_unavailable: string[];
}

export interface GrowthJourneyWhyAbsent {
  status: 'absent';
  reason: 'not_found';
  classification_id: string;
}

export type GrowthJourneyWhy = GrowthJourneyWhyFound | GrowthJourneyWhyAbsent;

const MAX_CHAIN = 20;

/** Read-only. The caller has already applied the brand guard to the row. */
export function whyFromRow(row: GrowthJourneyClassification, chain: GrowthJourneyClassification[]): GrowthJourneyWhyFound {
  const evidence = row.evidence ?? [];
  const trace = parseTrace(evidence);
  const stepName = STEP_ORDER[row.source_step - 1] ?? null;
  return {
    status: 'found',
    classification_id: row.id,
    created_at: row.created_at,
    brand_id: row.brand_id,
    tenant_id: row.tenant_id,
    subject_ref: row.subject_ref,
    trigger: row.trigger,
    answer: {
      brand_relationship: row.brand_relationship,
      journey_program: row.journey_program_slug,
      primary_path: row.primary_path,
      secondary_paths: row.secondary_paths ?? [],
      intent: row.intent,
      confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
      status: row.status,
      requires_human_review: row.requires_human_review,
      locked: row.locked,
    },
    decided_by_step: { step: row.source_step, name: stepName },
    steps_considered: trace,
    evidence: evidence.filter((e) => !e.startsWith('trace:')),
    eligibility: row.eligibility,
    referral_target_brand_id: row.referral_target_brand_id,
    versions: { ruleset_version: row.ruleset_version, model_version: row.model_version, ai_involved: row.ai_involved },
    override_chain: chain.map((c) => ({ classification_id: c.id, decided_by: c.decided_by, locked: c.locked, status: c.status, created_at: c.created_at })),
    inputs_unavailable: evidence.filter((e) => e.startsWith('input_unavailable:')).map((e) => e.slice('input_unavailable:'.length)),
  };
}

/** `trace:<step>:<outcome>:<note>` → one entry per §7.1 step; a step with no trace entry is `unrecorded`. */
export function parseTrace(evidence: string[]): WhyStep[] {
  const byStep = new Map<number, WhyStep>();
  for (const e of evidence) {
    const m = /^trace:(\d):(answered|abstained|skipped|unavailable):(.*)$/.exec(e);
    if (!m) continue;
    const step = Number(m[1]);
    byStep.set(step, { step, name: STEP_ORDER[step - 1], outcome: m[2] as WhyStep['outcome'], note: m[3] || null });
  }
  return STEP_ORDER.map((name, i) => byStep.get(i + 1) ?? { step: i + 1, name, outcome: 'unrecorded', note: null });
}

/**
 * Loads the row and its override chain. Returns the raw rows so the controller
 * can apply the brand guard to the row BEFORE anything is shaped — a 404 for
 * another tenant's row must be byte-identical to a genuine not-found.
 */
export async function loadWhyRows(classificationId: string): Promise<{ row: GrowthJourneyClassification; chain: GrowthJourneyClassification[] } | null> {
  const row = await GrowthJourneyClassification.findByPk(classificationId);
  if (!row) return null;
  const chain: GrowthJourneyClassification[] = [];
  let cursor: GrowthJourneyClassification | null = row;
  const seen = new Set<string>([row.id]); // the start is already 'seen': a cycle back to it stops here
  while (cursor && cursor.override_of && chain.length < MAX_CHAIN && !seen.has(cursor.override_of)) {
    seen.add(cursor.override_of);
    const prior: GrowthJourneyClassification | null = await GrowthJourneyClassification.findByPk(cursor.override_of);
    if (!prior || prior.brand_id !== row.brand_id) break; // never walk across a brand
    chain.push(prior);
    cursor = prior;
  }
  return { row, chain };
}

export function whyAbsent(classificationId: string): GrowthJourneyWhyAbsent {
  return { status: 'absent', reason: 'not_found', classification_id: classificationId };
}
