import {
  classifyExplorerReply,
  detectOptOut,
  isExplorerReplyClass,
  EXPLORER_REPLY_CLASSES,
  IN_CONVERSATION_SUPPRESSION_DAYS,
} from '../explorerReplyClassifier';

/**
 * Plan §15.5. The opt-out blocks carry the weight here.
 *
 * Both failure directions are permanent and invisible:
 *   - a MISSED opt-out keeps emailing someone who asked us to stop
 *   - a FALSE opt-out cascades through Lead.status, every CampaignLead
 *     lifecycle, pending sends, a consent revoke and a GHL DND tag — and §35
 *     D-4 says opt-outs are never retroactively reversed
 *
 * Nobody notices a message that was not sent, so the false-positive tests below
 * matter as much as the detection ones.
 */

describe('opt-out detection is deterministic and authoritative', () => {
  it.each([
    'STOP',
    'stop',
    'Stop.',
    'unsubscribe',
    'Please unsubscribe me',
    'I want to opt out',
    'opt-out',
    'Please remove me from this list',
    'take me off your mailing list',
    'stop emailing me',
    'Do not email me again',
    'no more emails please',
    'delete my account',
  ])('detects %j', (body) => {
    expect(detectOptOut(body).optOut).toBe(true);
  });

  it('records which pattern fired, so a suppression can be explained', () => {
    // A bare "unsubscribe" is the whole message, so the bare-command pattern
    // matches first. The value is that SOMETHING is always recorded.
    expect(detectOptOut('unsubscribe').pattern).toBe('bare-command');
    expect(detectOptOut('Please unsubscribe me').pattern).toBe('unsubscribe');
    expect(detectOptOut('Please remove me from this list').pattern).toBe('remove-me');
  });

  it('wins over the model, which is not even consulted', () => {
    const r = classifyExplorerReply('unsubscribe', 'INTERESTED');
    expect(r.class).toBe('OPT_OUT');
    expect(r.route).toBe('PROCESS_OPT_OUT');
    expect(r.source).toBe('deterministic');
  });
});

describe('it does not invent an opt-out', () => {
  it.each([
    'I stopped by the community room yesterday',
    'the nonstop notifications are great actually',
    'I cannot stop building with this',
    'Remove me from the waitlist, I want the full cohort',
    'Can you take me off mute in the session?',
    'I deleted my old notes, can you resend?',
    'This is a full stop to my doubts, I am in',
  ])('does not fire on %j', (body) => {
    // Every one of these is a person who did NOT ask to be removed. A false
    // positive ends the relationship permanently and silently.
    expect(detectOptOut(body).optOut).toBe(false);
  });

  it('ignores an unsubscribe footer quoted from our own email', () => {
    // Our footer is on every message we send. Without this, replying in a
    // thread opts the replier out.
    const reply = [
      'Sounds great, count me in!',
      '',
      '> On Tue, Ali wrote:',
      '> Click here to unsubscribe from these emails',
    ].join('\n');

    expect(detectOptOut(reply).optOut).toBe(false);
  });

  it('still detects a real opt-out above quoted history', () => {
    const reply = ['Please unsubscribe me.', '', '> earlier message'].join('\n');
    expect(detectOptOut(reply).optOut).toBe(true);
  });

  it('treats an empty body as not an opt-out', () => {
    expect(detectOptOut('').optOut).toBe(false);
    expect(detectOptOut('   ').optOut).toBe(false);
  });
});

describe('a model cannot trigger an irreversible suppression', () => {
  it('routes a model-only OPT_OUT to a human instead of processing it', () => {
    const r = classifyExplorerReply('I think I am done here', 'OPT_OUT');

    // Acting would mean a probabilistic classifier causing a permanent
    // suppression; discarding would mean throwing away a possible request to
    // stop. Neither is acceptable, so a person decides.
    expect(r.route).toBe('HUMAN_TASK');
    expect(r.class).toBe('NEEDS_ALI');
    expect(r.note).toContain('routed to a human');
  });

  it('never returns PROCESS_OPT_OUT from a model class', () => {
    for (const cls of EXPLORER_REPLY_CLASSES) {
      const r = classifyExplorerReply('a neutral message', cls);
      if (r.route === 'PROCESS_OPT_OUT') {
        expect(r.source).toBe('deterministic');
      }
    }
  });
});

describe('routing (§15.5)', () => {
  it.each(['READY_TO_ENROLL', 'NEEDS_ALI', 'NOT_INTERESTED', 'NEEDS_HELP'] as const)(
    '%s goes to a human, never an automated reply',
    (cls) => {
      expect(classifyExplorerReply('hello', cls).route).toBe('HUMAN_TASK');
    },
  );

  it.each(['QUESTION', 'PRICING', 'SCHEDULING'] as const)('%s is drafted for review', (cls) => {
    expect(classifyExplorerReply('hello', cls).route).toBe('DRAFT_FOR_REVIEW');
  });

  it.each(['INTERESTED', 'INTERNSHIP', 'COMMUNITY', 'OTHER'] as const)(
    '%s is recorded only',
    (cls) => {
      expect(classifyExplorerReply('hello', cls).route).toBe('RECORD_ONLY');
    },
  );

  it('has no auto-reply route at all', () => {
    // §15.5 permits auto-reply only later and behind its own flag. A value that
    // exists in the type is a value someone eventually returns.
    const routes = EXPLORER_REPLY_CLASSES.map((c) => classifyExplorerReply('x', c).route);
    expect(routes).not.toContain('AUTO_REPLY');
  });
});

describe('falling back', () => {
  it('records only when the model returned nothing', () => {
    const r = classifyExplorerReply('some reply', null);
    expect(r.class).toBe('OTHER');
    expect(r.route).toBe('RECORD_ONLY');
    expect(r.source).toBe('fallback');
  });

  it('records only when the model returned a class we do not know', () => {
    // A hallucinated class must not be routed on. Nothing is sent on a guess.
    const r = classifyExplorerReply('some reply', 'VERY_INTERESTED_INDEED');
    expect(r.class).toBe('OTHER');
    expect(r.route).toBe('RECORD_ONLY');
    expect(r.note).toContain('VERY_INTERESTED_INDEED');
  });

  it('still detects an opt-out when the model failed entirely', () => {
    // The safety property must not depend on the model being reachable.
    expect(classifyExplorerReply('unsubscribe', null).route).toBe('PROCESS_OPT_OUT');
  });

  it('rejects unknown classes at the type guard', () => {
    expect(isExplorerReplyClass('QUESTION')).toBe(true);
    expect(isExplorerReplyClass('NOPE')).toBe(false);
  });
});

describe('every reply suppresses nurture', () => {
  it('is 7 days per §15.5', () => {
    // Someone who wrote to us should not get an unrelated scheduled message
    // the next morning.
    expect(IN_CONVERSATION_SUPPRESSION_DAYS).toBe(7);
  });
});
