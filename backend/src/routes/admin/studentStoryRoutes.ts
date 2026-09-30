import { Router, Request, Response } from 'express';
import { requireSection } from '../../middlewares/authMiddleware';
import { handleGetPersonHistory } from '../../controllers/acceleratorController';
import { listMembersForAdmin } from '../../services/communityService';

/**
 * Support role's read-only student-story surface. Every route here is gated by
 * requireSection('students'), which admits Owner, mgmt-Admin, and Support (plus
 * legacy full admins) and 403s every other scoped mgmt role. The global
 * mgmtSectionGate has already confirmed a Support token may touch /api/admin/students.
 *
 * The Support role gets NO other admin API (deny-by-default in the gate) and no
 * mutating routes live here — it is a pure "student story" viewer.
 */
const router = Router();

// Searchable roster for the Support landing page. Lean projection — just enough
// to find a student and open their story. Reuses the community roster query.
router.get('/api/admin/students', requireSection('students'), async (req: Request, res: Response) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const members = await listMembersForAdmin(search);
    const students = members
      .filter((m) => m.enrollment_id)
      .map((m) => ({
        enrollment_id: m.enrollment_id,
        display_name: m.display_name,
        email: m.email,
        signed_up_at: m.signed_up_at,
      }));
    res.json({ students });
  } catch (err: any) {
    console.error('[StudentStoryRoutes] GET /students error:', err?.message);
    res.status(500).json({ error: 'Failed to load students' });
  }
});

// The full "student story" — same payload as the accelerator person-history, but
// served from the students section so Support can read it without Program access.
// handleGetPersonHistory reads req.params.id (the enrollment id).
router.get('/api/admin/students/:id/history', requireSection('students'), handleGetPersonHistory);

export default router;
