/**
 * T312 — the decision Why: Phase 2's envelope with the decision's fields inside
 * it, built from the stored row only.
 *
 * The fixture is a row exactly as `decisionService.ts`'s `decisionRow` writes
 * it (every column, the JSONB records in their stored shapes), so what these
 * tests drive is the view over the real record and not over a convenient one.
 */
import * as fs from 'fs';
import * as path from 'path';

const findByPk = jest.fn();
jest.mock('../../../models', () => ({
  GrowthJourneyDecision: { findByPk: (...a: unknown[]) => findByPk(...a) },
  GrowthJourneyClassification: {},
}));

import {
  DECISION_LIST_ATTRIBUTES,
  decisionWhyAbsent,
  decisionWhyFromRow,
  loadDecisionRow,
} from '../decisionWhyService';
import { whyFromRow } from '../classificationWhyService';
import { importsOf, phase2SourceFiles } from './phase2Sources';
import { DECISION_ID as ID, KNOWN_EMAIL, storedRow, suppression } from './fixtures/decisionRowFixture';

beforeEach(() => findByPk.mockReset());

/** Phase 2's envelope: the fields a Why carries regardless of what it explains. */
const ENVELOPE = ['status', 'created_at', 'brand_id', 'tenant_id', 'subject_ref', 'trigger', 'versions', 'inputs_unavailable'] as const;

describe('the envelope is Phase 2\'s, not a third shape', () => {
  it('every envelope field of the classification Why is present on the decision Why, with the same meaning', () => {
    const phase2 = whyFromRow({
      id: 'c', tenant_id: 't', brand_id: 'b', subject_ref: 'lead:1', trigger: 'reply', brand_relationship: 'cpn', journey_program_slug: 'learner', primary_path: null,
      secondary_paths: [], intent: null, confidence: '0.400', evidence: ['input_unavailable:behaviour'], source_step: 8, requires_human_review: false, status: 'proposed',
      locked: false, eligibility: null, referral_target_brand_id: null, ruleset_version: 'p2-v1', model_version: null, ai_involved: false, created_at: new Date(),
    } as never, []);
    const why = decisionWhyFromRow(storedRow());
    for (const k of ENVELOPE) {
      expect(k in phase2).toBe(true);
      expect(k in why).toBe(true);
    }
    expect(why.status).toBe('found');
    expect(why.versions).toEqual({ ruleset_version: 'p3-business-v1', model_version: null, ai_involved: false });
    expect(why.inputs_unavailable).toEqual(['appointments']);
    // The three the plan names as the additions.
    expect(why.journey_program).toEqual({ program_id: '30000000-0000-4000-8000-000000000001', status: 'draft', ruleset_version: 'p3-business-v1' });
    expect(why.brand_id).toBe('20000000-0000-4000-8000-000000000003');
    expect(why.subject_ref).toBe('lead:501');
  });

  it('the top-level key set is stated, so a field cannot be added or dropped unnoticed', () => {
    expect(Object.keys(decisionWhyFromRow(storedRow())).sort()).toEqual([
      ...ENVELOPE,
      'answer', 'candidates', 'classification_id', 'contact_evidence', 'content', 'decision_date', 'decision_id', 'deferred_actions',
      'eligibility', 'execution', 'journey_program', 'mode', 'overlays_at_decision', 'score_gaps', 'scores', 'state_at_decision',
      'suppressed', 'unknown_inputs',
    ].sort());
  });

  it('the absent variant names the decision', () => {
    expect(decisionWhyAbsent('nope')).toEqual({ status: 'absent', reason: 'not_found', decision_id: 'nope' });
  });
});

describe('every suppressed candidate, and every candidate, as stored', () => {
  it('lists all of them, in order, untouched — never a slice', () => {
    const suppressed = Array.from({ length: 25 }, (_, i) => suppression(i + 1));
    const row = storedRow({ suppressed });
    const why = decisionWhyFromRow(row);
    expect(why.suppressed).toHaveLength(25);
    expect(why.suppressed).toEqual(suppressed);
    expect(why.suppressed.map((s) => (s as { reason: string }).reason)).toEqual(suppressed.map((s) => s.reason));
    expect(why.candidates).toEqual(row.candidates);
    expect(why.deferred_actions).toEqual(row.deferred_actions);
  });

  it('an empty record is an empty list, not a missing field', () => {
    const why = decisionWhyFromRow(storedRow({ suppressed: [], candidates: [], deferred_actions: [] }));
    expect(why.suppressed).toEqual([]);
    expect(why.candidates).toEqual([]);
    expect(why.deferred_actions).toEqual([]);
  });

  it('is in the tree the one-arbitration-point read-ban walks, and the record it hands through really carries ranking fields', () => {
    const scanned = phase2SourceFiles().map((f) => f.replace(/\\/g, '/'));
    expect(scanned.some((s) => s.endsWith('services/growthJourney/decisionWhyService.ts'))).toBe(true);
    // Non-vacuity: the ban is only meaningful over code that could read the
    // field, and the fixture's candidates carry it — so a view that sorted or
    // labelled by it would have something to read and the ban something to catch.
    expect(JSON.stringify(storedRow().candidates)).toContain('priority_tier');
  });
});

