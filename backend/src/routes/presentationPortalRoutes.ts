/**
 * presentationPortalRoutes — the student-facing Presentation Studio API.
 *
 * Split out of `projectsPortalRoutes.ts` when that file crossed the 500-line
 * ceiling. Same surface, same gates, same conventions — only the file boundary
 * moved, so that adding the practice-session routes did not make an over-long file
 * longer.
 *
 * EVERY ROUTE HERE IS BEHIND TWO GATES: the projects API flag (`gate`) and the
 * Studio's own flag. A flagged-off feature 404s rather than 403s, so probing cannot
 * tell "exists but not for you" from "does not exist". Ownership is the service's
 * job and a miss is a 404 for the same reason.
 *
 * NO ROUTE HERE COMPLETES A TASK. Prep state, attempts and bookings are all
 * progress, never a claim that the work was verified.
 *
 *   GET  /api/portal/presentation-templates
 *   GET  /api/portal/presentation-templates/:templateId
 *   GET  /api/portal/projects/:projectId/tasks/:storyId/presentation-prompt
 *   GET  /api/portal/projects/:projectId/tasks/:storyId/presentation-assignment
 *   PATCH ...                                            /presentation-assignment
 *   GET  /api/portal/projects/:projectId/tasks/:storyId/presentation-session
 *   GET  /api/portal/projects/:projectId/tasks/:storyId/presentation-sessions
 *   POST /api/portal/projects/:projectId/tasks/:storyId/presentation-practice
 */
import { Router, Request, Response, NextFunction } from 'express';
import { requireParticipant } from '../middlewares/participantAuth';
import { env } from '../config/env';
import { z } from 'zod';
import { eid, gate, fail } from './portalRouteHelpers';

const router = Router();

// PRESENTATION STUDIO — the personalised deck prompt for one prep task.
//
// Read-only, and every value in the returned prompt is resolved SERVER-SIDE from the
// learner's own project. The client supplies only the template id and presentation
// options (audience, purpose, style), all allowlisted or length-capped below — it can
// never put project content into the prompt it gets back.
//
// Behind the Studio flag as well as the projects gate: with the Studio off this route
// does not exist, matching the convention that a flagged-off feature 404s rather than
// 403s. Ownership is the service's job and a miss is a 404, not a 403 — see the note
// on the task routes above for why.
const presentationPromptQuery = z.object({
  template: z.string().trim().max(80).optional(),
  audience: z.string().trim().max(200).optional(),
  purpose: z.string().trim().max(200).optional(),
  style: z.string().trim().max(120).optional(),
  theme: z.string().trim().max(120).optional(),
  presenters: z.string().trim().max(300).optional(),
  duration_seconds: z.coerce.number().int().positive().max(7200).optional(),
}).strict();
router.get('/api/portal/projects/:projectId/tasks/:storyId/presentation-prompt', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    if (!env.presentationStudioEnabled) return res.status(404).json({ error: 'Presentation Studio not enabled' });
    const q = presentationPromptQuery.parse(req.query || {});
    // Dynamic import, like the other service imports in this file, so the router stays
    // importable without the template content and its dependencies.
    const { buildPresentationPrompt } = await import('../services/presentation/presentationPromptService');
    const r = await buildPresentationPrompt({
      enrollmentId: eid(req),
      projectId: String(req.params.projectId),
      storyId: String(req.params.storyId),
      templateId: q.template ?? null,
      options: {
        audience: q.audience ?? null,
        purpose: q.purpose ?? null,
        style: q.style ?? null,
        theme: q.theme ?? null,
        presenters: q.presenters ?? null,
        durationSeconds: q.duration_seconds ?? null,
      },
    });
    if (!r.ok) {
      // An unknown template is the caller's mistake and is worth saying plainly; a
      // missing/unowned project is deliberately indistinguishable.
      if (r.reason === 'unknown_template') return res.status(400).json({ error: 'Unknown presentation template' });
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({
      prompt: r.prompt.text,
      template_id: r.prompt.templateId,
      template_version: r.prompt.templateVersion,
      template_label: r.template.label,
      speaking_seconds: r.template.defaultSeconds,
      qa_seconds: r.template.qaSeconds,
      // Surfaced so the UI can tell the student what is missing instead of letting
      // them paste a prompt full of "(not supplied)" without noticing.
      missing: r.prompt.missing,
    });
  } catch (e) { fail(res, e, next); }
});

