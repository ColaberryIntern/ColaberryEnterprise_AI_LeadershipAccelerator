import * as fs from 'fs';
import * as path from 'path';
import { SCORE_DIMENSIONS, dimensionsFor, sourcedKeys } from '../scoring/dimensions';
import { scoreSubject, type SubjectSignals } from '../scoring/scoreVector';

/**
 * T306 — the score vector.
 *
 * The property under test throughout: a dimension nobody can measure is `null`
 * and appears in `gaps`, a dimension that WAS measured carries visible
 * components, and the two are never confused. §5.3 forbids collapsing the
 * dimensions into an unexplained score, so the summary exists only when every
 * dimension that has a source produced a value.
 */

const AT = new Date('2026-09-14T12:00:00Z');

const signals = (over: Partial<SubjectSignals> = {}): SubjectSignals => ({
  lead: null,
  observed: null,
  computed_at: AT,
  ...over,
});

/** A lead with every sourced input answered, for both programmes. */
const fullLead = {
  industry: 'Manufacturing',
  annual_revenue: 25_000_000,
  employee_count: 400,
  company_size: 'enterprise',
  technology_stack: 'salesforce,snowflake',
  evaluating_90_days: true,
  maturity_score: 6,
  estimated_roi: 250_000,
  departments_impacted: 'operations,finance',
  selected_systems: 'crm,warehouse',
};

describe('the registry declares §5.3 and §5.4 by name', () => {
  it('§5.3 names exactly these ten dimensions, both directions', () => {
    expect(dimensionsFor('business').map((d) => d.key).sort()).toEqual([
      'authority_stakeholder_readiness',
      'delivery_feasibility',
      'fit',
      'friction_risk',
      'intent',
      'problem_clarity',
      'qualification_completeness',
      'relationship_engagement',
      'solution_alignment',
      'urgency',
    ]);
  });

  it('§5.4 names exactly these nine dimensions, both directions', () => {
    expect(dimensionsFor('consulting').map((d) => d.key).sort()).toEqual([
      'budget_payment_readiness',
      'concept_engagement',
      'integration_security_complexity',
      'problem_clarity',
      'qualification_completeness',
      'solution_fit',
      'stakeholder_readiness',
      'technical_feasibility',
      'urgency',
    ]);
  });

  it('THE COUNT OF SOURCELESS DIMENSIONS IS PINNED: 7 of 10 and 6 of 9', () => {
    // This is the number the Phase 3 discovery found, and pinning it is what
    // makes a later invented source visible: a dimension that quietly acquires a
    // "source" nobody built fails here rather than shipping a number.
    const business = dimensionsFor('business');
    const consulting = dimensionsFor('consulting');
    expect([business.length, business.filter((d) => d.source === 'none').length]).toEqual([10, 7]);
    expect([consulting.length, consulting.filter((d) => d.source === 'none').length]).toEqual([9, 6]);
    expect(sourcedKeys('business').sort()).toEqual(['fit', 'intent', 'urgency']);
    expect(sourcedKeys('consulting').sort()).toEqual(['solution_fit', 'technical_feasibility', 'urgency']);
  });

  it('every sourceless dimension says WHY, naming the nearest candidate', () => {
    // "No source" invites somebody to invent one. Each reason has to be long
    // enough to name what the nearest candidate actually measures.
    for (const d of SCORE_DIMENSIONS.filter((x) => x.source === 'none')) {
      expect({ key: d.key, hasReason: (d.reason ?? '').length > 40 }).toEqual({ key: d.key, hasReason: true });
    }
  });

  it('a sourceless dimension carries no weight, and a sourced one does', () => {
    for (const d of SCORE_DIMENSIONS) {
      expect({ key: d.key, weighted: d.weight > 0 }).toEqual({ key: d.key, weighted: d.source !== 'none' });
    }
  });

  it('the three shared names are ONE entry each, not two', () => {
    // §5.3 and §5.4 use the same words for these three. Duplicating them would
    // let the two copies drift; using one entry for adjacent-but-differently-named
    // ideas would invent a vocabulary neither section uses.
    const shared = SCORE_DIMENSIONS.filter((d) => d.programs.length === 2).map((d) => d.key).sort();
    expect(shared).toEqual(['problem_clarity', 'qualification_completeness', 'urgency']);
    expect(SCORE_DIMENSIONS).toHaveLength(16);
  });
});