describe('the answer, the state, the inputs the pipeline could not see', () => {
  it('states the selected action and why, the state and overlays, and both unknowns with their stored reasons', () => {
    const why = decisionWhyFromRow(storedRow());
    expect(why.answer).toEqual({
      selected_action: 'SEND_EMAIL', selected_path: 'business_consulting', selected_channel: 'email',
      reason: 'selected: capabilityEducation', requires_human_review: false, decided_by: 'governor:p3-business-v1',
    });
    expect(why.state_at_decision).toBe('EXPLORING_SOLUTIONS');
    expect(why.overlays_at_decision).toEqual(['NO_RESPONSE']);
    expect(why.unknown_inputs).toEqual({
      human_conversation: { value: 'unknown', reason: 'no source in this codebase: nothing records whether a human is in conversation' },
      sales_capacity: { value: 'unknown', reason: 'no source in this codebase: there is no sales capacity or assignment table' },
    });
    expect(why.eligibility).toEqual(storedRow().eligibility);
    expect(why.contact_evidence).toEqual(storedRow().contact_evidence);
    expect(why.content).toEqual({ selected: { asset_type: 'capability_education', offer_family: 'consulting', assets: [] }, gaps: ['content_purpose_unsupported:capability_education'] });
    expect(why.execution).toEqual({ executed: false, receipt: null });
    expect(why.mode).toBe('shadow');
    expect(why.decision_date).toBe('2026-09-15');
    expect(why.classification_id).toBe('40000000-0000-4000-8000-000000000001');
  });

  it('a WAIT refusal reads as one: null action, the named reason, nothing selected', () => {
    const why = decisionWhyFromRow(storedRow({ selected_action: 'WAIT', selected_path: null, selected_channel: null, selected_content: null, reason: 'refused: freshness:stale', candidates: [], suppressed: [] }));
    expect(why.answer.selected_action).toBe('WAIT');
    expect(why.answer.reason).toBe('refused: freshness:stale');
    expect(why.answer.selected_channel).toBeNull();
    expect(why.content.selected).toBeNull();
  });

  it('a row whose JSONB records are null renders empty lists and null records, not a throw', () => {
    const why = decisionWhyFromRow(storedRow({ eligibility: null, scores: null, contact_evidence: null, selected_content: null, execution_receipt: null, score_gaps: null, overlays_at_decision: null, content_gaps: null }));
    expect(why.eligibility).toBeNull();
    expect(why.scores).toEqual({ available: null, summary: null, computed_at: null, dimensions: [] });
    expect(why.inputs_unavailable).toEqual([]);
    expect(why.journey_program.status).toBeNull();
    expect(why.unknown_inputs.sales_capacity).toEqual({ value: 'unknown', reason: null });
    expect(why.overlays_at_decision).toEqual([]);
  });
});

describe('scores: a sourceless dimension is a gap, not a zero', () => {
  it('keeps the stored null and attaches the named gap; a scored dimension keeps its value and has none', () => {
    const why = decisionWhyFromRow(storedRow());
    const byKey = Object.fromEntries(why.scores.dimensions.map((d) => [d.key, d]));
    expect(byKey.budget_signal).toEqual({ key: 'budget_signal', label: 'Budget signal', value: null, source: 'none', gap: 'budget_signal:no_source', factors: [] });
    expect(byKey.budget_signal.value).not.toBe(0);
    expect(byKey.engagement).toMatchObject({ value: 62, source: 'delivery_engagements', gap: null });
    expect(byKey.engagement.factors).toEqual([{ factor: 'opened', label: 'Opened', points: 20 }]);
    expect(why.score_gaps).toEqual(['budget_signal:no_source']);
    expect(why.scores.available).toBe(true);
    expect(why.scores.computed_at).toBe('2026-09-15T06:00:00.000Z');
  });

  it('the summary is the STORED summary — never recomputed from the dimensions', () => {
    // Two scored dimensions average to 71; the stored summary is null because a
    // third has no source. A view that recomputed would say 71.
    expect(decisionWhyFromRow(storedRow()).scores.summary).toBeNull();
    // And a stored number is reported as stored, even when the dimensions disagree with it.
    expect(decisionWhyFromRow(storedRow({ scores: { ...(storedRow().scores as object), summary: 41 } })).scores.summary).toBe(41);
  });

  it('a Date computed_at from an in-memory row is rendered as ISO text', () => {
    const why = decisionWhyFromRow(storedRow({ scores: { ...(storedRow().scores as object), computed_at: new Date('2026-09-15T06:00:00Z') } }));
    expect(why.scores.computed_at).toBe('2026-09-15T06:00:00.000Z');
  });
});

