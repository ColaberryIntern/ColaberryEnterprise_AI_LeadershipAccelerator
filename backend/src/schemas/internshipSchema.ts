import { z } from 'zod';

/**
 * Request contracts for the participant-facing internship endpoints.
 *
 * ── STRICT OBJECTS, ON PURPOSE ─────────────────────────────────────────────
 *
 * Every schema here is `.strict()`. An unknown key is a 400, not a silently
 * dropped field. That is what makes "no API accepts or stores an API-key value
 * or password" testable rather than aspirational: a request carrying
 * `api_key`, `password` or `anthropic_key` is REJECTED at the boundary, so the
 * guarantee does not depend on every future handler remembering to ignore it.
 *
 * ── NO QUALIFICATION QUESTIONS ─────────────────────────────────────────────
 *
 * The intake schema deliberately has no field for motivation, availability,
 * commitment, tool-readiness or behaviour. Those belong to the interview, which
 * both channels answer through one question bank. A field added here would be a
 * question asked twice, which the contract forbids as its "non-negotiable
 * optimization rule".
 */

const URL_MAX = 500;

/** Optional URL that also accepts the empty string a cleared input sends. */
const optionalUrl = z.union([z.string().url().max(URL_MAX), z.literal('')]).optional();

export const WORK_AUTH_CATEGORIES = [
  'none', 'cpt', 'opt', 'ead', 'university_placement', 'other', 'unsure',
] as const;

export const administrativeIntakeSchema = z.object({
  legal_name: z.string().min(1).max(255).optional(),
  preferred_name: z.string().max(255).optional(),
  // Loose on shape by design: international formats vary and rejecting a real
  // number is worse than storing one we later normalise. Length-capped only.
  phone: z.string().max(50).optional(),
  time_zone: z.string().max(64).optional(),
  country: z.string().max(80).optional(),
  state_region: z.string().max(80).optional(),
  preferred_language: z.string().max(40).optional(),
  linkedin_url: optionalUrl,
  github_url: optionalUrl,
  portfolio_url: optionalUrl,
  work_auth_category: z.enum(WORK_AUTH_CATEGORIES).optional(),

  // Three separate consents. Collapsing any two would take a decision the
  // applicant did not make — see InternshipAdministrativeIntake's header.
  permission_to_call: z.boolean().optional(),
  permission_ai_interviewer: z.boolean().optional(),
  consent_recording: z.boolean().optional(),

  accommodation_request: z.string().max(2000).optional(),
  preferred_interview_at: z.string().datetime().optional(),

  // The two things the email intake actually collects (AI_INTERNSHIP_SPEC.md).
  attests_not_employed_fulltime: z.boolean().optional(),
  commitment_acknowledged: z.boolean().optional(),

  /** false/absent = autosave. true = "I am done with this step", which advances the lifecycle. */
  completes: z.boolean().optional().default(false),
}).strict();

export type AdministrativeIntakeInput = z.infer<typeof administrativeIntakeSchema>;

export const selectChannelSchema = z.object({
  channel: z.enum(['form', 'phone']),
}).strict();

export const startApplicationSchema = z.object({
  cohort_id: z.string().uuid().optional(),
}).strict();

/**
 * Dismissal. `days` is bounded rather than free: an unbounded value would let a
 * client hide the card effectively forever, which is a different decision from
 * the "not now" the student made. 90 days is the ceiling.
 */
export const dismissCardSchema = z.object({
  days: z.number().int().min(1).max(90).optional().default(14),
}).strict();

export const cardImpressionSchema = z.object({
  card_state: z.string().max(60).optional(),
}).strict();

// ── Phase 3: the interview ──────────────────────────────────────────────────

/**
 * One answer. `answer_value` is deliberately a narrow union rather than
 * `z.any()`: a yes/no must arrive as a real boolean and a choice as a string, so
 * a client cannot smuggle an object into a JSONB column that the reviewer UI
 * will later try to render.
 */
export const answerSchema = z.object({
  question_key: z.string().min(1).max(80),
  answer_text: z.string().max(8000).nullish(),
  answer_value: z.union([z.boolean(), z.string().max(120)]).nullish(),
  // `answered` and `skipped` are the applicant's to set. `confirmed` is not — it
  // is reached only by confirming the summary, and `needs_followup` only by
  // transcript extraction. Accepting either here would let a client mark an
  // extracted answer confirmed without the applicant ever seeing it.
  state: z.enum(['answered', 'skipped']).optional(),
}).strict();

export const saveAnswersSchema = z.object({
  answers: z.array(answerSchema).min(1).max(30),
  is_correction: z.boolean().optional().default(false),
}).strict();

/**
 * Scheduling a call. The window is bounded at both ends: a booking in the past is
 * a mistake, and one 90 days out is not a booking anyone will keep. The route
 * checks the lower bound against the real clock.
 */
export const scheduleCallSchema = z.object({
  scheduled_for: z.string().datetime(),
}).strict();

export const confirmSummarySchema = z.object({
  // The applicant ticking "yes, this is what I said". Required, so confirming is
  // an act rather than a default.
  confirmed: z.literal(true),
}).strict();

export const submitApplicationSchema = z.object({}).strict();

/**
 * Keys that must never be accepted by any internship endpoint.
 *
 * `.strict()` already rejects them. This list exists so a test can assert the
 * rule directly and name it when it breaks, rather than relying on a reader
 * noticing that `.strict()` is still present on every schema.
 */
export const FORBIDDEN_SECRET_KEYS = [
  'api_key', 'apiKey', 'anthropic_api_key', 'claude_api_key',
  'password', 'secret', 'token', 'access_token', 'credential',
] as const;
