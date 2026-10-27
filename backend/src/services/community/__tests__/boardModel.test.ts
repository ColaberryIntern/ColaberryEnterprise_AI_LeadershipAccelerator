import { assembleBoard, bucketOf, cohortWeek, cursorOf, laneOf, FRESH_MS, WEEK_MS, TWO_WEEKS_MS, type BoardRow } from '../boardModel';

/** Campus v14 B1: lanes, the 48 h / 7 d / 14 d buckets on instants, no repeats on "all", "mine" scoping, new-since and paging. */
const NOW = Date.parse('2026-10-26T17:00:00Z');
const ago = (ms: number): string => new Date(NOW - ms).toISOString();
const H = 60 * 60 * 1000;
let n = 0;
const row = (o: Partial<BoardRow> = {}): BoardRow => ({
  id: `p${String(++n).padStart(3, '0')}`, member_id: 'other', pinned: false, category: 'General', ritual_key: null,
  created_at: ago(H), comment_count: 0, ...o,
});
const opts = (o: Partial<Parameters<typeof assembleBoard>[2]> = {}) => ({ lane: 'all' as const, viewerMemberId: 'me', seenAt: null, now: NOW, olderCursor: null, ...o });

describe('laneOf', () => {
  it.each([
    [{ pinned: true, category: 'Support', ritual_key: 'roll_call' }, 'ann'],
    [{ pinned: false, category: 'Support', ritual_key: null }, 'q'],
    [{ pinned: false, category: 'General', ritual_key: 'unblock_me' }, 'q'],
    [{ pinned: false, category: 'Introductions', ritual_key: 'roll_call' }, 'intro'],
    [{ pinned: false, category: 'Wins', ritual_key: 'cohort_wins' }, 'wins'],
    [{ pinned: false, category: 'General', ritual_key: 'show_and_tell' }, 'wins'],
    [{ pinned: false, category: 'General', ritual_key: 'steal_this_prompt' }, 'tips'],
    [{ pinned: false, category: 'General', ritual_key: 'hot_take' }, 'ideas'],
    [{ pinned: false, category: 'General', ritual_key: 'war_story' }, 'ideas'],
    [{ pinned: false, category: 'General', ritual_key: null }, 'general'],
    [{ pinned: false, category: null, ritual_key: 'not_a_ritual' }, 'general'],
  ] as const)('%o -> %s', (input, lane) => {
    expect(laneOf(input)).toBe(lane);
  });
});

describe('bucketOf at the boundaries (instants)', () => {
  it.each([
    [FRESH_MS - 1, 'fresh'], [FRESH_MS, 'this_week'],
    [WEEK_MS - 1, 'this_week'], [WEEK_MS, 'last_week'],
    [TWO_WEEKS_MS - 1, 'last_week'], [TWO_WEEKS_MS, 'older'],
  ])('%i ms old is %s', (age, b) => {
    expect(bucketOf(ago(age), NOW)).toBe(b);
  });
});

describe('cohortWeek (the ritual bar)', () => {
  it.each([
    ['no cohort', null, null],
    ['before the cohort starts', '2026-11-02', null],
    ['day one', '2026-10-26', 1],
    ['the second week', '2026-10-19', 2],
    ['long after (capped at 12)', '2026-01-05', 12],
  ])('%s', (_n, start, week) => {
    expect(cohortWeek(start, NOW)).toBe(week);
  });
});

