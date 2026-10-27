import type { OpenHouseView } from '../../services/onboardingApi';
import type { TimelineFeedCard } from '../timeline/TimelineCard';
import type { ClassroomFeed, SideRow, SideTop } from './interior/pageSummary';
import { eventWhen, upcoming } from './events/eventsModel';

/**
 * C78 (Ali 2026-10-27: "when they finish today - show the timeline somehow - we don't want them to think they are finished with the
 * free trial. We need a way to keep them coming back for more"): once today's plan is finished, the path ahead, from real data only.
 *  - the next classroom lessons you can open now (available or in progress, in the classroom's own week and order), each a link
 *  - the next locked lesson, with the classroom's own lock reason (no reason: plain "Locked"; never an invented date)
 *  - the next upcoming event, with its real day and time
 * Nothing to show: no rows (the caller keeps its own line). The copy never says "free" (TWC 807.172(d)).
 */
export const AHEAD_LESSONS = 2;
export const AHEAD_MAX = 4;

const byPath = (a: TimelineFeedCard, b: TimelineFeedCard): number =>
  (a.week ?? Number.MAX_SAFE_INTEGER) - (b.week ?? Number.MAX_SAFE_INTEGER) || a.order - b.order;
// community posts ride the Today feed with a feed ref for an id: they are not lessons and have no runtime page
const isLesson = (c: TimelineFeedCard): boolean => !c.community_post_id;

export function pathAhead(feed: ClassroomFeed | null, events: OpenHouseView[] | null, now: Date): SideRow[] {
  const cards = (feed?.cards ?? []).filter(isLesson).sort(byPath);
  const open = cards.filter((c) => c.status === 'available' || c.status === 'in_progress').slice(0, AHEAD_LESSONS)
    .map((c) => ({ label: c.title, value: c.status === 'in_progress' ? 'keep going' : c.estimated_time ? `${c.estimated_time} min` : 'next', route: `/portal/runtime/${c.id}` }));
  const locked = cards.find((c) => c.status === 'locked');
  const lockedRow = locked ? [{ label: locked.title, value: `🔒 ${locked.lock_reason?.trim() || 'Locked'}` }] : [];
  const ev = upcoming(events ?? [], now, 1)[0];
  const evRow = ev ? (() => { const w = eventWhen(ev.starts_at); return [{ label: ev.title, value: `${w.day} · ${w.time}${ev.is_registered ? ' ✓' : ''}` }]; })() : [];
  return [...open, ...lockedRow, ...evRow].slice(0, AHEAD_MAX);
}

/** Today is finished (every item done) or there is no plan left today: the moment to show the path ahead. */
export const todayFinished = (stops: { done: boolean }[] | null): boolean => !!stops && stops.every((s) => s.done);

/** The Schedule's left board once today is finished: what comes next, and Today one tap away. `hadItems`: today's items are all
 *  checked off ("Today is done"); no items is ambiguous (done ones drop off the plan on the next read, or there was none), so it
 *  says only what is true either way. */
export function aheadBoard(rows: SideRow[], hadItems: boolean): SideTop {
  return {
    title: hadItems ? '✅ Today is done · what comes next' : '📅 Nothing left on today · what comes next',
    note: 'You are not finished. Pick up your next lesson or sign up for what is coming up.',
    rows, ...(rows.length ? {} : { empty: 'Nothing new on your path yet' }), open: 'Open Today', route: '/portal/today',
  };
}
