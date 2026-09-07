import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import { Rail, RailContext, RailTile, omitIfEmpty } from './types';

/**
 * The student's own weeks, so the classroom can move through time without
 * going anywhere else.
 *
 * WHAT IT IS FOR. A student in Week 7 with two unfinished items in Week 5 has
 * no reason to ever discover that, because the classroom shows them one week
 * and the week they are shown is the current one. This rail is the only place
 * in the design that looks backwards, and the tile for a week with outstanding
 * work carries "Finish it" rather than "Revisit".
 *
 * ONE QUERY, NOT TWELVE. Card counts and completion counts per week come back
 * in a single grouped read; resolving each week separately would mean twelve
 * round trips to draw one rail. Cards with a null week are excluded rather than
 * bucketed into week 0 — they belong to a surface other than the week feed.
 *
 * COMPLETION IS THE STUDENT'S OWN. `timeline_card_progress` is per enrollment,
 * so "3 of 12 done" means this student, not the cohort. A week with no progress
 * row for a card counts that card as not done, which is what the absence means.
 */

/** Weeks either side of the current one. Enough to reach back without a scroll marathon. */
const LOOK_BACK = 4;
const LOOK_FORWARD = 2;

interface WeekRow {
  week: number;
  total: string;
  done: string;
}

/** Statuses that mean the student finished the card. */
const DONE_STATUSES = "('completed','complete','done','verified')";

export async function resolveTimelineRail(ctx: RailContext): Promise<Rail | null> {
  const rows = await sequelize.query<WeekRow>(
    `SELECT c.week AS week,
            COUNT(*)::text AS total,
            COUNT(p.id) FILTER (WHERE p.status IN ${DONE_STATUSES})::text AS done
       FROM timeline_cards c
       LEFT JOIN timeline_card_progress p
         ON p.card_id = c.id AND p.enrollment_id = :enrollmentId
      WHERE c.week IS NOT NULL AND c.status = 'active'
      GROUP BY c.week
      ORDER BY c.week`,
    { replacements: { enrollmentId: ctx.enrollmentId }, type: QueryTypes.SELECT },
  );

  if (rows.length === 0) return null;

  const from = ctx.week - LOOK_BACK;
  const to = ctx.week + LOOK_FORWARD;

  const tiles: RailTile[] = rows
    .filter((r) => Number(r.week) >= from && Number(r.week) <= to)
    .map((r) => {
      const week = Number(r.week);
      const total = Number(r.total);
      const done = Number(r.done);
      const open = Math.max(0, total - done);
      const isCurrent = week === ctx.week;
      const isPast = week < ctx.week;
      const isFuture = week > ctx.week;

      // A past week with work left is the only tile that asks for anything.
      const needsFinishing = isPast && open > 0;

      return {
        id: `week-${week}`,
        title: `Week ${week}`,
        detail: isCurrent
          ? 'You are here'
          : isFuture
            ? 'Not open yet'
            : open > 0
              ? `${open} still open`
              : 'Complete',
        meta: `${done} of ${total} done`,
        image_url: null,
        glyph: isCurrent ? '\u{1F4CD}' : isFuture ? '\u{1F512}' : open > 0 ? '\u{26A0}' : '\u{2705}',
        stamp: null,
        action: isFuture
          ? null
          : {
            label: needsFinishing ? 'Finish it' : isCurrent ? 'You are here' : 'Revisit',
            href: `/portal/classroom?week=${week}`,
            kind: needsFinishing ? 'primary' : 'quiet',
          },
        featured: isCurrent,
      };
    });

  const behind = rows
    .filter((r) => Number(r.week) < ctx.week)
    .reduce((n, r) => n + Math.max(0, Number(r.total) - Number(r.done)), 0);

  return omitIfEmpty({
    surface: 'timeline',
    label: 'Your timeline',
    count_label: behind > 0
      ? `${behind} item${behind === 1 ? '' : 's'} still open in earlier weeks`
      : `week ${ctx.week}`,
    href: '/portal/classroom',
    tiles,
  });
}