// PRESENTATION STUDIO — the authored lesson for one presentation template.
//
// NOT project-scoped, deliberately: a template lesson is curriculum content and is the
// same for every learner, so there is no project to own and nothing to check beyond
// being a participant. It lives in this file with the rest of the Studio routes rather
// than on its own, because splitting one read across two routers would be worse.
router.get('/api/portal/presentation-templates', requireParticipant, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    if (!env.presentationStudioEnabled) return res.status(404).json({ error: 'Presentation Studio not enabled' });
    const { PRESENTATION_TEMPLATES } = await import('../services/presentation');
    // The chooser needs only the spine; the full lesson is a separate read.
    res.json(PRESENTATION_TEMPLATES.map((t) => ({
      id: t.id,
      label: t.label,
      prominent: t.prominent,
      outcome: t.outcome,
      speaking_seconds: t.defaultSeconds,
      qa_seconds: t.qaSeconds,
    })));
  } catch (e) { fail(res, e, next); }
});

router.get('/api/portal/presentation-templates/:templateId', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    if (!env.presentationStudioEnabled) return res.status(404).json({ error: 'Presentation Studio not enabled' });
    const { templateById } = await import('../services/presentation');
    const t = templateById(String(req.params.templateId));
    if (!t) return res.status(404).json({ error: 'Unknown presentation template' });
    res.json(t);
  } catch (e) { fail(res, e, next); }
});

// PRESENTATION STUDIO — the learner's Prepare answers for one task.
//
// These feed the deck prompt and an instructor's readiness view, which is why they are
// a row rather than browser storage: losing them to a cleared cache would cost real
// work. `prep_state` is DERIVED server-side from what the learner has actually filled
// in — a client cannot declare itself ready — and nothing on this route can complete a
// task — the canonical completion writer in services/projects/projectWriteService.ts
// remains the only thing that may do that.
//
// That writer's name is deliberately NOT spelled out anywhere in this directory.
// `projectTaskStatusGuard.test.ts` asserts no file under backend/src/routes/ contains
// the symbol, and it does a plain substring match over the whole file INCLUDING
// comments. That bluntness is the point — it is a tripwire on the one path that can
// grant completion, and it should stay blunt rather than be taught to ignore prose.
// Naming the function here, even to say this route never calls it, fails that test.
const assignmentPatchSchema = z.object({
  template: z.string().trim().max(80).optional(),
  audience: z.string().trim().max(200).nullable().optional(),
  purpose: z.string().trim().max(500).nullable().optional(),
  // Checklist ticks: an allowlisted map of boolean flags, capped so a crafted body
  // cannot grow the row without bound.
  checklist: z.record(z.string().max(200), z.boolean()).optional(),
}).strict();

router.get('/api/portal/projects/:projectId/tasks/:storyId/presentation-assignment', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    if (!env.presentationStudioEnabled) return res.status(404).json({ error: 'Presentation Studio not enabled' });
    const { getOrCreateAssignment } = await import('../services/presentation/presentationAssignmentService');
    const r = await getOrCreateAssignment(eid(req), String(req.params.projectId), String(req.params.storyId), req.participant?.cohort_id ?? null);
    if (!r.ok) {
      if (r.reason === 'unknown_template') return res.status(409).json({ error: 'This task points at a template that no longer exists' });
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(r.view);
  } catch (e) { fail(res, e, next); }
});

router.patch('/api/portal/projects/:projectId/tasks/:storyId/presentation-assignment', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    if (!env.presentationStudioEnabled) return res.status(404).json({ error: 'Presentation Studio not enabled' });
    const body = assignmentPatchSchema.parse(req.body || {});
    const { updateAssignment } = await import('../services/presentation/presentationAssignmentService');
    const r = await updateAssignment(eid(req), String(req.params.projectId), String(req.params.storyId), {
      templateId: body.template ?? null,
      audience: body.audience,
      purpose: body.purpose,
      checklist: body.checklist,
    }, req.participant?.cohort_id ?? null);
    if (!r.ok) {
      if (r.reason === 'unknown_template') return res.status(400).json({ error: 'Unknown presentation template' });
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(r.view);
  } catch (e) { fail(res, e, next); }
});

// PRACTICE SESSIONS — which room a take happens in, and booking the next one.
//
// The read routes return `meetingReady`, never a meeting URL. `joinBooking` re-checks
// entitlement on every call and is the only sanctioned way to hand out a join link;
// a URL baked into a page payload stays valid after access is revoked. The provider's
// privileged host/start URL is never projected to a student at all.

