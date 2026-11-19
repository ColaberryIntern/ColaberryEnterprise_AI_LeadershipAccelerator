import { groupTenantNeeds, type TenantNeed } from '../tenantNeeds';

function need(partial: Partial<TenantNeed> & { key: string; ask: string }): TenantNeed {
  return {
    kind: 'fact', why: '', usedIn: [{ docKey: 'd', sectionKey: 's' }], format: 'text', blocking: 'score',
    projects: [], ...partial,
  } as TenantNeed;
}

describe('groupTenantNeeds', () => {
  it('collapses near-duplicate past-performance needs into one card, split by subject', () => {
    const needs: TenantNeed[] = [
      need({ key: 'fact:project_name_1', ask: 'project name 1', subject: 'reporting', projects: [{ projectId: 'A', projectName: 'Reporting Bid' }, { projectId: 'B', projectName: 'BI Bid' }] }),
      need({ key: 'fact:project_name_2', ask: 'project name 2', subject: 'reporting', projects: [{ projectId: 'A', projectName: 'Reporting Bid' }] }),
      need({ key: 'fact:specific_project_names', ask: 'What are the specific project names?', subject: 'reporting', projects: [{ projectId: 'B', projectName: 'BI Bid' }] }),
      need({ key: 'reference:slot1', kind: 'record', recordType: 'reference', ask: 'Add a past-performance reference', subject: 'recruiting', projects: [{ projectId: 'C', projectName: 'Recruiting Bid' }] }),
    ];
    const cards = groupTenantNeeds(needs);
    const pp = cards.filter((c) => c.groupSlug === 'past_performance');
    expect(pp).toHaveLength(2); // reporting slot + recruiting slot, NOT interchangeable

    const reporting = pp.find((c) => c.subject === 'reporting')!;
    expect(reporting.bidCount).toBe(2); // union of A, B across the three collapsed needs
    expect(reporting.needKeys).toHaveLength(3);
    expect(reporting.concepts).toHaveLength(1); // all one concept
    expect(reporting.concepts[0].conceptId).toBe('past_performance');

    const recruiting = pp.find((c) => c.subject === 'recruiting')!;
    expect(recruiting.bidCount).toBe(1);
    expect(recruiting.groupKind).toBe('reference');
  });

  it('groups solicitation facts into one card with distinct concepts', () => {
    const needs: TenantNeed[] = [
      need({ key: 'fact:due_date', ask: 'What is the due date for the submission?', projects: [{ projectId: 'A', projectName: 'A' }, { projectId: 'B', projectName: 'B' }, { projectId: 'C', projectName: 'C' }] }),
      need({ key: 'fact:client', ask: 'client name', projects: [{ projectId: 'A', projectName: 'A' }] }),
      need({ key: 'fact:contact', ask: 'contact details', projects: [{ projectId: 'A', projectName: 'A' }] }),
    ];
    const cards = groupTenantNeeds(needs);
    const sol = cards.find((c) => c.groupSlug === 'solicitation')!;
    expect(sol).toBeTruthy();
    expect(sol.subject).toBe('general');
    expect(sol.bidCount).toBe(3); // union A,B,C
    const conceptIds = sol.concepts.map((c) => c.conceptId).sort();
    expect(conceptIds).toEqual(['client', 'contact', 'due_date']);
  });

  it('sorts fatal first, then by bid count', () => {
    const needs: TenantNeed[] = [
      need({ key: 'fact:pricing', ask: 'labor rate card', blocking: 'score', projects: [{ projectId: 'A', projectName: 'A' }] }),
      need({ key: 'reference:slot1', kind: 'record', recordType: 'reference', ask: 'Add a reference', blocking: 'fatal', subject: 'general', projects: [{ projectId: 'A', projectName: 'A' }] }),
    ];
    const cards = groupTenantNeeds(needs);
    expect(cards[0].blocking).toBe('fatal');
  });

  it('carries the first need why, source quote and example answers onto the concept (for the Fill form helper)', () => {
    const needs: TenantNeed[] = [
      need({ key: 'fact:due_date', ask: 'What is the due date for the submission?', why: 'The section cannot pass until it is answered.', source: { quote: 'Proposals are due by 2026-12-11.', file: 'rfp.pdf' }, suggestions: ['2026-12-11', 'December 11, 2026'], projects: [{ projectId: 'A', projectName: 'A' }] }),
    ];
    const concept = groupTenantNeeds(needs).find((c) => c.groupSlug === 'solicitation')!.concepts.find((c) => c.conceptId === 'due_date')!;
    expect(concept.why).toMatch(/cannot pass/);
    expect(concept.sourceQuote).toMatch(/due by/);
    expect(concept.suggestions).toEqual(['2026-12-11', 'December 11, 2026']);
  });

  it('is empty-safe', () => {
    expect(groupTenantNeeds([])).toEqual([]);
    expect(groupTenantNeeds(undefined as unknown as TenantNeed[])).toEqual([]);
  });
});
