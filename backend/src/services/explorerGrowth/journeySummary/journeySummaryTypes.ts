/**
 * The contract between reading the journey and rendering it (T208).
 *
 * Kept in its own module so the composer can be tested as a pure function with
 * no database, and so a change to either side has to pass through a declared
 * type rather than an untyped blob.
 *
 * WHAT IS DELIBERATELY ABSENT: a `replied` field. Reply tracking exists in the
 * `interaction_outcomes` vocabulary but has no writer that reaches Explorer
 * leads: 0 reply rows for the 1,278 Explorer profiles, and 25 rows repo-wide
 * with none newer than 2026-07-29. Carrying a field we can never populate would
 * invite a renderer to print "no replies", which reads as "they ignored us"
 * rather than "we do not track this". Measured 2026-11-27.
 */

/** One dated thing that happened to an email we sent. */
export interface JourneyEvent {
  /** When it happened. */
  at: Date;
  /**
   * Only the three we can actually evidence. `sent` comes from
   * `scheduled_emails`; `opened` and `clicked` from `interaction_outcomes`.
   */
  kind: 'sent' | 'opened' | 'clicked';
  /** The email's subject, when we can name it. Null when the join found none. */
  subject: string | null;
}

/**
 * Why a caller might need to tread carefully. Each reason is a stated fact, not
 * an inference: `suppressed` means the lead's own status is in
 * `SUPPRESSED_LEAD_STATUSES`, which stops outbound whatever else is true.
 */
export interface JourneyCaution {
  /** The lead status that triggered it, e.g. 'unsubscribed', 'dnd'. */
  leadStatus: string;
}

/** Everything the composer needs. Assembled by journeySummaryData. */
export interface JourneySummaryInput {
  /** For the audit line, so a stale card is visible as stale. */
  generatedAt: Date;
  /** Plain-English interest line, or null when we hold nothing worth saying. */
  interest: string | null;
  /** Caller-facing reasons from the existing outreach ranking. May be empty. */
  signals: string[];
  /** Newest first. May be empty. */
  events: JourneyEvent[];
  /** The agreed next step, when one exists and is fresh. */
  nextStep: { action: string; reason: string; decidedOn: Date } | null;
  /** Present only when there is a real suppression on the lead. */
  caution: JourneyCaution | null;
}

/**
 * The composer's verdict. `text` is null when there is genuinely nothing worth
 * putting in front of a caller, which is a real outcome rather than an error:
 * writing an empty card is worse than writing none, because Rose and Taiwo were
 * told to read this before every call.
 */
export interface ComposedSummary {
  text: string | null;
  /** Why nothing was composed, for logs. Null when text is present. */
  emptyReason: string | null;
}
