/**
 * hireTalentQuery - the validated query for GET /api/public/hire/talent.
 *
 * Every parameter is optional, and every value that is not one of the known ones is a 400,
 * never silently ignored: a caller that typos `track=fdee` should learn so, not be shown
 * the whole directory as if it had matched. Nothing here is ever interpolated into SQL;
 * the directory filters in memory over rows it has already loaded.
 */
import { z } from 'zod';

export const HIRE_TRACKS = ['fde', 'ai-engineer', 'architect', 'analytics'] as const;
export type HireTrack = (typeof HIRE_TRACKS)[number];

export const HIRE_SORTS = ['featured', 'case_studies', 'verified_commits', 'newest'] as const;
export type HireSort = (typeof HIRE_SORTS)[number];

export const HIRE_MAX_LIMIT = 48;
const FACET = /^[a-z0-9][a-z0-9-]{0,79}$/;

export const hireTalentQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  track: z.enum(HIRE_TRACKS).optional(),
  industry: z.string().regex(FACET).optional(),
  capability: z.string().regex(FACET).optional(),
  sort: z.enum(HIRE_SORTS).optional(),
  limit: z.coerce.number().int().min(1).max(HIRE_MAX_LIMIT).optional(),
  // An opaque offset cursor, as the API itself issues it.
  cursor: z.string().regex(/^\d{1,4}$/).optional(),
}).strict();

export type HireTalentQuery = z.infer<typeof hireTalentQuerySchema>;

/** Parse req.query. A repeated parameter (an array) is rejected rather than coerced. */
export function parseHireTalentQuery(raw: unknown):
  { ok: true; query: HireTalentQuery } | { ok: false; error: string } {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (Object.values(input).some((v) => Array.isArray(v))) {
    return { ok: false, error: 'Each query parameter may appear once' };
  }
  const parsed = hireTalentQuerySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.path.join('.') || 'query').join(', ') };
  }
  return { ok: true, query: parsed.data };
}

/**
 * The small explicit map from a portfolio's role words to a hiring track (SPEC §4.1).
 * First match wins, in this order; a role that matches none has NO track, which keeps the
 * person in the unfiltered directory and out of every track filter. Never guessed.
 */
const TRACK_RULES: ReadonlyArray<[HireTrack, RegExp]> = [
  ['fde', /\bforward[- ]deployed\b|\bfde\b/i],
  ['architect', /\barchitect\b/i],
  ['analytics', /\banalytic|\bdata (analyst|engineer|scientist)\b|\bbi\b|\bpower bi\b/i],
  ['ai-engineer', /\b(ai|ml|machine learning|llm|genai|frontier)\b.*\bengineer\b|\bengineer\b.*\b(ai|ml|llm)\b/i],
];

export function trackFor(role: string | null | undefined): HireTrack | null {
  const text = String(role || '');
  if (!text.trim()) return null;
  for (const [track, re] of TRACK_RULES) if (re.test(text)) return track;
  return null;
}