router.get('/api/portal/projects/:projectId/tasks/:storyId/presentation-session', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    if (!env.presentationStudioEnabled) return res.status(404).json({ error: 'Presentation Studio not enabled' });
    const { resolveSessionForAssignment } = await import('../services/presentation/presentationSessionService');
    const r = await resolveSessionForAssignment(eid(req), String(req.params.projectId), String(req.params.storyId));
    if (!r.ok) return res.status(404).json({ error: 'Project not found' });
    // `session: null` is a 200, not a 404 — the task is yours, nothing is booked yet.
    res.json({ session: r.session });
  } catch (e) { fail(res, e, next); }
});

router.get('/api/portal/projects/:projectId/tasks/:storyId/presentation-sessions', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    if (!env.presentationStudioEnabled) return res.status(404).json({ error: 'Presentation Studio not enabled' });
    const { listSessionsForAssignment } = await import('../services/presentation/presentationSessionService');
    const r = await listSessionsForAssignment(eid(req), String(req.params.projectId), String(req.params.storyId));
    if (!r.ok) return res.status(404).json({ error: 'Project not found' });
    res.json({ sessions: r.sessions });
  } catch (e) { fail(res, e, next); }
});

// Times are ISO-8601 instants, validated as such. A naive "2026-11-04T19:00" would be
// read in whatever zone the server happens to run in, which is exactly the class of
// bug that put Zoom bookings five hours out.
const practiceStartSchema = z.object({
  start_at: z.string().trim().datetime(),
  end_at: z.string().trim().datetime(),
  mode: z.enum(['practice_solo', 'practice_peer']).optional(),
  // Explicit: resuming the open take is the default, a fresh take is a decision.
  new_attempt: z.boolean().optional(),
}).strict();

router.post('/api/portal/projects/:projectId/tasks/:storyId/presentation-practice', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    if (!env.presentationStudioEnabled) return res.status(404).json({ error: 'Presentation Studio not enabled' });
    const body = practiceStartSchema.parse(req.body || {});
    const { startPracticeAttempt } = await import('../services/presentation/presentationPracticeService');
    const r = await startPracticeAttempt({
      enrollmentId: eid(req),
      cohortId: req.participant?.cohort_id ?? null,
      isStaff: req.participant?.isStaff === true,
      projectId: String(req.params.projectId),
      storyId: String(req.params.storyId),
      startAt: new Date(body.start_at),
      endAt: new Date(body.end_at),
      mode: body.mode,
      newAttempt: body.new_attempt === true,
    });
    if (!r.ok) {
      if (r.reason === 'slot_unavailable') {
        // 409, not 400: the request was well-formed and permitted. The host is simply
        // busy, and the reply says when it next is not.
        return res.status(409).json({ error: r.message, why: r.why, next_available: r.nextAvailable });
      }
      return res.status(404).json({ error: 'Project not found' });
    }
    // 201 only when a take was actually created, so a double-click is visibly a
    // no-op to the client rather than looking like a second booking.
    res.status(r.created ? 201 : 200).json(r.session);
  } catch (e) { fail(res, e, next); }
});

// LAUNCH — the one place a join URL is ever issued.
//
// A POST, not a GET, and not a field on any read payload. `joinBooking` re-checks
// the caller's room entitlement on this exact call, so a permission removed a minute
// ago takes effect now rather than at the viewer's next page load. The provider's
// privileged host URL is not involved anywhere in this backend; a guard test asserts
// the string appears in no product source file.
const launchSchema = z.object({
  attempt_id: z.string().trim().uuid(),
}).strict();

router.post('/api/portal/projects/:projectId/tasks/:storyId/presentation-launch', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    if (!env.presentationStudioEnabled) return res.status(404).json({ error: 'Presentation Studio not enabled' });
    const body = launchSchema.parse(req.body || {});
    const { launchAttempt } = await import('../services/presentation/presentationLaunchService');
    const r = await launchAttempt({
      enrollmentId: eid(req),
      cohortId: req.participant?.cohort_id ?? null,
      isStaff: req.participant?.isStaff === true,
      projectId: String(req.params.projectId),
      storyId: String(req.params.storyId),
      attemptId: body.attempt_id,
    });
    if (!r.ok) {
      // 409 for the two "yours, but not yet" states: the request was correct and
      // permitted, the room simply is not usable at this instant.
      if (r.reason === 'not_booked') return res.status(409).json({ error: 'This take has no room yet.' });
      if (r.reason === 'not_ready') return res.status(409).json({ error: 'The room is still being created. Try again in a few seconds.' });
      if (r.reason === 'not_authorized') return res.status(403).json({ error: 'You are not authorized to join this session.' });
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ join_url: r.joinUrl, attempt_id: r.attemptId, brief: r.brief });
  } catch (e) { fail(res, e, next); }
});

export default router;
