/**
 * govCompanyLibrary — only APPROVED facts ground the agent; answering a question saves an approved fact AND resolves
 * every open gap in the project that asked it (the "ask once" rail).
 */
const factFindAll = jest.fn();
const factCreate = jest.fn();
const refFindAll = jest.fn();
const refUpdate = jest.fn();
const personFindAll = jest.fn();
const personUpdate = jest.fn();
const queryMock = jest.fn();

jest.mock('../../../../models/GovCompanyFact', () => ({ __esModule: true, default: { findAll: (...a: any[]) => factFindAll(...a), create: (...a: any[]) => factCreate(...a), update: jest.fn() } }));
jest.mock('../../../../models/GovCompanyReference', () => ({ __esModule: true, default: { findAll: (...a: any[]) => refFindAll(...a), create: jest.fn(), update: (...a: any[]) => refUpdate(...a) } }));
jest.mock('../../../../models/GovCompanyPersonnel', () => ({ __esModule: true, default: { findAll: (...a: any[]) => personFindAll(...a), create: jest.fn(), update: (...a: any[]) => personUpdate(...a) } }));
jest.mock('../../../../config/database', () => ({ sequelize: { query: (...a: any[]) => queryMock(...a) } }));

import { approvedGroundingFacts, answerQuestionToLibrary, approvedReferences, approvedPersonnel, resumeDigest, approveCompanyReference, approveCompanyPersonnel, addCompanyFact } from '../govCompanyLibrary';

const plain = (v: any) => ({ get: () => ({ ...v }) });
beforeEach(() => jest.clearAllMocks());

describe('approvedGroundingFacts', () => {
  it('returns only approved facts as "key: value" strings', async () => {
    factFindAll.mockResolvedValue([plain({ key: 'Years in business', value: '8' }), plain({ key: 'DUNS', value: '12-345' })]);
    expect(await approvedGroundingFacts('t1')).toEqual(['Years in business: 8', 'DUNS: 12-345']);
    // scoped to approved=true
    expect(factFindAll).toHaveBeenCalledWith({ where: { tenant_id: 't1', approved: true } });
  });
});

describe('approvedReferences', () => {
  it('returns approved references with contact collapsed, scoped to approved=true, dropping blank clients', async () => {
    refFindAll.mockResolvedValue([
      plain({ client: 'City of Plano', scope: 'Permitting', contract_value: '$1.2M', dates: '2023-2025', contact: 'Jane Roe', phone: '555-1212', email: null }),
      plain({ client: '', scope: 'x', contract_value: null, dates: null, contact: null, phone: null, email: null }),
    ]);
    const out = await approvedReferences('t1');
    expect(out).toEqual([{ client: 'City of Plano', scope: 'Permitting', contractValue: '$1.2M', dates: '2023-2025', contact: 'Jane Roe, 555-1212', subject: null }]);
    expect(refFindAll).toHaveBeenCalledWith(expect.objectContaining({ where: { tenant_id: 't1', approved: true } }));
  });
});

describe('approvedPersonnel', () => {
  it('returns approved personnel with the résumé reduced to a plain-text digest', async () => {
    personFindAll.mockResolvedValue([plain({ name: 'Ada Lovelace', role: 'Technical Lead', resume_html: '<p>10y <b>data</b> engineering</p>' })]);
    const out = await approvedPersonnel('t1');
    expect(out).toEqual([{ name: 'Ada Lovelace', role: 'Technical Lead', summary: '10y data engineering', subject: null }]);
    expect(personFindAll).toHaveBeenCalledWith(expect.objectContaining({ where: { tenant_id: 't1', approved: true } }));
  });
});

describe('resumeDigest', () => {
  it('strips tags, collapses whitespace, and caps length', () => {
    expect(resumeDigest('<p>a   b</p>')).toBe('a b');
    expect(resumeDigest(null)).toBeNull();
    expect(resumeDigest('<p></p>')).toBeNull();
    const long = resumeDigest('x'.repeat(500), 50);
    expect(long!.length).toBeLessThanOrEqual(50);
    expect(long!.endsWith('…')).toBe(true);
  });
});

describe('addCompanyFact', () => {
  it('persists the category alongside key/value', async () => {
    factCreate.mockResolvedValue({ id: 'f1' });
    const id = await addCompanyFact('t1', { key: 'UEI', value: 'ABC123', category: 'registrations', approved: true }, 'id-1');
    expect(id).toBe('f1');
    expect(factCreate).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: 't1', key: 'UEI', value: 'ABC123', category: 'registrations', approved: true, approved_by_identity_id: 'id-1' }));
  });
});

describe('approveCompanyReference / approveCompanyPersonnel', () => {
  it('flips approved=true scoped to (id, tenant_id) for a reference', async () => {
    await approveCompanyReference('t1', 'r1', 'me');
    expect(refUpdate).toHaveBeenCalledWith(expect.objectContaining({ approved: true, approved_by_identity_id: 'me' }), { where: { id: 'r1', tenant_id: 't1' } });
  });
  it('flips approved=true scoped to (id, tenant_id) for a person', async () => {
    await approveCompanyPersonnel('t1', 'p1', 'me');
    expect(personUpdate).toHaveBeenCalledWith(expect.objectContaining({ approved: true, approved_by_identity_id: 'me' }), { where: { id: 'p1', tenant_id: 't1' } });
  });
});

describe('answerQuestionToLibrary', () => {
  it('derives a clean fact key from the gap need_key, saves an approved categorized fact, and resolves matching gaps', async () => {
    factCreate.mockResolvedValue({ id: 'fact-1' });
    queryMock
      .mockResolvedValueOnce([{ need_key: 'fact:project_name_1' }]) // factKeyForQuestion SELECT
      .mockResolvedValueOnce([[], 2]);                              // UPDATE affected 2 rows
    const r = await answerQuestionToLibrary('t1', 'dp-1', { question: 'What specific projects have you completed?', answer: 'Saratoga Springs asset system' }, 'me');
    expect(r.factId).toBe('fact-1');
    expect(r.gapsResolved).toBe(2);
    // a clean, categorized fact (not keyed by the raw sentence)
    expect(factCreate).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: 't1', key: 'Project Name 1', category: 'general', value: 'Saratoga Springs asset system', approved: true }));
    const updateSql = String(queryMock.mock.calls.find((c: any[]) => /UPDATE gov_proposal_document_gaps/.test(String(c[0])))?.[0] ?? '');
    expect(updateSql).toMatch(/resolution = 'answered'/);
  });

  it('falls back to the question text when the gap has no need_key', async () => {
    factCreate.mockResolvedValue({ id: 'fact-2' });
    queryMock.mockResolvedValueOnce([]).mockResolvedValueOnce([[], 1]); // no need_key, then UPDATE
    await answerQuestionToLibrary('t1', 'dp-1', { question: 'Who signs the offer?', answer: 'Jane Doe' }, 'me');
    expect(factCreate).toHaveBeenCalledWith(expect.objectContaining({ key: 'Who signs the offer?', value: 'Jane Doe' }));
  });
});
