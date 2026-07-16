/**
 * cardCommentService — the class comment thread under a Timeline card
 * (FB-style: every enrolled student reads the same thread; writes are
 * attributed by first name). Simple, deterministic CRUD.
 *
 * Failure design: list/add throw typed {status} errors the controller maps to
 * HTTP codes; no external calls, so no retries/timeouts needed. Re-running an
 * add is a NEW comment by design (a comment is not a replayable side effect —
 * the client only submits on an explicit user action).
 */
import CardComment from '../../models/CardComment';
import Enrollment from '../../models/Enrollment';

export interface CommentView {
  id: string;
  author: string;
  mine: boolean;
  body: string;
  created_at: Date;
}

const MAX_BODY = 2000;
const LIST_LIMIT = 200;

/** PURE — validate + normalize a comment body, or throw a 400. */
export function normalizeCommentBody(raw: unknown): string {
  const body = typeof raw === 'string' ? raw.trim() : '';
  if (!body) throw Object.assign(new Error('Comment is empty'), { status: 400 });
  if (body.length > MAX_BODY) throw Object.assign(new Error(`Comment is too long (max ${MAX_BODY} characters)`), { status: 400 });
  return body;
}

/** PURE — a short display name ("Aisha R.") from a full name; never empty. */
export function displayName(fullName: string | null | undefined): string {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Student';
  const first = parts[0];
  const lastInitial = parts.length > 1 ? ` ${parts[parts.length - 1][0].toUpperCase()}.` : '';
  return `${first}${lastInitial}`;
}

/** The card's thread, oldest → newest, flagged `mine` for the reader. */
export async function listComments(enrollmentId: string, cardId: string): Promise<CommentView[]> {
  const rows = await CardComment.findAll({
    where: { card_id: cardId },
    order: [['created_at', 'ASC']],
    limit: LIST_LIMIT,
  });
  return rows.map((r) => ({
    id: r.id,
    author: r.author_name,
    mine: r.enrollment_id === enrollmentId,
    body: r.body,
    created_at: r.created_at,
  }));
}

/** Post a comment as this student; returns the saved view row. */
export async function addComment(enrollmentId: string, cardId: string, rawBody: unknown): Promise<CommentView> {
  const body = normalizeCommentBody(rawBody);
  const enrollment = await Enrollment.findByPk(enrollmentId, { attributes: ['id', 'full_name'] });
  if (!enrollment) throw Object.assign(new Error('Enrollment not found'), { status: 404 });
  const row = await CardComment.create({
    card_id: cardId,
    enrollment_id: enrollmentId,
    author_name: displayName(enrollment.full_name),
    body,
  });
  return { id: row.id, author: row.author_name, mine: true, body: row.body, created_at: row.created_at };
}
