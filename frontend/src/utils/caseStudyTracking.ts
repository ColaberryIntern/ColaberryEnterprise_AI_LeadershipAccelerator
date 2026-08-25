import { trackEvent } from './tracker';
import { markOncePerSession } from './oncePerSession';

/**
 * Case Study OS - the browser-side emitters (T019, build spec section 27).
 *
 * This is the ONLY surface the `/stories` pages should call. It exists rather
 * than letting each component call `trackEvent` directly for three reasons, all
 * of which are properties the ingest cannot enforce for us:
 *
 * 1. NOTHING SANITISES `event_data` SERVER-SIDE. `utils/piiRedaction.ts` is
 *    applied to log lines only - there is a single call in the entire tracking
 *    path and it redacts a console statement. `recordPageEvent` writes the
 *    payload to JSONB verbatim. Whatever a component passes is what lands in
 *    the database, permanently, in a table nobody prunes. `sanitizeEventData`
 *    below is therefore the last line of defence, not a convenience.
 *
 * 2. THE INGEST HAS NO EVENT-LEVEL DEDUPLICATION. Every accepted request is an
 *    INSERT: no idempotency key, no unique constraint, no "same type within N
 *    seconds" guard. A `case_study_view` fired from a render path rather than an
 *    effect writes a row per re-render. The view emitter carries its own
 *    once-per-slug-per-session guard for that reason.
 *
 * 3. THE EVENT NAMES ARE AN ALLOWLIST ON THE SERVER. A typo does not warn - it
 *    400s and the tracker swallows the rejection silently. Naming them once,
 *    here, and typing the arguments removes the failure mode from call sites.
 *
 * CONSENT. None of this runs for a visitor who has not consented: the tracker
 * is only started by `PublicLayoutV2` when `localStorage['cbv2_consent']` is
 * `'granted'`, and the default is `'unset'`. These functions are safe to call
 * unconditionally - `trackEvent` no-ops when the tracker never initialised - but
 * any metric built on them measures CONSENTING SESSIONS ONLY, and any product
 * behaviour gated on a Case Study event must degrade gracefully when the events
 * never arrive.
 */

/**
 * The seven event names. Mirrors
 * `backend/src/constants/caseStudyEventTypes.ts`, which is the source of truth;
 * a backend test reads this file and fails if the two lists diverge.
 */
export const CASE_STUDY_EVENT_TYPES = [
  'case_study_view',
  'case_study_filter',
  'case_study_card_click',
  'case_study_repo_click',
  'case_study_artifact_click',
  'case_study_cta_click',
  'case_study_share',
] as const;

export type CaseStudyEventType = (typeof CASE_STUDY_EVENT_TYPES)[number];

/**
 * Keys that must never be sent. Mirrors `FORBIDDEN_EVENT_DATA_KEYS` in
 * `backend/src/constants/caseStudyEventTypes.ts` and is pinned to it by test.
 * Personal data plus private repository identity - a Case Study can be built
 * from a repo the public is not entitled to know exists.
 */
export const FORBIDDEN_EVENT_DATA_KEYS: readonly string[] = [
  'email', 'email_address', 'name', 'full_name', 'first_name', 'last_name',
  'phone', 'phone_number', 'address', 'ip', 'ip_address', 'user_agent',
  'company', 'employer', 'job_title', 'title',
  'lead_id', 'user_id', 'student_id', 'participant_id', 'enrollment_id',
  'visitor_id', 'fingerprint',
  'repo_url', 'repo_name', 'repo_owner', 'repo_full_name', 'repo_id',
  'clone_url', 'ssh_url', 'html_url', 'github_login', 'owner', 'organization',
  'token', 'access_token', 'github_token', 'api_key', 'authorization',
];

