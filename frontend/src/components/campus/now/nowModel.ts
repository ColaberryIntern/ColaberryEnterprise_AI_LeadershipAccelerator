import type { BoardPost, Lane } from '../board/boardData';
import { laneMeta } from '../board/boardTime';
import type { Happening } from './nowApi';

/**
 * Colaberry Now's stream, the pure part (Campus v20 N2, Basecamp C133). PURE and tested.
 */

/** Append a page to the stream without repeating a post already shown (a post can move pages while you scroll). */
export function appendPage(shown: BoardPost[], page: BoardPost[]): BoardPost[] {
  const seen = new Set(shown.map((p) => p.id));
  return [...shown, ...page.filter((p) => !seen.has(p.id))];
}

/** Insert the new posts the pill was holding at the top, newest first, without duplicates. */
export function insertNew(shown: BoardPost[], fresh: BoardPost[]): BoardPost[] {
  const ids = new Set(fresh.map((p) => p.id));
  return [...[...fresh].sort((a, b) => b.created_at.localeCompare(a.created_at)), ...shown.filter((p) => !ids.has(p.id))];
}

/** The newest post anyone else wrote that is on screen: what /since counts from (null: nothing to count from yet). */
export function newestOthers(lists: BoardPost[][]): string | null {
  let best: BoardPost | null = null;
  for (const p of lists.flat()) if (!p.mine && (!best || p.created_at > best.created_at)) best = p;
  return best?.id ?? null;
}

/** The section chip on a post: the ritual's icon and name, else its lane. */
export function sectionOf(p: Pick<BoardPost, 'ritual' | 'lane' | 'pinned'>): { icon: string; label: string } {
  if (p.pinned) return { icon: '📣', label: 'Announcement' };
  if (p.ritual) return { icon: p.ritual.icon, label: p.ritual.name };
  const m = laneMeta(p.lane as Lane);
  return { icon: m.icon, label: m.key === 'q' ? 'Question' : m.label };
}

export const isUnansweredQuestion = (p: Pick<BoardPost, 'lane' | 'comment_count'>): boolean => p.lane === 'q' && p.comment_count === 0;

/** The Happening-now chips, from real data only: a chip with nothing to say is left out. */
export type ChipKind = 'campus' | 'event' | 'questions' | 'win' | 'shorts';
export interface NowChip { kind: ChipKind; icon: string; bold: string; rest: string }
export function happeningChips(h: Happening | null, nameOf: (area: string) => string | null, when: (iso: string) => string): NowChip[] {
  if (!h) return [];
  const out: NowChip[] = [];
  if (h.on_campus && h.on_campus.count > 0) {
    const busiest = h.on_campus.busiest ? nameOf(h.on_campus.busiest) : null;
    out.push({ kind: 'campus', icon: '●', bold: `${h.on_campus.count} on campus`, rest: busiest ? `busiest: ${busiest}` : '' });
  }
  if (h.next_event) out.push({ kind: 'event', icon: '🎪', bold: h.next_event.title, rest: when(h.next_event.starts_at) });
  if (h.open_questions && h.open_questions > 0) {
    out.push({ kind: 'questions', icon: '🙋', bold: `${h.open_questions} ${h.open_questions === 1 ? 'question needs' : 'questions need'} an answer`, rest: '' });
  }
  if (h.latest_win) out.push({ kind: 'win', icon: '🏆', bold: h.latest_win.author.split(/\s+/)[0] || h.latest_win.author, rest: h.latest_win.title });
  if (h.shorts && h.shorts > 0) out.push({ kind: 'shorts', icon: '📺', bold: `${h.shorts} ${h.shorts === 1 ? 'short' : 'shorts'} on Colaberry TV`, rest: '' });
  return out;
}

/** "TUE 10:00 AM" in Central for the event chip. */
export function eventWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }).toUpperCase().replace(',', '');
}