describe('a sourceless dimension is null and named, never zero', () => {
  it('scores null and appears in gaps with :no_source', () => {
    const v = scoreSubject(signals({ lead: fullLead }), 'business');
    const sourceless = v.dimensions.filter((d) => d.source === 'none' && d.key !== 'recorded_signals');
    expect(sourceless).toHaveLength(7);
    for (const d of sourceless) {
      expect({ key: d.key, value: d.value, factors: d.factors.length }).toEqual({
        key: d.key,
        value: null,
        factors: 0,
      });
      expect(v.gaps).toContain(`${d.key}:no_source`);
    }
  });

  it('never produces a number for one, for either programme', () => {
    for (const program of ['business', 'consulting'] as const) {
      const v = scoreSubject(signals({ lead: fullLead, observed: { page_events: 9, behavioral_signals: 3 } }), program);
      for (const d of v.dimensions) {
        if (d.source === 'none') expect(d.value).toBeNull();
      }
    }
  });
});

describe('a measured zero and an unmeasured null are different answers', () => {
  it('signals that were READ and were empty score 0, not null', () => {
    // The sharpest distinction in this file: we looked, and there was nothing.
    // That is a measurement.
    //
    // The lead declares no systems either, deliberately: a declared system adds
    // an intent factor (§7.1 — declared intent outranks observed), so leaving one
    // in would have made this case about the declaration rather than about the
    // measured zero. That bump has its own case below.
    const v = scoreSubject(
      signals({
        lead: { industry: 'Manufacturing', evaluating_90_days: true },
        observed: { page_events: 0, behavioral_signals: 0 },
      }),
      'business',
    );
    const intent = v.dimensions.find((d) => d.key === 'intent');
    expect(intent?.value).toBe(0);
    expect(intent?.factors.map((f) => f.factor)).toEqual(['page_events', 'behavioral_signals']);
    expect(v.gaps).not.toContain('intent:no_value_for_subject');
  });

  it('a declared system lifts intent above an observed zero, and says which', () => {
    const v = scoreSubject(
      signals({ lead: fullLead, observed: { page_events: 0, behavioral_signals: 0 } }),
      'business',
    );
    const intent = v.dimensions.find((d) => d.key === 'intent');
    expect(intent?.value).toBe(10);
    expect(intent?.factors.find((f) => f.factor === 'selected_systems')?.detail).toContain(
      'declared intent',
    );
  });

  it('signals that were NOT read score null and name the gap', () => {
    const v = scoreSubject(signals({ lead: fullLead, observed: null }), 'business');
    expect(v.dimensions.find((d) => d.key === 'intent')?.value).toBeNull();
    expect(v.gaps).toContain('intent:no_value_for_subject');
  });

  it('an unanswered declared timeline is null, not "not urgent"', () => {
    const v = scoreSubject(
      signals({ lead: { ...fullLead, evaluating_90_days: null }, observed: { page_events: 1, behavioral_signals: 0 } }),
      'business',
    );
    expect(v.dimensions.find((d) => d.key === 'urgency')?.value).toBeNull();
    expect(v.gaps).toContain('urgency:no_value_for_subject');
  });

  it('an answered "no" IS a measurement, and scores low rather than null', () => {
    const v = scoreSubject(
      signals({ lead: { ...fullLead, evaluating_90_days: false }, observed: { page_events: 1, behavioral_signals: 0 } }),
      'business',
    );
    const urgency = v.dimensions.find((d) => d.key === 'urgency');
    expect(urgency?.value).toBe(10);
    expect(urgency?.factors[0].label).toBe('Not evaluating within 90 days');
  });

  it('a lead row that is absent entirely leaves fit null', () => {
    const v = scoreSubject(signals({ lead: null, observed: { page_events: 2, behavioral_signals: 1 } }), 'business');
    expect(v.dimensions.find((d) => d.key === 'fit')?.value).toBeNull();
  });

  it('a lead row with none of the fit fields recorded is null, not 0', () => {
    const v = scoreSubject(signals({ lead: {}, observed: null }), 'business');
    expect(v.dimensions.find((d) => d.key === 'fit')?.value).toBeNull();
  });
});

