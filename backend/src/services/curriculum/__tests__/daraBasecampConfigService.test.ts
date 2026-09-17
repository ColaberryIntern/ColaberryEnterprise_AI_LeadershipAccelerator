jest.mock('../../../models/AiAgent', () => ({ findOne: jest.fn() }));

import AiAgent from '../../../models/AiAgent';
import { getDaraBasecampConfig } from '../daraBasecampConfigService';
import { DARA_AGENT_NAME } from '../daraIdentitySeed';

const mockAiAgentFindOne = AiAgent.findOne as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getDaraBasecampConfig', () => {
  it('happy path: reads a fully configured real target off Dara\'s own AiAgent registry row', async () => {
    mockAiAgentFindOne.mockResolvedValue({
      config: { basecamp_gateway: { project_id: 'proj-1', todolist_id: 'list-1', assignee_basecamp_person_id: 12345 } },
    });

    const result = await getDaraBasecampConfig();

    expect(mockAiAgentFindOne).toHaveBeenCalledWith({ where: { agent_name: DARA_AGENT_NAME } });
    expect(result).toEqual({ projectId: 'proj-1', todolistId: 'list-1', assigneeBasecampPersonId: 12345 });
  });

  it('fail-closed: null (Dara\'s real, current default) when no AiAgent row exists', async () => {
    mockAiAgentFindOne.mockResolvedValue(null);
    expect(await getDaraBasecampConfig()).toBeNull();
  });

  it('fail-closed: null when config.basecamp_gateway is missing entirely (the real, current state of Dara\'s row)', async () => {
    mockAiAgentFindOne.mockResolvedValue({ config: {} });
    expect(await getDaraBasecampConfig()).toBeNull();
  });

  it('fail-closed: null when project_id is missing', async () => {
    mockAiAgentFindOne.mockResolvedValue({ config: { basecamp_gateway: { todolist_id: 'list-1', assignee_basecamp_person_id: 12345 } } });
    expect(await getDaraBasecampConfig()).toBeNull();
  });

  it('fail-closed: null when todolist_id is missing', async () => {
    mockAiAgentFindOne.mockResolvedValue({ config: { basecamp_gateway: { project_id: 'proj-1', assignee_basecamp_person_id: 12345 } } });
    expect(await getDaraBasecampConfig()).toBeNull();
  });

  it('happy path: assignee_basecamp_person_id is OPTIONAL — a real, valid target with no assignee resolves, not fails closed', async () => {
    mockAiAgentFindOne.mockResolvedValue({ config: { basecamp_gateway: { project_id: 'proj-1', todolist_id: 'list-1' } } });
    expect(await getDaraBasecampConfig()).toEqual({ projectId: 'proj-1', todolistId: 'list-1', assigneeBasecampPersonId: null });
  });

  it('defensive: a malformed (non-number, or non-positive) assignee_basecamp_person_id degrades to null rather than passing garbage through', async () => {
    mockAiAgentFindOne.mockResolvedValue({ config: { basecamp_gateway: { project_id: 'proj-1', todolist_id: 'list-1', assignee_basecamp_person_id: '12345' } } });
    expect(await getDaraBasecampConfig()).toEqual({ projectId: 'proj-1', todolistId: 'list-1', assigneeBasecampPersonId: null });
  });

  it('fail-closed: null when basecamp_gateway is malformed (not an object)', async () => {
    mockAiAgentFindOne.mockResolvedValue({ config: { basecamp_gateway: 'not-an-object' } });
    expect(await getDaraBasecampConfig()).toBeNull();
  });
});
