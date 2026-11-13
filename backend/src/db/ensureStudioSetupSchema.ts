import { sequelize } from '../config/database';

/**
 * D4 (P4-01) — the three things a class needs decided before it can air, and had nowhere to live.
 *
 * Until now the entire broadcast configuration was one checkbox on the Accelerator admin page.
 * Three decisions that the show depends on were either implicit or impossible:
 *
 *  - **Who produces it.** `is_producer` is derived from `isStaff(req)` alone
 *    (`broadcastController.ts:239`), so "the producer" is anyone on staff who opens the page.
 *    FC4.2 asks for a NAMED producer who is not the presenter, and a rule that persists nothing
 *    cannot satisfy that.
 *  - **Who presents it.** Same gap, and the producer rule is meaningless without it.
 *  - **Whether guests may join.** Decided today by `sessionGuestService.ts:51` testing the class
 *    TITLE against /open house/i. Whether an outsider may watch depends on what the class is
 *    called.
 *
 * ## Why all three sit on `live_sessions` and not on `broadcast_occurrences`
 *
 * The obvious home looks like the occurrence, since this is broadcast configuration. It is the
 * wrong one, for two reasons.
 *
 * The first is circular: an occurrence does not exist until the operator presses Create, and
 * Create is BLOCKED until a producer has been chosen. Storing the producer on the thing whose
 * creation it gates cannot work.
 *
 * The second is that these are facts about the class, not about one airing of it. Who teaches and
 * who produces are true whether or not the session is ever broadcast at all. An occurrence that
 * needs them reaches them through `broadcast_source_refs`, which is the only session-to-occurrence
 * link in this schema — there is no session column on `broadcast_occurrences`.
 *
 * ## Nullable, deliberately
 *
 * Every existing row predates this screen. NULL means "never configured here", which is exactly
 * true of all of them, and lets old code and old rows carry on untouched. `guest_access` NULL is
 * read as "no guests" by `assertGuestSession`, which matches the pre-change behaviour for every
 * session whose title did not say Open House — and the backfill in the same pass sets it true for
 * the ones whose title did, so nothing that worked stops working.
 *
 * Additive, in its own file, per the rule in ensureBroadcastSchema's header.
 */
export const STUDIO_SETUP_STATEMENTS: string[] = [
  // Who is on camera. UUID to match enrollments.id.
  `ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS presenter_enrollment_id UUID`,
  // Who drives the producer strip. The screen refuses to let this equal the presenter, and so
  // does the route behind it — a rule enforced only in the browser is a rule you do not have.
  `ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS producer_enrollment_id UUID`,
  /*
   * Whether this class accepts guests. Replaces the title match.
   *
   * BOOLEAN rather than a mode enum: the question really is binary, and the capability a guest
   * gets is fixed in code (read the question, vote) rather than chosen per session. An enum here
   * would invite the idea that there are other kinds of guest, which there are not.
   *
   * NULL and false both mean no. They are not collapsed into a NOT NULL DEFAULT false because the
   * difference is worth keeping: NULL is "nobody has used the new screen on this session", false
   * is "somebody looked at this and said no". The backfill below only touches rows the title rule
   * was already admitting, so it can never widen access to a session that did not already have it.
   */
  `ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS guest_access BOOLEAN`,
  /*
   * THE BACKFILL, which is what makes deleting the title match safe.
   *
   * Every session the old rule admitted is marked explicitly, so the moment the regex comes out of
   * `assertGuestSession` no currently-working Open House loses its guests. It is scoped by
   * `guest_access IS NULL` so it can never overwrite a deliberate false — an operator who turns
   * guests OFF on a session called "Open House" stays off, which is the case the first draft of
   * this plan got backwards.
   *
   * Idempotent by that same clause: the second run matches no rows.
   */
  `UPDATE live_sessions
      SET guest_access = TRUE
    WHERE guest_access IS NULL
      AND title ILIKE '%open house%'`,
];

export const STUDIO_SETUP_COLUMNS = [
  'presenter_enrollment_id',
  'producer_enrollment_id',
  'guest_access',
] as const;

export async function ensureStudioSetupSchema(): Promise<void> {
  for (const sql of STUDIO_SETUP_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] studio setup schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Studio setup columns ensured');
}
