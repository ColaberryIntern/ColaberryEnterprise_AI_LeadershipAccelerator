import type { Sheet } from './askRouter';

/**
 * Career Prep v27 (CP4.6): the "getting hired" pages, opened as sheets inside the room (kit 4.7), never as
 * more doors. Each sheet is a hash on the room's URL (/portal/career/room#offers), so an email link or the
 * jump bar opens the room with that sheet on top, and the browser Back button closes it.
 */
export interface SheetInfo { key: Sheet; title: string; purpose: string }
export const SHEETS: readonly SheetInfo[] = [
  { key: 'interviews', title: 'Your interviews', purpose: 'Every interview: the ones employers booked and the ones you added.' },
  { key: 'inbox', title: 'Job-search inbox', purpose: 'Where Cora will read interview invitations for you.' },
  { key: 'offers', title: 'Offers', purpose: 'Offers from employers, and when to reply.' },
  { key: 'applications', title: 'Applications', purpose: 'The jobs you applied to and where each one stands.' },
  { key: 'resume', title: 'Digital resume', purpose: 'The page employers see: your intro video, projects and case studies.' },
];
const KEYS = new Set<string>(SHEETS.map((s) => s.key));

/** The sheet a URL hash names, or null ("#offers" -> offers; anything else -> no sheet). */
export function sheetFromHash(hash: string): Sheet | null {
  const k = hash.replace(/^#/, '').trim().toLowerCase();
  return KEYS.has(k) ? (k as Sheet) : null;
}

export const sheetInfo = (key: Sheet): SheetInfo => SHEETS.find((s) => s.key === key) as SheetInfo;

/** The jump bar's list: every sheet, plus the room's common actions. */
export type JumpItem = { id: string; label: string; hint: string } & ({ go: 'sheet'; sheet: Sheet } | { go: 'tab'; tab: 'progress' | 'plan' | 'session' } | { go: 'start' });
export const JUMP_ITEMS: readonly JumpItem[] = [
  { id: 'start', label: "Start today's session", hint: 'Session', go: 'start' },
  { id: 'progress', label: 'Your progress', hint: 'Tab', go: 'tab', tab: 'progress' },
  { id: 'plan', label: 'Your plan', hint: 'Tab', go: 'tab', tab: 'plan' },
  ...SHEETS.map((s): JumpItem => ({ id: s.key, label: s.title, hint: 'Page', go: 'sheet', sheet: s.key })),
];

/** Type to filter: every word typed must appear in the label (case and order do not matter). */
export function filterJump(items: readonly JumpItem[], query: string): JumpItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((i) => words.every((w) => i.label.toLowerCase().includes(w)));
}
