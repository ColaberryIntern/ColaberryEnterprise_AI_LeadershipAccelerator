/**
 * Career Prep v27 (loop T33): write the test records the test guide needs for ONE Career Prep learner, and remove exactly
 * them afterwards, so booking, the consent room, the replay, the employer portal, offers and follow-ups can be tried
 * before the inbox manager is connected (intake is dark).
 *
 *   node dist/scripts/seedPlacementTestInterview.js --enrollment <id> --employer-email <a> --interviewer-email <b> [--apply]
 *   node dist/scripts/seedPlacementTestInterview.js --enrollment <id> --remove [--apply]
 *
 * DRY RUN by default: without --apply it only prints what it would do. It refuses an enrollment that is not on the Career
 * Prep allow-list (career_prep_enrollments). The employer and interviewer addresses are REQUIRED (the guide uses Ali's own).
 * --apply creates, each only once (a re-run changes nothing):
 *   - one placement interview in `review`, tagged source_event_id `test-interview:<enrollment>` (nothing is sent: staff
 *     send the booking link from the desk, and that send is gated by the employer-mail switch);
 *   - one employer account `Test Company`, tagged created_by `test-interview:<enrollment>`, with ONE member (the employer
 *     address), and the learner put forward to it.
 * --remove deletes, in ONE transaction, in foreign-key order, exactly what hangs off the tagged client and the tagged
 * interview: follow-up events, follow-ups, invoice records, offers, audit events, put-forward rows, the member's unused
 * sign-in tokens (only when that address belongs to no other employer account), the member, the client, then the
 * interview's events, the prep row a booking linked, and the interview. Nothing untagged is touched.
 */
import { sequelize } from '../config/database';
import { careerPrepEnrollmentIds } from '../services/careerPrep/careerPrepFlag';

export const TAG_PREFIX = 'test-interview:';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACTOR = 'seedPlacementTestInterview';

export interface Args { enrollment: string; employer: string | null; interviewer: string | null; remove: boolean; apply: boolean }

/** Parse and check the arguments; throws on anything missing or malformed. */
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

export type Q = (sql: string, replacements: Record<string, unknown>) => Promise<unknown[]>;
const q: Q = async (sql, replacements) => (await sequelize.query(sql, { replacements }))[0] as unknown[];
type Tx = <T>(fn: (run: Q) => Promise<T>) => Promise<T>;
const realTx: Tx = async (fn) => sequelize.transaction(async (t) => fn(async (sql, rep) => (await sequelize.query(sql, { replacements: rep, transaction: t }))[0] as unknown[]));

export interface Outcome { action: 'create' | 'remove'; dry: boolean; changed: boolean; interviewId: string | null; clientId: string | null }
const idOf = (rows: unknown[]) => { const r = rows[0] as { id?: unknown } | undefined; return r?.id ? String(r.id) : null; };

async function findTagged(run: Q, a: Args): Promise<{ interviewId: string | null; clientId: string | null }> {
  const tag = tagFor(a.enrollment);
  const iv = idOf(await run('SELECT id FROM placement_interviews WHERE source_event_id = :tag AND enrollment_id = :enrollment', { tag, enrollment: a.enrollment }));
  const client = idOf(await run('SELECT id FROM hire_clients WHERE created_by = :tag', { tag }));
  return { interviewId: iv, clientId: client };
}

async function createInterview(run: Q, a: Args): Promise<string | null> {
  const id = idOf(await run(`INSERT INTO placement_interviews (enrollment_id, source_event_id, company, position, type, contact_name, contact_email,
      confidence, state, interviewer_emails)
    VALUES (:enrollment, :tag, 'Test Company', 'Test interview (Career Prep test guide)', 'recruiter', 'Test interviewer', :employer, 0.9, 'review', ARRAY[:interviewer]::text[])
    ON CONFLICT (source_event_id) DO NOTHING RETURNING id`, { enrollment: a.enrollment, tag: tagFor(a.enrollment), employer: a.employer, interviewer: a.interviewer }));
  if (id) {
    await run(`INSERT INTO placement_events (subject_type, subject_id, event, to_state, actor, payload)
      VALUES ('placement_interview', :id, 'test_interview_seeded', 'review', :actor, '{}'::jsonb)`, { id, actor: ACTOR });
  }
  return id;
}

