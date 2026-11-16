/**
 * Every case below is a reply Cora actually generated in shadow mode on
 * 2026-11-15, replayed against real unanswered support mail. The strings in the
 * "violating" tests are hers, not invented examples.
 *
 * These tests do two jobs: they pin the violation detector's behaviour, and they
 * pin the rules block itself against silent deletion. A rules block that loses a
 * rule looks exactly like one that never had it.
 */
import {
  CORA_PROMPT_RULES,
  CORA_REPLY_VIOLATIONS,
  findCoraReplyViolations,
} from '../coraPromptRules';

describe('CORA_PROMPT_RULES', () => {
  it('states that the rules override the knowledge base', () => {
    expect(CORA_PROMPT_RULES).toMatch(/override anything in the knowledge base/i);
  });

  it('bans the word free outright rather than as a judgement call', () => {
    // The knowledge base was edited to say "no charge" and the model paraphrased
    // it back to "free" anyway, which is why this has to be an absolute.
    expect(CORA_PROMPT_RULES).toMatch(/The word "free" must never appear/);
  });

  it('forbids stating a policy the knowledge base does not state', () => {
    expect(CORA_PROMPT_RULES).toMatch(/Never state a policy the knowledge base does not state/);
    expect(CORA_PROMPT_RULES).toMatch(/refunds/i);
  });

  it('forbids placement claims in either direction', () => {
    expect(CORA_PROMPT_RULES).toMatch(/Never promise an outcome/);
    expect(CORA_PROMPT_RULES).toMatch(/do or do not guarantee employment/);
  });

  it('forbids naming a person or address that is not in the knowledge base', () => {
    expect(CORA_PROMPT_RULES).toMatch(/Never name a person, team, department, or email address/);
  });

  it('forbids confirming that an action was taken', () => {
    expect(CORA_PROMPT_RULES).toMatch(/Never confirm that an action has been taken/);
  });

  it('tells her the sender may already be a student', () => {
    expect(CORA_PROMPT_RULES).toMatch(/may already be a student/);
    // The contracted form has to be named: it is what the model actually wrote.
    expect(CORA_PROMPT_RULES).toMatch(/once you're enrolled/);
  });

  it('names software troubleshooting as a handoff rather than an answer', () => {
    // Rule 7's general wording did not stop her troubleshooting a Power BI
    // dashboard from general knowledge, so the category is named explicitly.
    expect(CORA_PROMPT_RULES).toMatch(/do not troubleshoot software from/);
    expect(CORA_PROMPT_RULES).toMatch(/Power BI/);
  });

  it('tells her to decline without inviting a follow-up', () => {
    expect(CORA_PROMPT_RULES).toMatch(/When you decline something, close the message/);
  });

  it('defines needs_human and defaults it to true under uncertainty', () => {
    expect(CORA_PROMPT_RULES).toMatch(/needs_human/);
    expect(CORA_PROMPT_RULES).toMatch(/not sure, set it to TRUE/);
  });

  it('does not itself use the word it bans, outside rule 1 stating the ban', () => {
    // The rules block is injected verbatim into the prompt. A stray "feel free" in
    // the instructions would model the behaviour being forbidden, so the only
    // occurrences allowed are the two inside rule 1's own wording.
    const ruleOneEnd = CORA_PROMPT_RULES.indexOf('\n2. Never state a policy');
    expect(ruleOneEnd).toBeGreaterThan(0);
    const afterRuleOne = CORA_PROMPT_RULES.slice(ruleOneEnd);
    expect(afterRuleOne).not.toMatch(/\bfree\b/i);
  });
});

describe('findCoraReplyViolations', () => {
  it('returns nothing for an empty body', () => {
    expect(findCoraReplyViolations('')).toEqual([]);
  });

  it('passes a clean reply', () => {
    const clean =
      'I have logged your request to delete your account and passed it to the team ' +
      'that handles data requests. You will hear from a person rather than from me.';
    expect(findCoraReplyViolations(clean)).toEqual([]);
  });

  describe('rule 1: the word free', () => {
    it('catches it describing a third-party tool', () => {
      // Her Genay reply, after the KB had been changed to say "no charge".
      expect(findCoraReplyViolations('Docker Desktop is free for individual use.'))
        .toContain('advertises_free');
    });

    it('catches it advertising an event', () => {
      expect(findCoraReplyViolations('The Open House is completely free to attend.'))
        .toContain('advertises_free');
    });

    it('catches the closing phrase that reopens a decline', () => {
      expect(findCoraReplyViolations('We do not review vendor offers. Feel free to ask.'))
        .toContain('advertises_free');
    });

    it('does not fire on words that merely contain it', () => {
      expect(findCoraReplyViolations('You will have freedom to choose your project, freely.'))
        .toEqual([]);
    });
  });

  describe('rule 2: invented policy', () => {
    it('catches the refund policy she invented', () => {
      const invented =
        'We do not offer refunds for the membership fees once they have been paid.';
      expect(findCoraReplyViolations(invented)).toContain('states_refund_policy');
    });

    it('catches a non-refundable claim', () => {
      expect(findCoraReplyViolations('The deposit is non-refundable.'))
        .toContain('states_refund_policy');
    });

    it('does not fire on routing a refund request to a person', () => {
      const routed =
        'I am not able to state the refund policy from here. I have passed your ' +
        'request on so a person can give you the terms that apply to your plan.';
      expect(findCoraReplyViolations(routed)).toEqual([]);
    });
  });

  describe('rule 3: placement claims', () => {
    it('catches the disclaimer she volunteered', () => {
      // Unprompted, in a reply to a laid-off alum. A negative claim is still a claim.
      expect(findCoraReplyViolations('Please note that we do not guarantee job placements.'))
        .toContain('placement_claim');
    });

    it('catches a positive claim', () => {
      expect(findCoraReplyViolations('We guarantee a job within six months.'))
        .toContain('placement_claim');
    });

    it('does not fire on describing career support without a claim', () => {
      expect(findCoraReplyViolations('I am not able to review resumes or make introductions.'))
        .toEqual([]);
    });
  });

  describe('rule 5: confirming an action', () => {
    it('catches the deletion confirmation she promised', () => {
      const promised =
        'You will receive a confirmation once your account has been permanently deleted.';
      expect(findCoraReplyViolations(promised)).toContain('confirms_action');
    });

    it('catches a refund confirmation', () => {
      expect(findCoraReplyViolations('Your payment was refunded on Tuesday.'))
        .toContain('confirms_action');
    });

    it('does not fire on saying a request was passed on', () => {
      expect(findCoraReplyViolations('I have passed your request to the team.')).toEqual([]);
    });
  });

  describe('rule 6: assuming the sender is not enrolled', () => {
    it('catches it', () => {
      // Said to a student who was already in orientation.
      expect(findCoraReplyViolations('Once you enroll, you will get access to the portal.'))
        .toContain('assumes_not_enrolled');
    });

    it('catches the past-tense phrasing too', () => {
      expect(findCoraReplyViolations('Once you are enrolled, your cohort will be assigned.'))
        .toContain('assumes_not_enrolled');
    });

    it('catches the contraction, which the first version of this check missed', () => {
      // Said to Michael, who had already attended the first orientation session.
      const missed = "You can also find them in the portal once you're enrolled.";
      expect(findCoraReplyViolations(missed)).toContain('assumes_not_enrolled');
    });

    it('catches the curly apostrophe a model is as likely to emit', () => {
      expect(findCoraReplyViolations('Available in the portal once you’re enrolled.'))
        .toContain('assumes_not_enrolled');
    });

    it('does not fire on telling an enrolled student where something is', () => {
      expect(findCoraReplyViolations('The setup instructions are in the portal under Resources.'))
        .toEqual([]);
    });
  });

  it('reports every rule a single reply trips, in rule order', () => {
    const bad =
      'The Open House is free. We do not offer refunds. Your account has been deleted.';
    expect(findCoraReplyViolations(bad)).toEqual([
      'advertises_free',
      'states_refund_policy',
      'confirms_action',
    ]);
  });

  it('has a unique id per check, so a caller can key on them', () => {
    const ids = CORA_REPLY_VIOLATIONS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
