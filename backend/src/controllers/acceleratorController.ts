import { Request, Response, NextFunction } from 'express';
import {
  listSessionsByCohort, getSession, createSession, updateSession, deleteSession,
  getSessionAttendance, markAttendance, bulkMarkAttendance, updateAttendanceRecord,
  listSubmissionsByEnrollment, listSubmissionsBySession, createSubmission, updateSubmission,
  computeReadinessScore, computeAllReadinessScores, getCohortDashboard,
  listCohortEnrollments, setPortalAccess,
} from '../services/acceleratorService';
import { generateMeetLink } from '../services/meetingService';
import { LiveSession } from '../models';

// -- Sessions --

export async function handleListSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const sessions = await listSessionsByCohort(req.params.cohortId as string);
    res.json({ sessions });
  } catch (err) { next(err); }
}

export async function handleGetSession(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await getSession(req.params.id as string);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ session });
  } catch (err) { next(err); }
}

export async function handleCreateSession(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await createSession({
      cohort_id: req.params.cohortId as string,
      ...req.body,
    });
    res.status(201).json({ session });
  } catch (err) { next(err); }
}

export async function handleUpdateSession(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await updateSession(req.params.id as string, req.body);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ session });
  } catch (err) { next(err); }
}

export async function handleDeleteSession(req: Request, res: Response, next: NextFunction) {
  try {
    const deleted = await deleteSession(req.params.id as string);
    if (!deleted) return res.status(404).json({ error: 'Session not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
}

export async function handleGenerateMeetLink(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await LiveSession.findByPk(req.params.id as string);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const link = await generateMeetLink(session);
    if (!link) return res.status(500).json({ error: 'Failed to generate Meet link' });
    res.json({ meeting_link: link });
  } catch (err) { next(err); }
}

// -- Attendance --

export async function handleGetAttendance(req: Request, res: Response, next: NextFunction) {
  try {
    const records = await getSessionAttendance(req.params.id as string);
    res.json({ records });
  } catch (err) { next(err); }
}

export async function handleMarkAttendance(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.body.records && Array.isArray(req.body.records)) {
      const results = await bulkMarkAttendance(req.params.id as string, req.body.records);
      return res.json({ records: results });
    }
    const record = await markAttendance({
      session_id: req.params.id as string,
      ...req.body,
    });
    res.json({ record });
  } catch (err) { next(err); }
}

export async function handleUpdateAttendance(req: Request, res: Response, next: NextFunction) {
  try {
    const record = await updateAttendanceRecord(req.params.id as string, req.body);
    if (!record) return res.status(404).json({ error: 'Attendance record not found' });
    res.json({ record });
  } catch (err) { next(err); }
}

// -- Submissions --

export async function handleListEnrollmentSubmissions(req: Request, res: Response, next: NextFunction) {
  try {
    const submissions = await listSubmissionsByEnrollment(req.params.enrollmentId as string);
    res.json({ submissions });
  } catch (err) { next(err); }
}

export async function handleListSessionSubmissions(req: Request, res: Response, next: NextFunction) {
  try {
    const submissions = await listSubmissionsBySession(req.params.id as string);
    res.json({ submissions });
  } catch (err) { next(err); }
}

export async function handleCreateSubmission(req: Request, res: Response, next: NextFunction) {
  try {
    const submission = await createSubmission(req.body);
    res.status(201).json({ submission });
  } catch (err) { next(err); }
}

export async function handleUpdateSubmission(req: Request, res: Response, next: NextFunction) {
  try {
    const submission = await updateSubmission(req.params.id as string, req.body);
    if (!submission) return res.status(404).json({ error: 'Submission not found' });
    res.json({ submission });
  } catch (err) { next(err); }
}

export async function handleUploadSubmission(req: Request, res: Response, next: NextFunction) {
  try {
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    const submission = await updateSubmission(req.params.id as string, {
      file_path: file.path,
      file_name: file.originalname,
      status: 'submitted',
    });
    if (!submission) return res.status(404).json({ error: 'Submission not found' });
    res.json({ submission });
  } catch (err) { next(err); }
}

// -- Readiness --

export async function handleGetReadiness(req: Request, res: Response, next: NextFunction) {
  try {
    const scores = await computeReadinessScore(req.params.enrollmentId as string);
    if (!scores) return res.status(404).json({ error: 'Enrollment not found' });
    res.json(scores);
  } catch (err) { next(err); }
}

export async function handleComputeReadiness(req: Request, res: Response, next: NextFunction) {
  try {
    const scores = await computeReadinessScore(req.params.enrollmentId as string);
    if (!scores) return res.status(404).json({ error: 'Enrollment not found' });
    res.json(scores);
  } catch (err) { next(err); }
}

export async function handleComputeAllReadiness(req: Request, res: Response, next: NextFunction) {
  try {
    const results = await computeAllReadinessScores(req.params.cohortId as string);
    res.json({ results });
  } catch (err) { next(err); }
}

// -- Dashboard --

export async function handleGetDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const dashboard = await getCohortDashboard(req.params.cohortId as string);
    if (!dashboard) return res.status(404).json({ error: 'Cohort not found' });
    res.json(dashboard);
  } catch (err) { next(err); }
}

// -- Admin Enrollment --

export async function handleCreateEnrollment(req: Request, res: Response, next: NextFunction) {
  try {
    const { full_name, email, company, title, phone, company_size, notes } = req.body;
    if (!full_name || !email || !company) {
      return res.status(400).json({ error: 'full_name, email, and company are required' });
    }
    const { createAdminEnrollment } = await import('../services/enrollmentService');
    const enrollment = await createAdminEnrollment({
      full_name, email, company, title, phone, company_size,
      cohort_id: req.params.cohortId as string,
      notes,
    });
    res.status(201).json({ enrollment });
  } catch (err) { next(err); }
}

// -- Enrollment Management --

export async function handleListCohortEnrollments(req: Request, res: Response, next: NextFunction) {
  try {
    const enrollments = await listCohortEnrollments(req.params.cohortId as string);
    res.json({ enrollments });
  } catch (err) { next(err); }
}

export async function handleSetPortalAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const { portal_enabled } = req.body;
    if (typeof portal_enabled !== 'boolean') {
      return res.status(400).json({ error: 'portal_enabled (boolean) is required' });
    }
    const enrollment = await setPortalAccess(req.params.id as string, portal_enabled);
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found' });
    res.json({ enrollment });
  } catch (err) { next(err); }
}
