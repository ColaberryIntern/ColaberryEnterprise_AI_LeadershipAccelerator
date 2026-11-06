import { isLiveDoc, anyNotStarted, docStageLabel, pursuitStageLabel, libraryPickerItems } from './buildHelpers';
import type { GovProposalDocument, StudentGovProjectView } from '../../../../services/govProjectPortalApi';

const doc = (over: Partial<GovProposalDocument>): GovProposalDocument => ({
  key: 'tech', title: 'Technical', status: 'not_started', contentHtml: null, version: 0, gate: false, order: 1,
  requirementIds: [], comments: [], draftedAt: null, acceptedAt: null, ...over,
});

describe('anyNotStarted', () => {
  it('is true only when a live doc is not_started', () => {
    expect(anyNotStarted([doc({ status: 'not_started' })])).toBe(true);
    expect(anyNotStarted([doc({ status: 'drafted' })])).toBe(false);
    expect(anyNotStarted([doc({ key: 'pricing', status: 'not_started' })])).toBe(false); // pricing excluded
    expect(anyNotStarted([doc({ status: 'not_started', superseded: true })])).toBe(false); // superseded excluded
    expect(anyNotStarted([])).toBe(false);
  });
});

describe('isLiveDoc', () => {
  it('excludes pricing and superseded', () => {
    expect(isLiveDoc(doc({}))).toBe(true);
    expect(isLiveDoc(doc({ key: 'pricing' }))).toBe(false);
    expect(isLiveDoc(doc({ superseded: true }))).toBe(false);
  });
});

describe('docStageLabel', () => {
  it('reads passing / superseded / status', () => {
    expect(docStageLabel(doc({ latest: { versionId: 'v', version: 2, scores: {}, passes: true, pageCount: 1, createdAt: null } }))).toBe('Passing');
    expect(docStageLabel(doc({ superseded: true }))).toBe('No longer required');
    expect(docStageLabel(doc({ status: 'not_started' }))).toBe('Not started');
    expect(docStageLabel(doc({ status: 'drafting' }))).toBe('Building');
  });
});

describe('pursuitStageLabel', () => {
  it('reflects readiness and build progress', () => {
    expect(pursuitStageLabel({ proposalReadiness: { pct: 96, passing: 3, total: 3 } })).toBe('Ready to submit');
    expect(pursuitStageLabel({ buildSummary: { studentProjectId: 'x', releases: [], rollup: { total: 10, verified: 4, complete: 4, inProgress: 0, blocked: 0, notStarted: 6, pct: 40 } } } as any)).toBe('Build in progress');
    expect(pursuitStageLabel({})).toBe('Proposal production');
  });
});

describe('libraryPickerItems (D9: jurisdiction-only forms)', () => {
  const generic = ['section:cover_letter', 'section:past_performance', 'resume:key_personnel', 'reference:project'];

  it('includes applicable state forms only when a state rulebook loaded', () => {
    const view = { blueprint: { stateFormsStatus: { state: 'TX', loaded: true, note: null }, forms: [
      { key: 'hsp', label: 'HSP', disposition: 'required' }, { key: 'ciq', label: 'CIQ', disposition: 'not_required' },
    ] } } as any as StudentGovProjectView;
    const keys = libraryPickerItems(view).map((i) => i.key);
    expect(keys).toContain('form:hsp');
    expect(keys).not.toContain('form:ciq'); // not_required dropped
    generic.forEach((g) => expect(keys).toContain(g));
  });

  it('shows NO state forms for a non-Texas / undetermined jurisdiction (rulebook not loaded)', () => {
    const view = { blueprint: { stateFormsStatus: { state: null, loaded: false, note: 'no rulebook' }, forms: [{ key: 'hsp', label: 'HSP', disposition: 'required' }] } } as any as StudentGovProjectView;
    const keys = libraryPickerItems(view).map((i) => i.key);
    expect(keys.some((k) => k.startsWith('form:'))).toBe(false);
    expect(keys).toEqual(generic);
  });

  it('is total with no blueprint (generic library only)', () => {
    expect(libraryPickerItems({} as StudentGovProjectView).map((i) => i.key)).toEqual(generic);
  });
});
