import {
  suggestionConfidence, confidenceTone, freshnessOf, daysUntil, formatCentralDate, centralToday, quarterLabel,
  buildKpis, heatStep, matchesTone, demandSplit, possibleProofForGap, gapsByPursuit, fitStepHref,
} from '../ourServicesModel';
import { buildDecideCards } from '../DecideNowStrip';
import { buildLifecycleChart } from '../ServicesLifecycleDiagram';
import { emptySummary, intakeItem, summary, svc } from '../__fixtures__/summaryFixtures';

describe('suggestionConfidence: the suggestor score as a banded percentage', () => {
  it('agrees with the backend strength bands (strong >= 75, moderate 50-74, weak < 50)', () => {
    expect(suggestionConfidence(5)).toBe(75);          // category + 2 keywords = strong
    expect(suggestionConfidence(9)).toBe(95);
    expect(suggestionConfidence(40)).toBe(100);        // capped
    expect(suggestionConfidence(3)).toBe(50);          // category alone = moderate
    expect(suggestionConfidence(4)).toBe(62);
    expect(suggestionConfidence(2)).toBe(40);          // weak
    expect(suggestionConfidence(1)).toBe(20);
  });
  it('treats null, zero and garbage as 0, never a guess', () => {
    expect(suggestionConfidence(null)).toBe(0);
    expect(suggestionConfidence(0)).toBe(0);
    expect(suggestionConfidence(Number.NaN)).toBe(0);
  });
  it('tones at the documented edges', () => {
    expect([confidenceTone(75), confidenceTone(74), confidenceTone(50), confidenceTone(49)]).toEqual(['success', 'warning', 'warning', 'muted']);
  });
});

describe('dates are read in Central time', () => {
  it('a late-evening Central moment is still that Central day (UTC has already rolled over)', () => {
    expect(centralToday(new Date('2026-11-14T04:30:00Z'))).toBe('2026-11-13'); // 22:30 CST on the 13th
  });
  it('days left and the deadline label', () => {
    const now = new Date('2026-11-13T15:00:00Z');
    expect(daysUntil('2026-11-23', now)).toBe(10);
    expect(daysUntil('2026-11-13', now)).toBe(0);
    expect(formatCentralDate('2026-11-23')).toBe('Nov 23'); // not Nov 22: a calendar date never shifts
    expect(quarterLabel('2026-Q4')).toBe("Q4 '26");
  });
  it('freshness: this year green, last year amber, older or none red', () => {
    expect([freshnessOf(2026, 2026), freshnessOf(2025, 2026), freshnessOf(2023, 2026), freshnessOf(null, 2026)]).toEqual(['fresh', 'recent', 'stale', 'none']);
  });
});

describe('buildKpis', () => {
  it('counts distinct linked case studies by source and ignores retired services', () => {
    const k = buildKpis(summary({ services: [svc(), svc({ id: 'svc-r', status: 'retired', caseStudies: [{ ...svc().caseStudies[0], id: 'cs-retired' }] })] }));
    expect(k).toMatchObject({ active: 1, growth: 0, linkedCaseStudies: 2, linkedInside: 1, linkedOutside: 1, proven: 1, provenPct: 100, avgScore: 75, blocked: 1 });
  });
  it('an empty catalog has no percentage and no average (null, not 0)', () => {
    const k = buildKpis(emptySummary());
    expect(k.provenPct).toBeNull();
    expect(k.avgScore).toBeNull();
    expect(k.linkedCaseStudies).toBe(0);
  });
});

describe('small rules', () => {
  it('heat steps are relative to the busiest cell', () => {
    expect([heatStep(0, 4), heatStep(1, 4), heatStep(2, 4), heatStep(3, 4), heatStep(4, 4)]).toEqual([0, 1, 2, 3, 4]);
  });
  it('open-match tone is relative, and unknown is muted', () => {
    expect([matchesTone(9, 9), matchesTone(4, 9), matchesTone(1, 9), matchesTone(null, 9)]).toEqual(['danger', 'warning', 'muted', 'muted']);
  });
  it('demand split is the median of known matches, at least 1', () => {
    expect(demandSplit([svc({ openOpportunityMatches: 2 }), svc({ openOpportunityMatches: 9 }), svc({ openOpportunityMatches: null })])).toBe(5.5);
    expect(demandSplit([svc({ openOpportunityMatches: 0 })])).toBe(1);
  });
  it('possible proof is keyword overlap with Intake, strongest first', () => {
    const hits = possibleProofForGap('Performance Monitoring and Alerting', [intakeItem(), intakeItem({ id: 'x', title: 'Unrelated', keywords: ['payroll'] })]);
    expect(hits.map((h) => h.item.id)).toEqual(['cs-9']);
    expect(hits[0].matched.sort()).toEqual(['alerting', 'monitoring']);
    expect(possibleProofForGap('and the', [intakeItem()])).toEqual([]);
  });
  it('gaps group by pursuit and re-assess opens that pursuit\'s Fit step', () => {
    expect(gapsByPursuit(summary().decideNow.openFitGaps.items)).toHaveLength(1);
    expect(fitStepHref('op 1')).toBe('/admin/gov-qualification?gws=op%201&tab=fit');
  });
});

describe('buildDecideCards: urgency order and honest unknowns', () => {
  const now = new Date('2026-11-13T15:00:00Z');
  it('blocked first, then the proposal deadline, then demand, then nothing-to-decide cards', () => {
    const cards = buildDecideCards(summary(), now);
    expect(cards.map((c) => c.key)).toEqual(['blocked', 'gaps', 'demand', 'stale']);
    expect(cards[1].title).toBe('Pursuit One: 1 gap, 10 days left');
    expect(cards[1].when).toBe('Before Nov 23 (Central)');
  });
  it('a null count reads as not available, never as 0', () => {
    const s = summary();
    s.decideNow.demandWithoutProof.count = null;
    s.decideNow.openFitGaps = { count: null, items: [] };
    const cards = buildDecideCards(s, now);
    expect(cards.find((c) => c.key === 'demand')?.title).toMatch(/not available/);
    expect(cards.find((c) => c.key === 'gaps')?.title).toMatch(/not available/);
  });
});

describe('buildLifecycleChart', () => {
  it('builds class definitions from resolved tokens only', () => {
    const chart = buildLifecycleChart((n) => (n === '--text-strong' ? '#111111' : n === '--blue-50' || n === '--chart-1' ? '#EEEEEE' : ''));
    expect(chart).toContain('flowchart LR');
    expect(chart).toContain('classDef inside fill:#EEEEEE,stroke:#EEEEEE,color:#111111');
    expect(chart).not.toContain('classDef gate'); // unresolved tokens drop the class instead of emitting junk
  });
});
