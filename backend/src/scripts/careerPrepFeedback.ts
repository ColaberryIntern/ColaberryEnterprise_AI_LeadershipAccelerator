/**
 * Read and answer Career Prep pilot feedback (the Claude Code tab that owns Career Prep runs this).
 *
 *   node dist/scripts/careerPrepFeedback.js list [--all]                  open items (or every item)
 *   node dist/scripts/careerPrepFeedback.js answer <id> <status> "text"   the student sees it in the room
 *
 * status: looking | fixed | planned | not_now. Idempotent: the same answer twice changes nothing. Never sends mail.
 */
import { sequelize } from '../config/database';
import { ensureCareerPrepFeedbackSchema } from '../db/ensureCareerPrepFeedbackSchema';
import { answerFeedback, FEEDBACK_STATUSES, type FeedbackStatus } from '../services/careerPrep/feedback';

type Args = { cmd: 'list'; all: boolean } | { cmd: 'answer'; id: string; status: FeedbackStatus; reply: string };

export function parseArgs(argv: string[]): Args {
  const [cmd, id, status, reply] = argv;
  if (cmd === 'list') return { cmd, all: argv.includes('--all') };
  if (cmd === 'answer' && /^[0-9a-f-]{36}$/i.test(id ?? '') && status !== 'new' && (FEEDBACK_STATUSES as readonly string[]).includes(status) && reply?.trim()) {
    return { cmd, id, status: status as FeedbackStatus, reply: reply.trim() };
  }
  throw new Error('usage: list [--all] | answer <id> <looking|fixed|planned|not_now> "text"');
}

async function main(): Promise<void> {
  const a = parseArgs(process.argv.slice(2));
  if (a.cmd === 'answer') {
    if (!(await answerFeedback(a.id, a.status, a.reply))) throw new Error(`no feedback ${a.id}`);
    console.log(JSON.stringify({ event: 'career_prep_feedback_answer', outcome: 'success', id: a.id, status: a.status }));
    return;
  }
  await ensureCareerPrepFeedbackSchema();
  const [rows] = await sequelize.query(
    `SELECT f.id, f.created_at, e.full_name, f.kind, f.status, f.message, f.better, f.context, f.reply, f.mail_status, f.screenshot IS NOT NULL AS has_screenshot
       FROM prep_feedback f JOIN enrollments e ON e.id = f.enrollment_id ${a.all ? '' : "WHERE f.status IN ('new','looking')"} ORDER BY f.created_at`);
  console.log(JSON.stringify(rows, null, 2));
}

if (require.main === module) {
  main()
    .catch((e) => { console.error(JSON.stringify({ event: 'career_prep_feedback', outcome: 'failure', error_class: (e as Error).name, message: (e as Error).message })); process.exitCode = 1; })
    .finally(() => { void sequelize.close().catch(() => undefined); });
}
