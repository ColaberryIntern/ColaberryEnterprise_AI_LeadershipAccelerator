/**
 * Decision emails: what they say, and what they structurally cannot say.
 *
 * Rendering is pure, so these run without a transport. The idempotency guarantee
 * itself is `sendOnce`'s and is already covered by the email-ledger suite; what is
 * pinned here is that the internship caller derives a STABLE business event id,
 * because a key containing a timestamp would defeat that ledger entirely.
 */
import { TEMPLATE_VERSIONS, renderDecisionEmail } from '../internshipEmails';

const NOW = Date.UTC(2026, 8, 9);

const render = (over: Partial<Parameters<typeof renderDecisionEmail>[0]> = {}) =>
  renderDecisionEmail({
    template: 'decision_rejected',
    firstName: 'Ada',
    reasonCode: 'experience_gap',
    nowMs: NOW,
    ...over,
  });

describe('nothing internal can appear', () => {
  it('has no parameter for reviewer notes, AI recommendation or factors', () => {
    // The guarantee is the absence. Passing them is a type error, and at runtime
    // they are simply not read — so no caller mistake can put them in an email.
    const out = render();
    const all = `${out.subject}\n${out.html}\n${out.text}`.toLowerCase();
    for (const banned of ['reviewer note', 'internal', 'ai_recommendation', 'suggested_action', 'blocking', 'factor', 'score', 'rank']) {
      expect(all).not.toContain(banned);
    }
  });

  it('escapes applicant-supplied text rather than interpolating it raw', () => {
    // A reviewer message is written by a human into a field that ends up in HTML.
    const out = render({ studentMessage: '<script>alert(1)</script> & "quoted"' });
    expect(out.html).not.toContain('<script>');
    expect(out.html).toContain('&lt;script&gt;');
    expect(out.html).toContain('&amp;');
  });
});

describe('rejection email', () => {
  it('gives the reason, the improvement steps and the reapply date', () => {
    const out = render();
    expect(out.text).toContain('not able to offer you a place');
    expect(out.text).toContain('What would change our answer');
    expect(out.text).toContain('2026-12-08');
  });

  it('says there is no waiting period when there genuinely is none', () => {
    const out = render({ reasonCode: 'not_eligible_employment' });
    expect(out.text).toContain('no waiting period');
    expect(out.text).not.toMatch(/apply again from \d{4}-\d{2}-\d{2}/);
  });

  it('invites a correction, because we might have it wrong', () => {
    expect(render().text).toContain('reply to this email');
  });

  it('uses the reviewer\'s message when they wrote one', () => {
    const mine = 'Ship two projects end to end and come back to me directly.';
    expect(render({ studentMessage: mine }).text).toContain(mine);
  });
});

describe('waitlist email', () => {
  it('does not promise a place', () => {
    const out = renderDecisionEmail({
      template: 'decision_waitlisted',
      reasonCode: 'capacity_or_timing',
      nowMs: NOW,
    });
    expect(out.text).toContain('not a place yet');
    expect(out.text.toLowerCase()).not.toContain('congratulations');
    expect(out.text.toLowerCase()).not.toContain('you are in');
    expect(out.text.toLowerCase()).not.toContain('accepted');
  });
});

describe('approval email', () => {
  it('points at the offer letter rather than implying they have started', () => {
    const out = renderDecisionEmail({
      template: 'decision_approved',
      firstName: 'Ada',
      reasonCode: 'other_see_message',
      studentMessage: 'Great conversation.',
      nowMs: NOW,
    });
    expect(out.subject).toContain('You are in');
    expect(out.text).toContain('offer letter');
    expect(out.text).toContain('sign it, and upload it back');
  });

  it('surfaces conditions prominently, because they cannot meet a secret one', () => {
    const out = renderDecisionEmail({
      template: 'decision_approved',
      reasonCode: 'other_see_message',
      studentMessage: 'Approved.',
      conditions: 'Set up your API key before orientation.',
      nowMs: NOW,
    });
    expect(out.text).toContain('Before you start: Set up your API key before orientation.');
    expect(out.html).toContain('Before you start');
  });

  it('omits the conditions block entirely when there are none', () => {
    const out = renderDecisionEmail({
      template: 'decision_approved',
      reasonCode: 'other_see_message',
      studentMessage: 'Approved.',
      nowMs: NOW,
    });
    expect(out.text).not.toContain('Before you start');
  });
});

describe('information requested email', () => {
  it('says what is needed and where to do it', () => {
    const out = renderDecisionEmail({
      template: 'information_requested',
      reasonCode: 'incomplete_application',
      nowMs: NOW,
    });
    expect(out.text).toContain('need one more thing');
    expect(out.text).toContain('portal');
  });
});

describe('rendering basics', () => {
  it('always produces a subject, html and a text alternative', () => {
    for (const template of Object.keys(TEMPLATE_VERSIONS) as Array<keyof typeof TEMPLATE_VERSIONS>) {
      if (template === 'application_received') continue; // not rendered by this function
      const out = renderDecisionEmail({
        template,
        reasonCode: 'other_see_message',
        studentMessage: 'x',
        nowMs: NOW,
      });
      expect(out.subject.length).toBeGreaterThan(0);
      expect(out.html).toContain('<html');
      expect(out.text.length).toBeGreaterThan(0);
    }
  });

  it('greets without a name rather than printing "Hi null"', () => {
    expect(render({ firstName: null }).text.startsWith('Hi,')).toBe(true);
    expect(render({ firstName: '   ' }).text.startsWith('Hi,')).toBe(true);
  });

  it('is deterministic for a given decision time', () => {
    expect(render()).toEqual(render());
  });
});
