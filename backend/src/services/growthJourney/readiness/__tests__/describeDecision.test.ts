/**
 * MR3: a journey decision has to read as a sentence.
 *
 * ── WHY THIS IS TESTED AGAINST FIXTURES, AND WHY THAT IS NOT A HOLE ────────
 *
 * `growth_journey_decisions` holds **zero rows** in production, and the execution contract
 * forbids flipping the flags that would create one. So fixtures are the only possible input -
 * but they are not invented: every field below is a real column on
 * `GrowthJourneyDecisionAttributes`, and the renderer takes a narrowed subset of that interface
 * so a fixture cannot drift from the model without a compile error.
 *
 * The renderer is built now, before the first run, precisely because the alternative is
 * discovering on the day that the output is unreadable. Today's only reader prints
 * `JSON.stringify(...)` of a row with thirty-odd fields including `candidates`, `suppressed`,
 * `scores` and `eligibility` - right for a machine, wrong for the decision a person has to make.
 *
 * What each group defends:
 *
 *   1. **A shadow decision never reads as something that happened.** This is the one that
 *      matters. A shadow row is a record of what the engine WOULD have done, and past tense
 *      would turn a dry run into an apparent log of sent messages.
 *   2. **"Not contacted" is not rendered as "contacted".** `hold` and `none` are real decisions
 *      and the commonest ones in a first shadow run.
 *   3. **No address, ever**, and no `undefined` or `null` leaking into prose.
 *   4. **The renderer is pure**, so it can be reused and tested without a database.
 */

import fs from 'fs';
import path from 'path';
import { describeDecision, describeDecisions, type DecisionFacts } from '../describeDecision';

const SHADOW: DecisionFacts = {
  subject_ref: 'lead:4821',
  mode: 'shadow',
  selected_action: 'send_nurture_email',
  selected_channel: 'email',
  reason: 'stage_fit_and_no_recent_contact',
};

describe('a shadow decision is conditional, never a record of something that happened', () => {
  it('says it WOULD contact, not that it did', () => {
    const s = describeDecision(SHADOW);
    expect(s).toMatch(/would be sent/);
    expect(s).toMatch(/only if this were live/);
    // The inversion that would turn a dry run into an apparent send log.
    expect(s).not.toMatch(/\bwas sent\b/);
  });

  it('names who, the channel, and the why, in one sentence', () => {
    const s = describeDecision(SHADOW);
    expect(s).toContain('lead:4821');
    expect(s).toContain('by email');
    expect(s).toContain('stage fit and no recent contact');
    expect(s.split('.').filter((x) => x.trim()).length).toBe(1);
  });

  it('a live decision that has NOT executed is still conditional, because the executor may refuse', () => {
    const s = describeDecision({ ...SHADOW, mode: 'live', executed: false });
    expect(s).toMatch(/is approved to be contacted/);
    expect(s).not.toMatch(/\bwas sent\b/);
  });

  it('only a live AND executed decision is past tense', () => {
    const s = describeDecision({ ...SHADOW, mode: 'live', executed: true });
    expect(s).toMatch(/was sent send nurture email by email/);
  });

  it('the run header states once that nothing was sent, so forty sentences do not have to', () => {
    const lines = describeDecisions([SHADOW, { ...SHADOW, subject_ref: 'lead:4822' }]);
    expect(lines[0]).toMatch(/all in shadow: nothing below was sent to anybody/);
    expect(lines).toHaveLength(3);
  });

  it('a mixed run says how many are live rather than claiming all are shadow', () => {
    const lines = describeDecisions([SHADOW, { ...SHADOW, mode: 'live' }]);
    expect(lines[0]).toMatch(/2 decision\(s\), 1 of them live/);
  });

  it('an empty run says so instead of rendering a misleading header', () => {
    expect(describeDecisions([])).toEqual(['No decisions to read.']);
  });
});

