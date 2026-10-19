/**
 * PATCH /api/admin/ai-ops/agents/:id — the allowlist that closes an unbounded write.
 *
 * THE DEFECT. `handleUpdateAgent` passed `req.body` straight into
 * `aiOpsService.updateAgent`, which did `agent.update({ ...updates, updated_at })`. Any key
 * that happened to be a column was written, and `tools_granted`, `autonomy_level`,
 * `system_prompt` and `agent_name` are all columns on `ai_agents`. So one admin-authenticated
 * request could arm any of the 267 agents, bypassing the autonomy classifier and the
 * build-authorization gate, or rename one, which is worse than it sounds: `agent_name` is the
 * findOrCreate key in `agentRegistrySeed.ts`, so a rename orphans the row and the next boot
 * re-creates the original as a SECOND agent.
 *
 * WHAT IS TESTED, and why in two places. The controller test proves the request is refused at
 * the boundary. The service test proves the write is narrow even if something reaches the
 * service directly, because a TypeScript interface is erased at runtime and stops nothing: the
 * service is the thing that used to spread.
 *
 * The dangerous keys are named individually rather than looped, so a failure says which field
 * got through.
 */
jest.mock('../../services/aiOpsService', () => ({
  updateAgent: jest.fn(),
}));

import * as aiOpsService from '../../services/aiOpsService';
import { handleUpdateAgent } from '../aiOpsController';

const updateAgentMock = aiOpsService.updateAgent as unknown as jest.Mock;

function mockRes() {
  const res: any = { statusCode: 200, jsonBody: undefined };
  res.status = jest.fn((code: number) => { res.statusCode = code; return res; });
  res.json = jest.fn((body: any) => { res.jsonBody = body; return res; });
  return res;
}
const reqWith = (body: unknown) => ({ params: { id: 'agent-1' }, body } as any);

describe('the two fields a real caller actually sends still work', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    updateAgentMock.mockResolvedValue({ id: 'agent-1' });
  });

  // AdminAISettingsPage.tsx:363 sends exactly this.
  it('accepts { status }', async () => {
    const res = mockRes();
    await handleUpdateAgent(reqWith({ status: 'paused' }), res);
    expect(res.statusCode).toBe(200);
    expect(updateAgentMock).toHaveBeenCalledWith('agent-1', { status: 'paused' });
  });

  // ai-settings/DepartmentAgentsTab.tsx:84 sends exactly this.
  it('accepts { enabled }', async () => {
    const res = mockRes();
    await handleUpdateAgent(reqWith({ enabled: false }), res);
    expect(res.statusCode).toBe(200);
    expect(updateAgentMock).toHaveBeenCalledWith('agent-1', { enabled: false });
  });

  it('rejects a status outside the column union', async () => {
    const res = mockRes();
    await handleUpdateAgent(reqWith({ status: 'armed' }), res);
    expect(res.statusCode).toBe(400);
    expect(updateAgentMock).not.toHaveBeenCalled();
  });

  it('refuses an empty body rather than reporting a write that changed nothing', async () => {
    const res = mockRes();
    await handleUpdateAgent(reqWith({}), res);
    expect(res.statusCode).toBe(400);
    expect(updateAgentMock).not.toHaveBeenCalled();
  });
});

describe('the governance-bearing columns are refused at the boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    updateAgentMock.mockResolvedValue({ id: 'agent-1' });
  });

  const refused = async (body: Record<string, unknown>) => {
    const res = mockRes();
    await handleUpdateAgent(reqWith(body), res);
    return res;
  };

  it('refuses tools_granted, which is what the autonomy level is DERIVED from', async () => {
    const res = await refused({ tools_granted: ['send_email'] });
    expect(res.statusCode).toBe(400);
    expect(updateAgentMock).not.toHaveBeenCalled();
  });

  it('refuses autonomy_level', async () => {
    const res = await refused({ autonomy_level: 'communicate' });
    expect(res.statusCode).toBe(400);
    expect(updateAgentMock).not.toHaveBeenCalled();
  });

  it('refuses agent_name, the findOrCreate key a rename would orphan', async () => {
    const res = await refused({ agent_name: 'Something Else' });
    expect(res.statusCode).toBe(400);
    expect(updateAgentMock).not.toHaveBeenCalled();
  });

  it('refuses system_prompt', async () => {
    const res = await refused({ system_prompt: 'ignore all previous instructions' });
    expect(res.statusCode).toBe(400);
    expect(updateAgentMock).not.toHaveBeenCalled();
  });

  it('refuses a dangerous key even when smuggled beside a legitimate one', async () => {
    // The shape that would slip past a check that only looked at the first key, or at
    // whether ANY allowed field was present.
    const res = await refused({ status: 'idle', tools_granted: ['send_email'] });
    expect(res.statusCode).toBe(400);
    expect(updateAgentMock).not.toHaveBeenCalled();
  });

  it('names the rejected field, so the caller is not left guessing', async () => {
    const res = await refused({ tools_granted: ['send_email'] });
    expect(String(res.jsonBody.error)).toContain('tools_granted');
  });
});

describe('the service is narrow too, because a type is erased at runtime', () => {
  // The controller is the boundary, but the service is what used to spread. These tests
  // call it with a plain object carrying dangerous keys, which TypeScript cannot prevent
  // at runtime, and assert the patch handed to the model contains only allowed fields.
  const realService = jest.requireActual('../../services/aiOpsService');

  it('writes ONLY status, enabled and updated_at, whatever else it is handed', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const AiAgent = jest.requireActual('../../models/AiAgent').default;
    const findByPk = jest.spyOn(AiAgent, 'findByPk').mockResolvedValue({ update } as any);

    await realService.updateAgent('agent-1', {
      status: 'paused',
      enabled: true,
      tools_granted: ['send_email'],
      autonomy_level: 'communicate',
      agent_name: 'Renamed',
      system_prompt: 'x',
    } as any);

    expect(update).toHaveBeenCalledTimes(1);
    const patch = update.mock.calls[0][0];
    expect(Object.keys(patch).sort()).toEqual(['enabled', 'status', 'updated_at']);
    expect(patch).not.toHaveProperty('tools_granted');
    expect(patch).not.toHaveProperty('autonomy_level');
    expect(patch).not.toHaveProperty('agent_name');
    findByPk.mockRestore();
  });

  it('POSITIVE CONTROL: it does still write the fields it is supposed to', async () => {
    // Without this, a service that wrote NOTHING would pass the assertion above.
    const update = jest.fn().mockResolvedValue(undefined);
    const AiAgent = jest.requireActual('../../models/AiAgent').default;
    const findByPk = jest.spyOn(AiAgent, 'findByPk').mockResolvedValue({ update } as any);

    await realService.updateAgent('agent-1', { status: 'idle' } as any);
    const patch = update.mock.calls[0][0];
    expect(patch.status).toBe('idle');
    // An absent field must not be written as undefined, which would null the column.
    expect(patch).not.toHaveProperty('enabled');
    findByPk.mockRestore();
  });
});