/**
 * The keys a Case Study event MAY carry. An allowlist, not a denylist.
 *
 * WHY THIS REPLACED A DENYLIST. Verification probed the previous denylist with
 * five payloads and **all five survived**: a phone number under `contact_ref`, a
 * private repository URL under `link`, a person's name under `author_name`, an
 * obfuscated address (`jane(at)example.com`) that dodged the `@` check, and a
 * denylisted key with trailing whitespace (`'email '`) because the normaliser
 * lower-cased but did not trim.
 *
 * That is not a gap in the list — it is the structure. A denylist can only
 * refuse names somebody thought of, and the acceptance criterion here is
 * "slugs, categories and counts only", which is a statement about what IS
 * allowed. Only an allowlist can deliver it. Every key not named below is
 * dropped, so the next component that passes an unreviewed field loses it
 * instead of persisting it forever in a column nothing sanitises server-side.
 *
 * Adding a key here is a deliberate act. Ask whether it can ever carry a person,
 * a customer, or a repository the public is not entitled to know exists.
 */
export const ALLOWED_EVENT_DATA_KEYS: readonly string[] = [
  // identity of the record being acted on
  'slug', 'case_study_id', 'surface', 'source',
  // taxonomy — all normalised slugs from a published projection
  'industry', 'capability', 'verification', 'verification_method', 'program',
  'built_by', 'featured',
  // interaction shape
  'filter_key', 'filter_value', 'result_count', 'position',
  'artifact_kind', 'repo_role', 'repo_visibility', 'cta', 'placement', 'channel',
  // scroll depth, emitted under both keys its two consumers read
  'depth', 'depth_percent',
];

/** Values a Case Study event may carry: slugs, categories, counts, flags. */
export type CaseStudyEventValue = string | number | boolean;
export type CaseStudyEventData = Record<string, CaseStudyEventValue>;

const MAX_STRING_LENGTH = 120;
const ALLOWED = new Set(ALLOWED_EVENT_DATA_KEYS);
/**
 * Retained as a SECOND gate, not the primary one. If a name on this list ever
 * appears on the allowlist above, that is a mistake worth failing loudly for
 * rather than resolving by precedence — a test asserts the two never intersect.
 */
const FORBIDDEN = new Set(FORBIDDEN_EVENT_DATA_KEYS);

/** A value that looks like a URL, whatever its key is called. */
const URL_SHAPED = /^(https?:)?\/\/|^[a-z0-9-]+\.[a-z]{2,}\//i;

/**
 * Reduce an arbitrary object to a payload that is safe to persist forever.
 *
 * Five filters, in order of how much they are trusted:
 *   - the ALLOWLIST. A key not on `ALLOWED_EVENT_DATA_KEYS` is dropped, full
 *     stop. This is the primary gate and the only one that can deliver "slugs,
 *     categories and counts only", because that is a claim about what is
 *     permitted, not about what somebody remembered to forbid;
 *   - the forbidden list, kept as a second gate so an accidental overlap fails
 *     loudly rather than resolving by precedence;
 *   - scalars only. Nested objects and arrays are dropped rather than
 *     flattened, because the shape a consumer reads is `event_data->>'key'`
 *     and because a nested blob is exactly how unreviewed fields get smuggled
 *     into a column nobody sanitises;
 *   - value shape, whatever the key is called: email-like (including `(at)`
 *     and `%40`, both of which dodged an `@`-only check) and URL-like. An
 *     allowed key such as `source` can still be handed a repository address by
 *     a component that means well;
 *   - a length cap, so a component that passes a paragraph of body copy stores
 *     a slug-sized string instead.
 *
 * Pure and exported so the guarantee is unit-tested rather than assumed.
 */
