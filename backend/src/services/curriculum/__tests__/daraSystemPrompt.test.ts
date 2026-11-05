jest.mock('../../agentBlueprint/agentSystemPrompt', () => ({ buildAgentSystemPrompt: jest.fn() }));
jest.mock('../daraIdentitySeed', () => ({ getDaraAgentId: jest.fn() }));

import { buildAgentSystemPrompt } from '../../agentBlueprint/agentSystemPrompt';
import { getDaraAgentId } from '../daraIdentitySeed';
import { buildDaraSystemPrompt, buildDaraStaffSystemPrompt } from '../daraSystemPrompt';
import { DARA_STAFF_PERSONA_BLOCK, DARA_STUDENT_PERSONA_BLOCK } from '../daraPersona';

const build = buildAgentSystemPrompt as jest.Mock;
const agentId = getDaraAgentId as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  build.mockResolvedValue('PROMPT');
  agentId.mockResolvedValue('dara-agent-1');
});

describe('daraSystemPrompt (C88)', () => {
  it('staff: the staff persona, no learner-context block, a staff closing line', async () => {
    await buildDaraStaffSystemPrompt('staff-1');
    const [persona, enrollment, opts] = build.mock.calls[0];
    expect(persona).toBe(DARA_STAFF_PERSONA_BLOCK);
    expect(enrollment).toBe('staff-1');
    expect(opts).toEqual(expect.objectContaining({ agentLabel: 'dara', agentId: 'dara-agent-1', skipLearnerContext: true }));
    expect(opts.closingLine).toMatch(/staff member/);
  });

  it('student: unchanged, the student persona with the learner context', async () => {
    await buildDaraSystemPrompt('student-1');
    const [persona, , opts] = build.mock.calls[0];
    expect(persona).toBe(DARA_STUDENT_PERSONA_BLOCK);
    expect(opts.skipLearnerContext).toBeUndefined();
  });

  it('the staff persona names only the tools Dara has, says what she cannot see yet, and forbids invented figures', () => {
    expect(DARA_STAFF_PERSONA_BLOCK).toMatch(/curriculum_health/);
    expect(DARA_STAFF_PERSONA_BLOCK).toMatch(/student_pacing/);
    expect(DARA_STAFF_PERSONA_BLOCK).not.toMatch(/escalate_to_human/);
    expect(DARA_STAFF_PERSONA_BLOCK).toMatch(/missed sessions, missed assignments or logins/);
    expect(DARA_STAFF_PERSONA_BLOCK).toMatch(/never\s+estimate/);
    expect(DARA_STAFF_PERSONA_BLOCK).not.toMatch(/\bfree\b/i);
  });

  it('an identity lookup failure still builds the prompt (never throws) and is logged, not swallowed', async () => {
    agentId.mockRejectedValue(Object.assign(new Error('db down'), { name: 'SequelizeConnectionError' }));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(buildDaraStaffSystemPrompt('staff-1')).resolves.toBe('PROMPT');
    expect(build.mock.calls[0][2].agentId).toBeUndefined();
    expect(warn.mock.calls[0][0]).toMatch(/agent_id_lookup_failed.*SequelizeConnectionError/);
    warn.mockRestore();
  });
});
