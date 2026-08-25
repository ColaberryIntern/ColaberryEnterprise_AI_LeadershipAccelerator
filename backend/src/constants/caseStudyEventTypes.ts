/**
 * Case Study OS - the semantic tracking events (T019, build spec section 27).
 *
 * WHY THIS FILE EXISTS RATHER THAN A LITERAL IN EACH CONSUMER. The same seven
 * strings have to appear in three places that are edited by three different
 * people at three different times:
 *
 *   1. the ingest allowlist  (controllers/tracking/trackingEventValidation.ts)
 *   2. the War Room feed SQL (routes/admin/cohortRoutes.ts, an IN (...) filter)
 *   3. the browser emitter   (frontend/src/utils/caseStudyTracking.ts)
 *
 * Any one of those going out of step fails SILENTLY: the ingest returns 400 and
 * the tracker swallows it, or the War Room filter simply returns fewer rows. A
 * single exported array turns two of the three into a compile-time dependency,
 * and the third is pinned by a parity test that reads the frontend file.
 *
 * THE 30-CHARACTER CEILING IS REAL. `page_events.event_type` is
 * `DataTypes.STRING(30)` (models/PageEvent.ts:79-82). It is a plain varchar -
 * not a Sequelize ENUM, not a Postgres enum, and there is no CHECK constraint -
 * so a 31-character name is not rejected by the allowlist or by validation. It
 * is rejected by Postgres at INSERT time, inside `recordPageEvent`, on the
 * highest-write path in the system. `EVENT_TYPE_MAX_LENGTH` exists so that a
 * test can assert the bound instead of a reviewer counting characters.
 */

/** `page_events.event_type` is STRING(30). Names longer than this fail at INSERT. */
export const EVENT_TYPE_MAX_LENGTH = 30;

/**
 * The seven Case Study events, per spec section 27.
 *
 * Longest is `case_study_artifact_click` at 25 characters, which leaves five
 * characters of headroom. A future variant suffix (`_v2`, `_bottom`) is
 * therefore NOT automatically safe - add it here and let the length test fail.
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
 * Keys that must never reach `page_events.event_data`.
 *
 * `utils/piiRedaction.ts` is applied to LOG LINES ONLY - there is exactly one
 * call in the whole tracking path (trackingController.ts:528) and it redacts a
 * console statement, not a row. `recordPageEvent` writes `event_data` to JSONB
 * verbatim. So there is no server-side net: the payload has to be clean when it
 * leaves the browser, which is why the runtime filter lives in
 * `frontend/src/utils/caseStudyTracking.ts` and this array is the contract it
 * is tested against.
 *
 * Two classes of key are listed:
 *   - personal data (identity, contact, employer, internal row ids);
 *   - private repository identity - a Case Study may be built from a repo the
 *     public is not entitled to know exists, so owner/name/URL/token-shaped
 *     fields are forbidden even though they are not PII in the legal sense.
 */
export const FORBIDDEN_EVENT_DATA_KEYS: readonly string[] = [
  // Identity and contact
  'email',
  'email_address',
  'name',
  'full_name',
  'first_name',
  'last_name',
  'phone',
  'phone_number',
  'address',
  'ip',
  'ip_address',
  'user_agent',
  'company',
  'employer',
  'job_title',
  'title',
  // Internal row identifiers that re-identify a person
  'lead_id',
  'user_id',
  'student_id',
  'participant_id',
  'enrollment_id',
  'visitor_id',
  'fingerprint',
  // Private repository identity
  'repo_url',
  'repo_name',
  'repo_owner',
  'repo_full_name',
  'repo_id',
  'clone_url',
  'ssh_url',
  'html_url',
  'github_login',
  'owner',
  'organization',
  // Credentials
  'token',
  'access_token',
  'github_token',
  'api_key',
  'authorization',
];

/**
 * The `page_events.event_type` values the War Room activity feed displays.
 *
 * The feed is an `IN (...)` allowlist (routes/admin/cohortRoutes.ts). An event
 * type absent from it is not "unlabelled" - it is invisible, because the filter
 * runs before the CASE that builds the label.
 *
 * The first nine entries are the pre-existing list, preserved verbatim and in
 * order so the diff shows an append and nothing else.
 */
export const WAR_ROOM_PAGE_EVENT_TYPES: readonly string[] = [
  'pageview',
  'cta_click',
  'form_start',
  'form_submit',
  'demo_start',
  'demo_complete',
  'demo_skip',
  'scroll',
  'booking_modal_opened',
  ...CASE_STUDY_EVENT_TYPES,
];

/** Event-type names are lowercase snake_case within the column's width. */
const SAFE_EVENT_TYPE = /^[a-z][a-z0-9_]{0,29}$/;

/**
 * Render event-type names as a SQL literal list for an `IN (...)` clause.
 *
 * These values are compile-time constants, never request input, so this is not
 * a sanitiser standing between a user and the database. It is a tripwire: it
 * throws if a name ever stops matching the safe shape, so that a value which
 * could alter the surrounding statement fails at module load - loudly, in every
 * environment, including the test run - instead of being interpolated into a
 * raw query. Parameter binding is not available here because the clause is
 * assembled into a `sequelize.query` template literal.
 */
export function toSqlInList(types: readonly string[]): string {
  if (types.length === 0) {
    throw new Error('toSqlInList: refusing to build an empty IN () clause');
  }
  return types
    .map((type) => {
      if (!SAFE_EVENT_TYPE.test(type)) {
        throw new Error(`toSqlInList: unsafe event_type literal ${JSON.stringify(type)}`);
      }
      return `'${type}'`;
    })
    .join(', ');
}
