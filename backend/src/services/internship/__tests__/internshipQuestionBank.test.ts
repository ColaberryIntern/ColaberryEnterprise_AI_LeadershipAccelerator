/**
 * The bank's integrity, and the parity the contract turns on.
 *
 * "Guided and phone channels use the same question keys" is the requirement these
 * tests exist to make unbreakable — not by checking that two lists happen to
 * match, but by proving there is only ONE list and that both phrasings live on it.
 */
import {
  ACTIVE_QUESTION_SET_VERSION,
  QUESTION_BANK_V1,
  SECTION_ORDER,
  SECTION_TITLES,
  activeQuestionKeys,
  activeQuestions,
  confirmationKeys,
  findQuestion,
  isValidAnswer,
  orderedQuestions,
  questionBank,
} from '../internshipQuestionBank';

describe('one bank, two phrasings', () => {
  it('gives every question BOTH a form and a voice phrasing under one key', () => {
    // This is the parity guarantee. A question with only one phrasing would mean
    // one channel silently skips it.
    for (const q of activeQuestions()) {
      expect(q.prompt_form.trim().length).toBeGreaterThan(0);
      expect(q.prompt_voice.trim().length).toBeGreaterThan(0);
      expect(q.question_key).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('has no duplicate keys', () => {
    const keys = activeQuestionKeys();
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('asks every question in exactly one section, and every section is known', () => {
    for (const q of activeQuestions()) {
      expect(SECTION_ORDER).toContain(q.section);
      expect(SECTION_TITLES[q.section]).toBeTruthy();
    }
  });

  it('covers all 21 canonical Group B questions', () => {
    // Pinned deliberately: silently dropping a question would shrink the interview
    // without anything failing.
    expect(QUESTION_BANK_V1).toHaveLength(21);
  });

  it('includes every question the contract names', () => {
    const required = [
      'why_join', 'career_target', 'success_definition',
      'employment_status', 'weekly_hours_commitment', 'can_attend_meetings',
      'conflicting_obligations', 'will_notify_absence',
      'accountable_for_kpis', 'two_active_projects',
      'built_something', 'tool_comfort',
      'when_blocked', 'revision_response', 'unreliable_metric', 'prove_it_works',
      'tools_required_ack', 'tools_ready_or_will_obtain', 'tools_secrets_ack',
      'costs_understood', 'agrees_to_expectations',
    ];
    expect(activeQuestionKeys().sort()).toEqual(required.sort());
  });
});

describe('no question collects a secret', () => {
  it('never asks for a key, password or token', () => {
    for (const q of activeQuestions()) {
      const text = `${q.prompt_form} ${q.prompt_voice}`.toLowerCase();
      // The secrets question must ask for UNDERSTANDING, never for a value.
      expect(text).not.toMatch(/what is your (api|access)?\s*key/);
      expect(text).not.toMatch(/enter your (api key|password|token)/);
      expect(text).not.toMatch(/share your (api key|password)/i);
    }
  });

  it('asks the applicant to confirm they will never share credentials', () => {
    const q = findQuestion('tools_secrets_ack')!;
    expect(q).toBeTruthy();
    expect(q.answer_type).toBe('yes_no');
    expect(q.is_confirmation).toBe(true);
    expect(q.prompt_form.toLowerCase()).toContain('never');
  });
});

describe('ordering', () => {
  it('orders by section then display order, so both channels ask alike', () => {
    const ordered = orderedQuestions();
    const rank = new Map(SECTION_ORDER.map((s, i) => [s, i]));
    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1];
      const cur = ordered[i];
      const rp = rank.get(prev.section)!;
      const rc = rank.get(cur.section)!;
      expect(rp).toBeLessThanOrEqual(rc);
      if (rp === rc) expect(prev.display_order).toBeLessThan(cur.display_order);
    }
  });

  it('returns the same order every time — no reliance on object key order', () => {
    expect(orderedQuestions().map((q) => q.question_key))
      .toEqual(orderedQuestions().map((q) => q.question_key));
  });
});

describe('versioning', () => {
  it('resolves the active version', () => {
    expect(questionBank(ACTIVE_QUESTION_SET_VERSION)).toBe(QUESTION_BANK_V1);
  });

  it('throws on an unknown version rather than guessing', () => {
    // Guessing would silently assess someone against the wrong questions.
    expect(() => questionBank(99)).toThrow(/Unknown internship question set version/);
  });
});

describe('confirmations', () => {
  it('marks every yes/no requirement as a confirmation', () => {
    const keys = confirmationKeys();
    expect(keys).toContain('weekly_hours_commitment');
    expect(keys).toContain('tools_secrets_ack');
    expect(keys).toContain('agrees_to_expectations');
    for (const key of keys) {
      expect(findQuestion(key)!.answer_type).toBe('yes_no');
    }
  });

  it('does not mark open questions as confirmations', () => {
    expect(findQuestion('why_join')!.is_confirmation).toBeUndefined();
    expect(findQuestion('built_something')!.is_confirmation).toBeUndefined();
  });
});

describe('answer validation is shared by both channels', () => {
  const yesNo = findQuestion('weekly_hours_commitment')!;
  const choice = findQuestion('employment_status')!;
  const text = findQuestion('why_join')!;

  it('requires a real boolean for yes/no', () => {
    expect(isValidAnswer(yesNo, { answer_value: true })).toBe(true);
    expect(isValidAnswer(yesNo, { answer_value: false })).toBe(true);
    // A stringified boolean is the classic transcript-extraction bug.
    expect(isValidAnswer(yesNo, { answer_value: 'yes' })).toBe(false);
    expect(isValidAnswer(yesNo, { answer_text: 'yes' })).toBe(false);
  });

  it('requires a declared option for a choice', () => {
    expect(isValidAnswer(choice, { answer_value: 'full_time' })).toBe(true);
    expect(isValidAnswer(choice, { answer_value: 'freelance' })).toBe(false);
  });

  it('requires non-empty text for a text question', () => {
    expect(isValidAnswer(text, { answer_text: 'Because I want to build.' })).toBe(true);
    expect(isValidAnswer(text, { answer_text: '   ' })).toBe(false);
    expect(isValidAnswer(text, {})).toBe(false);
  });

  it('declares options for every choice question, and only those', () => {
    for (const q of activeQuestions()) {
      if (q.answer_type === 'choice') expect((q.options ?? []).length).toBeGreaterThan(1);
      else expect(q.options).toBeUndefined();
    }
  });
});
