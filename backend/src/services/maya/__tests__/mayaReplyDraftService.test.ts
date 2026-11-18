/**
 * OH1h (T2) - Maya answers email replies. Pins: a Maya campaign reply is queued once (idempotent on the inbound
 * Message-Id), a non-Maya campaign is untouched, a blocked recipient gets no draft, the shipped setting (false)
 * never sends, the setting on sends through the delivery path, an Explorer is never auto-sent, the screen, the
 * dry run writes nothing, and delivery of a reply row carries Maya's reply-to and is recorded on the lead.
 */
// Every dependency is injected; the real database module is only constructed (never queried) because the copy
// screen is shared with openHouseCountdown, which loads the models barrel.
jest.mock('../mayaMemory', () => ({ mayaMemoryBlock: jest.fn(async () => '') }));

import {
  maybeDraftMayaReply, draftMayaReplyDryRun, isMayaCampaign, extractNewReplyText, screenReplyCopy,
  replyIdempotencyKey, toReplyHtml, replySubject, type MayaReplyDraftDeps, type CampaignIdentity,
} from '../mayaReplyDraftService';

const MAYA_CAMPAIGN: CampaignIdentity = { id: 'camp-1', settings: { sender_name: 'Maya at Colaberry' }, ai_system_prompt: 'You are Maya, Director of Admissions.' };
const OTHER_CAMPAIGN: CampaignIdentity = { id: 'camp-2', settings: { sender_name: 'Dhee - Colaberry Enterprise AI' }, ai_system_prompt: 'You are an outreach specialist.' };

const INPUT = {
  leadId: 7, fromEmail: 'sam@example.com', leadName: 'Sam Lee', subject: 'See you Thursday',
  body: 'Will it be recorded? I may be late.\n\nOn Mon, Nov 16, 2026 Maya wrote:\n> Looking forward to it',
  messageId: '<abc@mail.example.com>', campaignId: 'camp-1',
};

function makeDeps(over: Partial<MayaReplyDraftDeps> = {}) {
  const queued = new Map<string, string>();
  const d: MayaReplyDraftDeps & { events: string[] } = {
    events: [],
    loadCampaign: jest.fn(async (id: string) => (id === 'camp-1' ? MAYA_CAMPAIGN : OTHER_CAMPAIGN)),
    killSwitchOff: jest.fn(async () => false),
    evaluate: jest.fn(async () => ({ allowed: true })),
    memory: jest.fn(async () => 'WHAT MAYA AND THIS PERSON HAVE SAID (all channels)\n- email Maya ->: See you Thursday'),
    joinUrl: jest.fn(async () => 'https://enterprise.colaberry.ai/portal/class-checkin/abc'),
    compose: jest.fn(async () => 'Hi Sam, yes - the session is recorded, and joining a few minutes late is fine. Your Join link is https://enterprise.colaberry.ai/portal/class-checkin/abc.\n\nMaya'),
    enqueue: jest.fn(async ({ idempotencyKey }) => {
      const existing = queued.get(idempotencyKey);
      if (existing) return { id: existing, deduped: true };
      const id = `q-${queued.size + 1}`;
      queued.set(idempotencyKey, id);
      return { id, deduped: false };
    }),
    autoReplyEnabled: jest.fn(async () => false),
    autoDeliver: jest.fn(async () => ({ ok: true, status: 'sent' })),
    recordActivity: jest.fn(async () => undefined),
    log: jest.fn((event: string) => { d.events.push(event); }),
    ...over,
  };
  return d;
}

