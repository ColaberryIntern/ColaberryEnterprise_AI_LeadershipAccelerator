/**
 * workSummary (C129, phase 2 of the approved C127 design): the Dashboard room and the Gallery board, computed from the same
 * My work list the learner already loads. Pure, no I/O. Every number is a count of the learner's real pieces; nothing is
 * estimated, smoothed or invented (a week with nothing in it shows as 0, the design's "gap week shown honestly").
 */
import type { WorkGroup, WorkItem } from '../../../../services/myWorkApi';
import { GROUP_ORDER, GROUP_STYLE, skillLabel, weekKey } from './myWorkModel';

export interface KindBar { group: WorkGroup; label: string; color: string; n: number }
export interface WeekBar { key: string; label: string; n: number }
export interface SkillBar { label: string; n: number }

export interface WorkSummary {
  total: number;
  /** First and last piece, ISO; null when there are none. */
  first: string | null;
  last: string | null;
  kinds: KindBar[];
  /** The most recent weeks, oldest first, gaps included as 0. */
  weeks: WeekBar[];
  skills: SkillBar[];
  newest: WorkItem[];
  /** Distinct weeks with at least one piece. */
  activeWeeks: number;
  projects: number;
}

const MAX_WEEKS = 8;
const MAX_SKILLS = 6;
const MAX_NEWEST = 5;

const addDays = (key: string, days: number): string => {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export const weekShort = (key: string): string =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
export const dayShort = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });

export function summarize(items: WorkItem[]): WorkSummary {
  const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const byKind = new Map<WorkGroup, number>();
  const byWeek = new Map<string, number>();
  const bySkill = new Map<string, { label: string; n: number }>();
  const projects = new Set<string>();
  for (const it of sorted) {
    byKind.set(it.group, (byKind.get(it.group) ?? 0) + 1);
    const w = weekKey(it.createdAt);
    byWeek.set(w, (byWeek.get(w) ?? 0) + 1);
    const seen = new Set<string>();
    for (const s of it.skills) {
      const label = skillLabel(s);
      const k = label.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      const cur = bySkill.get(k) ?? { label, n: 0 };
      cur.n += 1;
      bySkill.set(k, cur);
    }
    if (it.project) projects.add(it.project.toLowerCase());
  }
  const weeks: WeekBar[] = [];
  if (sorted.length) {
    const lastWeek = weekKey(sorted[0].createdAt);
    const firstWeek = weekKey(sorted[sorted.length - 1].createdAt);
    for (let k = lastWeek, i = 0; i < MAX_WEEKS && k >= firstWeek; i += 1, k = addDays(k, -7)) {
      weeks.unshift({ key: k, label: weekShort(k), n: byWeek.get(k) ?? 0 });
    }
  }
  return {
    total: sorted.length,
    first: sorted.length ? sorted[sorted.length - 1].createdAt : null,
    last: sorted.length ? sorted[0].createdAt : null,
    kinds: GROUP_ORDER.filter((g) => byKind.get(g)).map((g) => ({ group: g, label: GROUP_STYLE[g].label, color: GROUP_STYLE[g].color, n: byKind.get(g) as number })),
    weeks,
    skills: [...bySkill.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).slice(0, MAX_SKILLS),
    newest: sorted.slice(0, MAX_NEWEST),
    activeWeeks: byWeek.size,
    projects: projects.size,
  };
}

/** Where a Dashboard tile lands in My work, already filtered (design: "every tile and bar is a link into My work"). */
export const myWorkLink = (q: { kind?: WorkGroup; by?: 'week' | 'project' | 'skill' | 'kind'; q?: string } = {}): string => {
  const p = new URLSearchParams();
  if (q.kind) p.set('kind', q.kind);
  if (q.by && q.by !== 'week') p.set('by', q.by);
  if (q.q) p.set('q', q.q);
  const s = p.toString();
  return `/portal/portfolio/work${s ? `?${s}` : ''}`;
};
