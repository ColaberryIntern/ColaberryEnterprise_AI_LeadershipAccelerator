import { RITUALS, parseRitualHeading, type RitualConfig } from '../runtime/communityRituals';

/**
 * A board note's title and excerpt (Campus v14 B2 "Title and excerpt rules", Basecamp C67). PURE, server-side because only the server
 * holds every ritual's guided-field labels.
 *  - Ritual posts: the title is the first required guided field, prefixed with its label where that reads well ("What I built: ...",
 *    "I'm ..."); the excerpt is the other filled fields joined with " - " (links left out).
 *  - Other posts: the title is the first sentence, at most 90 characters, cut on a word with an ellipsis; the excerpt is the rest.
 *  - The "<Ritual> - Week n" heading never appears in either (the chip already says it).
 * A locked post (above the viewer's level) has no text: its title says what unlocks it.
 */
export interface NoteText { title: string; excerpt: string }

const BY_KEY = new Map(Object.values(RITUALS).map((r) => [r.key, r]));
export const TITLE_MAX = 90;

const asText = (v: string | string[] | undefined): string => (Array.isArray(v) ? v.filter(Boolean).join(', ') : (v ?? '')).trim();

/** "I'm..." reads as "I'm Dana"; "Before" reads as "Before: 2 hrs"; a question-shaped label just shows the answer. */
export function withLabel(label: string, value: string): string {
  const l = label.trim();
  if (/[…]$|\.\.\.$/.test(l)) return `${l.replace(/(…|\.\.\.)$/, '')} ${value}`.trim();
  if (/\?$/.test(l)) return value;
  return `${l}: ${value}`;
}

export function cutTitle(text: string, max = TITLE_MAX): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const atWord = cut.lastIndexOf(' ') > max * 0.5 ? cut.slice(0, cut.lastIndexOf(' ')) : cut;
  return `${atWord.replace(/[\s,;:.-]+$/, '')}…`;
}

function ritualText(r: RitualConfig, values: Record<string, string | string[]>): NoteText | null {
  const fields = r.fields.filter((f) => f.kind !== 'link');
  const first = fields.find((f) => f.required && asText(values[f.key])) ?? fields.find((f) => asText(values[f.key]));
  if (!first) return null;
  const title = cutTitle(withLabel(first.label, asText(values[first.key])));
  const excerpt = fields.filter((f) => f !== first).map((f) => asText(values[f.key])).filter(Boolean).join(' · ');
  return { title, excerpt };
}

export function noteText(p: { body: string | null; locked: boolean; min_level: number; ritual_key: string | null; ritual_values: Record<string, string | string[]> | null }): NoteText {
  if (p.locked || p.body === null) return { title: `Unlocks at level ${p.min_level}`, excerpt: '' };
  const r = p.ritual_key ? BY_KEY.get(p.ritual_key) : undefined;
  if (r && p.ritual_values) {
    const t = ritualText(r, p.ritual_values);
    if (t) return t;
  }
  const text = (parseRitualHeading(p.body)?.rest ?? p.body).replace(/\s+/g, ' ').trim();
  if (!text) return { title: r ? r.name : 'Untitled note', excerpt: '' };
  const m = /^(.+?[.!?])(\s|$)/.exec(text);
  const sentence = m && m[1].length <= TITLE_MAX ? m[1] : null;
  if (sentence) return { title: sentence, excerpt: text.slice(sentence.length).trim() };
  const title = cutTitle(text);
  const shown = title.endsWith('…') ? title.slice(0, -1) : title;
  return { title, excerpt: text.slice(shown.length).trim() };
}