describe('every scored dimension shows its components', () => {
  it('each non-null dimension carries at least one factor with a readable label', () => {
    const v = scoreSubject(
      signals({ lead: fullLead, observed: { page_events: 4, behavioral_signals: 2 } }),
      'business',
    );
    const scored = v.dimensions.filter((d) => d.value !== null);
    expect(scored.length).toBeGreaterThanOrEqual(3);
    for (const d of scored) {
      expect(d.factors.length).toBeGreaterThan(0);
      for (const f of d.factors) {
        expect(f.label.length).toBeGreaterThan(8);
        expect(f.label).not.toMatch(/^[a-z_]+$/); // a key is not a label
        expect(typeof f.points).toBe('number');
      }
    }
  });

  it('names the field behind each factor, so a number can be traced', () => {
    const v = scoreSubject(signals({ lead: fullLead, observed: null }), 'consulting');
    const fit = v.dimensions.find((d) => d.key === 'solution_fit');
    expect(fit?.factors.map((f) => f.factor).sort()).toEqual(['selected_systems', 'technology_stack']);
  });
});

describe('the summary exists only when every sourced dimension produced a value', () => {
  it('all three answered gives a weighted number', () => {
    const v = scoreSubject(
      signals({ lead: fullLead, observed: { page_events: 10, behavioral_signals: 5 } }),
      'business',
    );
    expect(v.summary).not.toBeNull();
    expect(v.summary).toBeGreaterThan(0);
    expect(v.summary).toBeLessThanOrEqual(100);
  });

  it('ONE missing sourced dimension makes the summary null, not partial', () => {
    // A partial summary is a number whose meaning changes per subject.
    const v = scoreSubject(signals({ lead: fullLead, observed: null }), 'business');
    expect(v.summary).toBeNull();
  });

  it('the sourceless seven never suppress the summary on their own', () => {
    // They are not "contributing" dimensions: if they suppressed it, the summary
    // could never exist at all and the field would be decorative.
    const v = scoreSubject(
      signals({ lead: fullLead, observed: { page_events: 1, behavioral_signals: 1 } }),
      'business',
    );
    expect(v.gaps.filter((g) => g.endsWith(':no_source'))).toHaveLength(7);
    expect(v.summary).not.toBeNull();
  });

  it('is the weighted mean of the sourced dimensions, computed by hand here', () => {
    const v = scoreSubject(
      signals({
        lead: { evaluating_90_days: true, industry: 'Manufacturing' },
        observed: { page_events: 0, behavioral_signals: 0 },
      }),
      'business',
    );
    // fit = industry only = 20 (weight .4), intent = 0 (weight .3), urgency = 100 (weight .3)
    // (20*.4 + 0*.3 + 100*.3) / 1.0 = 38
    expect(v.dimensions.find((d) => d.key === 'fit')?.value).toBe(20);
    expect(v.dimensions.find((d) => d.key === 'intent')?.value).toBe(0);
    expect(v.dimensions.find((d) => d.key === 'urgency')?.value).toBe(100);
    expect(v.summary).toBe(38);
  });
});

