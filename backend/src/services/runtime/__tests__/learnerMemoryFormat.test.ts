/**
 * learnerMemoryFormat — unit tests for the pure longitudinal-memory logic.
 * Hermetic (no DB, no LLM, no clock): prompt build, defensive parse, the
 * idempotency rule, and the 360 render.
 */
import {
  buildDistillMessages, normalizeDistillation, shouldDistill, hasMemory, renderMemoryLine, DistillInputs,
} from '../learnerMemoryFormat';

describe('buildDistillMessages', () => {
  it('embeds prior profile + recent activity and asks for STRICT json', () => {
    const inputs: DistillInputs = {
      priorSummary: 'They are ramping on prompting.',
      priorMisconceptions: ['confuses tokens and words'],
      recentQuestions: ['what is a system prompt?', 'how do I chain calls?'],
      recentGaps: ['eval_methods'],
      recentEvalNotes: ['Week 3 evaluation: 60% not passed'],
      goalHint: 'ship an AI copilot',
    };
    const { system, user } = buildDistillMessages(inputs);
    expect(system).toMatch(/evolving profile/i);
    expect(user).toContain('what is a system prompt?');
    expect(user).toContain('ship an AI copilot');
    expect(user).toContain('They are ramping on prompting.');
    expect(user).toMatch(/evolve it, do not restart it/i);
  });
});

describe('normalizeDistillation', () => {
  it('coerces a well-formed object', () => {
    const m = normalizeDistillation({ summary: 'They learn fast.', misconceptions: ['a', 'b'], goals: 'ship X', strengths: ['systems thinking'] });
    expect(m).toEqual({ summary: 'They learn fast.', misconceptions: ['a', 'b'], goals: 'ship X', strengths: ['systems thinking'] });
  });
  it('defends against junk (missing/wrong types) and caps lists at 4', () => {
    const m = normalizeDistillation({ misconceptions: [1, 'ok', null, 'x', 'y', 'z', 'w'], strengths: 'not-an-array' });
    expect(m.summary).toBe('');
    expect(m.goals).toBe('');
    expect(m.misconceptions).toEqual(['ok', 'x', 'y', 'z']); // non-strings dropped, capped to 4
    expect(m.strengths).toEqual([]);
  });
  it('handles null/undefined input', () => {
    expect(normalizeDistillation(null)).toEqual({ summary: '', misconceptions: [], goals: '', strengths: [] });
  });
});

describe('shouldDistill (idempotency)', () => {
  it('skips when there is no new activity', () => {
    expect(shouldDistill(null, '2026-07-19', false)).toBe(false);
  });
  it('skips when already distilled today (idempotent per day)', () => {
    expect(shouldDistill('2026-07-19', '2026-07-19', true)).toBe(false);
  });
  it('distills when there is new activity and not yet done today', () => {
    expect(shouldDistill('2026-07-18', '2026-07-19', true)).toBe(true);
    expect(shouldDistill(null, '2026-07-19', true)).toBe(true);
  });
});

describe('hasMemory / renderMemoryLine', () => {
  it('empty memory renders nothing', () => {
    expect(hasMemory(null)).toBe(false);
    expect(hasMemory({ summary: '', misconceptions: [], strengths: [] })).toBe(false);
    expect(renderMemoryLine(null)).toBe('');
  });
  it('renders summary + recurring gaps + strengths compactly', () => {
    const line = renderMemoryLine({ summary: 'They think in systems.', misconceptions: ['token vs word'], strengths: ['debugging'] });
    expect(line).toContain('What the mentor has learned about them over time:');
    expect(line).toContain('They think in systems.');
    expect(line).toContain('Recurring gaps: token vs word.');
    expect(line).toContain('Consistent strengths: debugging.');
  });
  it('respects the budget', () => {
    expect(renderMemoryLine({ summary: 'x'.repeat(2000) }, 200).length).toBeLessThanOrEqual(200);
  });
});
