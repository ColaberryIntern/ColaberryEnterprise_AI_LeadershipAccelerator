/**
 * The Community Board in sections (Campus v14 B1, Basecamp C65). PURE: rows in, the board's shape out, so lanes, buckets and the
 * no-repeat rule are tested without a database (boardService reads the rows).
 *
 * LANES (laneOf): pinned is always Announcements; a Support post or an Unblock Me ritual is a Question; Roll Call is Introductions;
 * the build / win rituals are Wins & builds; the prompt / skill rituals are Tips & prompts; Hot Take and War Story are Ideas & stories;
 * everything else is General. "mine" is a view (my posts in any lane), not a lane a post belongs to.
 *
 * BUCKETS use instants, not calendar days (v14: "Central has nothing to do with it"): fresh is under 48 hours old, this week 48 h to
 * 7 days, last week 7 to 14 days, older beyond 14 days. A post exactly 48 h old is "this week" (the windows are half-open).
 */
export const LANES = ['all', 'mine', 'ann', 'q', 'intro', 'wins', 'tips', 'ideas', 'general'] as const;
export type Lane = typeof LANES[number];
export type PostLane = Exclude<Lane, 'all' | 'mine'>;
export type Bucket = 'fresh' | 'this_week' | 'last_week' | 'older';

const RITUAL_LANE: Record<string, PostLane> = {
  unblock_me: 'q',
  roll_call: 'intro',
  show_and_tell: 'wins', cohort_wins: 'wins', meet_my_team: 'wins', never_again: 'wins', architect_manifesto: 'wins',
  skill_drop: 'tips', steal_this_prompt: 'tips', teach_one_thing: 'tips',
  hot_take: 'ideas', war_story: 'ideas',
};

export interface LaneInput { pinned: boolean; category: string | null; ritual_key: string | null }

export function laneOf(p: LaneInput): PostLane {
  if (p.pinned) return 'ann';
  if (p.category === 'Support') return 'q';
  if (p.ritual_key && RITUAL_LANE[p.ritual_key]) return RITUAL_LANE[p.ritual_key];
  return 'general';
}

const H = 60 * 60 * 1000;
export const FRESH_MS = 48 * H;
export const WEEK_MS = 7 * 24 * H;
export const TWO_WEEKS_MS = 14 * 24 * H;

export function bucketOf(createdAt: string | Date, now: number): Bucket {
  const age = now - new Date(createdAt).getTime();
  if (age < FRESH_MS) return 'fresh';
  if (age < WEEK_MS) return 'this_week';
  if (age < TWO_WEEKS_MS) return 'last_week';
  return 'older';
}

export interface BoardRow extends LaneInput { id: string; member_id: string; created_at: string; comment_count: number }

export interface BoardIds {
  pinned: string[];
  unanswered: string[];
  fresh: string[];
  this_week: string[];
  last_week: string[];
  older: { ids: string[]; next_cursor: string | null };
}

export interface BoardShape {
  counts: Record<Lane, number>;
  open_questions: number;
  new_since: { at: string | null; count: number; by_lane: Record<Lane, number> };
  ids: BoardIds;
}

export const ALL_PINNED_MAX = 2;
export const UNANSWERED_MAX = 3;
export const ALL_FRESH_MAX = 9;
export const OLDER_PAGE = 20;

const zero = (): Record<Lane, number> => Object.fromEntries(LANES.map((l) => [l, 0])) as Record<Lane, number>;
const newestFirst = (a: BoardRow, b: BoardRow): number => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);
export const cursorOf = (r: Pick<BoardRow, 'created_at' | 'id'>): string => `${r.created_at}|${r.id}`;

export interface AssembleOptions {
  lane: Lane;
  viewerMemberId: string;
  seenAt: string | null;
  now: number;
  /** null: no older page requested; '' or 'start': the first page; otherwise the cursor of the last row already shown. */
  olderCursor: string | null;
}

/**
 * `all` are every visible post in the cohort (counts and new-since come from these, never from a search); `listed` are the ones the
 * lists may show (the same rows, narrowed by the search). Both newest first or in any order (they are sorted here).
 */
export function assembleBoard(all: BoardRow[], listed: BoardRow[], o: AssembleOptions): BoardShape {
  const counts = zero();
  const byLane = zero();
  let openQuestions = 0;
  let newCount = 0;
  const seen = o.seenAt ? new Date(o.seenAt).getTime() : null;
  for (const r of all) {
    const lane = laneOf(r);
    counts.all += 1;
    counts[lane] += 1;
    if (r.member_id === o.viewerMemberId) counts.mine += 1;
    if (lane === 'q' && r.comment_count === 0) openQuestions += 1;
    if (seen !== null && r.member_id !== o.viewerMemberId && new Date(r.created_at).getTime() > seen) {
      newCount += 1;
      byLane.all += 1;
      byLane[lane] += 1;
    }
  }

  const inLane = (r: BoardRow): boolean => o.lane === 'all' || (o.lane === 'mine' ? r.member_id === o.viewerMemberId : laneOf(r) === o.lane);
  const rows = listed.filter(inLane).sort(newestFirst);
  const ids: BoardIds = { pinned: [], unanswered: [], fresh: [], this_week: [], last_week: [], older: { ids: [], next_cursor: null } };

  if (o.lane === 'all' || o.lane === 'ann') {
    const pinned = rows.filter((r) => r.pinned);
    ids.pinned = (o.lane === 'all' ? pinned.slice(0, ALL_PINNED_MAX) : pinned).map((r) => r.id);
  }
  if (o.lane === 'all') {
    ids.unanswered = rows.filter((r) => laneOf(r) === 'q' && r.comment_count === 0).slice(0, UNANSWERED_MAX).map((r) => r.id);
  }
  // On "all" nothing repeats: fresh leaves out anything already pinned or in Needs an answer
  const shown = new Set([...ids.pinned, ...ids.unanswered]);
  const rest = rows.filter((r) => !shown.has(r.id) && !(o.lane === 'ann' && r.pinned));
  const fresh = rest.filter((r) => bucketOf(r.created_at, o.now) === 'fresh');
  ids.fresh = (o.lane === 'all' ? fresh.slice(0, ALL_FRESH_MAX) : fresh).map((r) => r.id);
  ids.this_week = rest.filter((r) => bucketOf(r.created_at, o.now) === 'this_week').map((r) => r.id);
  ids.last_week = rest.filter((r) => bucketOf(r.created_at, o.now) === 'last_week').map((r) => r.id);

  if (o.olderCursor !== null) {
    const older = rest.filter((r) => bucketOf(r.created_at, o.now) === 'older');
    const start = o.olderCursor === '' || o.olderCursor === 'start' ? 0 : older.findIndex((r) => cursorOf(r) === o.olderCursor) + 1;
    const page = start > 0 || o.olderCursor === '' || o.olderCursor === 'start' ? older.slice(start, start + OLDER_PAGE) : [];
    ids.older = { ids: page.map((r) => r.id), next_cursor: start + OLDER_PAGE < older.length && page.length ? cursorOf(page[page.length - 1]) : null };
  }

  return { counts, open_questions: openQuestions, new_since: { at: o.seenAt, count: newCount, by_lane: byLane }, ids };
}