describe('maybeDraftMayaReply', () => {
  it('a reply to a Maya campaign is drafted from the memory and queued ONCE, however often the webhook retries', async () => {
    const deps = makeDeps();
    const a = await maybeDraftMayaReply(INPUT, {}, deps);
    const b = await maybeDraftMayaReply(INPUT, {}, deps);
    expect(a).toMatchObject({ outcome: 'queued', handled: true, queueId: 'q-1', wouldSend: false });
    expect(b).toMatchObject({ outcome: 'deduped', handled: true, queueId: 'q-1' });
    expect(deps.recordActivity).toHaveBeenCalledTimes(1);
    expect(deps.autoDeliver).not.toHaveBeenCalled();
    // the memory and the NEW words reach the model, the quoted thread does not
    const [system, user] = (deps.compose as jest.Mock).mock.calls[0];
    expect(system).toContain('You are Maya, Director of Admissions.');
    expect(user).toContain('WHAT MAYA AND THIS PERSON HAVE SAID (all channels)');
    expect(user).toContain('Will it be recorded?');
    expect(user).not.toContain('Looking forward to it');
    const row = (deps.enqueue as jest.Mock).mock.calls[0][0];
    expect(row).toMatchObject({ leadId: 7, recipientAddress: 'sam@example.com', subject: 'Re: See you Thursday' });
    expect(row.body).toContain('<p>');
  });

  it('a non-Maya campaign is untouched: handled=false, nothing composed or queued', async () => {
    const deps = makeDeps();
    const r = await maybeDraftMayaReply({ ...INPUT, campaignId: 'camp-2' }, {}, deps);
    expect(r).toEqual({ outcome: 'not_maya', handled: false });
    expect(deps.compose).not.toHaveBeenCalled();
    expect(deps.enqueue).not.toHaveBeenCalled();
    expect(await maybeDraftMayaReply({ ...INPUT, campaignId: null }, {}, deps)).toEqual({ outcome: 'not_maya', handled: false });
  });

  it('a blocked recipient (consent / unsubscribe) gets no draft, so no reviewer can override it', async () => {
    const deps = makeDeps({ evaluate: jest.fn(async () => ({ allowed: false, blockedReason: 'unsubscribed' })) });
    const r = await maybeDraftMayaReply(INPUT, {}, deps);
    expect(r).toMatchObject({ outcome: 'blocked', handled: true, reason: 'unsubscribed' });
    expect(deps.compose).not.toHaveBeenCalled();
    expect(deps.enqueue).not.toHaveBeenCalled();
  });

  it('the Maya kill switch stops the draft', async () => {
    const deps = makeDeps({ killSwitchOff: jest.fn(async () => true) });
    expect(await maybeDraftMayaReply(INPUT, {}, deps)).toMatchObject({ outcome: 'kill_switch', handled: true });
    expect(deps.enqueue).not.toHaveBeenCalled();
  });

  it('the setting at its default (false) never sends', async () => {
    const deps = makeDeps();
    await maybeDraftMayaReply(INPUT, {}, deps);
    expect(deps.autoReplyEnabled).toHaveBeenCalled();
    expect(deps.autoDeliver).not.toHaveBeenCalled();
  });

  it('an unreadable setting is treated as off', async () => {
    const deps = makeDeps({ autoReplyEnabled: jest.fn(async () => { throw new Error('db'); }) });
    expect(await maybeDraftMayaReply(INPUT, {}, deps)).toMatchObject({ outcome: 'queued' });
    expect(deps.autoDeliver).not.toHaveBeenCalled();
  });

  it('the setting on delivers the queued row through the delivery path, once', async () => {
    const deps = makeDeps({ autoReplyEnabled: jest.fn(async () => true) });
    const r = await maybeDraftMayaReply(INPUT, {}, deps);
    expect(r).toMatchObject({ outcome: 'sent', queueId: 'q-1', wouldSend: true });
    expect(deps.autoDeliver).toHaveBeenCalledWith('q-1');
    await maybeDraftMayaReply(INPUT, {}, deps); // webhook retry
    expect(deps.autoDeliver).toHaveBeenCalledTimes(1);
  });

  it('an Explorer is drafted but never auto-sent, even with the setting on', async () => {
    const deps = makeDeps({ autoReplyEnabled: jest.fn(async () => true) });
    const r = await maybeDraftMayaReply({ ...INPUT, explorer: true }, {}, deps);
    expect(r).toMatchObject({ outcome: 'queued', wouldSend: false });
    expect(deps.autoDeliver).not.toHaveBeenCalled();
  });

  it('a draft that fails the screen is not queued; the lead gets a "person should answer" activity', async () => {
    const deps = makeDeps({ compose: jest.fn(async () => 'Great question! Tuition is $199 a month and there is a discount this week. See https://example.com/deal\n\nMaya') });
    const r = await maybeDraftMayaReply(INPUT, {}, deps);
    expect(r.outcome).toBe('screen_rejected');
    expect(r.problems).toEqual(expect.arrayContaining(['mentions discount', 'mentions a dollar amount']));
    expect(r.problems!.some((p) => p.startsWith('links somewhere else'))).toBe(true);
    expect(deps.enqueue).not.toHaveBeenCalled();
    expect((deps.recordActivity as jest.Mock).mock.calls[0][1]).toMatch(/person should answer/);
  });

  it('an empty reply (only the quoted thread) is handled without a draft', async () => {
    const deps = makeDeps();
    const r = await maybeDraftMayaReply({ ...INPUT, body: '> quoted only' }, {}, deps);
    expect(r).toEqual({ outcome: 'empty_reply', handled: true });
    expect(deps.compose).not.toHaveBeenCalled();
  });

  it('an error after the campaign is known to be Maya keeps the generic auto-reply away; before it, does not', async () => {
    const late = makeDeps({ compose: jest.fn(async () => { throw new Error('openai down'); }) });
    expect(await maybeDraftMayaReply(INPUT, {}, late)).toEqual({ outcome: 'error', handled: true });
    const early = makeDeps({ loadCampaign: jest.fn(async () => { throw new Error('db down'); }) });
    expect(await maybeDraftMayaReply(INPUT, {}, early)).toEqual({ outcome: 'error', handled: false });
  });

  it('the dry run composes and screens but writes nothing and does not ask the consent gate', async () => {
    const deps = makeDeps();
    const r = await draftMayaReplyDryRun(INPUT, deps);
    expect(r).toMatchObject({ outcome: 'dry_run', wouldEnqueue: true, wouldSend: false });
    expect(r.draft?.text).toContain('recorded');
    expect(deps.enqueue).not.toHaveBeenCalled();
    expect(deps.recordActivity).not.toHaveBeenCalled();
    expect(deps.evaluate).not.toHaveBeenCalled();
    expect(deps.autoDeliver).not.toHaveBeenCalled();
  });
});

