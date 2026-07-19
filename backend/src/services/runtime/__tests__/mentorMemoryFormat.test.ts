/**
 * mentorMemoryFormat — unit tests for the pure conversation-window builder.
 * Hermetic (no DB): turns→messages, older-turn summarization, and the window
 * (recent verbatim + rolling summary).
 */
import { turnsToMessages, summarizeTurns, buildConversationWindow, TurnLike } from '../mentorMemoryFormat';

const t = (question: string | null, reply: string | null, mode?: string): TurnLike => ({ question, reply, mode });

describe('turnsToMessages', () => {
  it('expands complete turns into alternating user/assistant messages', () => {
    const msgs = turnsToMessages([t('what is a token?', 'a word piece'), t('and embeddings?', 'vectors')]);
    expect(msgs).toEqual([
      { role: 'user', content: 'what is a token?' },
      { role: 'assistant', content: 'a word piece' },
      { role: 'user', content: 'and embeddings?' },
      { role: 'assistant', content: 'vectors' },
    ]);
  });

  it('skips incomplete turns (no reply) and labels empty questions by mode', () => {
    const msgs = turnsToMessages([t('', 'here is a nudge', 'hint'), t('unanswered', null)]);
    expect(msgs).toEqual([
      { role: 'user', content: '(hint requested)' },
      { role: 'assistant', content: 'here is a nudge' },
    ]);
  });
});

describe('summarizeTurns', () => {
  it('summarizes older exchanges compactly', () => {
    const s = summarizeTurns([t('tokens', 'x'), t('prompting basics', 'y')]);
    expect(s).toBe('the student worked through 2 earlier exchanges on: tokens; prompting basics');
  });
  it('returns empty for no completed older turns', () => {
    expect(summarizeTurns([])).toBe('');
    expect(summarizeTurns([t('q', null)])).toBe('');
  });
  it('respects the budget', () => {
    const many = Array.from({ length: 50 }, (_, i) => t('topic ' + 'x'.repeat(20) + i, 'r'));
    expect(summarizeTurns(many, 120).length).toBeLessThanOrEqual(120);
  });
});

describe('buildConversationWindow', () => {
  it('keeps the last N verbatim and summarizes the rest', () => {
    const turns = Array.from({ length: 10 }, (_, i) => t('q' + i, 'r' + i));
    const { summary, recent } = buildConversationWindow(turns, 6);
    expect(recent).toHaveLength(12);              // 6 turns * 2 messages
    expect(recent[0]).toEqual({ role: 'user', content: 'q4' }); // turns 4..9 are recent
    expect(recent[11]).toEqual({ role: 'assistant', content: 'r9' });
    expect(summary).toContain('4 earlier exchanges'); // turns 0..3 summarized
  });

  it('no summary when everything fits in the window', () => {
    const { summary, recent } = buildConversationWindow([t('q1', 'r1'), t('q2', 'r2')], 6);
    expect(summary).toBe('');
    expect(recent).toHaveLength(4);
  });

  it('empty in, empty out', () => {
    expect(buildConversationWindow([], 6)).toEqual({ summary: '', recent: [] });
  });
});