describe('assembleBoard', () => {
  it('"all": pinned (max 2), needs an answer (max 3), fresh (max 9) with no post repeated', () => {
    const pins = [row({ pinned: true }), row({ pinned: true }), row({ pinned: true })];
    const qs = [1, 2, 3, 4].map(() => row({ category: 'Support' }));
    const fresh = Array.from({ length: 12 }, () => row());
    const all = [...pins, ...qs, ...fresh];
    const b = assembleBoard(all, all, opts());
    expect(b.ids.pinned).toHaveLength(2);
    expect(b.ids.unanswered).toHaveLength(3);
    expect(b.ids.fresh).toHaveLength(9);
    const shown = [...b.ids.pinned, ...b.ids.unanswered, ...b.ids.fresh];
    expect(new Set(shown).size).toBe(shown.length);
    expect(b.open_questions).toBe(4);
    expect(b.counts.all).toBe(all.length);
    expect(b.counts.ann).toBe(3);
  });

  it('a lane has no cap on fresh and holds only its own posts; ann lists pinned only once', () => {
    const all = [...Array.from({ length: 11 }, () => row({ ritual_key: 'hot_take' })), row(), row({ pinned: true })];
    expect(assembleBoard(all, all, opts({ lane: 'ideas' })).ids.fresh).toHaveLength(11);
    const ann = assembleBoard(all, all, opts({ lane: 'ann' }));
    expect(ann.ids.pinned).toHaveLength(1);
    expect(ann.ids.fresh).toHaveLength(0);
  });

  it('"mine" is my posts in any lane', () => {
    const all = [row({ member_id: 'me', ritual_key: 'roll_call' }), row({ member_id: 'me', category: 'Support' }), row()];
    const b = assembleBoard(all, all, opts({ lane: 'mine' }));
    expect(b.counts.mine).toBe(2);
    expect([...b.ids.fresh]).toHaveLength(2);
  });

  it('buckets the earlier lists', () => {
    const all = [row({ created_at: ago(3 * 24 * H) }), row({ created_at: ago(10 * 24 * H) }), row({ created_at: ago(20 * 24 * H) })];
    const b = assembleBoard(all, all, opts());
    expect([b.ids.this_week.length, b.ids.last_week.length, b.ids.older.ids.length]).toEqual([1, 1, 0]);
  });

  it('new since my last look counts others\' posts after it, by lane', () => {
    const all = [row({ created_at: ago(H) }), row({ created_at: ago(H), ritual_key: 'roll_call' }), row({ created_at: ago(H), member_id: 'me' }), row({ created_at: ago(30 * H) })];
    const b = assembleBoard(all, all, opts({ seenAt: ago(2 * H) }));
    expect(b.new_since).toEqual(expect.objectContaining({ at: ago(2 * H), count: 2 }));
    expect(b.new_since.by_lane.intro).toBe(1);
    expect(assembleBoard(all, all, opts()).new_since.count).toBe(0);
  });

  it('a search narrows the lists, never the counts', () => {
    const a = row(); const b2 = row();
    const res = assembleBoard([a, b2], [a], opts());
    expect(res.ids.fresh).toEqual([a.id]);
    expect(res.counts.all).toBe(2);
  });

  it('older pages 20 at a time with a cursor', () => {
    const older = Array.from({ length: 25 }, (_, i) => row({ created_at: ago(TWO_WEEKS_MS + (i + 1) * H) }));
    expect(assembleBoard(older, older, opts()).ids.older.ids).toHaveLength(0);
    const p1 = assembleBoard(older, older, opts({ olderCursor: 'start' })).ids.older;
    expect(p1.ids).toHaveLength(20);
    expect(p1.next_cursor).toBe(cursorOf(older[19]));
    const p2 = assembleBoard(older, older, opts({ olderCursor: p1.next_cursor })).ids.older;
    expect(p2.ids).toEqual(older.slice(20).map((r) => r.id));
    expect(p2.next_cursor).toBeNull();
  });

  it('a section carries its first older page without asking (all its notes older than two weeks: it never opens empty)', () => {
    const intros = Array.from({ length: 17 }, (_, i) => row({ ritual_key: 'roll_call', created_at: ago(TWO_WEEKS_MS + (i + 1) * 24 * H) }));
    const lane = assembleBoard(intros, intros, opts({ lane: 'intro' }));
    expect(lane.counts.intro).toBe(17);
    expect(lane.ids.older.ids).toHaveLength(17);
    expect(lane.ids.older.next_cursor).toBeNull();
    const many = Array.from({ length: 25 }, (_, i) => row({ ritual_key: 'roll_call', created_at: ago(TWO_WEEKS_MS + (i + 1) * H) }));
    const p1 = assembleBoard(many, many, opts({ lane: 'intro' })).ids.older;
    expect(p1.ids).toHaveLength(20);
    expect(assembleBoard(many, many, opts({ lane: 'intro', olderCursor: p1.next_cursor })).ids.older.ids).toEqual(many.slice(20).map((r) => r.id));
    expect(assembleBoard(many, many, opts({ lane: 'mine', viewerMemberId: 'nobody' })).ids.older.ids).toHaveLength(0);
    // Everything keeps its "Show older" button
    expect(assembleBoard(many, many, opts()).ids.older.ids).toHaveLength(0);
  });
});
