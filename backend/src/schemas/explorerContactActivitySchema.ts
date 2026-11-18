import { z } from 'zod';

/**
 * Zod contract for POST /api/v1/explorer-growth/contact-activity.
 *
 * Data only - no I/O, no model imports, no database, and no clock. Same reasons as
 * `explorerGrowthSchema`: CI's jest config is an ignore-list, so a suite that reaches the model
 * layer without a `DATABASE_URL` goes red and gets excluded into invisibility. Keeping the clock
 * out matters too, because "is this timestamp in the future" is a question about `now`, and a
 * schema that answers it cannot be tested without freezing time. That check lives in the
 * service, which takes `now` as an argument.
 *
 * ── REJECT, DO NOT COERCE ───────────────────────────────────────────────────
 *
 * `z.coerce` appears nowhere here, for the reason the sibling schema already documents: it is a
 * repair mechanism wearing a parser's name. This payload comes from another system on a nightly
 * schedule, so a repaired value is a wrong value nobody will ever look at again. A malformed row
 * must be a 400 that Cora sees the same minute, not a silently mangled timestamp that suppresses
 * the wrong person for seven days.
 *
 * ── WHY `.strict()` ─────────────────────────────────────────────────────────
 *
 * An unknown key is a 400, not an ignored field. The failure this prevents is a rename: if Cora
 * ever sends `contact_id` or `last_call_at` instead of the names below, a permissive parse would
 * read every row as missing, match nothing, and answer 200 with `written: 0`. That looks exactly
 * like "Rose called nobody yesterday", which is a real and unremarkable answer, so nobody would
 * investigate. Strict turns a silent zero into a loud rejection.
 */

/** The upper bound on one push. See `contactActivityBodySchema` for why this number. */
export const CONTACT_ACTIVITY_MAX_ROWS = 2000;

/** The longest `ghl_contact_id` accepted. GoHighLevel's are 24 characters; this is slack, not a spec. */
export const GHL_CONTACT_ID_MAX_LENGTH = 128;

/**
 * One connected call.
 *
 * `last_connected_call_at` must carry an explicit offset (`Z` or `+hh:mm`). A bare
 * `2026-11-17T21:04:00` is rejected rather than assumed to be UTC, because the assumption is
 * invisible and wrong by up to six hours in Central: a timestamp read six hours early can fall
 * outside the seven-day suppression window and hand Rose back somebody she just spoke to.
 */
export const contactActivityRowSchema = z
  .object({
    ghl_contact_id: z
      .string()
      .trim()
      .min(1, 'ghl_contact_id must not be empty')
      .max(GHL_CONTACT_ID_MAX_LENGTH, `ghl_contact_id must be at most ${GHL_CONTACT_ID_MAX_LENGTH} characters`),
    last_connected_call_at: z
      .string()
      .datetime({ offset: true, message: 'last_connected_call_at must be an ISO 8601 timestamp with an explicit offset, for example 2026-11-17T21:04:00Z' }),
  })
  .strict();

/**
 * The whole request body.
 *
 * `source` is required and free-form so the ledger of who wrote a timestamp is not guesswork
 * later. It is not an enum: a second feed (a different caller, a backfill, a manual repair)
 * should be able to name itself without a deploy, and an enum here would turn that into a code
 * change at the exact moment somebody is trying to fix something.
 *
 * `rows` is capped at 2000. Kes's steady state is one row per connected call per day, which is
 * roughly 27 a day against the 378 he measured over 14 days; the agreed first push is the
 * trailing 14 days, so the real sizes are tens to hundreds. Two thousand leaves an order of
 * magnitude of headroom while keeping one statement's parameter payload small enough that a
 * runaway or looping caller is a 400 rather than a long transaction on the profiles table.
 */
export const contactActivityBodySchema = z
  .object({
    source: z.string().trim().min(1, 'source must not be empty').max(64, 'source must be at most 64 characters'),
    rows: z
      .array(contactActivityRowSchema)
      .min(1, 'rows must not be empty')
      .max(CONTACT_ACTIVITY_MAX_ROWS, `rows must contain at most ${CONTACT_ACTIVITY_MAX_ROWS} entries`),
  })
  .strict();

export type ContactActivityRowInput = z.infer<typeof contactActivityRowSchema>;
export type ContactActivityBody = z.infer<typeof contactActivityBodySchema>;
