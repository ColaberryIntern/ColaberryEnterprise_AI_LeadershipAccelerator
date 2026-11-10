/**
 * The case study deadline, read from `due_baseline_on` and NEVER from `due_on`.
 *
 * ## Why this exists at all
 *
 * On 10 Nov 2026 the report told a manager that Omolola's "Record Your Project Introduction" was
 * fifty days late. Her project had been created fourteen days earlier. Both statements were true of
 * the data and only one was true of the world:
 *
 *   due_on           2026-09-21   a cohort schedule from a month BEFORE the project existed
 *   due_baseline_on  2026-11-12   the real date, two days away
 *
 * `due_on` is back-dated on every gov project we have looked at, so a report that reads it reverses
 * the instruction: "fifty days late, this has been neglected" when the truth was "due in two days,
 * drop everything". A message built on the first number sends someone to the wrong work.
 *
 * ## What counts as the case study package
 *
 * The six PREP tasks - project introduction, working-system demo, AI visual presentation,
 * stakeholder update, final showcase, and Demo Day. They share one baseline date per project, and
 * that shared date IS the case study deadline. We take the earliest outstanding one so a package
 * that has been partly recorded still reports against the date its remainder is due.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import type { BriefDeadline } from './types';

interface Row { due_baseline_on: string | null; title: string }

/**
 * PREP tasks are identified by `story_id LIKE 'PREP-%'` first, because that is the id the
 * materializer assigns, and by title only as a fallback for rows that predate it.
 */
const SQL = `
  SELECT due_baseline_on, title
    FROM student_tasks
   WHERE project_id = :projectId
     AND verified_at IS NULL
     AND due_baseline_on IS NOT NULL
     AND (story_id LIKE 'PREP-%' OR title ILIKE 'Record Your %' OR title ILIKE 'Present at Demo Day%')
   ORDER BY due_baseline_on ASC, position ASC
`;

const DAY = 86400000;

/** Whole days from `now` to `iso`, in UTC. Today is 0; yesterday is -1. */
export function daysUntil(iso: string, now: Date): number {
  const due = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((due - today) / DAY);
}

/**
 * Null when the project has no outstanding PREP tasks, which is the normal state for an agent
 * builder early in a build and for anyone whose package is already recorded. A null deadline makes
 * the message fall back to its triage tier, which is the correct behaviour rather than a gap.
 */
export async function caseStudyDeadline(projectId: string | null, now: Date): Promise<BriefDeadline | null> {
  if (!projectId) return null;
  const rows = await sequelize.query<Row>(SQL, { type: QueryTypes.SELECT, replacements: { projectId } });
  const dated = rows.filter((r): r is Row & { due_baseline_on: string } => !!r.due_baseline_on);
  if (!dated.length) return null;
  const dueOn = String(dated[0].due_baseline_on).slice(0, 10);
  return {
    what: 'case study package',
    dueOn,
    daysLeft: daysUntil(dueOn, now),
    outstanding: dated.map((r) => r.title),
  };
}
