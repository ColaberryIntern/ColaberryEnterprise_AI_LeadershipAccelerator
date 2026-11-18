/**
 * OH1i (T3): the brain's other shelves. For each piece: verified content renders with its
 * links, nothing renders as an empty block, and a reader that throws is an empty block too,
 * never an invented fact. The AI-fact and build-prompt shelves serve only approved, unexpired,
 * sourced / test-built items, even when the reader hands them something else.
 */
import {
  gatherBrainPiece, renderLiveEvents, renderCommunityPulse, renderAiFact, renderBuildPrompt, renderWeeklyProgress,
  PORTAL_EVENTS_URL, BRAIN_PIECES, type BrainDeps, type UpcomingEvent,
} from '../openHouseBrain';
import type { BrainItem } from '../mayaBrain/mayaBrainItems';

const TODAY = 'https://enterprise.colaberry.ai/portal/today';
const inDays = (d: number) => new Date(Date.now() + d * 864e5);

const EVENTS: UpcomingEvent[] = [
  { title: 'Open House', starts_at: inDays(1), description: null },
  { title: 'AI Friday Trends, Tools & Practical Insights', starts_at: inDays(3), description: '<p>Trends and tools.</p>' },
  { title: 'AI Strategy & Collaboration', starts_at: inDays(2), description: null },
];

function item(over: Partial<BrainItem> = {}): BrainItem {
  return {
    id: 'i1', kind: 'ai_fact', title: 'Most AI pilots stall before production', body: 'Only a minority of pilots reach production.',
    source_url: 'https://example.org/report', source_label: 'CLM-021', virality: null, signal_id: null, status: 'approved',
    test_build_status: 'pending', test_build_notes: null, approved_by: 'ali', approved_at: inDays(-1).toISOString(),
    expires_at: inDays(20).toISOString(), ...over,
  };
}

const PROMPT = item({
  id: 'p1', kind: 'build_prompt', title: 'A private video-to-GIF converter', body: 'You are a senior front-end engineer. ...',
  source_label: 'Show HN: GIF converter (Hacker News, 412 points)', source_url: 'https://news.ycombinator.com/item?id=1',
  test_build_status: 'passed', virality: 0.9,
});

const quiet = () => jest.spyOn(console, 'warn').mockImplementation(() => {});
const deps = (over: Partial<BrainDeps>): Partial<BrainDeps> => ({ todayUrl: async () => TODAY, ...over });
const boom = async (): Promise<never> => { throw new Error('db down'); };

it('every piece is a known shelf', () => {
  expect(BRAIN_PIECES).toEqual(expect.arrayContaining(['live_event', 'community_pulse', 'ai_fact', 'build_prompt', 'weekly_progress']));
});

describe('live_event', () => {
  it('lists the next live events (never the Open House), soonest first, with the Events link', () => {
    const r = renderLiveEvents(EVENTS);
    expect(r.block).not.toMatch(/Open House/);
    expect(r.block.indexOf('AI Strategy')).toBeLessThan(r.block.indexOf('AI Friday'));
    expect(r.block).toContain('Trends and tools.');
    expect(r.block).not.toContain('<p>');
    expect(r.allowedLinks).toEqual([PORTAL_EVENTS_URL]);
  });
  it('drops past events and is empty when only the Open House is coming', () => {
    expect(renderLiveEvents([{ title: 'AI Lab', starts_at: inDays(-1), description: null }, EVENTS[0]]))
      .toEqual({ piece: 'live_event', block: '', allowedLinks: [] });
  });
  it('reads live, and an unreadable schedule is empty', async () => {
    expect((await gatherBrainPiece('live_event', 's', {}, deps({ upcomingEvents: async () => EVENTS })))!.block).toContain('AI Strategy');
    const w = quiet();
    expect(await gatherBrainPiece('live_event', 's', {}, deps({ upcomingEvents: boom }))).toEqual({ piece: 'live_event', block: '', allowedLinks: [] });
    w.mockRestore();
  });
});

describe('community_pulse', () => {
  const posts = [
    { category: 'Introductions', ritual: 'roll_call', week: 1, like_count: 1 },
    { category: 'Introductions', ritual: 'roll_call', week: 1, like_count: 0 },
    { category: 'General', ritual: 'show_and_tell', week: 3, like_count: 2 },
    { category: 'General', ritual: null, week: null, like_count: 0 }, // the unliked, unguided post: where spam sits
  ];
  it('gives themes and counts, the most liked by ritual, and no links', () => {
    const r = renderCommunityPulse(posts);
    expect(r.block).toContain('3 posts');
    expect(r.block).toContain('Roll Call: 2');
    expect(r.block).toContain('Most liked: Show & Tell (week 3); Roll Call (week 1)');
    expect(r.block).toContain('never quote a post, never name');
    expect(r.block).not.toContain('General posts');
    expect(r.allowedLinks).toEqual([]);
  });
  it('is empty when every post is unliked and unguided', () => {
    expect(renderCommunityPulse([posts[3]]).block).toBe('');
    expect(renderCommunityPulse([]).block).toBe('');
  });
  it('cannot carry a post body or author: the reader type has neither, and a thrown read is empty', async () => {
    const r = await gatherBrainPiece('community_pulse', 's', {}, deps({
      communityPosts: async () => [{ category: 'General', ritual: 'skill_drop', week: 2, like_count: 1, body: 'Hi I am Kit', member_id: 'm1' } as any],
    }));
    expect(r!.block).toContain('Skill Drop');
    expect(r!.block).not.toContain('Kit');
    const w = quiet();
    expect((await gatherBrainPiece('community_pulse', 's', {}, deps({ communityPosts: boom })))!.block).toBe('');
    w.mockRestore();
  });
});

