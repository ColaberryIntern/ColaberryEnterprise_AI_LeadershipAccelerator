import { Router, Request, Response } from 'express';

const router = Router();

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

export default router;
