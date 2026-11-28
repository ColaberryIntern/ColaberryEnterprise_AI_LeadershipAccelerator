import { z } from 'zod';
import { FOLLOW_LIMITS } from '../../liveFollowAlong';

/**
 * The session blueprint a Weekly Live deck is built from (WL4.2). It carries exactly what the
 * hand-built Session 3 deck carried per slide (do, say, read, clip line, follow-along card, prompt,
 * poll) plus the slide's on-screen content, so one renderer can build any episode.
 *
 * Every field is required in the AI's strict JSON schema (the API cannot leave a key out); a field that
 * does not apply is an empty string, an empty list or null. Lengths and ranges are Zod's job.
 */
export const SLIDE_KINDS = ['title', 'lobby', 'agenda', 'story', 'statement', 'teach', 'handson', 'poll', 'mistake', 'chain', 'hotseat', 'recap', 'next'] as const;
export type SlideKind = (typeof SLIDE_KINDS)[number];
export const POLL_KINDS = ['poll', 'trivia', 'prediction'] as const;

const text = (max: number) => z.string().trim().max(max);
const line = (max: number) => z.string().trim().min(1).max(max);

const FollowSchema = z.object({
  step: text(FOLLOW_LIMITS.step), icon: text(FOLLOW_LIMITS.icon), heading: line(FOLLOW_LIMITS.heading),
  body: text(FOLLOW_LIMITS.body), bullets: z.array(line(FOLLOW_LIMITS.bullet)).max(FOLLOW_LIMITS.bullets),
}).strict();
const PromptSchema = z.object({ label: line(80), text: line(2000), expect: text(200) }).strict();
const PollSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]{2,40}$/), kind: z.enum(POLL_KINDS), q: line(200),
  options: z.array(line(90)).min(2).max(5), answer: z.number().int().min(0).nullable(), reveal: text(300),
}).strict();
const StepSchema = z.object({ icon: text(8), label: line(40), text: line(120) }).strict();

export const SlideSchema = z.object({
  kind: z.enum(SLIDE_KINDS),
  min: z.number().int().min(1).max(25),
  title: line(90),
  kicker: text(80),
  headline: line(140),
  highlight: text(80),
  body: text(400),
  bullets: z.array(line(140)).max(6),
  do: text(500),
  say: z.array(line(300)).min(1).max(6),
  read: text(900),
  clip: text(200),
  follow: FollowSchema,
  prompt: PromptSchema.nullable(),
  poll: PollSchema.nullable(),
  pair: z.object({ no: line(160), yes: line(200) }).strict().nullable(),
  steps: z.array(StepSchema).max(3),
}).strict();
export type DeckSlide = z.infer<typeof SlideSchema>;

export const BlueprintSchema = z.object({
  promise: line(160),
  slides: z.array(SlideSchema).min(8).max(24),
  soundBites: z.array(z.object({ text: line(200), slide: z.number().int().min(0) }).strict()).min(10).max(20),
  nextWeek: z.object({ question: line(160), promise: line(200) }).strict(),
}).strict();
export type SessionBlueprint = z.infer<typeof BlueprintSchema>;

type Json = Record<string, unknown>;
const str: Json = { type: 'string' };
const int: Json = { type: 'integer' };
const obj = (props: Record<string, Json>): Json => ({ type: 'object', properties: props, required: Object.keys(props), additionalProperties: false });
const arr = (items: Json): Json => ({ type: 'array', items });
const orNull = (s: Json): Json => ({ anyOf: [s, { type: 'null' }] });

/** The same shape as a strict JSON schema for the writer call. */
export const BLUEPRINT_JSON_SCHEMA: Json = obj({
  promise: str,
  slides: arr(obj({
    kind: { type: 'string', enum: [...SLIDE_KINDS] }, min: int, title: str, kicker: str, headline: str, highlight: str, body: str, bullets: arr(str),
    do: str, say: arr(str), read: str, clip: str,
    follow: obj({ step: str, icon: str, heading: str, body: str, bullets: arr(str) }),
    prompt: orNull(obj({ label: str, text: str, expect: str })),
    poll: orNull(obj({ key: str, kind: { type: 'string', enum: [...POLL_KINDS] }, q: str, options: arr(str), answer: orNull(int), reveal: str })),
    pair: orNull(obj({ no: str, yes: str })),
    steps: arr(obj({ icon: str, label: str, text: str })),
  })),
  soundBites: arr(obj({ text: str, slide: int })),
  nextWeek: obj({ question: str, promise: str }),
});

/** Every field problem in a malformed answer, as sentences the writer can fix in one go (at most 20). */
export function blueprintIssues(raw: unknown): string[] {
  const p = BlueprintSchema.safeParse(raw);
  if (p.success) return [];
  if (raw === null || typeof raw !== 'object') return ['The answer was cut off or was not a JSON object.'];
  return p.error.issues.slice(0, 20).map((i) => `malformed at ${i.path.join('.')}: ${i.message}`);
}

/** Parse the writer's answer. Throws a ContractViolation naming the first bad field. */
export function parseBlueprint(raw: unknown): SessionBlueprint {
  const p = BlueprintSchema.safeParse(raw);
  if (p.success) return p.data;
  const i = p.error.issues[0];
  throw Object.assign(new Error(`The session plan came back malformed at ${i.path.join('.')}: ${i.message}`), { name: 'ContractViolation' });
}
