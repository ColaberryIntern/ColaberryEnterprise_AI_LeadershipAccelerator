/**
 * AF11.4 — does the grant actually change what the agent may do? Asked of the only real grant
 * check in the fleet.
 *
 * ## Why this file exists, in Ali's words
 *
 * The ticket's third correction, 3 Nov 2026: *"`agentEmailTool.ts:121-157` gates on
 * `tools_granted.includes(AGENT_EMAIL_TOOL)` and returns `reason: 'tool_not_granted'` when
 * absent. That is a real action behind a real grant check, which makes it the honest target for
 * the 'agent performs the granted action and refuses a neighboring ungranted one' criterion."*
 *
 * So this suite does not assert that a row was written. It asserts that the question "may this
 * agent send an email" is answered differently before and after — which is the only form of
 * "the grant worked" that is worth anything.
 *
 * ## What it also establishes, and it is a finding rather than a pass
 *
 * The grant alone is NOT enough to make the tool usable, and that is correct. `readAgentGate`
 * requires the agent enabled AND the tool granted AND an autonomy level that allows the action,
 * in that order. `send_email` classifies as `communicate`, the top rung, and 255 of 257 agents
 * are deliberately held at `observe`. So the honest end state of this ticket is
 * `granted: true, usable: false, reason: 'autonomy_insufficient:observe'` — the tool is held and
 * the agent still cannot act until somebody separately decides it may. Raising an autonomy level
 * is named in the ticket's own out-of-scope list, so a grant that made the tool usable by itself
 * would be the defect, not the goal.
 *
 * `agentAutonomy` is NOT mocked: its own docblock calls it pure and dependency-free, so the real
 * four-rung ladder runs here. Mocking it would leave the single most important question in this
 * file — does `observe` really refuse — answered by a stub.
 */

const findOne = jest.fn();
const query = jest.fn();
const evaluateSend = jest.fn();

jest.mock('../../../models', () => ({
  AiAgent: { findOne: (...a: unknown[]) => findOne(...a) },
}));
jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => query(...a) },
}));
jest.mock('../../communicationSafetyService', () => ({
  evaluateSend: (...a: unknown[]) => evaluateSend(...a),
}));

import { readAgentGate, AGENT_EMAIL_TOOL } from '../../agents/tools/agentEmailTool';

/** A neighbouring tool: real, registered, and not the one under test. */
const NEIGHBOUR = 'read_attachments';

function agentRow(over: Record<string, unknown> = {}) {
  return {
    autonomy_level: 'observe',
    tools_granted: [] as unknown,
    enabled: true,
    status: 'active',
    ...over,
  };
}

beforeEach(() => { jest.clearAllMocks(); });

describe('the gate answers differently before and after the grant', () => {
  it('BEFORE: the tool is refused, by name', async () => {
    findOne.mockResolvedValue(agentRow({ tools_granted: [] }));

    const gate = await readAgentGate('Maya');

    expect(gate.granted).toBe(false);
    expect(gate.usable).toBe(false);
    expect(gate.reason).toBe('tool_not_granted');
  });

  it('AFTER: the tool is held — and the agent still cannot send, for a DIFFERENT reason', async () => {
    // This is the whole ticket in one assertion. `granted` flipped, which is what the grant did.
    // `usable` did not, because an `observe` agent may not perform a `communicate` action, and
    // raising that is a separate decision with a separate author. The reason STRING changing
    // from `tool_not_granted` to `autonomy_insufficient:observe` is the proof that the grant
    // moved the thing it was supposed to move and nothing else.
    findOne.mockResolvedValue(agentRow({ tools_granted: [AGENT_EMAIL_TOOL] }));

    const gate = await readAgentGate('Maya');

    expect(gate.granted).toBe(true);
    expect(gate.usable).toBe(false);
    expect(gate.reason).toBe('autonomy_insufficient:observe');
  });

  it('AFTER, on an agent somebody separately lifted: the action is permitted', async () => {
    // POSITIVE CONTROL. Without it, every `usable: false` above would be satisfied just as well
    // by a gate that never permits anything.
    findOne.mockResolvedValue(agentRow({
      tools_granted: [AGENT_EMAIL_TOOL],
      autonomy_level: 'communicate',
    }));

    const gate = await readAgentGate('Maya');

    expect(gate.granted).toBe(true);
    expect(gate.usable).toBe(true);
    expect(gate.reason).toBeNull();
  });
});

describe('POSITIVE CONTROL — a grant does not widen anything it did not name', () => {
  it('granting the neighbour leaves send_email refused exactly as before', async () => {
    // The criterion in the ticket's own words: "a neighboring ungranted tool still reports
    // usable: false for the same agent. A grant that quietly widens access fails here."
    findOne.mockResolvedValue(agentRow({
      tools_granted: [NEIGHBOUR],
      autonomy_level: 'communicate',
    }));

    const gate = await readAgentGate('Maya');

    expect(gate.granted).toBe(false);
    expect(gate.usable).toBe(false);
    expect(gate.reason).toBe('tool_not_granted');
  });

  it('holding both tools permits only because the named one is among them', async () => {
    findOne.mockResolvedValue(agentRow({
      tools_granted: [NEIGHBOUR, AGENT_EMAIL_TOOL],
      autonomy_level: 'communicate',
    }));

    expect((await readAgentGate('Maya')).usable).toBe(true);
  });
});

describe('a grant is not a kill-switch override', () => {
  it('a disabled agent holding the tool is still refused, and says so first', async () => {
    // Order matters in the gate: `agent_disabled` is reported BEFORE `tool_not_granted`, so a
    // disabled agent never produces a reason that sounds like a missing grant. The ten domain
    // agents are seeded disabled, which makes this the state most of them are actually in.
    findOne.mockResolvedValue(agentRow({
      tools_granted: [AGENT_EMAIL_TOOL],
      enabled: false,
      autonomy_level: 'communicate',
    }));

    const gate = await readAgentGate('Maya');

    expect(gate.granted).toBe(true);
    expect(gate.usable).toBe(false);
    expect(gate.reason).toBe('agent_disabled');
  });

  it('a paused agent holding the tool is refused too', async () => {
    findOne.mockResolvedValue(agentRow({
      tools_granted: [AGENT_EMAIL_TOOL],
      status: 'paused',
      autonomy_level: 'communicate',
    }));

    expect((await readAgentGate('Maya')).reason).toBe('agent_paused');
  });
});

describe('a malformed column is not a grant', () => {
  it.each([
    ['a JSON string rather than an array', JSON.stringify([AGENT_EMAIL_TOOL])],
    ['null', null],
    ['an object', { send_email: true }],
    ['the bare tool name', AGENT_EMAIL_TOOL],
  ])('%s does not count as granted', async (_label, value) => {
    // `tools_granted` is jsonb and has had more than one writer. Only an ARRAY containing the
    // exact name counts, and a value the gate cannot read must never be resolved in the agent's
    // favour — "I could not tell" is not "yes".
    findOne.mockResolvedValue(agentRow({
      tools_granted: value,
      autonomy_level: 'communicate',
    }));

    const gate = await readAgentGate('Maya');

    expect(gate.granted).toBe(false);
    expect(gate.reason).toBe('tool_not_granted');
  });

  it('an unreadable agent row is refused rather than assumed', async () => {
    findOne.mockRejectedValue(new Error('database is on fire'));
    expect((await readAgentGate('Maya')).reason).toBe('agent_lookup_failed');

    findOne.mockResolvedValue(null);
    expect((await readAgentGate('Maya')).reason).toBe('agent_not_found');
  });
});
