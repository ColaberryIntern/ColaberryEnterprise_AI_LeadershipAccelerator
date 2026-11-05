/**
 * blueprintDiff — pure. The first blueprint (prev null) reports everything new; subsequent diffs report added /
 * removed / changed rules, flipped form dispositions and scoring changes.
 */
import { diffBlueprints } from '../blueprintDiff';
import type { ProposalBlueprint } from '../proposalBlueprintTypes';

const bp = (over: Partial<ProposalBlueprint> = {}): ProposalBlueprint => ({
  rules: [], forms: [], scoring: { basis: null, basisQuote: null, totalPoints: null, factors: [] },
  addenda: [], eliminationRisks: [], buyerType: null, droppedRuleCount: 0, sourceFiles: [], generatedAt: 'x', ...over,
});
const rule = (key: string, value: string) => ({ key, value, quote: 'q', sourceFile: 'f', severity: 'curable' as const });
const form = (key: string, disposition: 'required' | 'not_required' | 'needs_input' | 'at_award') => ({ key, label: key, disposition, timing: 'with_proposal' as const, severity: 'info' as const, triggerReason: 't', citation: 'c' });

describe('diffBlueprints', () => {
  it('first blueprint (prev null) reports every rule as added', () => {
    const d = diffBlueprints(null, bp({ rules: [rule('page_limit', '20'), rule('min_font', '12pt')] }));
    expect(d.rulesAdded.sort()).toEqual(['min_font', 'page_limit']);
    expect(d.summary.some((s) => /First blueprint/.test(s))).toBe(true);
  });

  it('detects added, removed and changed rules', () => {
    const prev = bp({ rules: [rule('page_limit', '20'), rule('copies', '3')] });
    const next = bp({ rules: [rule('page_limit', '25'), rule('min_font', '12pt')] });
    const d = diffBlueprints(prev, next);
    expect(d.rulesAdded).toEqual(['min_font']);
    expect(d.rulesRemoved).toEqual(['copies']);
    expect(d.rulesChanged).toEqual([{ key: 'page_limit', from: '20|curable', to: '25|curable' }]);
  });

  it('detects a flipped form disposition and a scoring change', () => {
    const prev = bp({ forms: [form('hsp', 'needs_input')], scoring: { basis: null, basisQuote: null, totalPoints: null, factors: [] } });
    const next = bp({ forms: [form('hsp', 'required')], scoring: { basis: 'best_value', basisQuote: 'q', totalPoints: 100, factors: [] } });
    const d = diffBlueprints(prev, next);
    expect(d.formsChanged).toEqual([{ key: 'hsp', from: 'needs_input', to: 'required' }]);
    expect(d.scoringChanged).toBe(true);
  });

  it('reports no changes when identical', () => {
    const same = bp({ rules: [rule('page_limit', '20')] });
    expect(diffBlueprints(same, bp({ rules: [rule('page_limit', '20')] })).summary).toEqual(['No changes from the previous blueprint.']);
  });
});
