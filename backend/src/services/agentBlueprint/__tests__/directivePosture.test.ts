/**
 * AF12.8 - the posture must be DERIVED from the runtime, not asserted.
 *
 * Half of these are ordinary unit tests over `describeDirectivePosture`. The other half read
 * the PROMPT-BUILDER SOURCES and fail when the wiring stops matching what `directivePosture.ts`
 * claims. That second half is the part that matters: without it, the module is a hand-written
 * list that drifts the first time somebody wires a third agent, and the acceptance explicitly
 * rules out an asserted answer.
 *
 * The technique is borrowed from `communicationSafetyService.journeyHold.test.ts`, which reads
 * its own service's source to hold a structural property.
 */
import fs from 'fs';
import path from 'path';

const mockDara = jest.fn<Promise<string | null>, []>();
const mockReese = jest.fn<Promise<string | null>, []>();
const mockMaya = jest.fn<Promise<string | null>, []>();

jest.mock('../../curriculum/daraIdentitySeed', () => ({ getDaraAgentId: () => mockDara() }));
jest.mock('../../reese/reeseIdentitySeed', () => ({ getReeseAgentId: () => mockReese() }));
jest.mock('../../mayaIdentitySeed', () => ({ getMayaAgentId: () => mockMaya() }));

import { describeDirectivePosture } from '../directivePosture';

const DARA = 'dara-agent-id';
const REESE = 'reese-agent-id';
const MAYA = 'maya-agent-id';
const ELLIS = 'ellis-agent-id';

beforeEach(() => {
  mockDara.mockReset().mockResolvedValue(DARA);
  mockReese.mockReset().mockResolvedValue(REESE);
  mockMaya.mockReset().mockResolvedValue(MAYA);
});

const SRC = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

describe('describeDirectivePosture', () => {
  it('reports ADVISORY for an agent whose reply runtime does inject directives', async () => {
    // Dara is the best case in the system and she is still advisory. That is the finding: the
    // mechanism is prompt text everywhere, so "enforced" is never the right word.
    const p = await describeDirectivePosture(DARA);
    expect(p.mechanism).toBe('advisory');
    expect(p.injectedBy).toEqual(['manager_conversation', 'own_reply_runtime']);
    expect(p.notInjectedBy).toEqual([]);
    expect(p.hasOwnReplyRuntime).toBe(true);
  });

  it('reports the manager conversation for an agent with no reply runtime at all', async () => {
    // The ticket said these agents were "enforced nowhere". They are not: the manager
    // conversation read site is unconditional, so a directive on Ellis does reach him there.
    const p = await describeDirectivePosture(ELLIS);
    expect(p.injectedBy).toEqual(['manager_conversation']);
    expect(p.notInjectedBy).toEqual([]);
    expect(p.hasOwnReplyRuntime).toBe(false);
  });

  it('reports Maya\'s live reply runtime as NOT injecting, which is the real defect', async () => {
    // She answers real DMs, and her prompt builders read no directive. This is the one case
    // where a manager's instruction genuinely does not reach the conversations the agent has.
    const p = await describeDirectivePosture(MAYA);
    expect(p.injectedBy).toEqual(['manager_conversation']);
    expect(p.notInjectedBy).toEqual(['own_reply_runtime']);
    expect(p.hasOwnReplyRuntime).toBe(true);
  });

  it('never claims a reach it could not confirm when an identity seed is unreadable', async () => {
    // Fails toward the floor every agent is known to have, rather than toward the flattering
    // answer. A posture that over-reports reach would tell a manager a directive lands
    // somewhere it does not.
    mockDara.mockRejectedValue(new Error('db down'));
    mockReese.mockRejectedValue(new Error('db down'));
    mockMaya.mockRejectedValue(new Error('db down'));
    const p = await describeDirectivePosture(DARA);
    expect(p.injectedBy).toEqual(['manager_conversation']);
    expect(p.notInjectedBy).toEqual([]);
    expect(p.mechanism).toBe('advisory');
  });

  it('tolerates a seed that resolves to null without matching every agent', async () => {
    mockDara.mockResolvedValue(null);
    const p = await describeDirectivePosture(DARA);
    expect(p.injectedBy).toEqual(['manager_conversation']);
  });

  it('always gives a reason, because a bare label tells a manager nothing', async () => {
    const p = await describeDirectivePosture(ELLIS);
    expect(p.mechanismReason).toMatch(/prompt text/i);
    expect(p.mechanismReason).toMatch(/never checked as a gate|never a gate/i);
  });
});

