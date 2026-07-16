import { Request, Response } from 'express';
import { z } from 'zod';
import TimelineCardComment from '../models/TimelineCardComment';
import Enrollment from '../models/Enrollment';

/**
 * timelineCommentController — per-card student comments for the Learning
 * Runtime workspace. Newest first; authors resolved to enrollment names.
 */

const eid = (req: Request) => req.participant!.sub;

const createSchema = z.object({ body: z.string().trim().min(1).max(2000) });

interface CardCommentDto {
  id: string;
  body: string;
  author: string;
  mine: boolean;
  created_at: Date;
}

/** GET /api/portal/classroom/cards/:cardId/comments — newest first (max 100). */
export async function handleListCardComments(req: Request, res: Response): Promise<void> {
  const enrollmentId = eid(req);
  const cardId = String(req.params.cardId); // express 5 types: params values are string | string[]
  const rows = await TimelineCardComment.findAll({
    where: { card_id: cardId },
    order: [['created_at', 'DESC']],
    limit: 100,
  });
  const authorIds = [...new Set(rows.map((r) => r.enrollment_id))];
  const authors = authorIds.length
    ? await Enrollment.findAll({ where: { id: authorIds }, attributes: ['id', 'full_name'] })
    : [];
  const nameById = new Map(authors.map((a) => [a.id, a.full_name]));
  const comments: CardCommentDto[] = rows.map((r) => ({
    id: r.id,
    body: r.body,
    author: nameById.get(r.enrollment_id) || 'Student',
    mine: r.enrollment_id === enrollmentId,
    created_at: r.created_at,
  }));
  res.json({ comments });
}

/** POST /api/portal/classroom/cards/:cardId/comments — add a comment (rate-limited at the route). */
export async function handleCreateCardComment(req: Request, res: Response): Promise<void> {
  const enrollmentId = eid(req);
  const parsed = createSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Comment text is required (max 2000 characters).' });
    return;
  }
  const row = await TimelineCardComment.create({
    card_id: String(req.params.cardId), // express 5 types: params values are string | string[]
    enrollment_id: enrollmentId,
    body: parsed.data.body,
  });
  const me = await Enrollment.findByPk(enrollmentId, { attributes: ['id', 'full_name'] });
  const comment: CardCommentDto = {
    id: row.id,
    body: row.body,
    author: me?.full_name || 'You',
    mine: true,
    created_at: row.created_at,
  };
  res.status(201).json({ comment });
}
