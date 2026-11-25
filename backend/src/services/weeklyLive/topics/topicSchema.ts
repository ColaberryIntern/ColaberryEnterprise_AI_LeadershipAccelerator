import { z } from 'zod';
import { lintFields, type LintViolation, type TaggedField } from '../contentLint';
import { CONVERT_WEIGHTS, IDEA_WEIGHTS, VIRAL_WEIGHTS } from '../scoring';

/**
 * The two AI answers behind a topic (WL3.3). A DRAFT is words only: the writer never scores itself. A
 * JUDGMENT is line scores only, from a separate call. scoring.ts does every total. An item that does not
 * fit is dropped with a reason, never repaired.
 */
const keys = <W extends Record<string, number>>(w: W) => Object.keys(w);
const linesOf = <W extends Record<string, number>>(w: W) => z.object(Object.fromEntries(keys(w).map((k) => [k, z.number()])) as Record<string, z.ZodNumber>);
const teachLine = z.object({ score: z.number(), why: z.string().min(3).max(400) });

export const TITLE_MAX_WORDS = 7;

export const DraftSchema = z.object({
  week: z.number().int().min(1).max(12),
  title: z.string().trim().min(3).max(80).refine((t) => t.split(/\s+/).length <= TITLE_MAX_WORDS, `more than ${TITLE_MAX_WORDS} words`),
  spin: z.string().min(10).max(900),
  parody: z.string().min(10).max(1200),
  hooks: z.array(z.string().min(5).max(200)).min(2).max(6),
  package: z.object({ long_video: z.string().min(3).max(300), shorts: z.string().min(3).max(600), thumbnail: z.string().min(1).max(60) }),
  marketing: z.object({ before: z.string().min(3).max(400), class_day: z.string().min(3).max(400), after: z.string().min(3).max(400) }),
  signals: z.array(z.string().regex(/^S\d{1,2}$/)).max(8),
  proof_use: z.string().max(400),
});
export type Draft = z.infer<typeof DraftSchema>;

const JudgmentSchema = z.object({
  id: z.string(),
  hooks: z.array(linesOf(VIRAL_WEIGHTS)),
  teach: z.object(Object.fromEntries(keys(IDEA_WEIGHTS).map((k) => [k, teachLine])) as Record<string, typeof teachLine>),
  viral: linesOf(VIRAL_WEIGHTS),
  convert: linesOf(CONVERT_WEIGHTS),
});
export type Judgment = z.infer<typeof JudgmentSchema>;

/** A draft with its judgment. Hooks carry their own line scores. */
export interface CandidateTopic extends Omit<Draft, 'hooks'> {
  hooks: { text: string; viral: Record<string, number> }[];
  teach: Judgment['teach']; viral: Judgment['viral']; convert: Judgment['convert'];
}

type Json = Record<string, unknown>;
const str: Json = { type: 'string' }; const num: Json = { type: 'number' };
const obj = (props: Record<string, Json>): Json => ({ type: 'object', properties: props, required: Object.keys(props), additionalProperties: false });
const arr = (items: Json): Json => ({ type: 'array', items });
const each = (w: Record<string, number>, v: Json) => obj(Object.fromEntries(Object.keys(w).map((k) => [k, v])));

/** The same shapes as strict JSON schemas, so the API cannot leave a key out. Lengths and ranges stay with Zod. */
export const DRAFTS_JSON_SCHEMA: Json = obj({ topics: arr(obj({
  week: { type: 'integer' }, title: str, spin: str, parody: str, hooks: arr(str),
  package: obj({ long_video: str, shorts: str, thumbnail: str }), marketing: obj({ before: str, class_day: str, after: str }), signals: arr(str), proof_use: str,
})) });
export const JUDGMENTS_JSON_SCHEMA: Json = obj({ scores: arr(obj({
  id: str, hooks: arr(each(VIRAL_WEIGHTS, num)), teach: each(IDEA_WEIGHTS, obj({ score: num, why: str })), viral: each(VIRAL_WEIGHTS, num), convert: each(CONVERT_WEIGHTS, num),
})) });

const issue = (e: z.ZodError) => `${e.issues[0].path.join('.')} ${e.issues[0].message}`;

/** Keep the drafts that are valid, open and clean. Reasons for the rest are returned, so a short list can be explained. */
export function parseDrafts(raw: unknown, allowedWeeks: ReadonlySet<number>): { drafts: Draft[]; rejected: string[] } {
  const list = (raw as { topics?: unknown } | null)?.topics;
  if (!Array.isArray(list)) return { drafts: [], rejected: ['the writer\'s answer had no topics list'] };
  const drafts: Draft[] = []; const rejected: string[] = [];
  list.forEach((item, i) => {
    const n = `topic ${i + 1}`;
    const p = DraftSchema.safeParse(item);
    if (!p.success) { rejected.push(`${n}: ${issue(p.error)}`); return; }
    if (!allowedWeeks.has(p.data.week)) { rejected.push(`${n}: week ${p.data.week} is not open`); return; }
    const d = { ...p.data, hooks: p.data.hooks.filter((h) => !lintFields(hookFields(h)).length) };
    if (d.hooks.length < 2) { rejected.push(`${n}: fewer than two hooks follow the content rules`); return; }
    const bad = lintTopic(d);
    if (bad.length) { rejected.push(`${n}: ${bad[0].field} breaks ${bad[0].rule}`); return; }
    drafts.push(d);
  });
  return { drafts, rejected };
}

/** Pair judgments with the drafts they scored, by id. A draft without a full judgment is dropped, never scored by guess. */
export function pairJudgments(drafts: Draft[], ids: string[], raw: unknown): { topics: CandidateTopic[]; rejected: string[] } {
  const list = (raw as { scores?: unknown } | null)?.scores;
  const byId = new Map<string, Judgment>(); const rejected: string[] = [];
  for (const item of Array.isArray(list) ? list : []) {
    const p = JudgmentSchema.safeParse(item);
    if (p.success) byId.set(p.data.id, p.data); else rejected.push(`a score: ${issue(p.error)}`);
  }
  const topics = drafts.flatMap((d, i): CandidateTopic[] => {
    const j = byId.get(ids[i]);
    if (!j || j.hooks.length !== d.hooks.length) { rejected.push(`"${d.title}" was not fully scored`); return []; }
    return [{ ...d, hooks: d.hooks.map((text, k) => ({ text, viral: j.hooks[k] })), teach: j.teach, viral: j.viral, convert: j.convert }];
  });
  return { topics, rejected };
}

/** A hook is spoken and captioned; its figures may be spoken with a source, never put on a graphic. */
const hookFields = (text: string): TaggedField[] => [{ path: 'hook', kind: 'voiceover', text }, { path: 'hook', kind: 'caption', text }];

/** Every public field of a topic against the content rules. The title and thumbnail go on graphics. */
export function lintTopic(t: Pick<Draft, 'title' | 'spin' | 'parody' | 'hooks' | 'package' | 'marketing'>): LintViolation[] {
  return lintFields([
    { path: 'title', kind: 'onScreen', text: t.title },
    { path: 'package.thumbnail', kind: 'onScreen', text: t.package.thumbnail },
    { path: 'spin', kind: 'post', text: t.spin },
    { path: 'parody', kind: 'voiceover', text: t.parody },
    ...t.hooks.flatMap(hookFields),
    { path: 'package.long_video', kind: 'post', text: t.package.long_video },
    { path: 'package.shorts', kind: 'post', text: t.package.shorts },
    ...Object.entries(t.marketing).map(([k, text]): TaggedField => ({ path: `marketing.${k}`, kind: 'post', text })),
  ]);
}
