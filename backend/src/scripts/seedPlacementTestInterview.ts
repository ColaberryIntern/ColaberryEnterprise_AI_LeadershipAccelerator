/**
 * Career Prep v27 (loop T33): write ONE test placement interview for one Career Prep learner, so the booking page, the
 * consent room, the replay, offers and follow-ups can be tried before the inbox manager is connected (intake is dark).
 *
 *   node dist/scripts/seedPlacementTestInterview.js --enrollment <id> --employer-email <a> --interviewer-email <b> [--apply]
 *   node dist/scripts/seedPlacementTestInterview.js --enrollment <id> --remove [--apply]
 *
 * DRY RUN by default: without --apply it only prints what it would do. It refuses an enrollment that is not on the
 * Career Prep allow-list (career_prep_enrollments). The employer and interviewer addresses are REQUIRED (the test guide
 * uses Ali's own). The row is tagged by source_event_id `test-interview:<enrollment id>`, so a second run changes nothing
 * (ON CONFLICT DO NOTHING) and --remove deletes exactly that interview (its events, and the prep row a booking linked;
 * every other table that points at it cascades or is set null by its own foreign key). Nothing is sent: the interview
 * starts in `review`, where staff send the booking link from the desk (and that send is gated by the employer-mail switch).
 */
import { sequelize } from '../config/database';
import { careerPrepEnrollmentIds } from '../services/careerPrep/careerPrepFlag';

export const TAG_PREFIX = 'test-interview:';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface Args { enrollment: string; employer: string | null; interviewer: string | null; remove: boolean; apply: boolean }

/** Parse and check the arguments; throws a ValidationError-style message on anything missing or malformed. */
export function parseArgs(argv: string[]): Args {
  const val = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 ? (argv[i + 1] ?? '').trim() : ''; };
  const enrollment = val('--enrollment');
  const remove = argv.includes('--remove');
  if (!UUID.test(enrollment)) throw new Error('usage: --enrollment <enrollment uuid> (--employer-email <a> --interviewer-email <b> | --remove) [--apply]');
  if (remove) return { enrollment, employer: null, interviewer: null, remove, apply: argv.includes('--apply') };
  const employer = val('--employer-email').toLowerCase();
  const interviewer = val('--interviewer-email').toLowerCase();
  if (!EMAIL.test(employer) || !EMAIL.test(interviewer)) throw new Error('--employer-email and --interviewer-email are both required and must be email addresses');
  return { enrollment, employer, interviewer, remove, apply: argv.includes('--apply') };
}

export const tagFor = (enrollment: string) => `${TAG_PREFIX}${enrollment}`;

type Q = (sql: string, replacements: Record<string, unknown>) => Promise<unknown[]>;
const q: Q = async (sql, replacements) => (await sequelize.query(sql, { replacements }))[0] as unknown[];

export interface Outcome { action: 'create' | 'remove'; dry: boolean; changed: boolean; interviewId: string | null }

/** Create the test interview (idempotent). The allow-list is checked first; nothing is written on a dry run. */
export async function create(a: Args, deps: { query?: Q; allowList?: () => Promise<string[]> } = {}): Promise<Outcome> {
  const run = deps.query ?? q;
  const allowed = await (deps.allowList ?? careerPrepEnrollmentIds)();
  if (!allowed.includes(a.enrollment)) throw new Error(`enrollment ${a.enrollment} is not on the Career Prep allow-list; refusing`);
  const tag = tagFor(a.enrollment);
  const [existing] = (await run('SELECT id FROM placement_interviews WHERE source_event_id = :tag', { tag })) as Array<{ id: string }>;
  if (existing) return { action: 'create', dry: !a.apply, changed: false, interviewId: String(existing.id) };
  if (!a.apply) return { action: 'create', dry: true, changed: true, interviewId: null };
  const rows = (await run(`INSERT INTO placement_interviews (enrollment_id, source_event_id, company, position, type, contact_name, contact_email,
      confidence, state, interviewer_emails)
    VALUES (:enrollment, :tag, 'Test Company', 'Test interview (Career Prep test guide)', 'recruiter', 'Test interviewer', :employer, 0.9, 'review', ARRAY[:interviewer]::text[])
    ON CONFLICT (source_event_id) DO NOTHING RETURNING id`, { enrollment: a.enrollment, tag, employer: a.employer, interviewer: a.interviewer })) as Array<{ id: string }>;
  const id = rows[0] ? String(rows[0].id) : null;
  if (id) {
    await run(`INSERT INTO placement_events (subject_type, subject_id, event, to_state, actor, payload)
      VALUES ('placement_interview', :id, 'test_interview_seeded', 'review', 'seedPlacementTestInterview', '{}'::jsonb)`, { id });
  }
  return { action: 'create', dry: false, changed: Boolean(id), interviewId: id };
}

/** Remove exactly the tagged test interview, its events and the prep row a booking linked, in one transaction. */
export async function remove(a: Args, deps: { query?: Q; transaction?: <T>(fn: (run: Q) => Promise<T>) => Promise<T> } = {}): Promise<Outcome> {
  const run = deps.query ?? q;
  const tag = tagFor(a.enrollment);
  const [row] = (await run('SELECT id FROM placement_interviews WHERE source_event_id = :tag AND enrollment_id = :enrollment', { tag, enrollment: a.enrollment })) as Array<{ id: string }>;
  if (!row) return { action: 'remove', dry: !a.apply, changed: false, interviewId: null };
  const id = String(row.id);
  if (!a.apply) return { action: 'remove', dry: true, changed: true, interviewId: id };
  const tx = deps.transaction ?? (async <T>(fn: (r: Q) => Promise<T>) => sequelize.transaction(async (t) => fn(async (sql, rep) => (await sequelize.query(sql, { replacements: rep, transaction: t }))[0] as unknown[])));
  await tx(async (r) => {
    await r("DELETE FROM placement_events WHERE subject_type = 'placement_interview' AND subject_id = :id", { id });
    await r('DELETE FROM career_interviews WHERE placement_interview_id = :id', { id });
    await r('DELETE FROM placement_interviews WHERE id = :id AND source_event_id = :tag', { id, tag });
  });
  return { action: 'remove', dry: false, changed: true, interviewId: id };
}

async function main(): Promise<void> {
  const a = parseArgs(process.argv.slice(2));
  const out = a.remove ? await remove(a) : await create(a);
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', service: 'backend', event: 'placement_test_interview', outcome: 'success', context: out }));
}

if (require.main === module) {
  main()
    .catch((e) => { console.error(JSON.stringify({ event: 'placement_test_interview', outcome: 'failure', error_class: 'ValidationError', message: (e as Error).message })); process.exitCode = 1; })
    .finally(() => { void sequelize.close().catch(() => undefined); });
}
