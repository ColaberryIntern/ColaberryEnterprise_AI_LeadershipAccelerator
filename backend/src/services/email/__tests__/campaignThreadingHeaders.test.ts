/**
 * Threading headers on a Mandrill reply.
 *
 * Mandrill does not thread on subject. A `Re: ...` send with no `In-Reply-To`
 * opens a BRAND NEW conversation, so the student's original thread keeps
 * exactly one message and reads as unanswered to anything that sweeps the
 * mailbox. On 2026-08-25 that made four already-answered student emails look
 * like a four-day backlog and very nearly produced an apology for a delay that
 * had never happened.
 *
 * The headers are optional, because a first-contact campaign has nothing to
 * thread into. The test that matters most is therefore the negative one: a send
 * WITHOUT them must be byte-identical to what went out before this existed, or
 * this change has quietly altered every student campaign.
 */
import { buildCampaignMessage, CAMPAIGN_BCC, TRACKING_SUPPRESSION } from '../campaignTransport';

const BASE = {
  recipient: 'student@example.com',
  subject: 'Re: Your build',
  text: 'plain',
  html: '<p>html</p>',
  businessEventId: 'evt-1',
  idempotencyKey: 'key-1',
};

describe('threading headers', () => {
  it('emits In-Reply-To and References when replying', () => {
    const msg = buildCampaignMessage({ ...BASE, inReplyTo: '<orig@mail.gmail.com>' });
    expect(msg.headers['In-Reply-To']).toBe('<orig@mail.gmail.com>');
    // References defaults to the single message being answered.
    expect(msg.headers['References']).toBe('<orig@mail.gmail.com>');
  });

  it('joins a supplied References chain oldest-first, space separated', () => {
    const msg = buildCampaignMessage({
      ...BASE,
      inReplyTo: '<third@mail>',
      references: ['<first@mail>', '<second@mail>', '<third@mail>'],
    });
    expect(msg.headers['References']).toBe('<first@mail> <second@mail> <third@mail>');
    expect(msg.headers['In-Reply-To']).toBe('<third@mail>');
  });

  it('OMITS both headers entirely when not replying', () => {
    const msg = buildCampaignMessage(BASE);
    expect('In-Reply-To' in msg.headers).toBe(false);
    expect('References' in msg.headers).toBe(false);
  });

  it('a non-reply send is unchanged in every other respect', () => {
    const msg = buildCampaignMessage(BASE);
    // The guards that were already right must not have moved.
    expect(msg.envelope.to).toEqual(['student@example.com', CAMPAIGN_BCC]);
    expect((msg as any).bcc).toBeUndefined();
    expect((msg as any).cc).toBeUndefined();
    expect(msg.headers['X-MC-Tags']).toBe('student-unblock');
    for (const [k, v] of Object.entries(TRACKING_SUPPRESSION)) {
      expect(msg.headers[k]).toBe(v);
    }
  });

  it('a reply keeps the envelope BCC, so Ali still gets his copy', () => {
    const msg = buildCampaignMessage({ ...BASE, inReplyTo: '<orig@mail>' });
    // This is the whole trade for giving up the Gmail Sent folder. If it ever
    // regresses, replies become invisible to Ali with no other signal.
    expect(msg.envelope.to).toEqual(['student@example.com', CAMPAIGN_BCC]);
    expect((msg as any).bcc).toBeUndefined();
  });

  it('tracking stays suppressed on a reply too', () => {
    const msg = buildCampaignMessage({ ...BASE, inReplyTo: '<orig@mail>' });
    for (const [k, v] of Object.entries(TRACKING_SUPPRESSION)) {
      expect(msg.headers[k]).toBe(v);
    }
  });

  it('an explicit tag separates watcher replies from campaign sends', () => {
    expect(buildCampaignMessage({ ...BASE, tag: 'watcher-reply' }).headers['X-MC-Tags'])
      .toBe('watcher-reply');
    // and defaults when not given
    expect(buildCampaignMessage(BASE).headers['X-MC-Tags']).toBe('student-unblock');
  });
});
