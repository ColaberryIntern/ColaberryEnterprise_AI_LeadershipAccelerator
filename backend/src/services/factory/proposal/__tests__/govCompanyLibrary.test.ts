/**
 * govCompanyLibrary — only APPROVED facts ground the agent; answering a question saves an approved fact AND resolves
 * every open gap in the project that asked it (the "ask once" rail).
 */
const factFindAll = jest.fn();
const factCreate = jest.fn();
const refFindAll = jest.fn();
const personFindAll = jest.fn();
const queryMock = jest.fn();

jest.mock('../../../../models/GovCompanyFact', () => ({ __esModule: true, default: { findAll: (...a: any[]) => factFindAll(...a), create: (...a: any[]) => factCreate(...a), update: jest.fn() } }));
jest.mock('../../../../models/GovCompanyReference', () => ({ __esModule: true, default: { findAll: (...a: any[]) => refFindAll(...a), create: jest.fn() } }));
jest.mock('../../../../models/GovCompanyPersonnel', () => ({ __esModule: true, default: { findAll: (...a: any[]) => personFindAll(...a), create: jest.fn() } }));
jest.mock('../../../../config/database', () => ({ sequelize: { query: (...a: any[]) => queryMock(...a) } }));

import { approvedGroundingFacts, answerQuestionToLibrary, approvedReferences, approvedPersonnel, resumeDigest } from '../govCompanyLibrary';

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
    expect(out).toEqual([{ client: 'City of Plano', scope: 'Permitting', contractValue: '$1.2M', dates: '2023-2025', contact: 'Jane Roe, 555-1212' }]);
    expect(refFindAll).toHaveBeenCalledWith(expect.objectContaining({ where: { tenant_id: 't1', approved: true } }));
  });
});

describe('approvedPersonnel', () => {
  it('returns approved personnel with the résumé reduced to a plain-text digest', async () => {
    personFindAll.mockResolvedValue([plain({ name: 'Ada Lovelace', role: 'Technical Lead', resume_html: '<p>10y <b>data</b> engineering</p>' })]);
    const out = await approvedPersonnel('t1');
    expect(out).toEqual([{ name: 'Ada Lovelace', role: 'Technical Lead', summary: '10y data engineering' }]);
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

describe('answerQuestionToLibrary', () => {
  it('saves an approved fact and resolves the open gaps that asked the question', async () => {
    factCreate.mockResolvedValue({ id: 'fact-1' });
    queryMock.mockResolvedValue([[], 2]); // UPDATE affected 2 rows
    const r = await answerQuestionToLibrary('t1', 'dp-1', { question: 'Who signs the offer?', answer: 'The PM, Jane Doe' }, 'me');
    expect(r.factId).toBe('fact-1');
    expect(r.gapsResolved).toBe(2);
    // saved approved
    expect(factCreate).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: 't1', value: 'The PM, Jane Doe', approved: true }));
    // resolved the matching open gaps for this project + question
    const sql = String(queryMock.mock.calls[0][0]);
    expect(sql).toMatch(/UPDATE gov_proposal_document_gaps/);
    expect(sql).toMatch(/resolution = 'answered'/);
  });
});