async function createClient(run: Q, a: Args): Promise<string> {
  const tag = tagFor(a.enrollment);
  const clientId = idOf(await run("INSERT INTO hire_clients (name, created_by) VALUES ('Test Company', :tag) RETURNING id", { tag })) as string;
  await run('INSERT INTO hire_client_members (client_id, email, display_name) VALUES (:clientId, :email, :name) ON CONFLICT DO NOTHING',
    { clientId, email: a.employer, name: 'Test employer' });
  await run('INSERT INTO hire_client_candidates (client_id, enrollment_id, put_forward_by) VALUES (:clientId, :enrollment, :tag) ON CONFLICT DO NOTHING',
    { clientId, enrollment: a.enrollment, tag });
  return clientId;
}

/** Create the test records (each only once). The allow-list is checked first; nothing is written on a dry run. */
export async function create(a: Args, deps: { query?: Q; transaction?: Tx; allowList?: () => Promise<string[]> } = {}): Promise<Outcome> {
  const run = deps.query ?? q;
  const allowed = await (deps.allowList ?? careerPrepEnrollmentIds)();
  if (!allowed.includes(a.enrollment)) throw new Error(`enrollment ${a.enrollment} is not on the Career Prep allow-list; refusing`);
  const found = await findTagged(run, a);
  if (found.interviewId && found.clientId) return { action: 'create', dry: !a.apply, changed: false, ...found };
  if (!a.apply) return { action: 'create', dry: true, changed: true, ...found };
  const out = await (deps.transaction ?? realTx)(async (r) => ({
    interviewId: found.interviewId ?? await createInterview(r, a),
    clientId: found.clientId ?? await createClient(r, a),
  }));
  return { action: 'create', dry: false, changed: true, ...out };
}

/** The deletes, in foreign-key order, each keyed to the tagged client or the tagged interview (never anything else). */
export const REMOVE_CLIENT_SQL: ReadonlyArray<[string, string]> = [
  ['employer_follow_up_events', 'DELETE FROM employer_follow_up_events WHERE follow_up_id IN (SELECT id FROM employer_follow_ups WHERE client_id = :clientId)'],
  ['employer_follow_ups', 'DELETE FROM employer_follow_ups WHERE client_id = :clientId'],
  // Audit rows are matched by subject_type AND id: invoice ids are BIGSERIAL text ('3') that other subject types also use.
  ['placement_events (placement_invoice)', `DELETE FROM placement_events WHERE subject_type = 'placement_invoice' AND subject_id IN
     (SELECT inv.id::text FROM placement_invoices inv JOIN placement_offers o ON o.id = inv.offer_id WHERE o.client_id = :clientId)`],
  ['placement_events (hire_client)', "DELETE FROM placement_events WHERE subject_type = 'hire_client' AND subject_id = CAST(:clientId AS text)"],
  ['placement_invoices', 'DELETE FROM placement_invoices WHERE offer_id IN (SELECT id FROM placement_offers WHERE client_id = :clientId)'],
  ['placement_offers', 'DELETE FROM placement_offers WHERE client_id = :clientId'],
  ['hire_client_candidates', 'DELETE FROM hire_client_candidates WHERE client_id = :clientId'],
  ['hire_client_signin_tokens', `DELETE FROM hire_client_signin_tokens WHERE email IN (SELECT email FROM hire_client_members WHERE client_id = :clientId)
     AND NOT EXISTS (SELECT 1 FROM hire_client_members m2 WHERE m2.email = hire_client_signin_tokens.email AND m2.client_id <> :clientId)`],
  ['hire_client_members', 'DELETE FROM hire_client_members WHERE client_id = :clientId'],
  ['hire_clients', 'DELETE FROM hire_clients WHERE id = :clientId AND created_by = :tag'],
];
export const REMOVE_INTERVIEW_SQL: ReadonlyArray<[string, string]> = [
  ['prep_observations', "DELETE FROM prep_observations WHERE source = 'real_interview' AND source_ref LIKE 'replay:' || :interviewId || ':%'"],
  ['prep_readiness_daily', 'DELETE FROM prep_readiness_daily WHERE interview_id IN (SELECT id FROM career_interviews WHERE placement_interview_id = :interviewId)'],
  ['zoom_meeting_requests', "DELETE FROM zoom_meeting_requests WHERE request_id LIKE 'placement-interview-' || :interviewId || '-%'"],
  ['placement_events (placement_review_item)', `DELETE FROM placement_events WHERE subject_type = 'placement_review_item'
     AND subject_id IN (SELECT id::text FROM placement_review_items WHERE interview_id = :interviewId)`],
  ['placement_events (interview)', "DELETE FROM placement_events WHERE subject_type = 'placement_interview' AND subject_id = :interviewId"],
  ['career_interviews', 'DELETE FROM career_interviews WHERE placement_interview_id = :interviewId'],
  ['placement_interviews', 'DELETE FROM placement_interviews WHERE id = :interviewId AND source_event_id = :tag'],
];

