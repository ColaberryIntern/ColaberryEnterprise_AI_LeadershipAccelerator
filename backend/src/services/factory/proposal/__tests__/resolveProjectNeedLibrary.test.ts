/**
 * resolveProjectNeed — the loop-closing write (Dossier Phase 3): a fact-kind need, once resolved, is also saved to the
 * company library as a REUSABLE fact (approved when the approver answered, pending for an intern). collectProjectNeeds,
 * the DB, the qualification and the library are mocked; routeNeedResolution runs for real.
 */
const collectProjectNeeds = jest.fn();
const queryMock = jest.fn();
const qualFindOne = jest.fn();
const addCompanyFact = jest.fn();

jest.mock('../collectProjectNeeds', () => ({ collectProjectNeeds: (...a: any[]) => collectProjectNeeds(...a) }));
jest.mock('../../../../config/database', () => ({ sequelize: { query: (...a: any[]) => queryMock(...a) } }));
jest.mock('../../../../models/GovQualification', () => ({ __esModule: true, default: { findOne: (...a: any[]) => qualFindOne(...a) } }));
jest.mock('../govCompanyLibrary', () => ({ addCompanyFact: (...a: any[]) => addCompanyFact(...a) }));

import { resolveProjectNeed } from '../resolveProjectNeed';
import type { HumanNeed } from '../proposalReviewTypes';

const factNeed: HumanNeed = { key: 'fact:project_name_1', kind: 'fact', ask: 'Project name 1', why: 'w', format: 'text', blocking: 'score', usedIn: [{ docKey: 'past_performance' }] };

beforeEach(() => {
  jest.clearAllMocks();
  collectProjectNeeds.mockResolvedValue([factNeed]);
  queryMock.mockResolvedValue([[], 1]); // UPDATE resolved one gap
  qualFindOne.mockResolvedValue({ tenant_id: 't1' });
});

describe('resolveProjectNeed library write', () => {
  it('saves an APPROVED, cleanly-keyed, categorized fact when an approver answers', async () => {
    const r = await resolveProjectNeed('dp-1', 'fact:project_name_1', { value: 'Saratoga Springs asset system' }, { email: 'ali@colaberry.com', canApprove: true });
    expect(r.status).toBe(200);
    expect(addCompanyFact).toHaveBeenCalledWith('t1', expect.objectContaining({ key: 'Project Name 1', value: 'Saratoga Springs asset system', category: 'general', approved: true }), null);
  });

  it('saves the fact as PENDING (unapproved) when an intern answers', async () => {
    await resolveProjectNeed('dp-1', 'fact:project_name_1', { value: 'Saratoga Springs asset system' }, { email: 'intern@x.com', canApprove: false });
    expect(addCompanyFact).toHaveBeenCalledWith('t1', expect.objectContaining({ approved: false }), null);
  });

  it('does not write to the library for a non-fact need (e.g. a decision)', async () => {
    const decisionNeed: HumanNeed = { key: 'decision:dataset', kind: 'decision', ask: 'Pick', why: 'w', format: 'choice', blocking: 'score', usedIn: [], options: ['a', 'b'] };
    collectProjectNeeds.mockResolvedValue([decisionNeed]);
    await resolveProjectNeed('dp-1', 'decision:dataset', { value: 'a' }, { email: 'ali@colaberry.com', canApprove: true });
    expect(addCompanyFact).not.toHaveBeenCalled();
  });

  it('still returns 200 when the library write fails (best-effort, the need is resolved)', async () => {
    addCompanyFact.mockRejectedValue(new Error('library down'));
    const r = await resolveProjectNeed('dp-1', 'fact:project_name_1', { value: 'x' }, { email: 'ali@colaberry.com', canApprove: true });
    expect(r.status).toBe(200);
  });
});
