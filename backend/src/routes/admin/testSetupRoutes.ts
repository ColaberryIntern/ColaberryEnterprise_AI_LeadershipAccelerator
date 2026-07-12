import { Router, Request, Response } from 'express';

import { requireAdmin } from '../../middlewares/authMiddleware';

const router = Router();

// SECURITY (TBI audit P0-1): test-setup endpoints shipped with NO auth in production —
// require an authenticated admin. (Test harnesses must authenticate; consider also
// disabling this router entirely when NODE_ENV === 'production'.)
router.use(requireAdmin);

// ─── Create Test Enrollments (Cold + Warm) ──────────────────────────

router.post('/api/admin/test-setup/create-test-users', async (req: Request, res: Response) => {
  try {
    const { cohort_id } = req.body;
    if (!cohort_id) {
      return res.status(400).json({ error: 'cohort_id is required' });
    }
    const { createTestEnrollments } = require('../../scripts/createTestUsers');
    const result = await createTestEnrollments(cohort_id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Reset Test Enrollments ─────────────────────────────────────────

router.post('/api/admin/test-setup/reset-test-users', async (req: Request, res: Response) => {
  try {
    const { cohort_id } = req.body;
    if (!cohort_id) {
      return res.status(400).json({ error: 'cohort_id is required' });
    }
    const { resetTestEnrollments } = require('../../scripts/createTestUsers');
    const result = await resetTestEnrollments(cohort_id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Inspect Context State for Any Enrollment ───────────────────────

router.get('/api/admin/test-setup/context-state/:enrollmentId', async (req: Request, res: Response) => {
  try {
    const { detectContextMode } = require('../../services/userContextService');
    const state = await detectContextMode(req.params.enrollmentId);
    res.json(state);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Reset Section State for an Enrollment ─────────────────────────

router.post('/api/admin/test-setup/reset-section', async (req: Request, res: Response) => {
  try {
    const { lessonId, userEmail } = req.body;
    if (!lessonId || !userEmail) {
      return res.status(400).json({ error: 'lessonId and userEmail are required' });
    }
    const { resetSectionForEnrollment } = require('../../services/sectionResetService');
    const result = await resetSectionForEnrollment(lessonId, userEmail);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
