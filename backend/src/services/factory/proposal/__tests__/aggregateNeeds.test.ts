import { aggregateNeeds, groupNeeds, needsForViewer, isPricingNeed } from '../aggregateNeeds';
import type { HumanNeed } from '../proposalReviewTypes';

const need = (over: Partial<HumanNeed> & Pick<HumanNeed, 'key' | 'kind'>): HumanNeed => ({
  ask: 'ask', why: 'why', format: 'fmt', blocking: 'score', usedIn: [], ...over,
});

describe('aggregateNeeds', () => {
  it('dedupes by key and merges usedIn, with fatal winning', () => {
    const out = aggregateNeeds([
      need({ key: 'fact:duns', kind: 'fact', usedIn: [{ docKey: 'cover' }], blocking: 'score' }),
      need({ key: 'fact:duns', kind: 'fact', usedIn: [{ docKey: 'past' }], blocking: 'fatal' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].blocking).toBe('fatal');
    expect(out[0].usedIn.map((u) => u.docKey).sort()).toEqual(['cover', 'past']);
  });

  it('sorts fatal first, then by how many documents each unblocks, then by key', () => {
    const out = aggregateNeeds([
      need({ key: 'b', kind: 'fact', blocking: 'score', usedIn: [{ docKey: 'd1' }] }),
      need({ key: 'a', kind: 'fact', blocking: 'score', usedIn: [{ docKey: 'd1' }, { docKey: 'd2' }] }),
      need({ key: 'fatal1', kind: 'file', blocking: 'fatal', usedIn: [{ docKey: 'd1' }] }),
    ]);
    expect(out.map((n) => n.key)).toEqual(['fatal1', 'a', 'b']); // fatal first; then a (2 docs) before b (1 doc)
  });

  it('skips empty/invalid entries', () => {
    expect(aggregateNeeds([null, undefined, need({ key: '', kind: 'fact' })])).toEqual([]);
  });
});

describe('groupNeeds', () => {
  it('splits blocking-export from holding-score', () => {
    const g = groupNeeds(aggregateNeeds([
      need({ key: 'a', kind: 'fact', blocking: 'fatal' }),
      need({ key: 'b', kind: 'fact', blocking: 'score' }),
    ]));
    expect(g.blockingExport.map((n) => n.key)).toEqual(['a']);
    expect(g.holdingScore.map((n) => n.key)).toEqual(['b']);
  });
});

describe('needsForViewer (intern no-leak rail)', () => {
  it('drops pricing needs when pricing is not included', () => {
    const list = [
      need({ key: 'file:pricing_proposal', kind: 'file' }),
      need({ key: 'fact:years', kind: 'fact' }),
    ];
    expect(needsForViewer(list, { includePricing: false, canApprove: true }).map((n) => n.key)).toEqual(['fact:years']);
    expect(needsForViewer(list, { includePricing: true, canApprove: true })).toHaveLength(2);
  });

  it('drops approval needs the viewer cannot give', () => {
    const list = [need({ key: 'approval:gold:package', kind: 'approval' }), need({ key: 'fact:x', kind: 'fact' })];
    expect(needsForViewer(list, { includePricing: true, canApprove: false }).map((n) => n.key)).toEqual(['fact:x']);
    expect(needsForViewer(list, { includePricing: true, canApprove: true })).toHaveLength(2);
  });

  it('isPricingNeed matches price/pricing/cost keys and asks', () => {
    expect(isPricingNeed(need({ key: 'file:pricing_proposal', kind: 'file' }))).toBe(true);
    expect(isPricingNeed(need({ key: 'fact:years', kind: 'fact', ask: 'Years in business?' }))).toBe(false);
  });
});
