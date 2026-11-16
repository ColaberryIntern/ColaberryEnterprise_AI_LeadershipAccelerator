import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { loadPrepData } from '../../services/careerPrep/prepData';
import { listPrepStudents } from '../../services/careerPrep/prepStudents';
import { buildDashboard } from '../../services/careerPrep/prepViews';
import { StaffPrepResponse, StaffStudentListResponse } from '../careerPrepSchemas';
import { logFailure, sendValidated } from '../campusRoutes';

/**
 * Career Prep v27 (CP1.5): the staff read of one student's prep, READ-ONLY (M1 Q3 default).
 * Gated `requireSection('placement')`: owner and admin hold it through ALL_SECTIONS; any other
 * staff member only through a per-member extra section. mgmtSectionGate maps the prefix.
 */
const Params = z.object({ id: z.string().uuid() }).strict();

export async function getStudentPrep(req: Request, res: Response): Promise<void> {
  const p = Params.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'id must be an enrollment id.' }); return; }
  try {
    const now = new Date();
    const dashboard = buildDashboard(await loadPrepData(p.data.id, now), now);
    sendValidated(res, StaffPrepResponse, { enrollmentId: p.data.id, dashboard }, 'placement_student_prep');
  } catch (err) {
    logFailure('placement_student_prep_failed', err);
    res.status(500).json({ error: 'Could not load this student\'s prep.' });
  }
}

/**
 * The Student prep page's list: every student with Career Prep evidence in the last 90 days, newest
 * first, with their latest general readiness (null when too little data). Capped at 500 rows.
 */
export async function listStudents(_req: Request, res: Response): Promise<void> {
  try {
    sendValidated(res, StaffStudentListResponse, { students: await listPrepStudents() }, 'placement_student_list');
  } catch (err) {
    logFailure('placement_student_list_failed', err);
    res.status(500).json({ error: 'Could not load students.' });
  }
}

const router = Router();
router.get('/api/admin/placement/students', requireSection('placement'), listStudents);
router.get('/api/admin/placement/students/:id/prep', requireSection('placement'), getStudentPrep);

export default router;
