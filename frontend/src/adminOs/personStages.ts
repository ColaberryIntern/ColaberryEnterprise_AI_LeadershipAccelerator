/**
 * How a lifecycle stage is named and toned on the operator surfaces.
 *
 * ── WHY THIS IS ONE FILE AND NOT TWO COPIES ─────────────────────────────────
 *
 * `PersonProfilePage` and `PeoplePage` each carried a private `STAGE_LABEL` with
 * the same nine keys and the same nine values. The duplication was not harmless:
 * T209 added an `explorer` stage to `backend/src/services/adminOs/lifecycle.ts`,
 * and NEITHER copy was updated, so the one stage this phase exists to make
 * visible rendered through the `?? stage` fallback as the raw enum `explorer` —
 * lowercase, unlabelled — on both the roster and the profile. Two copies of a
 * map do not drift together; they drift apart, and a third surface would have
 * forgotten it too.
 *
 * ── THE LABEL IS THE BACKEND'S LABEL, DELIBERATELY ──────────────────────────
 *
 * `explorer` reads "Explorer ($0 to start)", character for character the
 * `label` on `lifecycle.ts`. Two reasons, and the second is a legal one:
 *
 *   1. One stage must not have two names. An operator reading "Explorer" on one
 *      screen and something else on another cannot tell whether they are looking
 *      at the same population.
 *   2. 40 TAC 807.172(d) forbids advertising training as "free". The house
 *      phrasings are "$0 to start" and "No card needed". This string is rendered
 *      to a person, so it uses the house phrasing — and the repo's own gate,
 *      `bannedWordOutboundCopy`, scans for the word that is not allowed here.
 *
 * Tone is `info` rather than `warning`: an Explorer is a real and wanted state,
 * not a problem. `applicant` is the warning (someone stalled mid-application)
 * and `lapsed` is the one the business exists to prevent.
 */

export const STAGE_LABEL: Record<string, string> = {
  anonymous_visitor: 'Anonymous visitor',
  identified_visitor: 'Identified visitor',
  lead: 'Lead',
  applicant: 'Applicant',
  explorer: 'Explorer ($0 to start)',
  enrolled_student: 'Enrolled',
  active_learner: 'Active learner',
  graduate: 'Graduate',
  lapsed: 'Lapsed',
  returning_customer: 'Returning customer',
};

export const STAGE_TONE: Record<string, 'info' | 'warning' | 'success' | 'neutral'> = {
  anonymous_visitor: 'neutral',
  identified_visitor: 'neutral',
  lead: 'info',
  applicant: 'warning',
  explorer: 'info',
  enrolled_student: 'success',
  active_learner: 'success',
  // Lapsed is the state the business exists to prevent, so it reads as a
  // warning rather than a neutral end-state.
  graduate: 'success',
  lapsed: 'warning',
  returning_customer: 'success',
};

/** Temperature badges, shared by the profile header and the acquisition panel. */
export const TEMPERATURE_TONE: Record<string, string> = {
  hot: 'danger',
  warm: 'warning',
  cold: 'secondary',
};

/** Timeline event domains. Paired with `PersonActivityChart`'s own colour map. */
export const DOMAIN_TONE: Record<string, string> = {
  acquisition: 'info',
  sales: 'primary',
  communication: 'secondary',
  commerce: 'success',
  learning: 'warning',
  community: 'dark',
};
