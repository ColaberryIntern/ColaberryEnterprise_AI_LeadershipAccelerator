/**
 * OH1f (Ali, 2026-11-18): the countdown emails use the one content brain, never repeat
 * themselves, never touch a person twice in 24 hours, and the Open House takes precedence
 * over Explorer Growth and every other campaign.
 */
import {
  spacingProblems, repetitionScore, REPETITION_LIMIT, countdownYieldUntil, renderSpotlight,
  seedIndex, PORTAL_EVENTS_URL,
} from '../openHouseBrain';
import { buildEventUserPrompt, buildSystemPrompt } from '../aiMessageService';
import { hardStopReason } from '../explorerGrowth/governor/candidates/hardStop';
import { isInOpenHouseCountdown } from '../explorerGrowth/governor/openHouseHold';

const JOIN = 'https://enterprise.colaberry.ai/portal/class-checkin/abc';

describe('spacingProblems (no two touches within 24 hours)', () => {
  it('passes a cadence a day or more apart', () => {
    expect(spacingProblems([{ minutes_before_event: 10080, channel: 'email' }, { minutes_before_event: 4320, channel: 'email' }, { minutes_before_event: 240, channel: 'email' }])).toEqual([]);
  });
  it('names the pair that is too close, in any order', () => {
    const p = spacingProblems([{ minutes_before_event: 240, channel: 'email' }, { minutes_before_event: 1440, channel: 'email' }]);
    expect(p).toEqual(['T-1440min and T-240min are 20h apart']);
  });
});

describe('repetitionScore (a draft that re-says an earlier email is not sent)', () => {
  const first = '<p>Hi Sam,</p><p>I saw you finished the welcome video. The Open House is a live hour where we walk through the program and what people build, with live questions and quick phone polls.</p>';
  it('is near 1 for a copy and over the limit', () => {
    expect(repetitionScore(first, [first])).toBeGreaterThan(0.9);
    expect(repetitionScore(first, [first])).toBeGreaterThan(REPETITION_LIMIT);
  });
  it('flags a draft that re-explains the Open House in the same words', () => {
    const again = '<p>Hi Sam,</p><p>Quick note before Thursday. The Open House is a live hour where we walk through the program and what people build, with live questions and quick phone polls.</p>';
    expect(repetitionScore(again, [first])).toBeGreaterThan(REPETITION_LIMIT);
  });
  it('passes a genuinely different email about the same event', () => {
    const builder = '<p>Hi Sam,</p><p>Meet Kes. Calls that ended without an answer were retried 551 times. Kes built a small system that reads what the caller meant and picks the next step, and retries dropped to zero. On Thursday you can ask how projects like this get built.</p>';
    expect(repetitionScore(builder, [first])).toBeLessThan(REPETITION_LIMIT);
  });
  it('ignores links and markup, and is 0 with nothing earlier', () => {
    expect(repetitionScore(first, [])).toBe(0);
    expect(repetitionScore(`<a href="${JOIN}">${JOIN}</a>`, [`<p>${JOIN}</p>`])).toBe(0);
  });
});

describe('countdownYieldUntil (the Open House takes precedence over other campaigns)', () => {
  it('lets a message through when no countdown touch is near', () => {
    expect(countdownYieldUntil([])).toBeNull();
  });
  it('holds it until 24 hours after the latest nearby countdown touch', () => {
    const a = new Date('2026-11-19T20:30:00Z');
    const b = new Date('2026-11-18T12:00:00Z');
    expect(countdownYieldUntil([b, a])?.toISOString()).toBe('2026-11-20T20:30:00.000Z');
  });
  it('ignores an unreadable date instead of throwing', () => {
    expect(countdownYieldUntil([new Date('nope')])).toBeNull();
  });
});