/**
 * These are the tests that make the posture DERIVED. Each one reads real source and would fail
 * if the wiring changed underneath the claims in `directivePosture.ts`.
 */
describe('the posture matches the actual wiring (read from source)', () => {
  it('the manager conversation reads directives UNCONDITIONALLY, for every agent', () => {
    const src = SRC('agentBlueprint/agentManagerConversationPrompt.ts');
    // Positive control first: prove we are reading the right file before trusting any absence.
    expect(src).toContain('getActiveDirectiveTexts');
    // The call must not sit behind a name check, a slug list, or an enabled gate. If someone
    // narrows it, this fails and `injectedBy`'s unconditional 'manager_conversation' is wrong.
    const call = /const directives = await getActiveDirectiveTexts\(agentId\);/.exec(src);
    expect(call).not.toBeNull();
    const before = src.slice(0, call!.index);
    const enclosing = before.slice(before.lastIndexOf('\n\n'));
    expect(enclosing).not.toMatch(/if\s*\(/);
  });

  it('the shared prompt builder gates its directive read behind an explicit agentId', () => {
    const src = SRC('agentBlueprint/agentSystemPrompt.ts');
    expect(src).toContain('getActiveDirectiveTexts');
    expect(src).toMatch(/if\s*\(options\?\.agentId\)/);
  });

  it('EXACTLY Dara and Reese pass agentId to the shared prompt builder', () => {
    // The load-bearing assertion. `REPLY_RUNTIME_INJECTS` lists these two; if a third prompt
    // builder starts passing agentId, this fails until the posture module is updated.
    const callers = [
      { file: 'curriculum/daraSystemPrompt.ts', expected: true },
      { file: 'reese/reeseSystemPrompt.ts', expected: true },
      { file: 'maya/mayaPortalPrompt.ts', expected: false },
      { file: 'admissionsMayaService.ts', expected: false },
    ];
    for (const { file, expected } of callers) {
      const src = SRC(file);
      // Control: the file exists and is a prompt builder, so a false negative below is real.
      expect(src.length).toBeGreaterThan(0);
      expect(src.toLowerCase()).toContain('prompt');
      expect(/agentId/.test(src) && /buildAgentSystemPrompt/.test(src)).toBe(expected);
    }
  });

  it('PINS MAYA\'S GAP: her prompt builders still read no directive', () => {
    // This test exists to be broken. The day somebody wires directives into Maya's replies it
    // fails, which is the signal to move her from REPLY_RUNTIME_OMITS to REPLY_RUNTIME_INJECTS
    // instead of letting the posture quietly report a gap that has been closed.
    for (const file of ['maya/mayaPortalPrompt.ts', 'admissionsMayaService.ts']) {
      const src = SRC(file);
      expect(src.toLowerCase()).toContain('prompt');           // control
      expect(src).not.toContain('getActiveDirectiveTexts');
    }
  });

  it('no code path reads a directive to GRANT anything, which is why advisory is honest', () => {
    // The restrict-only property holds by construction. If a grant path ever reads directives,
    // `mechanism` stops being a constant and this is where that shows up.
    const service = SRC('managerDirectiveService.ts');
    expect(service).toContain('getActiveDirectiveTexts');      // control
    expect(service).not.toMatch(/tools_granted|autonomy_level\s*=|grantTool/);
  });
});
