/**
 * proposalGrounding — the grounding carries ONLY the allowed inputs (blueprint weights/rules/page budget, the
 * document's requirements + section plans, inserted artifacts, approved facts) and nothing else; the prompt text
 * tells the model those approved facts are its ONLY source, and falls back to the [PLACEHOLDER] instruction when none.
 */
import { buildGrounding, groundingToPromptText, groundingToBackingRefs } from '../proposalGrounding';
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

describe('proof grounding (references, personnel, case studies)', () => {
  const doc = { title: 'Past Performance', requirements: [], sections: [] };

  it('passes references, personnel, and case studies through buildGrounding', () => {
    const g = buildGrounding({
      document: doc,
      references: [{ client: 'City of Plano', scope: 'Permitting portal', contractValue: '$1.2M', dates: '2023-2025', contact: 'Jane Roe, 555-1212' }],
      personnel: [{ name: 'Ada Lovelace', role: 'Technical Lead', summary: '10y data engineering' }],
      caseStudies: [{ title: 'Asset Management Rebuild', industry: 'Municipal', year: 2024, capability: 'Platform modernization', metricLabel: 'Cycle time', metricValue: '-40%', metricVerified: true }],
    });
    expect(g.references).toHaveLength(1);
    expect(g.personnel?.[0].name).toBe('Ada Lovelace');
    expect(g.caseStudies?.[0].title).toBe('Asset Management Rebuild');
  });

  it('renders references as citable, named clients', () => {
    const g = buildGrounding({ document: doc, references: [{ client: 'City of Plano', scope: 'Permitting portal', contractValue: '$1.2M', dates: '2023-2025', contact: 'Jane Roe' }] });
    const text = groundingToPromptText(g);
    expect(text).toMatch(/you MAY name the client/);
    expect(text).toMatch(/City of Plano/);
    expect(text).toMatch(/value \$1\.2M/);
  });

  it('renders personnel as nameable and describable', () => {
    const g = buildGrounding({ document: doc, personnel: [{ name: 'Ada Lovelace', role: 'Technical Lead', summary: '10y data engineering' }] });
    const text = groundingToPromptText(g);
    expect(text).toMatch(/key personnel/i);
    expect(text).toMatch(/Ada Lovelace, Technical Lead: 10y data engineering/);
  });

  it('renders case studies as ANONYMIZED proof, labels metric verification, and forbids inventing a client', () => {
    const g = buildGrounding({ document: doc, caseStudies: [
      { title: 'Asset Rebuild', industry: 'Municipal', year: 2024, capability: 'Modernization', metricLabel: 'Cycle time', metricValue: '-40%', metricVerified: true },
      { title: 'Portal Launch', industry: 'State', year: 2023, metricLabel: 'Adoption', metricValue: '3x', metricVerified: false },
    ] });
    const text = groundingToPromptText(g);
    expect(text).toMatch(/ANONYMIZED/);
    expect(text).toMatch(/never assert or invent a real client name/);
    expect(text).toMatch(/Cycle time: -40% \(verified\)/);
    expect(text).toMatch(/Adoption: 3x \(reported\)/);
  });

  it('omits every proof block when none are supplied', () => {
    const text = groundingToPromptText(buildGrounding({ document: doc }));
    expect(text).not.toMatch(/past-performance references/i);
    expect(text).not.toMatch(/key personnel/i);
    expect(text).not.toMatch(/Case-study proof points/);
  });
});

