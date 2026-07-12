import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  listPendingReviews,
  approveReview,
  dismissReview,
} from '../../services/mentorFeedbackService';
import AssignmentSubmission from '../../models/AssignmentSubmission';
import MentorReviewItem from '../../models/MentorReviewItem';

const router = Router();

const ApproveBody = z.object({
  reviewer_notes: z.string().max(5000).optional(),
});

/**
 * GET /api/admin/mentor-reviews
 * Query: ?status=pending_review|auto_approved|approved|dismissed (default: pending_review)
 */
router.get('/api/admin/mentor-reviews', requireAdmin, async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || 'pending_review';
    const validStatuses = ['pending_review', 'auto_approved', 'approved', 'dismissed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status filter' });
    }

    const items = await MentorReviewItem.findAll({
      where: { status },
      order: [['created_at', 'ASC']],
    });

    // Attach submission titles for context
    const submissionIds = items.map((i) => i.submission_id);
    const submissions = submissionIds.length
      ? await AssignmentSubmission.findAll({
          where: { id: submissionIds },
          attributes: ['id', 'title', 'assignment_type', 'submitted_at'],
        })
      : [];
    const subMap = new Map(submissions.map((s) => [s.id, s]));

    const payload = items.map((item) => {
      const sub = subMap.get(item.submission_id);
      return {
        id: item.id,
        submission_id: item.submission_id,
        enrollment_id: item.enrollment_id,
        submission_title: sub?.title ?? null,
        assignment_type: sub?.assignment_type ?? null,
        submitted_at: sub?.submitted_at ?? null,
        ai_feedback: item.ai_feedback,
        confidence_score: item.confidence_score,
        status: item.status,
        reviewer_notes: item.reviewer_notes,
        reviewed_at: item.reviewed_at,
        created_at: item.created_at,
      };
    });

    res.json({ items: payload, total: payload.length });
  } catch (err: any) {
    console.error('[MentorReviewRoutes] list error:', err.message);
    res.status(500).json({ error: 'Failed to list mentor reviews' });
  }
});

/**
 * POST /api/admin/mentor-reviews/:id/approve
 * Body: { reviewer_notes?: string }
 */
router.post('/api/admin/mentor-reviews/:id/approve', requireAdmin, async (req: Request, res: Response) => {
  try {
    const parsed = ApproveBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
    }

    const item = await approveReview(req.params.id as string, parsed.data.reviewer_notes);
    if (!item) return res.status(404).json({ error: 'Review item not found' });

    res.json({ item });
  } catch (err: any) {
    console.error('[MentorReviewRoutes] approve error:', err.message);
    res.status(500).json({ error: 'Failed to approve review' });
  }
});

/**
 * POST /api/admin/mentor-reviews/:id/dismiss
 */
router.post('/api/admin/mentor-reviews/:id/dismiss', requireAdmin, async (req: Request, res: Response) => {
  try {
    const item = await dismissReview(req.params.id as string);
    if (!item) return res.status(404).json({ error: 'Review item not found' });

    res.json({ item });
  } catch (err: any) {
    console.error('[MentorReviewRoutes] dismiss error:', err.message);
    res.status(500).json({ error: 'Failed to dismiss review' });
  }
});

export default router;
