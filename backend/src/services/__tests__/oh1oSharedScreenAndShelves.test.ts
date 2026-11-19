/**
 * OH1o: the one copy screen the countdown and Explorer Growth share (screenMayaCopy), the wider
 * shelves (every builder, rotating events and community themes, the week ahead, the inventory), and
 * the one signature wrapper both paths use.
 */
import { openingOf, screenEventReminderCopy, screenMayaCopy, subjectsRepeat } from '../openHouseCountdown';
import {
  communityItemId, eventItemId, gatherBrainPiece, pickSpotlight, readBrainInventory, renderCommunityPulse,
  renderLiveEvents, renderWeekAhead, type SpotlightFacts, type UpcomingEvent,
} from '../openHouseBrain';
import { wrapEmailHtml } from '../email/campaignEmailWrapper';

const JOIN = 'https://enterprise.colaberry.ai/portal/class-checkin/8c92ba87-4766-4a83-9da4-ad529f68b2dc';

describe('the countdown screen is unchanged by the move to the shared screen', () => {
  it.each([
    ['clean', 'Today at 2:30', `<p>Join here: ${JOIN}</p>`, []],
    ['banned word', 'Free seats', `<p>${JOIN}</p>`, ['mentions a no-cost claim']],
    ['no join link', 'Today', '<p>See you</p>', ['missing the Join link']],
    ['other link', 'Today', `<p>${JOIN} https://evil.example.com/x</p>`, ['links somewhere else (https://evil.example.com/x)']],
    ['the idiom is NOT rewritten on this path', 'Today', `<p>Feel free to ask. ${JOIN}</p>`, ['mentions a no-cost claim']],
  ])('%s', (_label, subject, body, expected) => {
    expect(screenEventReminderCopy(subject, body, JOIN)).toEqual(expected);
  });
});

describe('screenMayaCopy (the Explorer settings)', () => {
  const base = { allowedPrefixes: ['https://enterprise.colaberry.ai/'], soften: true };
  it('rewrites the harmless idiom first, then bans the word outright', () => {
    const a = screenMayaCopy({ ...base, subject: 'Hi', body: '<p>Feel free to reply.</p>' });
    expect(a.problems).toEqual([]);
    expect(a.body).toContain("You're welcome to reply");
    const b = screenMayaCopy({ ...base, subject: 'Hi', body: '<p>It is free.</p>' });
    expect(b.problems).toEqual(['mentions a no-cost claim']);
  });
  it('allows its own lesson pages by prefix and nothing else', () => {
    expect(screenMayaCopy({ ...base, subject: 'S', body: '<p>https://enterprise.colaberry.ai/portal/runtime/abc</p>' }).problems).toEqual([]);
    expect(screenMayaCopy({ ...base, subject: 'S', body: '<p>https://elsewhere.ai/x</p>' }).problems).toEqual(['links somewhere else (https://elsewhere.ai/x)']);
  });
  it('refuses a repeated body, a reused subject and the same opening (E3)', () => {
    const earlier = [{ subject: 'Your next step at Colaberry', body: '<p>Hi Megan, it is great to see you exploring the platform this week. More here.</p>' }];
    const r = screenMayaCopy({ ...base, subject: 'Your Next Step at Colaberry!', body: '<p>Hi Megan, it is great to see you exploring the platform this week. Something new.</p>', earlier });
    expect(r.problems).toEqual(expect.arrayContaining(['reuses an earlier subject line', 'opens the same way as an earlier email']));
    expect(r.overlap).toBeGreaterThan(0);
    const fresh = screenMayaCopy({ ...base, subject: 'A builder you should meet', body: '<p>Hi Megan, Kesete built an intake agent that answers in seconds.</p>', earlier });
    expect(fresh.problems).toEqual([]);
  });
  it('applies the never-say phrases from the brain rules', () => {
    expect(screenMayaCopy({ ...base, subject: 'S', body: '<p>Let us circle back.</p>', extraNeverSay: ['circle back'] }).problems)
      .toEqual(['never-say: "circle back"']);
  });
  it('helpers: opening skips the greeting; subjects compare by words', () => {
    expect(openingOf('<p>Hi Megan, it is great to see you here today friend</p>')).toBe('it is great to see you here today');
    expect(subjectsRepeat('Re: Your next step', 'your next step')).toBe(true);
    expect(subjectsRepeat('A builder to meet', 'Your next step')).toBe(false);
  });
});