describe('ai_fact', () => {
  it('states an approved fact with its registry id and public source, and names the item', async () => {
    const r = await gatherBrainPiece('ai_fact', 's', {}, deps({ servableItems: async () => [item()] }));
    expect(r!.block).toContain('Most AI pilots stall');
    expect(r!.block).toContain('Source: CLM-021');
    expect(r!.allowedLinks).toEqual(['https://example.org/report']);
    expect(r!.itemId).toBe('i1');
  });
  it('a registry-only fact carries no link', () => {
    expect(renderAiFact(item({ source_url: null })).allowedLinks).toEqual([]);
  });
  it.each([
    ['a draft', { status: 'draft' as const }],
    ['an expired fact', { expires_at: inDays(-1).toISOString() }],
    ['an unsourced fact', { source_label: 'a blog I read', source_url: null }],
  ])('never serves %s, even if the reader returns it', async (_n, over) => {
    const r = await gatherBrainPiece('ai_fact', 's', {}, deps({ servableItems: async () => [item(over)] }));
    expect(r).toEqual({ piece: 'ai_fact', block: '', allowedLinks: [] });
  });
  it('never serves one already sent to this person', async () => {
    const r = await gatherBrainPiece('ai_fact', 's', { excludeItemIds: ['i1'] }, deps({ servableItems: async () => [item()] }));
    expect(r!.block).toBe('');
  });
});

describe('build_prompt', () => {
  it('serves the most viral approved, test-built prompt with its credit', async () => {
    const r = await gatherBrainPiece('build_prompt', 's', {}, deps({ servableItems: async () => [PROMPT, { ...PROMPT, id: 'p2', title: 'Second' }] }));
    expect(r!.block).toContain('BUILD OF THE WEEK');
    expect(r!.block).toContain('A private video-to-GIF converter');
    expect(r!.block).toContain('Inspired by: Show HN: GIF converter (Hacker News, 412 points)');
    expect(r!.block).toContain('You are a senior front-end engineer.');
    expect(r!.allowedLinks).toEqual(['https://news.ycombinator.com/item?id=1']);
    expect(r!.itemId).toBe('p1');
  });
  it.each([
    ['an untested prompt', { test_build_status: 'pending' as const }],
    ['a failed prompt', { test_build_status: 'failed' as const }],
    ['a draft prompt', { status: 'draft' as const }],
    ['an expired prompt', { expires_at: inDays(-2).toISOString() }],
  ])('never serves %s', async (_n, over) => {
    const r = await gatherBrainPiece('build_prompt', 's', {}, deps({ servableItems: async () => [{ ...PROMPT, ...over }] }));
    expect(r!.block).toBe('');
  });
  it('an empty or unreadable shelf is an empty block', async () => {
    expect(renderBuildPrompt(null).block).toBe('');
    const w = quiet();
    expect((await gatherBrainPiece('build_prompt', 's', {}, deps({ servableItems: boom })))!.block).toBe('');
    w.mockRestore();
  });
});

describe('weekly_progress', () => {
  const facts = { lessonsDone: ['Video: A welcome from Ali'], points: 40, nextLessons: ['Claude Code 101', 'Get Claude Code running'] };
  it('says what they did, what is next and what is live this week, with only those links', async () => {
    const r = await gatherBrainPiece('weekly_progress', 's', { email: 'sam@example.test' }, deps({
      weeklyFacts: async () => facts, upcomingEvents: async () => EVENTS,
    }));
    expect(r!.block).toContain('"Video: A welcome from Ali"');
    expect(r!.block).toContain('Points earned this week: 40');
    expect(r!.block).toContain('Up next on their Today page: "Claude Code 101", "Get Claude Code running"');
    expect(r!.block).toContain('Live this week: Open House');
    expect(r!.allowedLinks).toEqual([TODAY, PORTAL_EVENTS_URL]);
  });
  it('a quiet week says "none" instead of inventing a lesson', () => {
    const r = renderWeeklyProgress({ lessonsDone: [], points: 0, nextLessons: ['Claude Code 101'], nextEvent: null }, TODAY);
    expect(r.block).toContain('Lessons finished this week: none');
    expect(r.block).not.toContain('Points');
  });
  it('is empty with no account, nothing to say, or a failed read', async () => {
    expect((await gatherBrainPiece('weekly_progress', 's', {}, deps({ weeklyFacts: async () => null, upcomingEvents: async () => [] })))!.block).toBe('');
    expect(renderWeeklyProgress({ lessonsDone: [], points: 0, nextLessons: [], nextEvent: null }, TODAY).block).toBe('');
    const w = quiet();
    expect((await gatherBrainPiece('weekly_progress', 's', {}, deps({ weeklyFacts: boom, upcomingEvents: boom })))!.block).toBe('');
    w.mockRestore();
  });
});

describe('the countdown pieces keep working with injected readers', () => {
  it('builder_spotlight survives a throwing spotlight reader and still shows the next event', async () => {
    const w = quiet();
    const r = await gatherBrainPiece('builder_spotlight', 's', {}, deps({ spotlight: boom, upcomingEvents: async () => EVENTS }));
    expect(r!.block).toContain('AI Strategy & Collaboration');
    expect(r!.block).not.toMatch(/^- Open House/m);
    w.mockRestore();
  });
  it('their_progress allows the Today page only', async () => {
    expect(await gatherBrainPiece('their_progress', 's', {}, deps({}))).toEqual({ piece: 'their_progress', block: '', allowedLinks: [TODAY] });
  });
});
