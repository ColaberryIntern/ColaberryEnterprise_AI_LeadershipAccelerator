import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';

/**
 * WHO landed on a page - the ones we can name, and an honest count of the ones we cannot.
 *
 * WHY THE SHAPE IS "SOME NAMES PLUS A NUMBER". Ali asked to see "how many and who is clicking
 * on the landing page so we can start measuring the results". How many was already answerable.
 * Who is only partly answerable, and the honest version says so rather than presenting a short
 * list as if it were the audience.
 *
 * On 2026-10-15 the live page had eighteen visitors and TWO of them were identifiable - both
 * Sohail, testing. Seventeen were anonymous. That is not a tracking failure: a visitor has no
 * name until they hand over an email, and a landing page's whole job is to collect one from
 * someone who arrived without it. A list of two shown alone would read as "almost nobody came",
 * when what happened is "eighteen came and sixteen have not told us who they are yet".
 *
 * So the answer is both numbers, always, and the UI is expected to show them together.
 *
 * THE JOIN IS lead_id ON THE EVENT, not a reverse lookup from the lead's own page_url. The event
 * carries the lead it was attributed to at the time; `leads.page_url` records where a lead was
 * CREATED, which is a different question and would miss anyone who landed before converting.
 */

export interface LandingPageVisitor {
  leadId: number;
  email: string | null;
  /** The lead's name where there is one; often the email again, which the UI should not repeat. */
  name: string | null;
  firstTouch: string;
  lastTouch: string;
  /** Did this person press a button, or only read? */
  clicked: boolean;
}

export interface LandingPageAudience {
  /** Everyone we can name, most recent first. */
  people: LandingPageVisitor[];
  /** Distinct visitors in the window, named or not. */
  totalVisitors: number;
  /** Visitors with no lead attached. Expected to be the large majority. */
  anonymousVisitors: number;
}

/**
 * The audience for one hosted page, by its public path.
 *
 * `pagePath` is the `/lp/:brand/:slug` the tracker records, supplied by the caller from the row
 * rather than rebuilt here - two places deriving a path is how they come to disagree.
 */
export async function landingPageAudience(
  pagePath: string,
  days = 30,
  limit = 50,
): Promise<LandingPageAudience> {
  const windowDays = Math.min(Math.max(Math.trunc(days) || 30, 1), 365);
  const cap = Math.min(Math.max(Math.trunc(limit) || 50, 1), 200);

  const [totals] = await sequelize.query<{ total: number; anonymous: number }>(
    `SELECT COUNT(DISTINCT visitor_id)::int AS total,
            COUNT(DISTINCT visitor_id) FILTER (WHERE lead_id IS NULL)::int AS anonymous
       FROM page_events
      WHERE page_path = :pagePath
        AND created_at > NOW() - (:windowDays || ' days')::interval`,
    { type: QueryTypes.SELECT, replacements: { pagePath, windowDays } },
  );

  const people = await sequelize.query<LandingPageVisitor>(
    `SELECT l.id           AS "leadId",
            l.email        AS email,
            l.name         AS name,
            MIN(pe.created_at) AS "firstTouch",
            MAX(pe.created_at) AS "lastTouch",
            BOOL_OR(pe.event_type = 'cta_click') AS clicked
       FROM page_events pe
       JOIN leads l ON l.id = pe.lead_id
      WHERE pe.page_path = :pagePath
        AND pe.created_at > NOW() - (:windowDays || ' days')::interval
      GROUP BY l.id, l.email, l.name
      ORDER BY MAX(pe.created_at) DESC
      LIMIT :cap`,
    { type: QueryTypes.SELECT, replacements: { pagePath, windowDays, cap } },
  );

  return {
    people,
    totalVisitors: totals?.total ?? 0,
    anonymousVisitors: totals?.anonymous ?? 0,
  };
}
