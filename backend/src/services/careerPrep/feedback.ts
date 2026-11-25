import { sequelize } from '../../config/database';
import { env } from '../../config/env';
import { ensureCareerPrepFeedbackSchema } from '../../db/ensureCareerPrepFeedbackSchema';
import { readSendOutcome } from '../email/sendOutcome';
import { guardedSendMail } from '../emailService';
import { getSetting } from '../settingsService';
import { feedbackSubject, feedbackText } from './feedbackEmail';

/**
 * Career Prep pilot feedback: save, notify, list, answer.
 *
 *   submit   the row is written FIRST, keyed (enrollment, client_key), so a retry is the same row and is never mailed
 *            twice. Then one plain-text notice goes to `career_prep_feedback_emails`. If that mail fails or nobody is
 *            set up, the feedback is still saved (mail_status 'failed', logged): scripts/careerPrepFeedback lists it.
 *            The mail is not retried; the saved row is the recovery path.
 *   list     the student's own items only, newest first, with our answers.
 *   seen     marks our answers read, for the badge.
 *   answer   used by scripts/careerPrepFeedback; a new answer is unread again.
 */
export const FEEDBACK_KINDS = ['broken', 'confusing', 'idea', 'works'] as const;
export const FEEDBACK_STATUSES = ['new', 'looking', 'fixed', 'planned', 'not_now'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export const FEEDBACK_EMAILS_KEY = 'career_prep_feedback_emails';

export interface FeedbackContext {
  pageUrl: string; tab: string; sheet?: string; interviewId?: string; browser: string; viewport: string;
  errors: Array<{ at: string; kind: string; message: string; stack?: string }>;
  failedRequests: Array<{ at: string; method: string; url: string; status: number | string; ms: number; count?: number }>;
}
export interface FeedbackInput { clientKey: string; kind: FeedbackKind; message: string; better?: string; context: FeedbackContext; screenshot?: { buffer: Buffer; filename: string } | null }
export interface FeedbackView { id: string; kind: FeedbackKind; message: string; better?: string; status: FeedbackStatus; reply?: string; unread: boolean; createdAt: string }

export type FeedbackRow = { id: string; kind: FeedbackKind; message: string; better: string | null; status: FeedbackStatus; reply: string | null; replied_at: string | Date | null; reply_seen_at: string | Date | null; created_at: string | Date };
const COLS = 'id, kind, message, better, status, reply, replied_at, reply_seen_at, created_at';
export const view = (r: FeedbackRow): FeedbackView => ({
  id: String(r.id), kind: r.kind, message: r.message, ...(r.better ? { better: r.better } : {}), status: r.status,
  ...(r.reply ? { reply: r.reply } : {}),
  unread: Boolean(r.reply && r.replied_at && (!r.reply_seen_at || new Date(r.reply_seen_at) < new Date(r.replied_at))),
  createdAt: new Date(r.created_at).toISOString(),
});

function warn(event: string, errorClass: string, context: Record<string, unknown>): void {
  console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event, outcome: 'failure', error_class: errorClass, context }));
}

