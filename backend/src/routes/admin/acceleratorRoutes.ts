import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleListSessions, handleGetSession, handleCreateSession, handleUpdateSession, handleDeleteSession,
  handleSkipSession, handleUnskipDate, handleGetSessionCurriculum,
  handleGetSessionKit, handleGetSessionKitDoc, handleGetSessionOutline,
  handleGenerateMeetLink, handleGenerateCohortMeetLinks,
  handleGetAttendance, handleMarkAttendance, handleUpdateAttendance,
  handleListEnrollmentSubmissions, handleListSessionSubmissions, handleCreateSubmission,
  handleUpdateSubmission, handleUploadSubmission,
  handleGetReadiness, handleComputeReadiness, handleComputeAllReadiness,
  handleGetDashboard,
  handleCreateEnrollment,
  handleListCohortEnrollments,
  handleSetPortalAccess,
  handleGetPortalLink,
  handleGetViewAsToken,
  handleGetPersonHistory,
} from '../../controllers/acceleratorController';
import {
  handleAdminOverrideLessonStatus,
  handleAdminGetLabResponses,
  handleAdminListModules,
  handleAdminGetParticipantProgress,
  handleAdminExportProjectArchitect,
} from '../../controllers/curriculumController';
import { strategyPrepUpload } from '../../config/upload';

const router = Router();