export function sanitizeEventData(raw: Record<string, unknown> | undefined): CaseStudyEventData {
  const clean: CaseStudyEventData = {};
  if (!raw) return clean;

  for (const [key, value] of Object.entries(raw)) {
    // `.trim()` as well as `.toLowerCase()`: a key of `'email '` slipped the
    // previous normalisation and was persisted.
    const normalised = key.toLowerCase().trim();
    if (!ALLOWED.has(normalised)) continue;
    if (FORBIDDEN.has(normalised)) continue;
    if (value === null || value === undefined) continue;

    if (typeof value === 'number') {
      if (Number.isFinite(value)) clean[normalised] = value;
      continue;
    }
    if (typeof value === 'boolean') {
      clean[normalised] = value;
      continue;
    }
    if (typeof value === 'string') {
      // Email-shaped, so PII regardless of what the key is called. Both the
      // literal form and the two obfuscations that dodged the `@` check.
      const lowered = value.toLowerCase();
      if (lowered.includes('@') || lowered.includes('(at)') || lowered.includes('%40')) continue;
      // URL-shaped, so potentially a private repository address regardless of
      // what the key is called. An allowed key like `source` can still be handed
      // one by a component that means well.
      if (URL_SHAPED.test(value.trim())) continue;
      const trimmed = value.trim();
      if (trimmed.length === 0) continue;
      clean[normalised] = trimmed.slice(0, MAX_STRING_LENGTH);
      continue;
    }
    // Objects, arrays, functions, symbols: dropped.
  }

  return clean;
}

/** Emit one Case Study event with a sanitised payload. */
function emit(eventType: CaseStudyEventType, data: Record<string, unknown>): void {
  trackEvent(eventType, sanitizeEventData(data));
}

/** Identity of the Case Study being acted on. Every emitter takes at least a slug. */
export interface CaseStudyRef {
  slug: string;
  case_study_id?: string;
  surface?: string;
  industry?: string;
  capability?: string;
  verification?: string;
  /** Where the interaction started, e.g. 'stories-index' or 'stories-detail'. */
  source?: string;
}

/**
 * A Case Study detail page was viewed.
 *
 * Guarded to fire at most once per slug per session. React Strict Mode invokes
 * effects twice in development and any render-path call fires per re-render;
 * with no server-side dedup, either produces duplicate rows that inflate every
 * count computed from this table. Returns true when the event was emitted.
 */
export function trackCaseStudyView(ref: CaseStudyRef): boolean {
  if (!markOncePerSession(`case_study_view:${ref.slug}`)) return false;
  emit('case_study_view', { ...ref });
  return true;
}

/**
 * A filter was applied on the index.
 *
 * `result_count` is the point of the event: it is what separates "explored and
 * found matches" from "explored and found nothing", which is a content gap
 * signal rather than an engagement signal. Call this on COMMIT (the applied
 * filter), not per keystroke - there is no server-side rate limiting beyond a
 * silent 204 drop at 100 requests per 60 seconds.
 */
export function trackCaseStudyFilter(params: {
  filter_key: string;
  filter_value: string;
  result_count: number;
  surface?: string;
  source?: string;
}): void {
  emit('case_study_filter', { ...params });
}

/** A Case Study card was clicked on the index. `position` is the 1-based rank. */
export function trackCaseStudyCardClick(ref: CaseStudyRef & { position?: number }): void {
  emit('case_study_card_click', { ...ref });
}

/**
 * An approved public repository link was opened.
 *
 * Pass the repo's PUBLIC visibility class and role, never its owner, name or
 * URL - those keys are on the forbidden list and are stripped here anyway.
 */
export function trackCaseStudyRepoClick(ref: CaseStudyRef & {
  repo_role?: string;
  repo_visibility?: string;
}): void {
  emit('case_study_repo_click', { ...ref });
}

/** An approved artifact was opened. `artifact_kind` is the type, not the file name. */
export function trackCaseStudyArtifactClick(ref: CaseStudyRef & {
  artifact_kind?: string;
}): void {
  emit('case_study_artifact_click', { ...ref });
}

/**
 * The Enterprise CTA was clicked from a Case Study surface.
 *
 * This is the conversion-adjacent one: it is on the War Room feed allowlist and
 * it is what makes a Case Study visit legible as intent in the lead journey.
 */
export function trackCaseStudyCtaClick(ref: CaseStudyRef & {
  cta: string;
  placement?: string;
}): void {
  emit('case_study_cta_click', { ...ref });
}

/** A Case Study was shared. `channel` is the destination class, e.g. 'linkedin'. */
export function trackCaseStudyShare(ref: CaseStudyRef & { channel: string }): void {
  emit('case_study_share', { ...ref });
}
