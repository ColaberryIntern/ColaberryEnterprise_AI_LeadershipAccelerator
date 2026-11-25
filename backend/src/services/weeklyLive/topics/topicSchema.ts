import { z } from 'zod';
import { lintFields, type LintViolation, type TaggedField } from '../contentLint';
import { CONVERT_WEIGHTS, IDEA_WEIGHTS, VIRAL_WEIGHTS } from '../scoring';

/**
 * The shape of one AI topic candidate (WL3.3). The AI proposes words and line scores; scoring.ts does
 * every total. A candidate that does not fit is dropped, never repaired.
 */
const keys = <W extends Record<string, number>>(w: W) => Object.keys(w) as [string, ...string[]];
const linesOf = <W extends Record<string, number>>(w: W) => z.object(Object.fromEntries(keys(w).map((k) => [k, z.number()])) as Record<string, z.ZodNumber>);
const teachLine = z.object({ score: z.number(), why: z.string().min(3).max(300) });

export const TITLE_MAX_WORDS = 5;

export const CandidateTopicSchema = z.object({
  week: z.number().int().min(1).max(12),
  title: z.string().trim().min(3).max(80).refine((t) => t.split(/\s+/).length <= TITLE_MAX_WORDS, 'more than five words'),
  spin: z.string().min(10).max(600),
  parody: z.string().min(10).max(600),
  hooks: z.array(z.object({ text: z.string().min(5).max(160), viral: linesOf(VIRAL_WEIGHTS) })).min(2).max(5),
  package: z.object({ long_video: z.string().min(3).max(200), shorts: z.string().min(3).max(300), thumbnail: z.string().min(1).max(60) }),
  marketing: z.object({ before: z.string().min(3).max(300), class_day: z.string().min(3).max(300), after: z.string().min(3).max(300) }),
  signals: z.array(z.string().regex(/^S\d{1,2}$/)).max(8),
  teach: z.object(Object.fromEntries(keys(IDEA_WEIGHTS).map((k) => [k, teachLine])) as Record<string, typeof teachLine>),
  viral: linesOf(VIRAL_WEIGHTS),
  convert: linesOf(CONVERT_WEIGHTS),
});
export type CandidateTopic = z.infer<typeof CandidateTopicSchema>;

type Json = Record<string, unknown>;
const str: Json = { type: 'string' }; const num: Json = { type: 'number' };
const obj = (props: Record<string, Json>): Json => ({ type: 'object', properties: props, required: Object.keys(props), additionalProperties: false });
const arr = (items: Json): Json => ({ type: 'array', items });
const each = (w: Record<string, number>, v: Json) => obj(Object.fromEntries(Object.keys(w).map((k) => [k, v])));

/** The same shape as a strict JSON schema, so the API cannot leave out a score line. Lengths and ranges stay with Zod above. */
export const TOPICS_JSON_SCHEMA: Json = obj({ topics: arr(obj({
  week: { type: 'integer' }, title: str, spin: str, parody: str,
  hooks: arr(obj({ text: str, viral: each(VIRAL_WEIGHTS, num) })),
  package: obj({ long_video: str, shorts: str, thumbnail: str }), marketing: obj({ before: str, class_day: str, after: str }),
  signals: arr(str), teach: each(IDEA_WEIGHTS, obj({ score: num, why: str })), viral: each(VIRAL_WEIGHTS, num), convert: each(CONVERT_WEIGHTS, num),
})) });

export interface Parsed { topics: CandidateTopic[]; rejected: string[]; }

/** Keep what is valid and clean. Reasons for the rest are returned, so a short list can be explained. */
export function parseTopics(raw: unknown, allowedWeeks: ReadonlySet<number>): Parsed {
  const list = (raw as { topics?: unknown } | null)?.topics;
  if (!Array.isArray(list)) return { topics: [], rejected: ['the answer had no topics list'] };
  const topics: CandidateTopic[] = []; const rejected: string[] = [];
  list.forEach((item, i) => {
    const p = CandidateTopicSchema.safeParse(item);
    if (!p.success) { rejected.push(`topic ${i + 1}: ${p.error.issues[0].path.join('.')} ${p.error.issues[0].message}`); return; }
    if (!allowedWeeks.has(p.data.week)) { rejected.push(`topic ${i + 1}: week ${p.data.week} is not open`); return; }
    const t = { ...p.data, hooks: p.data.hooks.filter((h) => !lintFields(hookFields(h.text)).length) };
    if (t.hooks.length < 2) { rejected.push(`topic ${i + 1}: fewer than two hooks follow the content rules`); return; }
    const bad = lintTopic(t);
    if (bad.length) { rejected.push(`topic ${i + 1}: ${bad[0].field} breaks ${bad[0].rule}`); return; }
    topics.push(t);
  });
  return { topics, rejected };
}

/** A hook is spoken and captioned; its figures may be spoken with a source, never put on a graphic. */
const hookFields = (text: string): TaggedField[] => [{ path: 'hook', kind: 'voiceover', text }, { path: 'hook', kind: 'caption', text }];

/** Every public field of a topic against the content rules. The title and thumbnail go on graphics. */
export function lintTopic(t: Pick<CandidateTopic, 'title' | 'spin' | 'parody' | 'hooks' | 'package' | 'marketing'>): LintViolation[] {
  return lintFields([
    { path: 'title', kind: 'onScreen', text: t.title },
    { path: 'package.thumbnail', kind: 'onScreen', text: t.package.thumbnail },
    { path: 'spin', kind: 'post', text: t.spin },
    { path: 'parody', kind: 'voiceover', text: t.parody },
    ...t.hooks.flatMap((h) => hookFields(h.text)),
    { path: 'package.long_video', kind: 'post', text: t.package.long_video },
    { path: 'package.shorts', kind: 'post', text: t.package.shorts },
    ...Object.entries(t.marketing).map(([k, text]): TaggedField => ({ path: `marketing.${k}`, kind: 'post', text })),
  ]);
}
