import * as fs from 'fs';
import * as path from 'path';
import { SCORE_DIMENSIONS, dimensionsFor, sourcedKeys } from '../scoring/dimensions';
import { scoreSubject } from '../scoring/scoreVector';
import { signals } from './fixtures/scoreFixtures';

/**
 * T306 — what the REGISTRY declares: the dimension names, the pinned counts, the
 * reasons behind every absence, the sources that exist but are deliberately not
 * wired, and the raw-text scans over both source files.
 *
 * Split from `scoreVector.test.ts` when that file passed CLAUDE.md's 500-line
 * hard ceiling. The other half tests what the scorer DOES with a subject.
 */

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

  it('THE COUNT OF SOURCELESS DIMENSIONS IS PINNED: 4 of 10 and 6 of 9', () => {
    // Seven of ten is the number the Phase 3 discovery found. T407 moved it to
    // FOUR, deliberately - the plan: "the pinned counts move 7-of-10 -> 4-of-10 in
    // that one file, deliberately, with the plan's sentence quoted; consulting
    // stays 6-of-9 - all three deferred dimensions are programs: ['business'] and
    // this task wires no consulting dimension". Pinning it is still what makes a
    // later invented source visible: a dimension that quietly acquires a "source"
    // nobody built fails here rather than shipping a number.
    const business = dimensionsFor('business');
    const consulting = dimensionsFor('consulting');
    expect([business.length, business.filter((d) => d.source === 'none').length]).toEqual([10, 4]);
    expect([consulting.length, consulting.filter((d) => d.source === 'none').length]).toEqual([9, 6]);
    expect(sourcedKeys('business').sort()).toEqual(['authority_stakeholder_readiness', 'fit', 'friction_risk', 'intent', 'relationship_engagement', 'urgency']);
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

  it('is DEEP frozen: an entry cannot be edited in place', () => {
    // `Object.freeze` on the array alone left every entry writable, and the
    // verifier set `SCORE_DIMENSIONS[0].source` at runtime. A registry whose
    // entries can be edited is a registry that can disagree with the test above.
    const first = SCORE_DIMENSIONS[0] as { source: string; programs: string[] };
    expect(() => {
      first.source = 'lead_firmographics';
    }).toThrow(TypeError);
    expect(() => first.programs.push('learner')).toThrow(TypeError);
    expect(SCORE_DIMENSIONS[0].source).toBe('none');
  });

  it('T407: the three sources that existed all along are wired, by the name of the thing that holds the data, and nothing is deferred any more', () => {
    const byKey = (k: string) => SCORE_DIMENSIONS.find((d) => d.key === k)!;
    expect(byKey('relationship_engagement').source).toBe('interaction_outcomes');
    expect(byKey('friction_risk').source).toBe('interaction_outcomes');
    expect(byKey('friction_risk').inverse).toBe(true);
    expect(byKey('authority_stakeholder_readiness').source).toBe('lead_title');
    for (const k of ['relationship_engagement', 'friction_risk', 'authority_stakeholder_readiness']) {
      expect(byKey(k).programs).toEqual(['business']);
      expect(byKey(k).weight).toBeGreaterThan(0);
      expect('deferred_source' in byKey(k)).toBe(false);
    }
    // The six business weights sum to 1, and the three consulting ones still do (urgency is shared).
    const sum = (program: 'business' | 'consulting') => Math.round(dimensionsFor(program).reduce((t, d) => t + d.weight, 0) * 100) / 100;
    expect(sum('business')).toBe(1);
    expect(sum('consulting')).toBe(1);
    // No entry anywhere carries a deferral note: the field itself is gone from the spec.
    expect(SCORE_DIMENSIONS.some((d) => 'deferred_source' in d)).toBe(false);
  });

  it('the AI-derived source is named as AI-derived, not as declared', () => {
    // `leads.maturity_score` is written as `recommendation.confidence * 100` by
    // the advisory sync. Calling it `declared_maturity` hid that; AI may rank,
    // but it may not be invisible.
    const feasibility = SCORE_DIMENSIONS.find((d) => d.key === 'technical_feasibility');
    expect(feasibility?.source).toBe('advisory_ai_maturity');
    const v = scoreSubject(signals({ lead: { maturity_score: 6, selected_systems: 'crm' } }), 'consulting');
    const factor = v.dimensions
      .find((d) => d.key === 'technical_feasibility')
      ?.factors.find((f) => f.factor === 'maturity_score');
    expect(factor?.label).toContain('Advisory AI maturity');
    expect(factor?.detail).toContain('recommendation.confidence');
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
});
