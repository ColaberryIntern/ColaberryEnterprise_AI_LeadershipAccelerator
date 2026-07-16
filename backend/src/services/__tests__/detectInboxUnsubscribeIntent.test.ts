/**
 * Unit tests for the tightened inbound-unsubscribe detector.
 *
 * Two goals, in tension:
 *  - GENUINE requests must still be caught (missing one = CAN-SPAM violation).
 *  - False positives (internal staff discussing/forwarding campaigns, quoted
 *    footers) must NOT auto-unsubscribe the sender.
 */
import { detectInboxUnsubscribeIntent, topReplyText } from '../unsubscribeEnforcementService';

describe('detectInboxUnsubscribeIntent — genuine requests still match', () => {
  it('native mail-client / explicit "unsubscribe" subject', () => {
    expect(detectInboxUnsubscribeIntent('unsubscribe', '', 'joe@acme.com'))
      .toEqual({ matched: true, via: 'subject' });
    expect(detectInboxUnsubscribeIntent('Re: unsubscribe', 'Apple Mail sent this...', 'joe@acme.com').matched)
      .toBe(true);
  });

  it('short one-word/one-line body reply', () => {
    expect(detectInboxUnsubscribeIntent('Re: Your AI cohort', 'unsubscribe', 'joe@acme.com'))
      .toEqual({ matched: true, via: 'body' });
    expect(detectInboxUnsubscribeIntent('Re: Your AI cohort', 'Thanks but swamped. Unsubscribe. Cheers, Bob', 'joe@acme.com').matched)
      .toBe(true);
  });

  it('imperative phrases match even in a long message', () => {
    const longRant = 'I have asked repeatedly and I am frustrated. '.repeat(6) + ' Please take me off your list.';
    expect(longRant.length).toBeGreaterThan(240);
    expect(detectInboxUnsubscribeIntent('Re: hello', longRant, 'joe@acme.com').matched).toBe(true);
    expect(detectInboxUnsubscribeIntent('Re: hello', 'please remove me from your list', 'joe@acme.com').matched).toBe(true);
    expect(detectInboxUnsubscribeIntent('Re: hello', 'stop emailing me', 'joe@acme.com').matched).toBe(true);
    expect(detectInboxUnsubscribeIntent('Re: hello', 'opt out', 'joe@acme.com').matched).toBe(true);
  });

  it('genuine request above a quoted history is caught', () => {
    const body = 'please unsubscribe me\n\nOn Mon, Jul 14, 2026 at 9:00 AM Ali <ali@colaberry.com> wrote:\n> Hi, join our cohort ... click here to unsubscribe';
    expect(detectInboxUnsubscribeIntent('Re: cohort', body, 'joe@acme.com')).toEqual({ matched: true, via: 'body' });
  });
});

describe('detectInboxUnsubscribeIntent — false positives are rejected', () => {
  it('skips internal @colaberry.com senders entirely', () => {
    expect(detectInboxUnsubscribeIntent('unsubscribe', 'unsubscribe', 'ali@colaberry.com'))
      .toEqual({ matched: false, via: null });
    expect(detectInboxUnsubscribeIntent('Re: pipeline', 'the unsubscribe pipeline is live now', 'techadmin@colaberry.com').matched)
      .toBe(false);
  });

  it('ignores "unsubscribe" that only appears in quoted history', () => {
    const body = 'Thanks Ali, looks great!\n\nOn Mon, Jul 14, 2026 at 9:00 AM Ali wrote:\n> ... to stop these, click here to unsubscribe';
    expect(detectInboxUnsubscribeIntent('Re: cohort', body, 'joe@acme.com')).toEqual({ matched: false, via: null });
  });

  it('ignores a forwarded/long campaign whose footer contains "unsubscribe"', () => {
    const campaign = 'To view this email in your browser click here. '.repeat(8) +
      'Why do 11% of AI workers outperform? Join our cohort. '.repeat(4) +
      '\nUnsubscribe\nManage preferences';
    expect(campaign.length).toBeGreaterThan(240);
    expect(detectInboxUnsubscribeIntent('Fwd: AI cohort', campaign, 'external@acme.com'))
      .toEqual({ matched: false, via: null });
  });

  it('empty subject and body do not match', () => {
    expect(detectInboxUnsubscribeIntent('', '', 'joe@acme.com')).toEqual({ matched: false, via: null });
    expect(detectInboxUnsubscribeIntent(null, null, null)).toEqual({ matched: false, via: null });
  });
});

describe('topReplyText', () => {
  it('cuts at ">" quoted lines and "On ... wrote:"', () => {
    expect(topReplyText('my reply\n> quoted stuff with unsubscribe')).toBe('my reply');
    expect(topReplyText('my reply\nOn Mon, Jul 14, 2026 X wrote:\nquoted unsubscribe')).toBe('my reply');
  });
  it('cuts at forwarded-message markers', () => {
    expect(topReplyText('see below\n---------- Forwarded message ---------\nFrom: x\nunsubscribe'))
      .toBe('see below');
  });
});
