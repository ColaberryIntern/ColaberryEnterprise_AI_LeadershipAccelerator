/**
 * The renewal email must not teach members how to leave.
 *
 * ── WHAT IT USED TO SAY ─────────────────────────────────────────────────────
 *
 * Two sentences, both true when written, and together they made lapsing the
 * path of least resistance:
 *
 *   "Nothing bills automatically, so this payment has to come from you."
 *   "If you would rather stop here, do nothing and no payment will be taken."
 *
 * Silence is the easiest thing a busy person does. So staying was the effortful
 * choice and leaving was the default, in a monthly email, to every member. The
 * July cohort started on 13 July and should have been on their third payment by
 * 1 September; 21 members had paid exactly once.
 *
 * ── WHY THE FIRST SENTENCE ALSO HAD TO GO ───────────────────────────────────
 *
 * On 2026-09-01, 20 members were migrated onto standing PaySimple schedules,
 * taking auto-pay from 1 member to 21. For those members the sentence is now
 * FALSE, and worse than false: telling someone to go and pay when a schedule
 * will collect it invites a second payment for the same period.
 *
 * So the mail branches. With a schedule it is a heads-up that money is about to
 * move and there is nothing to do. Without one it is a request. Both still offer
 * cancellation, because the point was never to trap anyone; it is that leaving
 * should be something a member SAYS, not something that happens to them through
 * inaction.
 *
 * ── WHAT EACH TEST WOULD CATCH ──────────────────────────────────────────────
 *
 *   1-2  either banned sentence returning, in either body. These are the
 *        regression guards and the reason this file exists.
 *   3-4  an auto-pay member being told to go and pay, which is the one failure
 *        that costs a member money rather than costing us a renewal.
 *   5    a manual member losing the payment link entirely, which would be a
 *        worse bug than the one being fixed.
 *   6-7  cancellation staying genuinely available in both branches, so this is
 *        a change of default and not a trap.
 *   8    the lapsed branch untouched: it already required the member to reply
 *        with a word, which was never the problem.
 */
import { renderRenewalReminderEmail } from '../renewalReminderEmail';

const BANNED_BILLS = 'Nothing bills automatically';
const BANNED_DONOTHING = 'do nothing and no payment will be taken';

function base(overrides: Record<string, unknown> = {}) {
  return {
    full_name: 'Test Member',
    email: 'member@example.test',
    plan: 'monthly',
    kind: 'before_7d' as never,
    period_end: new Date(Date.now() + 7 * 86400_000).toISOString(),
    amount_cents: 19900,
    applied_credit_cents: 0,
    payment_link: 'https://checkout.example.test/abc',
    day_delta: 7,
    ...overrides,
  } as never;
}

describe('the sentences that taught members to lapse are gone', () => {
  it('never says billing is manual, on either branch', () => {
    for (const autopay of [true, false]) {
      const e = renderRenewalReminderEmail(base({ autopay }));
      expect(e.text).not.toContain(BANNED_BILLS);
      expect(e.html).not.toContain(BANNED_BILLS);
    }
  });

  it('never offers inaction as the way to leave, on either branch', () => {
    for (const autopay of [true, false]) {
      const e = renderRenewalReminderEmail(base({ autopay }));
      expect(e.text).not.toContain(BANNED_DONOTHING);
      expect(e.html).not.toContain(BANNED_DONOTHING);
    }
  });
});

describe('an auto-pay member is told, not asked', () => {
  it('says there is nothing for them to do', () => {
    const e = renderRenewalReminderEmail(base({ autopay: true }));
    expect(e.text).toMatch(/nothing for you to do/i);
  });

  it('does not tell them their payment has to come from them', () => {
    const e = renderRenewalReminderEmail(base({ autopay: true }));
    // The failure that costs a member money: paying a second time for a period
    // a standing schedule is already going to collect.
    expect(e.text).not.toMatch(/has to come from you/i);
  });
});

describe('a manual member still gets what they need', () => {
  it('keeps the payment link, which is the whole point of the mail', () => {
    const e = renderRenewalReminderEmail(base({ autopay: false }));
    expect(e.text).toContain('https://checkout.example.test/abc');
  });
});

describe('leaving stays possible, it is only no longer the default', () => {
  it('an auto-pay member is told how to stop before the charge', () => {
    const e = renderRenewalReminderEmail(base({ autopay: true }));
    expect(e.text).toMatch(/pause, or stop|reply and tell me/i);
  });

  it('a manual member is told how to stop', () => {
    const e = renderRenewalReminderEmail(base({ autopay: false }));
    expect(e.text).toMatch(/stop your membership|reply and tell me/i);
  });
});

describe('the lapsed branch is unchanged', () => {
  it('still asks a lapsed member to reply with the word cancel', () => {
    const e = renderRenewalReminderEmail(base({
      day_delta: -3,
      kind: 'after_lapse_1d' as never,
      period_end: new Date(Date.now() - 3 * 86400_000).toISOString(),
    }));
    // This branch already required an explicit word rather than silence, so it
    // was never the defect and must not drift while the others change.
    expect(e.text).toMatch(/reply with the word/i);
  });
});