describe('helpers', () => {
  it('isMayaCampaign: sender name, sender profile, or a Maya prompt', () => {
    expect(isMayaCampaign(MAYA_CAMPAIGN)).toBe(true);
    expect(isMayaCampaign({ id: 'x', sender_profile_from_name: 'Maya' })).toBe(true);
    expect(isMayaCampaign({ id: 'x', ai_system_prompt: '  You are Maya, ...' })).toBe(true);
    expect(isMayaCampaign(OTHER_CAMPAIGN)).toBe(false);
    expect(isMayaCampaign({ id: 'x', settings: { sender_name: 'Mayan Ruins Tours' } })).toBe(false);
    expect(isMayaCampaign(null)).toBe(false);
  });
  it('extractNewReplyText drops markup and the quoted thread', () => {
    expect(extractNewReplyText('<p>Yes please</p><div>On Tue, Nov 17, 2026 at 9:00 AM Maya wrote:</div><blockquote>old</blockquote>')).toBe('Yes please');
    expect(extractNewReplyText('Sure\n> earlier')).toBe('Sure');
  });
  it('screenReplyCopy allows the Join link, Today page and main site only', () => {
    const join = 'https://enterprise.colaberry.ai/portal/class-checkin/abc';
    expect(screenReplyCopy('Re: hi', `See you there: ${join}. Or https://enterprise.colaberry.ai/portal/today`, [join])).toEqual([]);
    expect(screenReplyCopy('Re: hi', 'Read https://other.site/x for more details here.', [])).toEqual(['links somewhere else (https://other.site/x)']);
    expect(screenReplyCopy('Re: hi', 'ok', [])).toContain('too short to be an answer');
  });
  it('the idempotency key follows the Message-Id, not the text', () => {
    expect(replyIdempotencyKey(1, '<a@b>', 'x')).toBe(replyIdempotencyKey(1, 'a@b', 'y'));
    expect(replyIdempotencyKey(1, null, 'x')).not.toBe(replyIdempotencyKey(1, null, 'y'));
  });
  it('toReplyHtml escapes and links; replySubject prefixes once', () => {
    expect(toReplyHtml('a <b>\n\nsee https://enterprise.colaberry.ai.')).toBe('<p>a &lt;b&gt;</p>\n<p>see <a href="https://enterprise.colaberry.ai">https://enterprise.colaberry.ai</a>.</p>');
    expect(replySubject('Re: x')).toBe('Re: x');
    expect(replySubject('x')).toBe('Re: x');
  });
});
