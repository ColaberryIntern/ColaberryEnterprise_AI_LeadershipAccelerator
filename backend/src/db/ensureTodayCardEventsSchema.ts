import { sequelize } from '../config/database';

/**
 * What a learner actually SAW on Today, and which door they opened a card from (C107, C98 recommendation 3).
 *
 * Before this, `today_feed_impressions` wrote a row when the server BUILT an item, including items the page filtered
 * out and items never scrolled to, and only an open from the feed counted. The C98 audit could not tell "not seen"
 * from "seen and skipped".
 *
 *  - event 'seen': the card scrolled into view (the page's IntersectionObserver, at least half visible).
 *  - event 'open': the card was opened, from the feed or from the banner at the top of Today.
 *
 * One row per (enrollment, ref, event, source), the FIRST time it happens: replays are ON CONFLICT DO NOTHING, so the
 * table is bounded by people times cards and needs no retention job. This table is deliberately separate from
 * `today_feed_impressions.interacted_at`: Explorer Growth scores that column as `first_card_interacted`, and a seen or
 * banner event must never move a learner between Explorer states.
 *
 * Same lazy, memoized creation as the sign-in and campus tables (server.ts is over the 500-line ceiling). Every
 * statement is IF NOT EXISTS; a failed first run clears the memo so the next call retries.
 */
export const TODAY_CARD_EVENT_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS today_card_events (
     id BIGSERIAL PRIMARY KEY,
     enrollment_id UUID NOT NULL,
     ref TEXT NOT NULL,
     event TEXT NOT NULL CHECK (event IN ('seen', 'open')),
     source TEXT NOT NULL CHECK (source IN ('feed', 'banner')),
     first_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (enrollment_id, ref, event, source)
   )`,
  'CREATE INDEX IF NOT EXISTS today_card_events_first_at_idx ON today_card_events (first_at)',
];

type Runner = (sql: string) => Promise<unknown>;
const defaultRunner: Runner = (sql) => sequelize.query(sql);

let inflight: Promise<void> | null = null;

/** Create the table once per process. Concurrent callers share one run; a failed run is retried next call. */
export function ensureTodayCardEventsSchema(run: Runner = defaultRunner): Promise<void> {
  if (!inflight) {
    inflight = (async () => { for (const s of TODAY_CARD_EVENT_STATEMENTS) await run(s); })()
      .catch((err) => { inflight = null; throw err; });
  }
  return inflight;
}

/** Test seam: forget the memo. */
export function __resetTodayCardEventsSchemaForTests(): void { inflight = null; }
