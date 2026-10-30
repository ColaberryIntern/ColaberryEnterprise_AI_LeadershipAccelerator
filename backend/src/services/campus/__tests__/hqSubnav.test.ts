/**
 * C92: GET /api/portal/campus/hq-subnav serves the cards behind the admin sidebar's live sub-lists for THIS person: the same list
 * functions the admin routes use, called with the person's effective sections and email; nothing for a section they do not
 * hold; a failing list is empty (fail-soft, logged), never the whole building.
 */
const mockStatus = { is_mgmt: true, role: 'owner', label: 'Owner', sections: ['program', 'gov_contracts', 'agents', 'internship'] as string[] };
jest.mock('../../access/mgmtBridgeService', () => ({ getMgmtStatus: jest.fn(async () => mockStatus) }));
const mockGov = jest.fn();
const mockAgents = jest.fn();
jest.mock('../../factory/govContractsList', () => ({ listGovContractsFor: (...a: unknown[]) => mockGov(...a) }));
jest.mock('../../agentDomain/agentFactoryList', () => ({ listAgentFactoryFor: (...a: unknown[]) => mockAgents(...a) }));

import { getHqSubnav } from '../hqSubnav';

beforeEach(() => {
  mockStatus.sections = ['program', 'gov_contracts', 'agents', 'internship'];
  mockGov.mockReset(); mockAgents.mockReset();
  mockGov.mockResolvedValue({ projects: [{ key: 'g1' }], scope: 'all' });
  mockAgents.mockResolvedValue({ agents: [{ domainKey: 'a1' }], scope: 'all' });
});

describe('getHqSubnav', () => {
  it('serves both lists from the admin routes\x27 own functions, as this person (effective sections + email)', async () => {
    expect(await getHqSubnav('enr-1', 'ali@colaberry.com')).toEqual({ gov: [{ key: 'g1' }], agents: [{ domainKey: 'a1' }] });
    expect(mockGov).toHaveBeenCalledWith({ email: 'ali@colaberry.com', sections: mockStatus.sections });
    expect(mockAgents).toHaveBeenCalledWith({ email: 'ali@colaberry.com', sections: mockStatus.sections });
  });
  it('a section the person does not hold: that list is not even asked for', async () => {
    mockStatus.sections = ['internship'];
    expect(await getHqSubnav('enr-1', 'm@example.com')).toEqual({ gov: [], agents: [] });
    expect(mockGov).not.toHaveBeenCalled();
    expect(mockAgents).not.toHaveBeenCalled();
  });
  it('an unconfigured gov container is an empty gov list; a failing list is empty and logged, the other still served', async () => {
    mockGov.mockResolvedValue(null);
    mockAgents.mockRejectedValue(new TypeError('db down'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await getHqSubnav('enr-1', 'ali@colaberry.com')).toEqual({ gov: [], agents: [] });
    expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({ event: 'campus_hq_subnav_list_failed', error_class: 'TypeError', context: { list: 'agents' } });
    warn.mockRestore();
  });
});
