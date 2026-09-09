import {
  isSuppressedForChannel,
  isLegacyGlobalEvent,
  isGlobalChannel,
  optOutSuppressesGlobally,
  PER_CHANNEL_SUPPRESSION_CUTOFF,
  type SuppressionEvent,
} from '../channelSuppression';

/**
 * Plan §35 D-4: fix per-channel suppression, "but only for opt-outs recorded
 * after the change. Never retroactively un-suppress anyone."
 *
 * Two properties, pulling opposite ways, and the second is the one that keeps
 * this safe:
 *
 *   1. A NEW SMS opt-out must not block email.
 *   2. An OLD SMS opt-out must still block everything, because that is what it
 *      meant when it was written and what has been enforced ever since.
 *
 * Getting (1) without (2) means quietly mailing people who told us to stop.
 */

const BEFORE = new Date(PER_CHANNEL_SUPPRESSION_CUTOFF.getTime() - 86_400_000);
const AFTER = new Date(PER_CHANNEL_SUPPRESSION_CUTOFF.getTime() + 86_400_000);

const ev = (channel: string | null, created_at: Date): SuppressionEvent => ({ channel, created_at });

describe('a NEW sms opt-out leaves email alone', () => {
  it('does not block email', () => {
    expect(isSuppressedForChannel([ev('sms', AFTER)], 'email').suppressed).toBe(false);
  });

  it('still blocks sms', () => {
    const r = isSuppressedForChannel([ev('sms', AFTER)], 'sms');
    expect(r.suppressed).toBe(true);
    expect(r.reason).toContain('sms');
  });

  it('does not block voice either — declining texts is not declining calls', () => {
    expect(isSuppressedForChannel([ev('sms', AFTER)], 'voice').suppressed).toBe(false);
  });

  it('a new voice opt-out leaves email and sms alone', () => {
    expect(isSuppressedForChannel([ev('voice', AFTER)], 'email').suppressed).toBe(false);
    expect(isSuppressedForChannel([ev('voice', AFTER)], 'sms').suppressed).toBe(false);
    expect(isSuppressedForChannel([ev('voice', AFTER)], 'voice').suppressed).toBe(true);
  });
});

describe('an OLD opt-out still blocks everything (§35 D-4)', () => {
  it('blocks email even though its channel says sms', () => {
    // The row was written under global semantics and has been enforced that way
    // ever since. Reading it per-channel re-opens a door someone closed.
    const r = isSuppressedForChannel([ev('sms', BEFORE)], 'email');
    expect(r.suppressed).toBe(true);
    expect(r.reason).toContain('legacy');
  });

  it('blocks every channel', () => {
    for (const ch of ['email', 'sms', 'voice'] as const) {
      expect(isSuppressedForChannel([ev('voice', BEFORE)], ch).suppressed).toBe(true);
    }
  });

  it('treats an event exactly AT the cutoff as new', () => {
    expect(isLegacyGlobalEvent(ev('sms', PER_CHANNEL_SUPPRESSION_CUTOFF))).toBe(false);
    expect(
      isLegacyGlobalEvent(ev('sms', new Date(PER_CHANNEL_SUPPRESSION_CUTOFF.getTime() - 1))),
    ).toBe(true);
  });

  it('treats an undateable event as legacy', () => {
    // The conservative reading: the alternative narrows a suppression we cannot
    // date.
    expect(isLegacyGlobalEvent({ channel: 'sms', created_at: 'not a date' })).toBe(true);
  });

  it('one legacy row is enough, even among newer per-channel ones', () => {
    const events = [ev('sms', AFTER), ev('sms', BEFORE)];
    expect(isSuppressedForChannel(events, 'email').suppressed).toBe(true);
  });
});

describe('a global opt-out blocks everything, new or old', () => {
  it.each(['all', 'any', '', 'global', 'unknown', null, 'something-nobody-validated'])(
    'treats channel %j as global',
    (channel) => {
      expect(isGlobalChannel(channel as any)).toBe(true);
      expect(isSuppressedForChannel([ev(channel as any, AFTER)], 'email').suppressed).toBe(true);
    },
  );

  it('does not treat a real channel as global', () => {
    for (const c of ['email', 'sms', 'voice']) expect(isGlobalChannel(c)).toBe(false);
  });

  it('is case and whitespace tolerant', () => {
    expect(isSuppressedForChannel([ev('  SMS  ', AFTER)], 'sms').suppressed).toBe(true);
    expect(isSuppressedForChannel([ev('  SMS  ', AFTER)], 'email').suppressed).toBe(false);
  });
});

describe('callers that name no channel keep the old behaviour exactly', () => {
  it('blocks on any event when no channel is given', () => {
    // Every existing caller of checkLeadSendable is in this position. Nothing
    // changes for a path that has not been reviewed.
    expect(isSuppressedForChannel([ev('sms', AFTER)]).suppressed).toBe(true);
    expect(isSuppressedForChannel([ev('sms', BEFORE)]).suppressed).toBe(true);
    expect(isSuppressedForChannel([ev('email', AFTER)]).suppressed).toBe(true);
  });

  it('permits when there are no events at all', () => {
    expect(isSuppressedForChannel([]).suppressed).toBe(false);
    expect(isSuppressedForChannel([], 'email').suppressed).toBe(false);
  });
});

describe('which opt-outs still set the global lead status', () => {
  it('sms and voice do NOT', () => {
    // The entire point: their opt-out lives in the event and the consent
    // ledger, both already per-channel, and the person stays emailable.
    expect(optOutSuppressesGlobally('sms')).toBe(false);
    expect(optOutSuppressesGlobally('voice')).toBe(false);
  });

  it('email still does — unchanged', () => {
    // An email unsubscribe is the primary meaning of Lead.status
    // 'unsubscribed'. Narrowing it would be a change nobody asked for.
    expect(optOutSuppressesGlobally('email')).toBe(true);
  });

  it.each(['all', '', null, undefined, 'mystery'])('%j still suppresses globally', (c) => {
    expect(optOutSuppressesGlobally(c as any)).toBe(true);
  });
});
