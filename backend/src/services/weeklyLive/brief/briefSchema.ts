import { z } from 'zod';
import { lintFields, tagObject, type FieldKind } from '../contentLint';

/**
 * The copy in Jackie's event brief (WL4.4), the parts a writer produces; everything factual (date, the
 * four time zones, the Zoom room, the next episode, the promotion calendar, export sizes) is filled in
 * by code, so the writer cannot get a time or a link wrong.
 */
export const THUMB_THEMES = ['night', 'clock', 'event', 'dawn'] as const;
const line = (max: number) => z.string().trim().min(1).max(max);

export const BriefCopySchema = z.object({
  eventName: line(70),
  fullTitle: line(140),
  summary: line(140),
  description: z.array(line(500)).min(3).max(8),
  bullets: z.array(line(240)).min(2).max(5),
  whoFor: line(300),
  whatToBring: line(300),
  tags: z.array(line(30)).min(6).max(12),
  thumbnails: z.array(z.object({
    theme: z.enum(THUMB_THEMES), kicker: line(30), bigWord: line(16), accent: z.string().trim().max(16), line: line(60), name: line(30), why: line(200), bestFor: line(40),
  }).strict()).length(4),
  posts: z.array(z.object({ slot: line(20), text: line(900) }).strict()).min(2).max(10),
}).strict();
export type BriefCopy = z.infer<typeof BriefCopySchema>;

type Json = Record<string, unknown>;
const str: Json = { type: 'string' };
const obj = (props: Record<string, Json>): Json => ({ type: 'object', properties: props, required: Object.keys(props), additionalProperties: false });
const arr = (items: Json): Json => ({ type: 'array', items });
export const BRIEF_JSON_SCHEMA: Json = obj({
  eventName: str, fullTitle: str, summary: str, description: arr(str), bullets: arr(str), whoFor: str, whatToBring: str, tags: arr(str),
  thumbnails: arr(obj({ theme: { type: 'string', enum: [...THUMB_THEMES] }, kicker: str, bigWord: str, accent: str, line: str, name: str, why: str, bestFor: str })),
  posts: arr(obj({ slot: str, text: str })),
});

/** Every field problem in an answer, as sentences the writer can fix in one go. */
export function briefIssues(raw: unknown, slotIds: readonly string[]): string[] {
  const p = BriefCopySchema.safeParse(raw);
  if (!p.success) {
    if (raw === null || typeof raw !== 'object') return ['The answer was cut off or was not a JSON object.'];
    return p.error.issues.slice(0, 20).map((i) => `malformed at ${i.path.join('.')}: ${i.message}`);
  }
  const bad: string[] = [];
  const got = p.data.posts.map((x) => x.slot);
  const missing = slotIds.filter((id) => !got.includes(id));
  if (missing.length) bad.push(`posts missing for slots: ${missing.join(', ')}`);
  const extra = got.filter((id) => !slotIds.includes(id));
  if (extra.length) bad.push(`posts for slots that do not exist: ${extra.join(', ')}`);
  if (new Set(got).size !== got.length) bad.push('two posts for one slot');
  // Thumbnails and titles are graphics: no statistics there. Posts and the description are captions.
  const kindOf = (path: string): FieldKind => (/^(thumbnails|eventName|fullTitle)/.test(path) ? 'onScreen' : 'post');
  for (const v of lintFields(tagObject(p.data, kindOf))) bad.push(`content rule ${v.rule} at ${v.field}: "${v.match}"`);
  if (/\bguarant(ee|eed)\b/i.test(JSON.stringify(p.data))) bad.push('the word "guarantee" is not allowed');
  return bad;
}