describe('renderSpotlight (the builder piece is verified and carries its own links)', () => {
  const s = { name: 'Kesetebirhan Delele', role: 'AI Engineer', title: 'The Call Ended. The Next Step Did Not Have To.', industry: 'Education', metric: '551 to 0 retries', url: 'https://hire.refactored.ai/case-studies/turning-call-intent-into-the-next-action' };
  it('lists the builder, the result and the public link, and allows exactly that link', () => {
    const r = renderSpotlight(s, null);
    expect(r.block).toContain('Kesetebirhan Delele');
    expect(r.block).toContain('551 to 0 retries');
    expect(r.allowedLinks).toEqual([s.url]);
  });
  it('adds the next live event with the Events schedule link', () => {
    const r = renderSpotlight(s, { title: 'AI Strategy And Collaboration Session', when: 'Wednesday, November 25, 10:00 AM CT' });
    expect(r.block).toContain('AI Strategy And Collaboration Session');
    expect(r.allowedLinks).toEqual([s.url, PORTAL_EVENTS_URL]);
  });
  it('is empty, not invented, when the brain has nothing', () => {
    expect(renderSpotlight(null, null)).toEqual({ piece: 'builder_spotlight', block: '', allowedLinks: [] });
  });
  it('picks a stable builder per person', () => {
    expect(seedIndex('123', 7)).toBe(seedIndex('123', 7));
    expect(seedIndex('123', 7)).toBeGreaterThanOrEqual(0);
    expect(seedIndex('x', 0)).toBe(0);
  });
});

describe('the AI prompt carries the brain piece and the earlier emails in full', () => {
  const params: any = {
    channel: 'email', ai_instructions: 'Three days out.', lead: { name: 'Sam Lee' },
    campaignContext: { type: 'behavioral_trigger', name: 'Open House Countdown (Maya)', system_prompt: 'You are Maya.' },
    compositeContext: { previousMessages: [{ channel: 'email', subject: 'Glad you are coming', sentAt: 'Nov 12', bodyPreview: 'x'.repeat(800) + ' END' }] },
    eventContext: {
      title: 'Open House', when: 'Thursday at 6:30 PM CST', join_url: JOIN, minutes_before: 4320,
      content_piece: 'A REAL BUILDER\n- Kes', extra_links: ['https://hire.refactored.ai/case-studies/x'],
    },
  };
  it('puts the content piece in its own section', () => {
    const u = buildEventUserPrompt(params);
    expect(u).toContain("THIS EMAIL'S CONTENT PIECE");
    expect(u).toContain('A REAL BUILDER');
  });
  it('shows enough of an earlier email to avoid repeating it (not just the greeting)', () => {
    expect(buildEventUserPrompt(params)).toContain('END');
  });
  it('allows the piece links and tells the AI the Open House is the center and nothing repeats', () => {
    const sys = buildSystemPrompt('email', params);
    expect(sys).toContain('https://hire.refactored.ai/case-studies/x');
    expect(sys).toContain('The Open House is the center of every message');
    expect(sys).toContain('Never re-say what an earlier email said');
  });
});

describe('Explorer Growth holds anyone in a live Open House countdown', () => {
  const base = { converted: false, unsubscribed: false, dnc: false, consentRevoked: false, killSwitch: false, campaignInactive: false };
  it('is a hard stop with its own reason', () => {
    expect(hardStopReason({ hardStop: { ...base, openHouseCountdown: true } })).toBe('open_house_countdown');
    expect(hardStopReason({ hardStop: { ...base, openHouseCountdown: false } })).toBeNull();
  });
  it('a permanent reason still wins the label', () => {
    expect(hardStopReason({ hardStop: { ...base, converted: true, openHouseCountdown: true } })).toBe('converted');
  });
  it('holds when a countdown step is live, and not otherwise', async () => {
    expect(await isInOpenHouseCountdown(42, { countLive: async () => 1 })).toBe(true);
    expect(await isInOpenHouseCountdown(42, { countLive: async () => 0 })).toBe(false);
  });
  it('fails closed: an unreadable answer holds', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await isInOpenHouseCountdown(42, { countLive: async () => { throw new Error('db down'); } })).toBe(true);
    warn.mockRestore();
  });
  it('no lead row means no countdown to defer to', async () => {
    const countLive = jest.fn(async () => 1);
    expect(await isInOpenHouseCountdown(null, { countLive })).toBe(false);
    expect(countLive).not.toHaveBeenCalled();
  });
});
