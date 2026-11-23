import { aggregateNeeds, groupNeeds, needsForViewer, isPricingNeed, needScope, withNeedScope } from '../aggregateNeeds';
import type { HumanNeed } from '../proposalReviewTypes';

const need = (over: Partial<HumanNeed> & Pick<HumanNeed, 'key' | 'kind'>): HumanNeed => ({
  ask: 'ask', why: 'why', format: 'fmt', blocking: 'score', usedIn: [], ...over,
});

describe('needScope / withNeedScope (global vs this-bid)', () => {
  it('records (references, key personnel) and company signatures are GLOBAL dossier assets', () => {
    expect(needScope(need({ key: 'ref:1', kind: 'record', recordType: 'reference' }))).toBe('global');
    expect(needScope(need({ key: 'person:1', kind: 'record', recordType: 'personnel' }))).toBe('global');
    expect(needScope(need({ key: 'sig:exhibitB', kind: 'signature', ask: 'Executed certification' }))).toBe('global');
  });
  it('a firm-level fact is GLOBAL; a solicitation-specific fact is LOCAL', () => {
    expect(needScope(need({ key: 'fact:security', kind: 'fact', ask: 'Describe your SSO and encryption / security posture.' }))).toBe('global');
    expect(needScope(need({ key: 'fact:sla', kind: 'fact', ask: 'What support SLA does the firm offer?' }))).toBe('global');
    expect(needScope(need({ key: 'fact:buildings', kind: 'fact', ask: 'How many buildings and facilities are covered?' }))).toBe('local');
    expect(needScope(need({ key: 'fact:users', kind: 'fact', ask: 'The expected number of employee users.' }))).toBe('local');
    expect(needScope(need({ key: 'fact:deadline', kind: 'fact', ask: 'The submission deadline and time zone.' }))).toBe('local');
  });
  it('a bare, unmatched fact defaults to LOCAL so the shared dossier is never polluted', () => {
    expect(needScope(need({ key: 'fact:misc', kind: 'fact', ask: 'Provide the thing.' }))).toBe('local');
  });
  it('decisions / settings / approvals / files are bid-specific (LOCAL)', () => {
    expect(needScope(need({ key: 'd', kind: 'decision', ask: 'Pick A or B' }))).toBe('local');
    expect(needScope(need({ key: 'g', kind: 'approval', ask: 'Gold go' }))).toBe('local');
  });
  it('withNeedScope stamps scope on every need and does not drop any', () => {
    const out = withNeedScope([need({ key: 'ref:1', kind: 'record', recordType: 'reference' }), need({ key: 'fact:buildings', kind: 'fact', ask: 'how many buildings' })]);
    expect(out.map((n) => n.scope)).toEqual(['global', 'local']);
    expect(out).toHaveLength(2);
  });
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