describe('builders: the whole directory, never the same one twice for a person', () => {
  const pool: SpotlightFacts[] = ['a', 'b', 'c'].map((s) => ({
    id: `builder:${s}`, name: s.toUpperCase(), role: null, title: `Built ${s}`, industry: null, metric: null, url: `https://hire.refactored.ai/case-studies/${s}`,
  }));
  it('skips builders the person already met; none left = none', () => {
    expect(pickSpotlight(pool, 'seed', ['builder:a', 'builder:b'])?.id).toBe('builder:c');
    expect(pickSpotlight(pool, 'seed', pool.map((p) => p.id!))).toBeNull();
  });
  it('gatherBrainPiece returns the builder as an item, and re-checks the exclusion', async () => {
    const r = await gatherBrainPiece('builder_spotlight', 's', { excludeItemIds: [] }, {
      spotlight: async () => pool[0], upcomingEvents: async () => [],
    });
    expect(r?.itemId).toBe('builder:a');
    const again = await gatherBrainPiece('builder_spotlight', 's', { excludeItemIds: ['builder:a'] }, {
      spotlight: async () => pool[0], upcomingEvents: async () => [],
    });
    expect(again?.block).toBe('');
  });
});

describe('events and community themes rotate per person', () => {
  const now = new Date('2026-11-18T12:00:00Z');
  const ev = (title: string, iso: string): UpcomingEvent => ({ title, starts_at: new Date(iso), description: null });
  const events = [ev('AI Build Night', '2026-11-20T00:30:00Z'), ev('Skill Clinic', '2026-11-22T18:00:00Z'), ev('Open House', '2026-11-19T20:30:00Z')];
  it('touts an event the person has not been touted yet', () => {
    const first = renderLiveEvents(events, now);
    expect(first.itemId).toBe(eventItemId(events[0]));
    const second = renderLiveEvents(events, now, [first.itemId!]);
    expect(second.itemId).toBe(eventItemId(events[1]));
    expect(renderLiveEvents(events, now, [first.itemId!, second.itemId!]).block).toBe('');
  });
  it('features one theme, a different one next time', () => {
    const posts = [
      { category: null, ritual: 'show_and_tell', week: 1, like_count: 3 },
      { category: null, ritual: 'show_and_tell', week: 1, like_count: 1 },
      { category: null, ritual: 'roll_call', week: 1, like_count: 0 },
    ];
    const a = renderCommunityPulse(posts, 1, [], now);
    expect(a.block).toContain('FEATURE THIS THEME IN THIS EMAIL (and only this one): Show & Tell');
    expect(a.itemId).toBe(communityItemId('Show & Tell', now));
    const b = renderCommunityPulse(posts, 1, [a.itemId!], now);
    expect(b.block).toContain('FEATURE THIS THEME IN THIS EMAIL (and only this one): Roll Call');
  });
});

describe('week ahead: the real schedule for the rest of this week, never invented', () => {
  const monday = new Date('2026-11-16T15:00:00Z'); // Monday 9 AM CT
  const ev = (title: string, iso: string): UpcomingEvent => ({ title, starts_at: new Date(iso), description: null });
  it('lists this week only, with the Events and Today links', () => {
    const r = renderWeekAhead([ev('Open House', '2026-11-19T20:30:00Z'), ev('Next week thing', '2026-11-24T18:00:00Z')], 'https://enterprise.colaberry.ai/portal/today', monday);
    expect(r.block).toContain('Open House');
    expect(r.block).not.toContain('Next week thing');
    expect(r.allowedLinks).toEqual(['https://enterprise.colaberry.ai/portal/events', 'https://enterprise.colaberry.ai/portal/today']);
    expect(r.itemId).toBe('week_ahead:2026-11-16');
  });
  it('an empty week is an empty shelf', () => {
    expect(renderWeekAhead([], 'https://x', monday).block).toBe('');
  });
});

describe('the inventory (G)', () => {
  it('lists every shelf, and names a reader that failed instead of showing it empty', async () => {
    const inv = await readBrainInventory({
      spotlightPool: async () => [{ id: 'builder:a', name: 'A', role: null, title: 't', industry: null, metric: null, url: 'u' }],
      upcomingEvents: async () => { throw new Error('down'); },
      communityPosts: async () => [{ category: null, ritual: 'roll_call', week: 1, like_count: 0 }],
      servableItems: async () => [],
      todayUrl: async () => 'https://enterprise.colaberry.ai/portal/today',
    });
    expect(inv.builders).toHaveLength(1);
    expect(inv.communityThemes[0].label).toBe('Roll Call');
    expect(inv.unavailable).toEqual(['events']);
  });
});

describe('the one signature wrapper (A)', () => {
  it("Maya's campaign signature: name, title, Colaberry Inc., the site and the unsubscribe link", () => {
    const html = wrapEmailHtml('<p>Hi Dana</p>', { senderName: 'Maya at Colaberry', senderEmail: 'maya@colaberry.com', unsubscribeUrl: 'https://u/x' });
    expect(html).toContain('Maya at Colaberry');
    expect(html).toContain('Director of Admissions');
    expect(html).toContain('Colaberry Inc.');
    expect(html).toContain('href="https://u/x"');
  });
});
