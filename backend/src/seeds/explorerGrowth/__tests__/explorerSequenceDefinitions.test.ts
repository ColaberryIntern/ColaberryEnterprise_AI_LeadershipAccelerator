import {
  EXPLORER_SEQUENCES,
  definedSequenceNames,
  NEVER_STATE_CLAUSE,
} from '../explorerSequenceDefinitions';
import { EXPLORER_CAMPAIGNS } from '../explorerCampaignDefinitions';
import { validateSequenceSteps } from '../../../services/sequenceService';

/**
 * EPIC 6 T002.
 *
 * WHAT THESE TESTS DO NOT PROVE, said first so nobody mistakes the scope: the
 * engine GENERATES the message from `ai_instructions` at send time. Scanning
 * those instructions tests the prompt, not the artifact. A model that invents a
 * price at render time passes every assertion below.
 *
 * What they do prove: the steps are structurally valid, no SMS or voice field
 * leaked in, the prohibition reaches every step, and no literal that ships
 * as-written carries a claim we are not authoritative for.
 */

describe('every campaign has a sequence, and vice versa', () => {
  it('matches the campaign definitions one to one', () => {
    expect(definedSequenceNames().sort()).toEqual(EXPLORER_CAMPAIGNS.map((c) => c.sequenceName).sort());
  });

  it('has eight, with unique names', () => {
    expect(EXPLORER_SEQUENCES).toHaveLength(8);
    expect(new Set(definedSequenceNames()).size).toBe(8);
  });
});

describe('the steps are structurally valid', () => {
  it.each(EXPLORER_SEQUENCES.map((s) => [s.name, s] as const))(
    '%s passes validateSequenceSteps',
    (_name, seq) => {
      // The real validator, not a reimplementation: max 12 steps, non-decreasing
      // delays, 2-day minimum gap, 45-day cap.
      const result = validateSequenceSteps(seq.steps);
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    },
  );

  it('carries an empty body_template on every step — the engine renders the copy', () => {
    // Non-optional on the interface, so it must be present; empty because
    // ai_instructions is the content source.
    for (const seq of EXPLORER_SEQUENCES) {
      for (const s of seq.steps) expect(s.body_template).toBe('');
    }
  });

  it('has at least one step in every sequence', () => {
    for (const seq of EXPLORER_SEQUENCES) expect(seq.steps.length).toBeGreaterThan(0);
  });
});

describe('email only — SMS and voice stay blocked pending compliance sign-off', () => {
  it('sets channel email on every step', () => {
    for (const seq of EXPLORER_SEQUENCES) {
      for (const s of seq.steps) expect(s.channel).toBe('email');
    }
  });

  it.each(['sms_template', 'voice_prompt', 'voice_agent_type', 'fallback_channel'] as const)(
    'never sets %s',
    (field) => {
      // Opt-in wording for SMS and voice has no compliance sign-off. A step
      // carrying one of these fields would be ready to use the moment a channel
      // flag flipped, which is exactly the wrong default.
      for (const seq of EXPLORER_SEQUENCES) {
        for (const s of seq.steps) expect(s[field]).toBeUndefined();
      }
    },
  );
});

describe('the prohibition reaches every step', () => {
  it('appends the clause verbatim to all instructions', () => {
    for (const seq of EXPLORER_SEQUENCES) {
      for (const s of seq.steps) expect(s.ai_instructions).toContain(NEVER_STATE_CLAUSE);
    }
  });

  it('names every category we are not authoritative for', () => {
    // If one is dropped from the clause, it silently stops being prohibited in
    // all 24 steps at once.
    for (const term of ['cohort date', 'price', 'payment deadline', 'seat count', 'consented']) {
      expect(NEVER_STATE_CLAUSE).toContain(term);
    }
  });

  it('is one shared constant, not eight copies that can drift', () => {
    const clauses = EXPLORER_SEQUENCES.flatMap((s) =>
      s.steps.map((st) => st.ai_instructions!.slice(-NEVER_STATE_CLAUSE.length)),
    );
    expect(new Set(clauses).size).toBe(1);
  });
});

describe('literals that ship as written carry no claim', () => {
  const subjects = EXPLORER_SEQUENCES.flatMap((s) => s.steps.map((st) => st.subject));

  it('found subjects to check', () => {
    expect(subjects.length).toBeGreaterThan(7);
  });

  it.each([
    ['a price', /\$\s?\d/],
    ['a date', /\d{4}-\d{2}-\d{2}|\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i],
    ['a guarantee', /guarantee/i],
    ['a seat count', /\d+\s*(seats?|spots?|places?)/i],
  ])('no subject states %s', (_label, pattern) => {
    // Subjects are the one part of a step that reaches the recipient verbatim,
    // so this assertion is real rather than a proxy — unlike the same scan over
    // ai_instructions, which only tests the prompt.
    for (const s of subjects) expect(s).not.toMatch(pattern as RegExp);
  });

  it('keeps subjects short enough not to truncate in a client', () => {
    for (const s of subjects) expect(s.length).toBeLessThanOrEqual(60);
  });
});