describe('a decision NOT to contact is not rendered as a decision to contact', () => {
  it.each(['hold', 'none', 'no_action', '', null, undefined])(
    'action %p reads as NOT contacted', (action) => {
      const s = describeDecision({ ...SHADOW, selected_action: action as string | null });
      expect(s).toMatch(/would NOT be contacted/);
      expect(s).not.toMatch(/would be sent/);
    },
  );

  it('and it does not bother naming a channel nobody will be reached on', () => {
    const s = describeDecision({ ...SHADOW, selected_action: 'hold' });
    expect(s).not.toContain('by email');
  });

  it('a human-review hold is called out, because it is a different state from a refusal', () => {
    const s = describeDecision({ ...SHADOW, requires_human_review: true });
    expect(s).toMatch(/held for human review/);
  });
});

describe('every channel reads as a person would say it', () => {
  it.each([
    ['email', 'by email'],
    ['in_app', 'in the product'],
    ['ali_outreach', 'by a message from Ali'],
    ['sms', 'by text'],
    ['voice', 'by phone'],
  ])('%s renders as %s', (channel, phrase) => {
    expect(describeDecision({ ...SHADOW, selected_channel: channel })).toContain(phrase);
  });

  it('an unknown channel is named rather than dropped', () => {
    expect(describeDecision({ ...SHADOW, selected_channel: 'carrier_pigeon' }))
      .toContain('on the carrier_pigeon channel');
  });

  it('a missing channel says so instead of reading as though one were chosen', () => {
    expect(describeDecision({ ...SHADOW, selected_channel: null }))
      .toContain('on no channel yet chosen');
  });
});

describe('nothing leaks, and nothing renders as a placeholder', () => {
  it('an address in subject_ref is replaced wholesale, not masked', () => {
    // The journey tree's rule: no `@` in output, ever. `redactForLogs` would leave the `@`
    // intact, which is why `scrubField` is the sanctioned tool.
    const s = describeDecision({ ...SHADOW, subject_ref: 'dana.reyes@gmail.com' });
    expect(s).not.toContain('@');
    expect(s).not.toContain('dana');
    expect(s).toContain('redacted');
  });

  it.each([null, undefined, '', '   '])('a missing reason (%p) still ends the sentence honestly', (reason) => {
    const s = describeDecision({ ...SHADOW, reason: reason as string | null });
    expect(s).toContain('no reason was recorded');
    expect(s).not.toMatch(/undefined|null|\[object Object\]/);
  });

  it.each([null, undefined, '', '   '])('a missing subject (%p) does not render as undefined', (ref) => {
    const s = describeDecision({ ...SHADOW, subject_ref: ref as string });
    expect(s).toContain('an unidentified subject');
    expect(s).not.toMatch(/undefined|null/);
  });

  it('a very long reason is capped rather than running away', () => {
    // This test found a real defect. The first version scrubbed only `subject_ref`, on the
    // assumption that it is the one field that can carry an address - but `reason` is a TEXT
    // column of engine-generated free text, so it is both unbounded and the field most likely
    // to quote something about a person.
    const s = describeDecision({ ...SHADOW, reason: 'x'.repeat(500) });
    expect(s).toContain('...');
    expect(s.length).toBeLessThan(400);
  });

  it('an address in the REASON is replaced too, not just one in the subject', () => {
    const s = describeDecision({ ...SHADOW, reason: 'already contacted at dana@gmail.com' });
    expect(s).not.toContain('@');
    expect(s).toContain('redacted');
  });
});

describe('the renderer is pure', () => {
  it('imports no database, no model and no config', () => {
    // The claim in the file header, asserted rather than trusted. This is also why `scrubField`
    // was extracted to its own leaf: importing it from `buildReadiness` would have pulled the
    // whole model barrel into a function that touches nothing.
    const src = fs.readFileSync(path.join(__dirname, '../describeDecision.ts'), 'utf8');
    const imports = [...src.matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]);
    expect(imports).toEqual(['./scrubField']);
  });

  it('returns the same sentence for the same row, and mutates nothing', () => {
    const row = { ...SHADOW };
    const a = describeDecision(row);
    const b = describeDecision(row);
    expect(a).toBe(b);
    expect(row).toEqual(SHADOW);
  });
});
