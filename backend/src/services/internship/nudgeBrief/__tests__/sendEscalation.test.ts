/**
 * sendBrief is the backstop, and this file proves it is one.
 *
 * `escalationGate.test.ts` covers the rule. This covers the thing only the seam can get wrong:
 * the gate is checked on the body that is ACTUALLY transmitted, not on the one the composer
 * produced. Three ways a harder sentence arrives after composition, and all three land here:
 * a manager editing the text in the box, the model rewriting the middle, and a brief composed
 * before this gate existed and so carrying no warrant at all.
 *
 * `guardedSendMail` is mocked and asserted on rather than stubbed away, because the only claim
 * worth making is that nothing reached the transport.
 */
const mockGuardedSendMail = jest.fn(async () => ({ messageId: 'M1' }));
jest.mock('../../../emailService', () => ({
  guardedSendMail: (...a: unknown[]) => mockGuardedSendMail(...(a as [])),
}));

const mockKillSwitch = jest.fn(async () => false);
jest.mock('../../../launchSafety', () => ({ isKillSwitchActive: () => mockKillSwitch() }));

/** Faithful stand-in: claim, call the provider, report its outcome. */
jest.mock('../../../email/idempotentSend', () => ({
  sendOnce: async (_id: unknown, send: () => Promise<{ ok: boolean; messageId?: string }>) => {
    const r = await send();
    return r.ok ? { outcome: 'sent', messageId: r.messageId } : { outcome: 'failed', errorClass: 'E', error: 'e' };
  },
}));

import { sendBrief } from '../send';
import type { EscalationWarrant } from '../escalationGate';
import type { NudgeBrief } from '../types';

const NOW = new Date('2026-11-13T12:00:00Z');

const WARRANT = (level: EscalationWarrant['level']): EscalationWarrant => ({
  hasAssignedProject: level !== 'none',
  daysSinceTheirLastWord: 30,
  unansweredOutbound: 5,
  weOweThemAnAnswer: false,
  level,
  reason: 'test warrant',
});

const brief = (over: Partial<NudgeBrief> = {}): NudgeBrief => ({
  enrollmentId: 'e1',
  name: 'Test Person',
  firstName: 'Test',
  email: 'test@example.test',
  tier: 'quiet',
  subject: 'Where things stand',
  body: 'Push whatever you have today, even partially, so I can see where it stands.',
  escalation: WARRANT('none'),
  generatedAt: NOW.toISOString(),
  ...over,
} as unknown as NudgeBrief);

/** The sentence from the 12 November message that offers them the exit. */
const EXIT_OFFER = 'Tell me honestly whether you have decided you are done with the internship.';

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
});
afterEach(() => jest.restoreAllMocks());

describe('the gate is applied to the body that is actually sent', () => {
  it('refuses an edited body that escalates past the warrant, and sends nothing', async () => {
    const out = await sendBrief({
      brief: brief(),
      body: EXIT_OFFER,
      subject: 'Where things stand',
      dryRun: false,
      now: NOW,
    });

    expect(out.outcome).toBe('skipped');
    if (out.outcome === 'skipped') expect(out.reason).toMatch(/^escalation_unwarranted:/);
    expect(mockGuardedSendMail).not.toHaveBeenCalled();
  });

  it('refuses it on a DRY RUN too, so a preview never shows a message we would not send', async () => {
    const out = await sendBrief({
      brief: brief(), body: EXIT_OFFER, subject: 's', dryRun: true, now: NOW,
    });
    expect(out.outcome).toBe('skipped');
  });

  it('refuses when the brief carries no warrant at all', async () => {
    const out = await sendBrief({
      brief: brief({ escalation: undefined as never }),
      body: EXIT_OFFER, subject: 's', dryRun: false, now: NOW,
    });
    expect(out.outcome).toBe('skipped');
    if (out.outcome === 'skipped') expect(out.reason).toMatch(/no warrant was computed/);
    expect(mockGuardedSendMail).not.toHaveBeenCalled();
  });

  it('sends the same body when the evidence supports it', async () => {
    const out = await sendBrief({
      brief: brief({ escalation: WARRANT('ultimatum') }),
      body: EXIT_OFFER, subject: 's', dryRun: false, now: NOW,
    });
    expect(out.outcome).toBe('sent');
    expect(mockGuardedSendMail).toHaveBeenCalledTimes(1);
  });
});

describe('it does not get in the way of ordinary mail', () => {
  it('sends an unescalated body under the strictest warrant, with Ali bcc', async () => {
    const out = await sendBrief({ brief: brief(), body: brief().body, subject: 's', dryRun: false, now: NOW });
    expect(out.outcome).toBe('sent');
    expect(mockGuardedSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'test@example.test', bcc: 'ali@colaberry.com' }),
    );
  });
});