/** The setting may hold a string or an array; anything that is not an address is dropped. */
export function feedbackRecipients(value: unknown): string[] {
  const flat = Array.isArray(value) ? value.join(',') : typeof value === 'string' ? value : '';
  return flat.split(/[,;\s]+/).map((s) => s.trim().replace(/^["']+|["']+$/g, '')).filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
}

async function mailNotice(id: string, enrollmentId: string, input: FeedbackInput): Promise<boolean> {
  const to = feedbackRecipients(await getSetting(FEEDBACK_EMAILS_KEY));
  if (to.length === 0) { warn('career_prep_feedback_no_recipient', 'ConfigError', { id }); return false; }
  const [rows] = await sequelize.query('SELECT full_name, email FROM enrollments WHERE id = :e', { replacements: { e: enrollmentId } });
  const who = (rows as Array<{ full_name: string | null; email: string | null }>)[0] ?? { full_name: null, email: null };
  const info = await guardedSendMail({
    from: env.emailFrom, to: to.join(','), subject: feedbackSubject(input), text: feedbackText(id, who, input),
    attachments: input.screenshot ? [{ filename: input.screenshot.filename, content: input.screenshot.buffer }] : undefined,
  });
  const outcome = readSendOutcome(info);
  if (!outcome.delivered) warn('career_prep_feedback_not_mailed', 'UpstreamUnavailable', { id, reason: outcome.reason });
  return outcome.delivered;
}

/** Never throws: the feedback is already saved. */
async function notify(id: string, enrollmentId: string, input: FeedbackInput): Promise<void> {
  let sent = false;
  try { sent = await mailNotice(id, enrollmentId, input); } catch (err) {
    warn('career_prep_feedback_not_mailed', (err as Error)?.name || 'UpstreamUnavailable', { id, message: String((err as Error)?.message ?? err).slice(0, 200) });
  }
  try { await sequelize.query('UPDATE prep_feedback SET mail_status = :s WHERE id = :id', { replacements: { s: sent ? 'sent' : 'failed', id } }); } catch (err) {
    warn('career_prep_feedback_mark_failed', 'DatabaseError', { id, message: String((err as Error)?.message ?? err).slice(0, 200) });
  }
}

export async function submitFeedback(enrollmentId: string, input: FeedbackInput): Promise<{ item: FeedbackView; created: boolean }> {
  await ensureCareerPrepFeedbackSchema();
  const [made] = await sequelize.query(
    `INSERT INTO prep_feedback (enrollment_id, client_key, kind, message, better, context, screenshot, screenshot_filename)
     VALUES (:e, :key, :kind, :message, :better, CAST(:context AS JSONB), :shot, :file)
     ON CONFLICT (enrollment_id, client_key) DO NOTHING RETURNING ${COLS}`,
    { replacements: { e: enrollmentId, key: input.clientKey, kind: input.kind, message: input.message, better: input.better ?? null,
      context: JSON.stringify(input.context), shot: input.screenshot?.buffer ?? null, file: input.screenshot?.filename ?? null } });
  const row = (made as FeedbackRow[])[0];
  if (row) { await notify(String(row.id), enrollmentId, input); return { item: view(row), created: true }; }
  const [found] = await sequelize.query(`SELECT ${COLS} FROM prep_feedback WHERE enrollment_id = :e AND client_key = :key`, { replacements: { e: enrollmentId, key: input.clientKey } });
  return { item: view((found as FeedbackRow[])[0]), created: false };
}

export async function listFeedback(enrollmentId: string): Promise<FeedbackView[]> {
  await ensureCareerPrepFeedbackSchema();
  const [rows] = await sequelize.query(`SELECT ${COLS} FROM prep_feedback WHERE enrollment_id = :e ORDER BY created_at DESC LIMIT 50`, { replacements: { e: enrollmentId } });
  return (rows as FeedbackRow[]).map(view);
}

export async function markRepliesSeen(enrollmentId: string): Promise<void> {
  await ensureCareerPrepFeedbackSchema();
  await sequelize.query('UPDATE prep_feedback SET reply_seen_at = NOW() WHERE enrollment_id = :e AND replied_at IS NOT NULL AND (reply_seen_at IS NULL OR reply_seen_at < replied_at)', { replacements: { e: enrollmentId } });
}

/** Answer one item. The same answer twice changes nothing (it is not marked unread again). False = no such item. */
export async function answerFeedback(id: string, status: FeedbackStatus, reply: string): Promise<boolean> {
  await ensureCareerPrepFeedbackSchema();
  const [rows] = await sequelize.query(
    `UPDATE prep_feedback SET status = :s, replied_at = CASE WHEN reply IS DISTINCT FROM :r OR status <> :s THEN NOW() ELSE replied_at END, reply = :r
      WHERE id = :id RETURNING id`, { replacements: { s: status, r: reply, id } });
  return (rows as unknown[]).length === 1;
}
