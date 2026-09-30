/**
 * Update one week's Skilljar CourseLink (URL / status / title) without editing code.
 *
 * For Kes: once a pending week's URL is confirmed against the live Skilljar catalog,
 * flip it to 'confirmed' (and correct the URL/title if needed) in one command — no
 * seed edit, no PR. Idempotent: re-running with the same args yields the same row.
 * The row must already exist (run seedCurriculumCourseLinks first).
 *
 * Run:
 *   npx ts-node backend/src/scripts/updateCourseLink.ts --week 7 --url https://anthropic.skilljar.com/<slug> --status confirmed
 *   npx ts-node backend/src/scripts/updateCourseLink.ts --week 6 --status confirmed
 *   (in the prod container: node /app/dist/scripts/updateCourseLink.js --week 1 --url ... --status confirmed)
 *
 * Output: prints the row before and after the update.
 */

import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

export type CourseLinkStatus = 'confirmed' | 'pending_confirmation' | 'not_applicable';
const STATUSES: CourseLinkStatus[] = ['confirmed', 'pending_confirmation', 'not_applicable'];

export interface CourseLinkUpdate {
  module_number: number;
  course_url?: string;
  link_status?: CourseLinkStatus;
  course_title?: string;
}

// Pure arg parser (exported for tests). Reads `--flag value` pairs from argv.
export function parseArgs(argv: string[]): CourseLinkUpdate {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };
  const weekRaw = get('--week');
  const update: CourseLinkUpdate = {
    module_number: weekRaw !== undefined ? Number(weekRaw) : NaN,
  };
  const url = get('--url');
  const status = get('--status');
  const title = get('--title');
  if (url !== undefined) update.course_url = url;
  if (status !== undefined) update.link_status = status as CourseLinkStatus;
  if (title !== undefined) update.course_title = title;
  return update;
}

// Pure validation (exported for tests). Throws on bad input; never partially applies.
export function validateUpdate(u: CourseLinkUpdate): void {
  if (!Number.isInteger(u.module_number) || u.module_number < 1 || u.module_number > 12) {
    throw new Error('`--week` is required and must be an integer 1-12');
  }
  if (u.course_url === undefined && u.link_status === undefined && u.course_title === undefined) {
    throw new Error('provide at least one of --url, --status, --title');
  }
  if (u.course_url !== undefined && !/^https:\/\//.test(u.course_url)) {
    throw new Error('`--url` must be an https:// URL');
  }
  if (u.link_status !== undefined && !STATUSES.includes(u.link_status)) {
    throw new Error(`\`--status\` must be one of: ${STATUSES.join(', ')}`);
  }
}

type Row = { module_number: number; course_title: string | null; course_url: string | null; link_status: string };

async function selectRow(week: number): Promise<Row | undefined> {
  const rows = await sequelize.query<Row>(
    'SELECT module_number, course_title, course_url, link_status FROM curriculum_course_links WHERE module_number = :week',
    { replacements: { week }, type: QueryTypes.SELECT }
  );
  return rows[0];
}

async function run(): Promise<void> {
  const update = parseArgs(process.argv.slice(2));
  validateUpdate(update);

  const before = await selectRow(update.module_number);
  if (!before) {
    throw new Error(
      `No curriculum_course_links row for week ${update.module_number}. Run seedCurriculumCourseLinks first.`
    );
  }

  const sets: string[] = [];
  const repl: Record<string, unknown> = { week: update.module_number };
  if (update.course_url !== undefined) { sets.push('course_url = :course_url'); repl.course_url = update.course_url; }
  if (update.link_status !== undefined) { sets.push('link_status = :link_status'); repl.link_status = update.link_status; }
  if (update.course_title !== undefined) { sets.push('course_title = :course_title'); repl.course_title = update.course_title; }
  sets.push('updated_at = NOW()');

  await sequelize.query(
    `UPDATE curriculum_course_links SET ${sets.join(', ')} WHERE module_number = :week`,
    { replacements: repl, type: QueryTypes.UPDATE }
  );

  const after = await selectRow(update.module_number);
  console.log('before:', JSON.stringify(before));
  console.log('after: ', JSON.stringify(after));
}

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('updateCourseLink failed:', (err as Error).message);
      process.exit(1);
    });
}