const OPTIONAL = ['prep_observations', 'prep_readiness_daily', 'zoom_meeting_requests', 'career_interviews'];

/**
 * Remove exactly the tagged test records, in one transaction. Dry run names what would go. Known leftover (by design, not
 * guessed at): the learner-wide readiness rollup row (interview_id = none) for each day the test ran keeps the value
 * computed that day; the nightly rollup rewrites only the current Central day, so earlier days are not recomputed.
 */
export async function remove(a: Args, deps: { query?: Q; transaction?: Tx } = {}): Promise<Outcome> {
  const found = await findTagged(deps.query ?? q, a);
  if (!found.interviewId && !found.clientId) return { action: 'remove', dry: !a.apply, changed: false, ...found };
  if (!a.apply) return { action: 'remove', dry: true, changed: true, ...found };
  const tag = tagFor(a.enrollment);
  await (deps.transaction ?? realTx)(async (r) => {
    // Tables another subsystem owns may be absent on a fresh database: their deletes are skipped, never guessed.
    const present = new Set(((await r(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()
      AND table_name IN ('prep_observations', 'prep_readiness_daily', 'zoom_meeting_requests', 'career_interviews')`, {})) as Array<{ table_name: string }>).map((x) => x.table_name));
    const has = (label: string) => { const tbl = label.split(' ')[0]; return !OPTIONAL.includes(tbl) || (present.has(tbl) && (tbl !== 'prep_readiness_daily' || present.has('career_interviews'))); };
    if (found.clientId) for (const [label, sql] of REMOVE_CLIENT_SQL) if (has(label)) await r(sql, { clientId: found.clientId, tag });
    if (found.interviewId) for (const [label, sql] of REMOVE_INTERVIEW_SQL) if (has(label)) await r(sql, { interviewId: found.interviewId, tag });
  });
  return { action: 'remove', dry: false, changed: true, ...found };
}

async function main(): Promise<void> {
  const a = parseArgs(process.argv.slice(2));
  const out = a.remove ? await remove(a) : await create(a);
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', service: 'backend', event: 'placement_test_records', outcome: 'success', context: out }));
}

if (require.main === module) {
  main()
    .catch((e) => { console.error(JSON.stringify({ event: 'placement_test_records', outcome: 'failure', error_class: 'ValidationError', message: (e as Error).message })); process.exitCode = 1; })
    .finally(() => { void sequelize.close().catch(() => undefined); });
}