describe('groundingToBackingRefs (the proof judge sees the same proof the drafter cites)', () => {
  const doc = { title: 'Past Performance', requirements: [], sections: [] };

  it('passes approved facts through verbatim as backing', () => {
    const g = buildGrounding({ document: doc, approvedFacts: ['SAM UEI: ABC123', 'ISO 9001 certified'] });
    expect(groundingToBackingRefs(g)).toEqual(['SAM UEI: ABC123', 'ISO 9001 certified']);
  });

  it('renders a reference as a named, citable past-performance line', () => {
    const g = buildGrounding({ document: doc, references: [{ client: 'City of Plano', scope: 'Permitting portal', contractValue: '$1.2M', dates: '2023-2025', contact: 'Jane Roe' }] });
    const [line] = groundingToBackingRefs(g);
    expect(line).toBe('Past-performance reference: City of Plano - Permitting portal; value $1.2M; 2023-2025');
  });

  it('renders a case study ANONYMIZED with its verified/reported metric label and no client field', () => {
    const g = buildGrounding({ document: doc, caseStudies: [
      { title: 'Asset Rebuild', industry: 'Municipal', year: 2024, capability: 'Modernization', metricLabel: 'Cycle time', metricValue: '-40%', metricVerified: true },
      { title: 'Portal Launch', industry: 'State', year: 2023, metricLabel: 'Adoption', metricValue: '3x', metricVerified: false },
    ] });
    const refs = groundingToBackingRefs(g);
    expect(refs[0]).toBe('Case study (anonymized): Asset Rebuild (Municipal, 2024) [Modernization], Cycle time: -40% (verified)');
    expect(refs[1]).toContain('Adoption: 3x (reported)');
  });

  it('renders key personnel as a nameable backing line', () => {
    const g = buildGrounding({ document: doc, personnel: [{ name: 'Ada Lovelace', role: 'Technical Lead', summary: '10y data engineering' }] });
    expect(groundingToBackingRefs(g)).toEqual(['Key personnel: Ada Lovelace, Technical Lead: 10y data engineering']);
  });

  it('is empty when there is no citable proof (so the judge is honestly told none exists)', () => {
    expect(groundingToBackingRefs(buildGrounding({ document: doc }))).toEqual([]);
  });

  it('orders proof facts first, then references, case studies, personnel', () => {
    const g = buildGrounding({
      document: doc,
      approvedFacts: ['F'],
      references: [{ client: 'R', scope: null, contractValue: null, dates: null, contact: null }],
      caseStudies: [{ title: 'C', industry: null, year: null, capability: null, metricLabel: null, metricValue: null, metricVerified: false }],
      personnel: [{ name: 'P', role: null, summary: null }],
    });
    const refs = groundingToBackingRefs(g);
    expect(refs[0]).toBe('F');
    expect(refs[1]).toMatch(/^Past-performance reference: R/);
    expect(refs[2]).toMatch(/^Case study \(anonymized\): C/);
    expect(refs[3]).toBe('Key personnel: P');
  });
});

describe('solicitation facts (the RFP\'s own facts the agent must assert, never ask for)', () => {
  const doc = { title: 'Compliance Matrix', requirements: [], sections: [] };

  it('passes solicitationFacts through buildGrounding', () => {
    const g = buildGrounding({ document: doc, solicitationFacts: ['Proposal submission due date: 2026-11-30', 'Issuing agency: Herriman City'] });
    expect(g.solicitationFacts).toEqual(['Proposal submission due date: 2026-11-30', 'Issuing agency: Herriman City']);
  });

  it('renders solicitation facts as authoritative and forbids placeholdering or asking for them', () => {
    const g = buildGrounding({ document: doc, solicitationFacts: ['Proposal submission due date: 2026-11-30'] });
    const text = groundingToPromptText(g);
    expect(text).toMatch(/Solicitation facts \(authoritative/);
    expect(text).toMatch(/NEVER insert a placeholder or raise a question for them/);
    expect(text).toMatch(/Proposal submission due date: 2026-11-30/);
  });

  it('omits the solicitation block entirely when none are supplied', () => {
    expect(groundingToPromptText(buildGrounding({ document: doc }))).not.toMatch(/Solicitation facts/);
  });

  it('carries a real requirement statement rather than the bare id (the grounding caller supplies the text)', () => {
    const g = buildGrounding({ document: { title: 'Technical', requirements: [{ canonicalReqId: 'REQ-004', statement: 'Proposals must be submitted no later than 5:00 p.m. MDT on November 30, 2026.' }], sections: [] } });
    const text = groundingToPromptText(g);
    expect(text).toMatch(/\[REQ-004\] Proposals must be submitted no later than 5:00 p\.m\. MDT/);
    expect(text).not.toMatch(/\[REQ-004\] REQ-004/);
  });
});
