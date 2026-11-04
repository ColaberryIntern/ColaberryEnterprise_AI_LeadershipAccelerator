/**
 * proposalGrounding — the grounding carries ONLY the allowed inputs (blueprint weights/rules/page budget, the
 * document's requirements + section plans, inserted artifacts, approved facts) and nothing else; the prompt text
 * tells the model those approved facts are its ONLY source, and falls back to the [PLACEHOLDER] instruction when none.
 */
import { buildGrounding, groundingToPromptText } from '../proposalGrounding';
import type { ProposalBlueprint } from '../proposalBlueprintTypes';

const blueprint: ProposalBlueprint = {
  rules: [{ key: 'page_limit', value: '20', quote: 'q', sourceFile: 'f', severity: 'fatal' }, { key: 'min_font', value: '12pt', quote: 'q', sourceFile: 'f', severity: 'curable' }],
  forms: [], scoring: { basis: 'best_value', basisQuote: 'q', totalPoints: 100, factors: [{ label: 'Technical', points: 40, quote: 'q' }] },
  addenda: [], eliminationRisks: [], buyerType: 'state_agency', droppedRuleCount: 0, sourceFiles: ['f'], generatedAt: 'x',
};

describe('buildGrounding', () => {
  const g = buildGrounding({
    blueprint,
    document: { title: 'Technical Proposal', requirements: [{ canonicalReqId: 'R1', statement: 'Provide a search DB.' }], sections: [{ sectionKey: 'R1', heading: 'Search', plan: 'hot button → feature → benefit' }] },
    artifacts: [{ caption: 'Search results screen', requirementIds: ['R1'] }],
    approvedFacts: ['Years in business: 8'],
  });

  it('includes the page budget, scoring factors, rules, requirements, section plans, artifacts, and approved facts', () => {
    expect(g.pageBudget).toBe(20);
    expect(g.scoringFactors[0].label).toBe('Technical');
    expect(g.rules.map((r) => r.key)).toEqual(['page_limit', 'min_font']);
    expect(g.requirements[0].canonicalReqId).toBe('R1');
    expect(g.sections[0].plan).toMatch(/hot button/);
    expect(g.artifacts[0]).toMatch(/Search results screen/);
    expect(g.facts).toEqual(['Years in business: 8']);
  });

  it('prompt text names approved facts as the only source', () => {
    expect(groundingToPromptText(g)).toMatch(/ONLY specific facts you may assert/);
  });
  it('with no approved facts, the prompt text instructs a PLACEHOLDER instead of inventing', () => {
    const none = buildGrounding({ blueprint: null, document: { title: 't', requirements: [], sections: [] } });
    expect(none.facts).toEqual([]);
    expect(groundingToPromptText(none)).toMatch(/\[PLACEHOLDER/);
  });
});