describe('redaction is structural', () => {
  it('the rendered Why contains no @ for a subject whose address the test knows', () => {
    expect(KNOWN_EMAIL).toContain('@');
    const text = JSON.stringify(decisionWhyFromRow(storedRow()));
    expect(text).not.toContain('@');
    expect(text).not.toContain(KNOWN_EMAIL);
    // The lead's numeric id and the key are not part of the view either: the subject_ref is the reference.
    expect(text).not.toContain('"lead_id"');
    expect(text).not.toContain('idempotency_key');
  });
});

describe('loadDecisionRow', () => {
  it('is the primary-key read and nothing else; a missing row is null', async () => {
    findByPk.mockResolvedValue(storedRow());
    expect(await loadDecisionRow(ID)).toBe(await findByPk.mock.results[0].value);
    expect(findByPk).toHaveBeenCalledWith(ID);
    findByPk.mockResolvedValue(null);
    expect(await loadDecisionRow('nope')).toBeNull();
  });
});

describe('the list projection', () => {
  it('names real columns only, none of the JSONB records, and not the lead id', () => {
    const columns = new Set(Object.keys(storedRow()));
    for (const a of DECISION_LIST_ATTRIBUTES) expect(columns.has(a)).toBe(true);
    for (const blob of ['candidates', 'suppressed', 'deferred_actions', 'eligibility', 'scores', 'contact_evidence', 'selected_content', 'execution_receipt', 'lead_id', 'enrollment_id', 'idempotency_key']) {
      expect(DECISION_LIST_ATTRIBUTES).not.toContain(blob);
    }
    for (const needed of ['id', 'tenant_id', 'brand_id', 'subject_ref', 'mode', 'selected_action', 'reason', 'created_at']) {
      expect(DECISION_LIST_ATTRIBUTES).toContain(needed);
    }
  });
});

/* ── stored evidence only: a source scan ──────────────────────────────────── */

const SERVICE = path.join(__dirname, '..', 'decisionWhyService.ts');
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * Modules that would let the Why recompute or look something up: the scorer,
 * the freshness gate, the contact policy, the strategies, the loader, the
 * pipeline, the content resolver, the offer gate, the subject resolver, any
 * Explorer module, and the lead model.
 */
const RECOMPUTE_IMPORTS = ['./scoring', './governor', './decision', './strategies', './lifecycle', './journeyContent', './offerEligibility', './subjectResolver', './profileService', './decisionService', '../explorerGrowth', '../../models/Lead', './classificationService'];
const RECOMPUTE_CALLS = /\b(scoreSubject|scoreVector|evaluateFreshness|resolveContactEvidence|decideForSubject|loadDecisionContext|loadLearnerFacts|generateWithReport|Lead\.find\w*|findAll|findOne)\b/;

function storedEvidenceOnlyOffences(src: string): string[] {
  const code = stripComments(src);
  const out: string[] = [];
  for (const spec of importsOf(code)) {
    if (RECOMPUTE_IMPORTS.some((p) => spec === p || spec.startsWith(`${p}/`))) out.push(`import ${spec}`);
  }
  const call = RECOMPUTE_CALLS.exec(code);
  if (call) out.push(`call ${call[1]}`);
  return out;
}

describe('stored evidence only', () => {
  const src = fs.readFileSync(SERVICE, 'utf8');

  it('imports the model and Phase 2\'s types, and nothing that could recompute or look up', () => {
    expect(importsOf(stripComments(src)).sort()).toEqual(['../../models', '../../models/GrowthJourneyDecision', './classificationWhyService'].sort());
    // The two that are not the model are TYPE imports: nothing of Phase 2's runs here.
    expect(src).toMatch(/^import type \{[^}]*\} from '\.\.\/\.\.\/models\/GrowthJourneyDecision';$/m);
    expect(src).toMatch(/^import type \{[^}]*\} from '\.\/classificationWhyService';$/m);
    expect(storedEvidenceOnlyOffences(src)).toEqual([]);
  });

  it('the scan catches a recompute — the plan\'s control', () => {
    const recompute = src.replace(
      "import { GrowthJourneyDecision } from '../../models';",
      "import { GrowthJourneyDecision } from '../../models';\nimport { scoreSubject } from './scoring/scoreVector';",
    ).replace('summary: typeof scores?.summary', 'summary: scoreSubject(row).summary ?? typeof scores?.summary');
    expect(recompute).not.toBe(src);
    expect(storedEvidenceOnlyOffences(recompute)).toEqual(['import ./scoring/scoreVector', 'call scoreSubject']);
    // And a lead lookup, by import or by call.
    expect(storedEvidenceOnlyOffences("import { Lead } from '../../models/Lead';\nconst l = await Lead.findByPk(row.lead_id);")).toEqual(['import ../../models/Lead', 'call Lead.findByPk']);
    expect(storedEvidenceOnlyOffences("import { evaluateFreshness } from '../explorerGrowth/governor/freshness';")).toEqual(['import ../explorerGrowth/governor/freshness', 'call evaluateFreshness']);
  });
});
