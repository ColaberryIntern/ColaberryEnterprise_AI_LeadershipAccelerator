import type { BoardPost, Lane, PostLane } from './boardData';

/**
 * The board's lanes as they read, and its time words (Campus v14 B2 / B3, Basecamp C67). PURE and tested.
 * Lane colours are art tokens (campusArtTokens.css --cm-art-lane-*): never a hex here.
 */
export interface LaneMeta { key: Lane; label: string; icon: string; desc: string }
export const LANE_META: LaneMeta[] = [
  { key: 'all', label: 'Everything', icon: '📌', desc: '' },
  { key: 'mine', label: 'Your notes', icon: '⭐', desc: 'Everything you’ve posted, where it is now, and who replied.' },
  { key: 'ann', label: 'Announcements', icon: '📣', desc: 'Pinned by the Colaberry team.' },
  { key: 'q', label: 'Questions', icon: '🙋', desc: 'Ask anything. Classmates, Reese and Dara answer. Unanswered ones stay at the top until someone does.' },
  { key: 'intro', label: 'Introductions', icon: '👋', desc: 'Roll Call: who’s here, where they work and the one thing they want AI to do for them.' },
  { key: 'wins', label: 'Wins & builds', icon: '🏆', desc: 'Show & Tell, Cohort Wins, Meet My Team, Never Again and Architect Manifesto: what people shipped.' },
  { key: 'tips', label: 'Tips & prompts', icon: '💡', desc: 'Skill Drop, Steal This Prompt and Teach One Thing: things you can use today.' },
  { key: 'ideas', label: 'Ideas & stories', icon: '⚖️', desc: 'Hot Take and War Story: opinions, debates and lessons from the field.' },
  { key: 'general', label: 'General', icon: '💬', desc: 'Everything else.' },
];
export const laneMeta = (k: Lane): LaneMeta => LANE_META.find((l) => l.key === k) ?? LANE_META[LANE_META.length - 1];

const TZ = 'America/Chicago';
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const centralDay = (t: number): string => new Date(t).toLocaleDateString('en-CA', { timeZone: TZ });

/**
 * "just now", "12m ago", "3h ago", "Yesterday", "4d ago" (up to 6 days), then "Oct 12". Yesterday is the Central calendar day; the
 * finer labels use the instant.
 */
export function ageLabel(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  const d = Math.max(0, now - t);
  if (d < MIN) return 'just now';
  if (d < HOUR) return `${Math.floor(d / MIN)}m ago`;
  if (centralDay(t) === centralDay(now)) return `${Math.floor(d / HOUR)}h ago`;
  if (centralDay(t) === centralDay(now - DAY)) return 'Yesterday';
  if (d < 7 * DAY) return `${Math.max(2, Math.round(d / DAY))}d ago`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ });
}

/** The full Central date and time for the tooltip ("Sun, Oct 25, 1:55 PM CDT"). */
export function fullCentral(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ, timeZoneName: 'short' });
}

/** "Sun 1:55 PM CDT" for the header's "since you looked". */
export function shortCentral(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: TZ, timeZoneName: 'short' });
}

const FRESH_MS = 48 * HOUR;
/** Where one of your posts sits now (the Your notes view). */
export function whereNow(p: Pick<BoardPost, 'created_at' | 'lane'>, now: number): string {
  const lane = laneMeta(p.lane as PostLane).label;
  const until = new Date(p.created_at).getTime() + FRESH_MS;
  if (until > now) return `📍 On the cork in Fresh until ${shortCentral(new Date(until).toISOString())}, then in ${lane}`;
  return `📍 In ${lane} · ${now - new Date(p.created_at).getTime() < 7 * DAY ? 'Earlier this week' : 'Earlier'}`;
}

export const firstName = (n: string): string => n.trim().split(/\s+/)[0] || n;
export const initials = (n: string): string => n.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
/** A slight, stable tilt per note (about one degree either way), from its id. */
export function tiltOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 5) - 2) * 0.5;
}