// Accelerator Sessions & Enrollments
router.get('/api/admin/accelerator/cohorts/:cohortId/sessions', requireAdmin, handleListSessions);
router.post('/api/admin/accelerator/cohorts/:cohortId/sessions', requireAdmin, handleCreateSession);
router.get('/api/admin/accelerator/cohorts/:cohortId/dashboard', requireAdmin, handleGetDashboard);
router.post('/api/admin/accelerator/cohorts/:cohortId/readiness', requireAdmin, handleComputeAllReadiness);
// Quick-add student: create enrollment + enable portal + send magic link in one call
router.post('/api/admin/accelerator/quick-add-student', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { full_name, email, company, title, phone, company_size, cohort_id, notes } = req.body;
    if (!full_name || !email || !cohort_id) {
      res.status(400).json({ error: 'full_name, email, and cohort_id are required' }); return;
    }

    // 1. Create enrollment
    const { createAdminEnrollment } = await import('../../services/enrollmentService');
    const enrollment = await createAdminEnrollment({ full_name, email, company: company || '', title, phone, company_size, cohort_id, notes });

    // 2. Enable portal access
    const { setPortalAccess } = await import('../../services/acceleratorService');
    await setPortalAccess(enrollment.id, true);

    // 3. Send magic link email
    const { requestMagicLink } = await import('../../services/participantService');
    await requestMagicLink(email);

    res.json({
      success: true,
      enrollment: { id: enrollment.id, full_name: enrollment.full_name, email: enrollment.email },
      message: `${full_name} enrolled and login link sent to ${email}`,
    });
  } catch (err: any) {
    if (err.message?.includes('already enrolled')) {
      res.status(409).json({ error: err.message });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// Free Access (comped seat): grant/revoke a 100% discount on an enrollment —
// full program access at $0, no staff role, normal student experience.
router.post('/api/admin/accelerator/enrollments/:id/free-access', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { grantFreeAccess } = await import('../../services/subscriptionService');
    await grantFreeAccess(req.params.id as string);
    res.json({ success: true, free_access: true });
  } catch (err: any) {
    const status = err?.error_class === 'NotFoundError' ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});
router.delete('/api/admin/accelerator/enrollments/:id/free-access', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { revokeFreeAccess } = await import('../../services/subscriptionService');
    const revoked = await revokeFreeAccess(req.params.id as string);
    res.json({ success: true, free_access: false, revoked });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/admin/accelerator/cohorts/:cohortId/enrollments', requireAdmin, handleCreateEnrollment);
router.get('/api/admin/accelerator/cohorts/:cohortId/enrollments', requireAdmin, handleListCohortEnrollments);
router.patch('/api/admin/accelerator/enrollments/:id/portal-access', requireAdmin, handleSetPortalAccess);
router.get('/api/admin/accelerator/enrollments/:id/portal-link', requireAdmin, handleGetPortalLink);
// Read-only "View as member" — mints a read_only participant token (server blocks all writes).
router.get('/api/admin/accelerator/enrollments/:id/view-as-token', requireAdmin, handleGetViewAsToken);
router.get('/api/admin/accelerator/enrollments/:id/history', requireAdmin, handleGetPersonHistory);
router.get('/api/admin/accelerator/sessions/:id', requireAdmin, handleGetSession);
router.patch('/api/admin/accelerator/sessions/:id', requireAdmin, handleUpdateSession);
router.delete('/api/admin/accelerator/sessions/:id', requireAdmin, handleDeleteSession);
// Schedule management: skip a session's day (push forward), un-skip a date, per-session curriculum
router.post('/api/admin/accelerator/sessions/:id/skip', requireAdmin, handleSkipSession);
router.post('/api/admin/accelerator/cohorts/:cohortId/unskip', requireAdmin, handleUnskipDate);
router.get('/api/admin/accelerator/sessions/:id/curriculum', requireAdmin, handleGetSessionCurriculum);
router.post('/api/admin/accelerator/sessions/:id/meet-link', requireAdmin, handleGenerateMeetLink);
router.get('/api/admin/accelerator/sessions/:id/kit', requireAdmin, handleGetSessionKit);
// Full interactive Class Kit teaching deck (HTML) — opened in a new tab to run the class.
router.get('/api/admin/accelerator/sessions/:id/kit-doc', requireAdmin, handleGetSessionKitDoc);
// Plain-language class outline (teaching plan) — review / prepare / print.
router.get('/api/admin/accelerator/sessions/:id/outline', requireAdmin, handleGetSessionOutline);
router.post('/api/admin/accelerator/cohorts/:cohortId/meet-links', requireAdmin, handleGenerateCohortMeetLinks);
router.get('/api/admin/accelerator/sessions/:id/attendance', requireAdmin, handleGetAttendance);
router.post('/api/admin/accelerator/sessions/:id/attendance', requireAdmin, handleMarkAttendance);
router.get('/api/admin/accelerator/sessions/:id/submissions', requireAdmin, handleListSessionSubmissions);
router.patch('/api/admin/accelerator/attendance/:id', requireAdmin, handleUpdateAttendance);
router.get('/api/admin/accelerator/enrollments/:enrollmentId/submissions', requireAdmin, handleListEnrollmentSubmissions);
router.get('/api/admin/accelerator/enrollments/:enrollmentId/readiness', requireAdmin, handleGetReadiness);
router.post('/api/admin/accelerator/enrollments/:enrollmentId/readiness', requireAdmin, handleComputeReadiness);
router.post('/api/admin/accelerator/submissions', requireAdmin, handleCreateSubmission);
router.patch('/api/admin/accelerator/submissions/:id', requireAdmin, handleUpdateSubmission);
router.post('/api/admin/accelerator/submissions/:id/upload', requireAdmin, strategyPrepUpload.single('file'), handleUploadSubmission);

// Curriculum Admin
router.get('/api/admin/accelerator/cohorts/:cohortId/curriculum/modules', requireAdmin, handleAdminListModules);
router.get('/api/admin/accelerator/enrollments/:enrollmentId/curriculum-progress', requireAdmin, handleAdminGetParticipantProgress);
router.get('/api/admin/accelerator/enrollments/:enrollmentId/project-architect', requireAdmin, handleAdminExportProjectArchitect);
router.put('/api/admin/accelerator/curriculum/lessons/:lessonId/override', requireAdmin, handleAdminOverrideLessonStatus);
router.get('/api/admin/accelerator/enrollments/:enrollmentId/lab-responses', requireAdmin, handleAdminGetLabResponses);

// Open House: onboard Eventbrite registrants (read from CCPP) as Explorer accounts.
// Dry-run by default; pass ?send=true to actually create accounts + send login links.
router.post('/api/admin/accelerator/open-house/sync', requireAdmin, async (req: Request, res: Response) => {
  try {
    const dryRun = req.query.send !== 'true';
    const { syncOpenHouseExplorers } = await import('../../services/openHouseOnboardingService');
    const summary = await syncOpenHouseExplorers({ dryRun });
    res.json({ success: true, ...summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