describe('the three repo scores are recorded, never scored', () => {
  it('appear as zero-point factors on a dimension that cannot score', () => {
    const v = scoreSubject(
      signals({
        lead: fullLead,
        observed: null,
        labels: { lead_temperature: 'hot', opportunity_score: 87, recommended_offer: 'ai_consulting' },
      }),
      'business',
    );
    const recorded = v.dimensions.find((d) => d.key === 'recorded_signals');
    expect(recorded?.value).toBeNull();
    expect(recorded?.source).toBe('none');
    expect(recorded?.factors.map((f) => f.factor).sort()).toEqual([
      'lead_temperature',
      'opportunity_score',
      'recommended_offer',
    ]);
    for (const f of recorded?.factors ?? []) expect(f.points).toBe(0);
  });

  it('move no dimension value and no summary', () => {
    const withLabels = scoreSubject(
      signals({
        lead: fullLead,
        observed: { page_events: 2, behavioral_signals: 1 },
        labels: { lead_temperature: 'hot', opportunity_score: 99 },
      }),
      'business',
    );
    const without = scoreSubject(
      signals({ lead: fullLead, observed: { page_events: 2, behavioral_signals: 1 } }),
      'business',
    );
    expect(withLabels.summary).toBe(without.summary);
    for (const key of sourcedKeys('business')) {
      expect(withLabels.dimensions.find((d) => d.key === key)?.value).toBe(
        without.dimensions.find((d) => d.key === key)?.value,
      );
    }
  });

  it('an opportunity score of 0 is still recorded, not dropped as falsy', () => {
    const v = scoreSubject(signals({ lead: fullLead, labels: { opportunity_score: 0 } }), 'business');
    const recorded = v.dimensions.find((d) => d.key === 'recorded_signals');
    expect(recorded?.factors.map((f) => f.factor)).toEqual(['opportunity_score']);
  });
});

describe('a learner journey does not score here', () => {
  it('answers available:false and names where learner scores live', () => {
    // CPN and Colaberry Training score through Explorer's own three learner
    // scores. A learner dimension set here would be a second learner scorer.
    const v = scoreSubject(signals({ lead: fullLead }), 'learner');
    expect(v).toEqual({
      dimensions: [],
      summary: null,
      gaps: ['no_dimensions_for_program:learner'],
      available: false,
      computed_at: AT,
    });
  });
});

describe('the scorer defaults nothing to zero, and the file says so', () => {
  /** Comments removed: prose naming the forbidden shape is not the shape. */
  const codeOf = (file: string): string =>
    fs
      .readFileSync(path.join(__dirname, '..', 'scoring', file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  const ZERO_DEFAULT = [/\?\?\s*0\b/, /\|\|\s*0\b/];

  it('flags a control line that defaults to zero, and passes prose that names it', () => {
    // The scan fired on this file's own doc comment first — the same shape T304's
    // cutoff rule hit. Code defaults nothing; a comment naming the forbidden
    // shape is the opposite of committing it.
    const control = 'const value = scored.value ?? 0;';
    expect(ZERO_DEFAULT.some((rx) => rx.test(control))).toBe(true);
    const prose = '// A test scans this file for `?? 0` and `|| 0`, because that is the mistake.';
    const stripped = prose.replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(ZERO_DEFAULT.some((rx) => rx.test(stripped))).toBe(false);
  });

  it('contains no `?? 0` and no `|| 0` in CODE', () => {
    // A dimension defaulted to 0 reads as "measured, and bad" — a false claim
    // about a subject nobody measured.
    const code = codeOf('scoreVector.ts');
    for (const rx of ZERO_DEFAULT) expect(code).not.toMatch(rx);
    // Non-vacuity: comment-stripping did not eat the file.
    expect(code).toContain('export function scoreSubject');
  });

  it('and neither does the registry', () => {
    const code = codeOf('dimensions.ts');
    for (const rx of ZERO_DEFAULT) expect(code).not.toMatch(rx);
    expect(code).toContain('SCORE_DIMENSIONS');
  });

  it('available is false when nothing at all could be measured', () => {
    const v = scoreSubject(signals(), 'business');
    expect(v.available).toBe(false);
    expect(v.summary).toBeNull();
    expect(v.dimensions.every((d) => d.value === null)).toBe(true);
  });
});
