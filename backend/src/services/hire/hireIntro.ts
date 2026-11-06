/**
 * hireIntro - POST /api/public/hire/intro: an employer asks to be introduced to a person.
 *
 * IT IS A LEAD, so it goes through the canonical ingest path (`handleIngest`, source
 * `hire-refactored`, entry `intro_request`) - lead dedup by email + source, the prospect
 * account, the activity log and the routing rules all happen there, exactly once. The
 * Colaberry owner is told by a `notify_sales` routing rule on that source (seeded with
 * scripts/seedLeadNotificationRule at deploy, to the admin notification addresses - Ali's
 * H1.1 answer). The CANDIDATE is never contacted and their contact details are never
 * returned: this response carries a status and nothing else.
 *
 * IDEMPOTENT PER DAY. The routing engine claims a notification per raw payload, so a
 * double-click would notify twice. The key `sha256(email + talentSlug + day)` (SPEC §4.4,
 * day in Central time) is inserted into `hire_intro_requests` with ON CONFLICT DO NOTHING
 * BEFORE ingest; a repeat the same day answers 200 `duplicate` and fires nothing. The
 * table holds the hash, the slug and a timestamp - no email, no name.
 *
 * FAILURE-FIRST. (1) An unknown or unlisted talent slug is a 404, identical to the
 * portfolio's. (2) If ingest fails after the key was claimed, the key is released so the
 * employer can retry; a failure to release is logged, and costs at most one retry-day.
 * (3) No retry loop: the employer's resubmit is the retry.
 */
import crypto from 'crypto';
import { z } from 'zod';
import { sequelize } from '../../config/database';
import { handleIngest } from '../leadIngestionService';
import { loadHireIndex } from './hireTalentIndex';

export const HIRE_INTRO_SOURCE = 'hire-refactored';
export const HIRE_INTRO_ENTRY = 'intro_request';

export const hireIntroSchema = z.object({
  talentSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,158}$/i),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().max(254).email(),
  company: z.string().trim().min(1).max(160),
  role: z.string().trim().min(1).max(120),
  message: z.string().trim().max(2000).optional().default(''),
}).strict();

export type HireIntroInput = z.infer<typeof hireIntroSchema>;

export type HireIntroOutcome =
  | { status: 'created'; http: 201 }
  | { status: 'duplicate'; http: 200 }
  | { status: 'invalid'; http: 400; error: string }
  | { status: 'not_found'; http: 404 }
  | { status: 'failed'; http: 502 };

/** The calendar day in Central time, so "the same day" means Ali's day, not UTC's. */
export function centralDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function introIdempotencyKey(email: string, talentSlug: string, now: Date): string {
  return crypto.createHash('sha256')
    .update(`${email.trim().toLowerCase()}|${talentSlug.toLowerCase()}|${centralDay(now)}`)
    .digest('hex');
}

/** Claim the key. True when THIS request is the first today; false for a repeat. */
async function claimKey(key: string, talentSlug: string): Promise<boolean> {
  const [rows] = await sequelize.query(
    `INSERT INTO hire_intro_requests (idempotency_key, talent_slug)
     VALUES ($1, $2) ON CONFLICT (idempotency_key) DO NOTHING RETURNING idempotency_key`,
    { bind: [key, talentSlug] },
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function releaseKey(key: string): Promise<void> {
  try {
    await sequelize.query('DELETE FROM hire_intro_requests WHERE idempotency_key = $1', { bind: [key] });
  } catch (err: unknown) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
      event: 'hire_intro_key_release_failed', outcome: 'failure', error_class: e.name || 'Error',
      context: { message: e.message.slice(0, 200) },
    }));
  }
}

export interface HireIntroContext {
  readonly headers: Record<string, unknown>;
  readonly remoteIp?: string;
  readonly now?: Date;
}

export async function requestHireIntro(raw: unknown, ctx: HireIntroContext): Promise<HireIntroOutcome> {
  const parsed = hireIntroSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: 'invalid', http: 400, error: parsed.error.issues.map((i) => i.path.join('.') || 'body').join(', ') };
  }
  const input = parsed.data;
  const now = ctx.now ?? new Date();

  // Only a person reachable on Hire can be asked for. Same 404 as an unknown slug.
  const [entry] = await loadHireIndex(['public', 'unlisted'], input.talentSlug);
  if (!entry) return { status: 'not_found', http: 404 };

  const key = introIdempotencyKey(input.email, entry.page.slug, now);
  if (!(await claimKey(key, entry.page.slug))) return { status: 'duplicate', http: 200 };

  const rawBody = {
    name: input.name, email: input.email, company: input.company, role: input.role,
    message: input.message, talent_slug: entry.page.slug, idempotency_key: key,
  };
  const result = await handleIngest({
    sourceSlug: HIRE_INTRO_SOURCE,
    entrySlug: HIRE_INTRO_ENTRY,
    rawBody,
    rawBodyText: JSON.stringify(rawBody),
    // handleIngest declares headers as Record<string, any>; the request's headers pass through untouched.
    headers: ctx.headers as Record<string, any>,
    remoteIp: ctx.remoteIp,
    signature: '',
    sessionId: '',
  }).catch((err: unknown) => ({ success: false as const, httpStatus: 500, error: err instanceof Error ? err.message : String(err) }));

  if (!result?.success) {
    await releaseKey(key);
    console.error(JSON.stringify({
      timestamp: now.toISOString(), level: 'error', service: 'backend',
      event: 'hire_intro_ingest_failed', outcome: 'failure', error_class: 'UpstreamUnavailable',
      context: { talent_slug: entry.page.slug, http_status: result?.httpStatus ?? null },
    }));
    return { status: 'failed', http: 502 };
  }
  return { status: 'created', http: 201 };
}
