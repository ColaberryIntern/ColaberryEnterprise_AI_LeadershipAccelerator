/**
 * My work (C128): pure list logic, no React. The kind chips, the four groupings the approved design
 * asks for (Week, Project, Skill, Kind), search, and Previous / Next on the work page.
 *
 * Counts come from the learner's real pieces only; a kind with none has no chip (design: "a chip with 0
 * is hidden"), and a week with nothing in it simply has no section rather than an invented one.
 */
import type { WorkGroup, WorkItem } from '../../../../services/myWorkApi';

export const GROUP_STYLE: Record<WorkGroup, { label: string; one: string; color: string; icon: string }> = {
  written: { label: 'Written work', one: 'Written work', color: '#B7791F', icon: 'article-line' },
  guide: { label: 'Field guides', one: 'Field guide', color: '#0F766E', icon: 'compass-3-line' },
  link: { label: 'Claude Studio links', one: 'Claude Studio link', color: '#475569', icon: 'external-link-line' },
  sheet: { label: 'Spreadsheets', one: 'Spreadsheet', color: '#217346', icon: 'file-excel-2-line' },
  word: { label: 'Word documents', one: 'Word document', color: '#2B579A', icon: 'file-word-2-line' },
  pdf: { label: 'PDFs', one: 'PDF', color: '#C4302B', icon: 'file-pdf-2-line' },
  slides: { label: 'Slides', one: 'Slides', color: '#C2410C', icon: 'file-ppt-2-line' },
  recording: { label: 'Recordings', one: 'Recording', color: '#6B4FBB', icon: 'video-line' },
  image: { label: 'Images', one: 'Image', color: '#A21CAF', icon: 'image-line' },
  notes: { label: 'Notes', one: 'Notes', color: '#64748B', icon: 'sticky-note-line' },
  file: { label: 'Other files', one: 'File', color: '#475569', icon: 'file-line' },
};
export const GROUP_ORDER: WorkGroup[] = ['written', 'guide', 'link', 'sheet', 'word', 'pdf', 'slides', 'recording', 'image', 'notes', 'file'];

export type GroupBy = 'week' | 'project' | 'skill' | 'kind';
export const GROUP_BY: Array<{ key: GroupBy; label: string }> = [
  { key: 'week', label: 'Week' }, { key: 'project', label: 'Project' }, { key: 'skill', label: 'Skill' }, { key: 'kind', label: 'Kind' },
];

export interface Chip { key: WorkGroup | 'all'; label: string; count: number }

/** "All" first, then every kind the learner actually has, in display order. Any list of pieces with a group (My work, Showcase). */
export function chipsFor(items: ReadonlyArray<Pick<WorkItem, 'group'>>): Chip[] {
  const n = new Map<WorkGroup, number>();
  for (const it of items) n.set(it.group, (n.get(it.group) ?? 0) + 1);
  return [{ key: 'all', label: 'All', count: items.length },
    ...GROUP_ORDER.filter((g) => n.get(g)).map((g) => ({ key: g, label: GROUP_STYLE[g].label, count: n.get(g) as number }))];
}

/** Skills read the same whether stored as "context_engineering" or "Context Engineering". */
export function skillLabel(s: string): string {
  const t = s.replace(/_/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/** Monday of the week a piece was made, as YYYY-MM-DD in Central time (the program's clock). */
export function weekKey(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const d = new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
const weekLabel = (key: string): string =>
  `Week of ${new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;

export function matches(it: Pick<WorkItem, 'title' | 'from' | 'project' | 'skills'>, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [it.title, it.from, it.project ?? '', ...it.skills, ...it.skills.map(skillLabel)].some((v) => v.toLowerCase().includes(s));
}

export function filterItems(items: WorkItem[], kind: WorkGroup | 'all', q: string): WorkItem[] {
  return items.filter((it) => (kind === 'all' || it.group === kind) && matches(it, q));
}

export interface Section { key: string; label: string; items: WorkItem[] }

/**
 * The pieces in sections. Items keep their incoming order (newest first) inside a section. Weeks run
 * newest first; projects, skills and kinds run by size, then name, with the leftovers last. A piece with
 * several skills appears under each one: that is the point of grouping by skill.
 */
export function sectionsFor(items: WorkItem[], by: GroupBy): Section[] {
  const map = new Map<string, Section>();
  const add = (key: string, label: string, it: WorkItem) => {
    const s = map.get(key) ?? { key, label, items: [] };
    s.items.push(it);
    map.set(key, s);
  };
  for (const it of items) {
    if (by === 'week') { const k = weekKey(it.createdAt); add(k, weekLabel(k), it); }
    else if (by === 'project') add(it.project ? `p:${it.project.toLowerCase()}` : '~none', it.project ?? 'Not tied to a project', it);
    else if (by === 'kind') add(it.group, GROUP_STYLE[it.group].label, it);
    else if (it.skills.length) {
      const seen = new Set<string>();
      for (const sk of it.skills) { const k = `s:${skillLabel(sk).toLowerCase()}`; if (!seen.has(k)) { seen.add(k); add(k, skillLabel(sk), it); } }
    } else add('~none', 'No skill tagged', it);
  }
  const all = [...map.values()];
  if (by === 'week') return all.sort((a, b) => b.key.localeCompare(a.key));
  if (by === 'kind') return all.sort((a, b) => GROUP_ORDER.indexOf(a.key as WorkGroup) - GROUP_ORDER.indexOf(b.key as WorkGroup));
  return all.sort((a, b) => (a.key === '~none' ? 1 : 0) - (b.key === '~none' ? 1 : 0) || b.items.length - a.items.length || a.label.localeCompare(b.label));
}

/** The order the list was showing, unique ids, for Previous / Next on the work page. */
export function orderOf(sections: Section[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of sections) for (const it of s.items) if (!seen.has(it.id)) { seen.add(it.id); out.push(it.id); }
  return out;
}

export function neighbors(order: string[], id: string): { prev: string | null; next: string | null; index: number } {
  const i = order.indexOf(id);
  if (i < 0) return { prev: null, next: null, index: -1 };
  return { prev: i > 0 ? order[i - 1] : null, next: i < order.length - 1 ? order[i + 1] : null, index: i };
}

export const shortDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' });
