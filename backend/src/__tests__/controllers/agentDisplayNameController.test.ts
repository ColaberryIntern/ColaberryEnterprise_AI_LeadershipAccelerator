const mockSet = jest.fn();

jest.mock('../../config/database', () => ({ sequelize: { fake: true } }));

/**
 * The service is mocked, but its ERROR CLASSES are defined here rather than stubbed, because the
 * controller branches on `instanceof`. Both the controller and this test resolve the same mocked
 * module, so the identity holds and the branch under test is the real one.
 */
jest.mock('../../services/agentDomain/agentDisplayNameService', () => {
  class AgentNotYoursError extends Error {
    constructor() {
      super('That agent is not one of yours.');
      this.name = 'AgentNotYoursError';
    }
  }
  class AgentDisplayNameTakenError extends Error {
    takenName: string;

    source: string;

    constructor(takenName: string, source: string) {
      super(`"${takenName}" is already taken by another agent.`);
      this.name = 'AgentDisplayNameTakenError';
      this.takenName = takenName;
      this.source = source;
    }
  }
  return {
    setAgentDisplayName: (...a: any[]) => mockSet(...a),
    AgentNotYoursError,
    AgentDisplayNameTakenError,
  };
});

import { handleSetAgentDisplayName } from '../../controllers/agentDisplayNameController';
import {
  AgentNotYoursError,
  AgentDisplayNameTakenError,
} from '../../services/agentDomain/agentDisplayNameService';

/**
 * AF10.6 controller. The properties worth the most here:
 *
 *  - The four outcomes stay DISTINCT. 400, 403, 409 and 200 each mean one thing, because an
 *    intern who cannot tell "my name is invalid" from "somebody has it" from "not my agent" has
 *    no idea what to do next.
 *  - The 409 carries the colliding name and its source out to the client, since that sentence is
 *    the entire value of the uniqueness check.
 *  - A 500 says nothing about the internals. No message, no stack.
 *  - Every attempt emits one structured line carrying `actor_email`, `outcome` and, on failure,
 *    `error_class`. This repo tests log fields elsewhere; a promise in a plan does not deliver
 *    them.
 */

const AGENT = '11111111-2222-4333-8444-555555555555';

function reqres(body: unknown, params: Record<string, string> = { agentId: AGENT }) {
  const res = {
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
  };
  const req = { body, params, admin: { email: 'ruth@example.com' } };
  return { req: req as any, res: res as any };
}

/** The structured lines the handler emitted during one call. */
let logged: any[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  logged = [];
  jest.spyOn(console, 'log').mockImplementation((line: any) => {
    try { logged.push(JSON.parse(String(line))); } catch { /* not ours */ }
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('handleSetAgentDisplayName', () => {
  it('200s and returns the stored name', async () => {
    mockSet.mockResolvedValue({ agent_id: AGENT, display_name: 'Dara', unchanged: false });
    const { req, res } = reqres({ display_name: 'Dara' });

    await handleSetAgentDisplayName(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ agent_id: AGENT, display_name: 'Dara', unchanged: false });
    expect(mockSet).toHaveBeenCalledWith({ fake: true }, 'ruth@example.com', AGENT, 'Dara');
  });

  it('passes `unchanged` through, so a replay is visible to the caller', async () => {
    mockSet.mockResolvedValue({ agent_id: AGENT, display_name: 'Dara', unchanged: true });
    const { req, res } = reqres({ display_name: 'Dara' });

    await handleSetAgentDisplayName(req, res);

    expect(res.body.unchanged).toBe(true);
  });

  it('400s on an unusable name, without calling the service', async () => {
    const { req, res } = reqres({ display_name: '   ' });

    await handleSetAgentDisplayName(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Invalid input');
    // Zod 4 exposes `issues`, not `errors`.
    expect(Array.isArray(res.body.issues)).toBe(true);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('400s on an unknown field rather than ignoring it', async () => {
    const { req, res } = reqres({ display_nme: 'Pip' });

    await handleSetAgentDisplayName(req, res);

    expect(res.statusCode).toBe(400);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('400s on a route param that is not an agent id', async () => {
    const { req, res } = reqres({ display_name: 'Pip' }, { agentId: 'not-a-uuid' });

    await handleSetAgentDisplayName(req, res);

    expect(res.statusCode).toBe(400);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('403s when the agent is not the caller\'s', async () => {
    mockSet.mockRejectedValue(new AgentNotYoursError());
    const { req, res } = reqres({ display_name: 'Ellis' });

    await handleSetAgentDisplayName(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toContain('not one of yours');
  });

  it('409s and names both the collision and its source', async () => {
    mockSet.mockRejectedValue(new AgentDisplayNameTakenError('Maya', 'agent_name'));
    const { req, res } = reqres({ display_name: 'Maya' });

    await handleSetAgentDisplayName(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.taken_name).toBe('Maya');
    expect(res.body.source).toBe('agent_name');
    expect(res.body.error).toContain('Maya');
  });

  it('500s on an unexpected failure and leaks nothing about it', async () => {
    mockSet.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    const { req, res } = reqres({ display_name: 'Ava' });

    await handleSetAgentDisplayName(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Could not save that name.' });
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
  });
});

describe('the structured log', () => {
  it('records a success with the actor and the outcome', async () => {
    mockSet.mockResolvedValue({ agent_id: AGENT, display_name: 'Dara', unchanged: false });
    const { req, res } = reqres({ display_name: 'Dara' });

    await handleSetAgentDisplayName(req, res);

    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({
      event: 'agent_display_name_set',
      service: 'backend',
      outcome: 'success',
      actor_email: 'ruth@example.com',
    });
    expect(typeof logged[0].duration_ms).toBe('number');
    expect(typeof logged[0].timestamp).toBe('string');
  });

  it('classifies a validation failure', async () => {
    const { req, res } = reqres({ display_name: '' });
    await handleSetAgentDisplayName(req, res);
    expect(logged[0]).toMatchObject({ outcome: 'failure', error_class: 'ValidationError' });
  });

  it('classifies a refusal with the error class, not a generic Error', async () => {
    mockSet.mockRejectedValue(new AgentNotYoursError());
    const { req, res } = reqres({ display_name: 'Ellis' });

    await handleSetAgentDisplayName(req, res);

    expect(logged[0]).toMatchObject({ outcome: 'failure', error_class: 'AgentNotYoursError' });
  });

  it('records which source a collision came from', async () => {
    mockSet.mockRejectedValue(new AgentDisplayNameTakenError('Maya', 'admin_display_name'));
    const { req, res } = reqres({ display_name: 'Maya' });

    await handleSetAgentDisplayName(req, res);

    expect(logged[0]).toMatchObject({ error_class: 'AgentDisplayNameTakenError' });
    expect(logged[0].context.source).toBe('admin_display_name');
  });

  it('never logs the name itself, which is user input', async () => {
    mockSet.mockResolvedValue({ agent_id: AGENT, display_name: 'Dara', unchanged: false });
    const { req, res } = reqres({ display_name: 'Dara' });

    await handleSetAgentDisplayName(req, res);

    expect(JSON.stringify(logged[0])).not.toContain('Dara');
  });
});
