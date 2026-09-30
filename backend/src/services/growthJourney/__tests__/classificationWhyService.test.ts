/**
 * T229 — the Why service: the trace parser and the bounded override chain.
 */
const findByPk = jest.fn();
jest.mock('../../../models', () => ({ GrowthJourneyClassification: { findByPk: (...a: unknown[]) => findByPk(...a) } }));

import { loadWhyRows, parseTrace, whyAbsent, whyFromRow } from '../classificationWhyService';
import { STEP_ORDER } from '../classification/types';

beforeEach(() => findByPk.mockReset());

describe('parseTrace', () => {
  it('yields one entry per §7.1 step in order; a step with no entry is unrecorded', () => {
    const steps = parseTrace(['trace:2:answered:path x', 'trace:7:skipped:no model wired', 'not a trace', 'trace:9:answered:bogus', 'trace:3:weird:outcome']);
    expect(steps.map((s) => s.name)).toEqual([...STEP_ORDER]);
    expect(steps[1]).toEqual({ step: 2, name: 'explicit_selection', outcome: 'answered', note: 'path x' });
    expect(steps[6]).toEqual({ step: 7, name: 'ai_fallback', outcome: 'skipped', note: 'no model wired' });
    expect(steps[0].outcome).toBe('unrecorded');
    expect(steps[2].outcome).toBe('unrecorded'); // an unknown outcome word is not parsed
  });

  it('an empty note is null', () => {
    expect(parseTrace(['trace:1:abstained:'])[0].note).toBeNull();
  });
});

describe('loadWhyRows', () => {
  const row = (id: string, override_of: string | null, brand_id = 'b-1') => ({ id, override_of, brand_id, tenant_id: 't-1' });

  it('walks the chain up through override_of, in order', async () => {
    findByPk.mockImplementation(async (id: string) => ({ 'c-3': row('c-3', 'c-2'), 'c-2': row('c-2', 'c-1'), 'c-1': row('c-1', null) } as Record<string, unknown>)[id] ?? null);
    const loaded = await loadWhyRows('c-3');
    expect(loaded?.chain.map((c) => c.id)).toEqual(['c-2', 'c-1']);
  });

  it('a cycle cannot loop forever', async () => {
    findByPk.mockImplementation(async (id: string) => ({ 'c-a': row('c-a', 'c-b'), 'c-b': row('c-b', 'c-a') } as Record<string, unknown>)[id] ?? null);
    const loaded = await loadWhyRows('c-a');
    expect(loaded?.chain.map((c) => c.id)).toEqual(['c-b']);
    expect(findByPk.mock.calls.length).toBeLessThan(10);
  });

  it('stops at a brand boundary and at a dangling pointer', async () => {
    findByPk.mockImplementation(async (id: string) => ({ 'c-3': row('c-3', 'c-2'), 'c-2': row('c-2', 'c-1', 'b-other') } as Record<string, unknown>)[id] ?? null);
    expect((await loadWhyRows('c-3'))?.chain).toEqual([]);
    findByPk.mockImplementation(async (id: string) => (id === 'c-3' ? row('c-3', 'gone') : null));
    expect((await loadWhyRows('c-3'))?.chain).toEqual([]);
  });

  it('a missing row is null, and whyAbsent states it', async () => {
    expect(await loadWhyRows('nope')).toBeNull();
    expect(whyAbsent('nope')).toEqual({ status: 'absent', reason: 'not_found', classification_id: 'nope' });
  });
});

describe('whyFromRow', () => {
  it('separates the trace from the evidence and coerces the DECIMAL confidence', () => {
    const w = whyFromRow({
      id: 'c', tenant_id: 't', brand_id: 'b', subject_ref: 'lead:1', trigger: 'reply', brand_relationship: 'cpn', journey_program_slug: 'learner', primary_path: null,
      secondary_paths: [], intent: null, confidence: '0.400', evidence: ['step8:safe_default_nurture', 'trace:8:answered:no path; programme nurture applies'],
      source_step: 8, requires_human_review: false, status: 'proposed', locked: false, eligibility: null, referral_target_brand_id: null, ai_involved: false,
      model_version: null, ruleset_version: 'p2-v1', override_of: null, decided_by: null, created_at: new Date(0),
    } as never, []);
    expect(w.evidence).toEqual(['step8:safe_default_nurture']);
    expect(w.answer.confidence).toBe(0.4);
    expect(w.decided_by_step).toEqual({ step: 8, name: 'low_confidence_default' });
    expect(w.steps_considered[7]).toMatchObject({ outcome: 'answered' });
  });
});
