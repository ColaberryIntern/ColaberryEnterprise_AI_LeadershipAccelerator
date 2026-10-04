import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import InternshipApplication from '../../models/InternshipApplication';
import { applicationDetail, queue, queueCounts, type QueueBucket } from '../../services/internship/internshipReviewQueue';
import { decide } from '../../services/internship/internshipDecisionService';
import { assessApplicant } from '../../services/internship/internshipApplicantAssessment';
import { internActivity } from '../../services/internship/internshipActivityService';
import { internshipProjectReview } from '../../services/internship/internshipProjectReview';
import { authorAndAssignInternshipProject } from '../../services/internship/internshipProjectAuthoring';
import {
  internProjectQuestions, startInternProjectBuild, internProjectBuild,
  assignGeneratedProject, assertNotGeneratedProject,
} from '../../services/internship/internshipProjectGeneration';
import { internshipProjectReadiness } from '../../services/internship/internshipProjectReadiness';
import { InvalidInternshipTransitionError } from '../../services/internship/internshipStateMachine';
import { REASON_CODES } from '../../services/internship/internshipReasonCodes';
import fs from 'fs';
import path from 'path';
import { SIGNED_DOC_DIR } from '../../config/upload';
import { documentsFor, outstandingRequirements, verifyDocument } from '../../services/internship/internshipDocumentService';
import { activate, activeInternView, buildChecklist } from '../../services/internship/internshipActivationService';
import { commitConversion, planConversion } from '../../services/internship/internshipConversionService';
import { internshipKpis, internshipProfileSection } from '../../services/internship/internshipTrackingService';
import { getConsoleRoster, consoleCounts } from '../../services/internship/internConsoleRoster';
import { PROJECT_STAGES } from '../../services/projectDeliveryService';
import { getInternConsoleDetail } from '../../services/internship/internConsoleDetail';
import { transition } from '../../services/internship/internshipApplicationService';
import { isTerminal, InternshipState } from '../../services/internship/internshipStateMachine';
import { sendNudge, isNudgeTemplate, NUDGE_TEMPLATES } from '../../services/internship/internshipNudge';
import Enrollment from '../../models/Enrollment';

/**
 * Admin — AI Internship applications.
 *
 * ── THE GATE ───────────────────────────────────────────────────────────────
 *
 * Every route is `requireSection('internship')`, which admits owner, mgmt-admin
 * and **admissions** — the role Dhee holds, so she manages this without needing
 * `admin`. Two things must agree for that to work, and both are in this change:
 *
 *   1. `mgmtSectionGate`'s PATH_SECTION maps `/api/admin/internship` → 'internship'.
 *      Without that row the gate is deny-by-default and every scoped mgmt token
 *      403s here while a legacy full admin passes — the exact latent failure the
 *      case-studies and cert-prep rows in that file were added to fix.
 *   2. The frontend nav declares the same section, so the page and the API cannot
 *      disagree about who may see it.
 *
 * ── AND WHY THE DECISION ROUTE IS NOT "PATCH state" ────────────────────────
 *
 * A generic state-setting endpoint would let a reviewer (or a bug) move an
 * application anywhere the state machine happens to allow, without a reason code,
 * without a decision row, and without an email. The verbs here are the decisions
 * a reviewer actually makes, and each one goes through `decide()`, which cannot
 * record a rejection without a student-safe reason.
 */
const router = Router();

const BUCKETS: QueueBucket[] = [
  'awaiting_review', 'information_requested', 'waitlisted',
  'interview_incomplete', 'calls_failed', 'approved_awaiting_documents',
  'onboarding', 'active_interns', 'converted', 'in_review',
];

const queueQuerySchema = z.object({
  bucket: z.enum(BUCKETS as [QueueBucket, ...QueueBucket[]]).default('awaiting_review'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const decideSchema = z.object({
  decision: z.enum([
    'approve', 'approve_with_conditions', 'reject',
    'waitlist', 'request_information', 'schedule_human_follow_up',
  ]),
  // Optional: a reason is required only for reject / waitlist / request_information
  // (enforced in decide()). Approving needs none. The dropdown sends '' when no
  // reason is picked, so coerce that empty string to "absent" before the enum
  // check — otherwise an approval with no reason fails as an invalid decision.
  reason_code: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(REASON_CODES as [string, ...string[]]).nullish(),
  ),
  student_message: z.string().max(4000).nullish(),
  reviewer_notes: z.string().max(4000).nullish(),
  conditions: z.string().max(2000).nullish(),
}).strict();

/**
 * GET /api/admin/internship/console
 *
 * One row per active intern for the Intern Console: identity, state, day N, activity, training
 * with the weeks 1-3 gate, cert sitting counts, and their project if they have one.
 *
 * `requireSection('internship')` rather than `requireAdmin`, matching every route around it.
 * Narrowing to admin-only would remove access that internship-scoped staff have today, which is
 * a permissions regression dressed as a new feature.
 *
 * **There is no attendance field in this response, by product decision.** See
 * `internConsoleRoster`'s header: 7 join rows existed across 2 interns and no denominator exists.
 */
router.get('/api/admin/internship/console', requireSection('internship'), async (_req: Request, res: Response) => {
  try {
    const interns = await getConsoleRoster();
    // `stages` is served rather than hardcoded in the client so the pipeline's columns come from the
    // same constant the `stage` values are produced from. A client with its own copy of the list
    // silently drops a column the day a stage is added, and the projects in it vanish from the board.
    res.json({ interns, counts: consoleCounts(interns), stages: PROJECT_STAGES });
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_console_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
    res.status(500).json({ error: 'Could not load the intern console.' });
  }
});

/**
 * GET /api/admin/internship/console/:enrollmentId
 *
 * One intern in depth: their roster row, the per-section training breakdown, the cert attempt
 * series with each sitting's item count, the readiness/claim pair, and their activity feed.
 *
 * **404 rather than 403 for someone who is not an active intern.** The enrollment id is not a
 * secret, but whether a given person is an intern is not something this endpoint should confirm to
 * a caller who cannot already see the roster — and the roster's own predicate is what decides, so
 * the two surfaces cannot disagree about who exists.
 */
router.get('/api/admin/internship/console/:enrollmentId', requireSection('internship'), async (req: Request, res: Response) => {
  const enrollmentId = String(req.params.enrollmentId ?? '');
  try {
    const detail = await getInternConsoleDetail(enrollmentId);
    if (!detail) { res.status(404).json({ error: 'Not an active intern.' }); return; }
    res.json(detail);
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_console_detail_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
    res.status(500).json({ error: 'Could not load this intern.' });
  }
});

/**
 * The five status actions the console's Manage drawer offers, mapped to states.
 *
 * A fixed allowlist, not a free-text state: a route that accepted any `InternshipState` would let a
 * caller move an application to `documents_verified` or `active` and skip approval entirely. These
 * five are the only moves a manager makes from the console.
 */
const CONSOLE_ACTIONS: Record<string, InternshipState> = {
  pause: 'paused',
  resume: 'active',
  complete: 'completed',
  withdraw: 'withdrawn',
  remove: 'removed',
};

/** `complete`, `withdraw` and `remove` have NO reverse edge — see the state machine's terminal map. */
const ONE_WAY = new Set(['complete', 'withdraw', 'remove']);

const transitionSchema = z.object({
  action: z.enum(['pause', 'resume', 'complete', 'withdraw', 'remove']),
  reason: z.string().trim().min(1).max(2000).optional(),
  /**
   * Required for the three actions that cannot be undone: the caller must echo the action name.
   * A typed confirmation is the only thing standing between a misclick and a terminal record that
   * can never be reopened — reapplying opens a NEW application rather than reviving this one.
   */
  confirm: z.string().optional(),
}).strict();

/**
 * POST /api/admin/internship/applications/:id/transition
 *
 * Thin by design. `transition()` in `internshipApplicationService` is the ONLY writer of
 * `internship_applications.state`; it takes a row lock, asserts the move against the state machine
 * and writes the audit event in the same transaction. This route adds the console's own rules —
 * the five-action allowlist, the typed confirmation on one-way moves, and the actor — and nothing
 * else. Re-implementing any of it here would create a second write path, which is exactly what the
 * service's header says must not exist.
 *
 * **The actor comes from the verified session, never from the body.** A body-supplied actor would
 * let a caller attribute their own decision to someone else in the permanent audit trail.
 */
router.post('/api/admin/internship/applications/:id/transition', requireSection('internship'), async (req: Request, res: Response) => {
  const parsed = transitionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid transition request.', issues: parsed.error.issues });
    return;
  }
  const { action, reason, confirm } = parsed.data;

  if (ONE_WAY.has(action) && confirm !== action) {
    res.status(400).json({
      error: `"${action}" cannot be undone. Send confirm:"${action}" to proceed.`,
      one_way: true,
    });
    return;
  }

  const applicationId = String(req.params.id);
  try {
    const current = await InternshipApplication.findByPk(applicationId);
    if (!current) { res.status(404).json({ error: 'Application not found.' }); return; }

    // Refused before the writer is even called, with the reason named. The state machine would also
    // refuse it, but a terminal record is the one case worth answering precisely: "this application
    // was completed on <date> and cannot be reopened" is actionable, "invalid transition" is not.
    if (isTerminal(current.state as InternshipState)) {
      res.status(409).json({
        error: `This application is ${current.state} and cannot be changed. Reapplying opens a new application.`,
        state: current.state,
        terminal: true,
      });
      return;
    }

    const app = await transition(applicationId, CONSOLE_ACTIONS[action], {
      actor: 'reviewer',
      actorId: (req as any).admin?.email ?? null,
      reason: reason ?? null,
      evidenceSource: 'intern_console',
    });

    res.json({ application_id: app.id, state: app.state, action });
  } catch (err: any) {
    if (err instanceof InvalidInternshipTransitionError) {
      // The state machine's own refusal, passed through with its message rather than flattened.
      res.status(409).json({ error: err.message, refused_by: 'state_machine' });
      return;
    }
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_console_transition_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message, action },
    }));
    res.status(500).json({ error: "Could not change this intern's status." });
  }
});

const nudgeSchema = z.object({
  template: z.string().refine(isNudgeTemplate, {
    message: `template must be one of: ${Object.keys(NUDGE_TEMPLATES).join(', ')}`,
  }),
  /** One optional human line. Escaped and capped by the renderer. */
  note: z.string().trim().max(400).optional(),
  /**
   * Defaults to a DRY RUN. Sending requires `send: true` explicitly, so a mistaken call previews
   * rather than mails a student.
   */
  send: z.boolean().optional(),
}).strict();

/**
 * POST /api/admin/internship/applications/:id/nudge
 *
 * **The caller picks a template; it can never supply the words.** There is no subject, body or HTML
 * parameter, so no request can put unreviewed text in front of a student. The one free-text field is
 * a short note, escaped and length-capped by the renderer.
 *
 * **The recipient comes from the enrollment, never the body.** A body-supplied address would turn an
 * admin console into an open relay that sends from Colaberry's domain.
 *
 * Dry run by default: `send: true` is required to actually mail, and the idempotency ledger allows
 * one nudge of a given template per intern per day.
 */
router.post('/api/admin/internship/applications/:id/nudge', requireSection('internship'), async (req: Request, res: Response) => {
  const parsed = nudgeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid nudge request.', issues: parsed.error.issues });
    return;
  }

  try {
    const app = await InternshipApplication.findByPk(String(req.params.id));
    if (!app) { res.status(404).json({ error: 'Application not found.' }); return; }

    const enrollment: any = await Enrollment.findByPk(String((app as any).enrollment_id));
    const to = enrollment?.email ?? null;
    if (!to) { res.status(409).json({ error: 'This intern has no email address on file.' }); return; }

    const result = await sendNudge({
      applicationId: String(app.id),
      to,
      firstName: String(enrollment?.full_name ?? '').trim().split(/\s+/)[0] || null,
      template: parsed.data.template,
      note: parsed.data.note ?? null,
      dryRun: parsed.data.send !== true,
      correlationId: (app as any).correlation_id ?? null,
    });

    res.json(result);
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_console_nudge_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
    res.status(500).json({ error: 'Could not send this nudge.' });
  }
});

/** GET /api/admin/internship/queue */
router.get('/api/admin/internship/queue', requireSection('internship'), async (req: Request, res: Response) => {
  const parsed = queueQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid filters.', issues: parsed.error.issues });
    return;
  }
  try {
    const [counts, page] = await Promise.all([
      queueCounts(),
      queue(parsed.data),
    ]);
    res.json({ counts, ...page, bucket: parsed.data.bucket });
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_queue_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
    res.status(500).json({ error: 'Could not load the queue.' });
  }
});

/** GET /api/admin/internship/applications/:id */
router.get('/api/admin/internship/applications/:id', requireSection('internship'), async (req: Request, res: Response) => {
  try {
    const detail = await applicationDetail(String(req.params.id));
    if (!detail) { res.status(404).json({ error: 'Application not found.' }); return; }
    res.json(detail);
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_detail_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
    res.status(500).json({ error: 'Could not load the application.' });
  }
});

/**
 * GET /api/admin/internship/applications/:id/activity
 * What the intern is doing: training (weeks 1-3 gate), project, cert prep, case
 * studies. Read-only; keyed off the application's enrollment.
 */
router.get('/api/admin/internship/applications/:id/activity', requireSection('internship'), async (req: Request, res: Response) => {
  try {
    const application = await InternshipApplication.findByPk(String(req.params.id), { attributes: ['id', 'enrollment_id'] });
    if (!application) { res.status(404).json({ error: 'Application not found.' }); return; }
    const activity = await internActivity((application as any).enrollment_id);
    res.json(activity);
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_activity_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
    res.status(500).json({ error: 'Could not load the intern activity.' });
  }
});

/**
 * POST /api/admin/internship/applications/:id/project-review
 * The "dig into their project" AI review. Body: optional { question }. Generated
 * on demand so the LLM cost is paid only when a manager asks.
 */
router.post('/api/admin/internship/applications/:id/project-review', requireSection('internship'), async (req: Request, res: Response) => {
  try {
    const application = await InternshipApplication.findByPk(String(req.params.id), { attributes: ['id', 'enrollment_id'] });
    if (!application) { res.status(404).json({ error: 'Application not found.' }); return; }
    const question = typeof req.body?.question === 'string' ? req.body.question.slice(0, 500) : undefined;
    const review = await internshipProjectReview((application as any).enrollment_id, question);
    res.json(review);
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_project_review_route_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
    res.status(500).json({ error: 'Could not review the project.' });
  }
});

/**
 * GET /api/admin/internship/project-readiness
 * The manager's roster: every active intern with their first-three-weeks gate,
 * attendance, and whether they already have a project — so "who is ready for a
 * project" is answerable at a glance.
 */
router.get('/api/admin/internship/project-readiness', requireSection('internship'), async (_req: Request, res: Response) => {
  try {
    const rows = await internshipProjectReadiness();
    res.json({ interns: rows });
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_project_readiness_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
    res.status(500).json({ error: 'Could not load project readiness.' });
  }
});

/**
 * POST /api/admin/internship/applications/:id/author-project
 * Author a project (releases + stories) and assign it to the intern. A fresh,
 * active project is created on their enrollment and the releases/stories are
 * materialised onto their profile — the manager's project-delivery surface.
 */
const authorStorySchema = z.object({
  title: z.string().min(1).max(300),
  narrative: z.string().max(4000).nullish(),
  acceptance: z.array(z.string().max(600)).max(20).nullish(),
  build: z.string().max(20000).nullish(),
  blocked_by: z.array(z.string().max(60)).max(40).optional(),
});
const authorProjectSchema = z.object({
  name: z.string().min(1).max(200),
  industry: z.string().max(120).nullish(),
  releases: z.array(z.object({
    key: z.string().min(1).max(40),
    name: z.string().max(200),
    stories: z.array(authorStorySchema).max(100),
  })).min(1).max(20),
});

router.post('/api/admin/internship/applications/:id/author-project', requireSection('internship'), async (req: Request, res: Response) => {
  try {
    const application = await InternshipApplication.findByPk(String(req.params.id), { attributes: ['id', 'enrollment_id'] });
    if (!application) { res.status(404).json({ error: 'Application not found.' }); return; }
    const parsed = authorProjectSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid project.', issues: parsed.error.issues }); return; }
    // The manual form is the escape hatch, not a second writer. `importProject`
    // writes NOTHING to a project that already has a published plan and returns
    // the existing tree, so without this the reviewer is told their stories were
    // saved when none were. Refuse loudly instead.
    await assertNotGeneratedProject((application as any).enrollment_id);
    const result = await authorAndAssignInternshipProject((application as any).enrollment_id, parsed.data);
    res.json(result);
  } catch (err: any) {
    if (typeof err?.status === 'number' && err.status < 500) {
      res.status(err.status).json({ error: String(err.message) });
      return;
    }
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_author_project_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
    res.status(500).json({ error: 'Could not author the project.' });
  }
});

/**
 * ── GENERATED PROJECTS ─────────────────────────────────────────────────────
 *
 * The admin door onto the Student Build Pipeline. Ali, 2026-09-28: "We will
 * never build projects like this, one story at a time... This is where I need
 * to put my idea process in here. The same process that already exists for
 * creating projects."
 *
 * Every SBP route is participant-scoped and derives the enrollment from the
 * student's own JWT, so a reviewer could not run one on an intern's behalf.
 * These four are that entry, `requireSection('internship')` like the rest of
 * this file, and they call the pipeline's own stages in the pipeline's own
 * order. The sequence is: questions -> generate -> build (poll/review) ->
 * assign.
 */
const projectQuestionsSchema = z.object({
  idea: z.string().min(20).max(6000),
  size: z.enum(['workflow', 'project', 'autonomous']).optional(),
  name: z.string().max(200).nullish(),
}).strict();

const generateProjectSchema = projectQuestionsSchema.extend({
  industry: z.string().max(120).nullish(),
  answers: z.array(z.object({
    id: z.string().max(60),
    question: z.string().max(1000),
    answer: z.string().max(6000),
    angle: z.string().max(60).optional(),
  })).max(20).optional(),
  covered: z.array(z.object({
    angle: z.string().max(60),
    evidence: z.string().max(2000),
  })).max(20).optional(),
}).strict();

const assignProjectSchema = z.object({
  project_id: z.string().uuid(),
  /** The hash of the plan the reviewer actually read. */
  expected_sha256: z.string().regex(/^[0-9a-f]{64}$/).nullish(),
}).strict();

/** Log + answer, with the service's own status when it set one. */
function generationFailure(res: Response, event: string, err: any, fallback: string): void {
  const status = typeof err?.status === 'number' ? err.status : 500;
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: status >= 500 ? 'error' : 'warn', service: 'backend', event,
    outcome: 'failure', error_class: err?.error_class ?? err?.constructor?.name ?? 'Error',
    context: { message: err?.message },
  }));
  res.status(status).json({ error: status >= 500 ? fallback : String(err?.message ?? fallback) });
}

/**
 * POST /api/admin/internship/applications/:id/project/questions
 * The sharpening interview, for the reviewer. Creates nothing.
 */
router.post('/api/admin/internship/applications/:id/project/questions', requireSection('internship'), async (req: Request, res: Response) => {
  const parsed = projectQuestionsSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: 'Describe the project first.', issues: parsed.error.issues }); return; }
  try {
    res.json(await internProjectQuestions(parsed.data));
  } catch (err: any) {
    generationFailure(res, 'internship_project_questions_failed', err, 'Could not generate the questions.');
  }
});

/**
 * POST /api/admin/internship/applications/:id/project/generate
 * Creates the project and starts generation, HELD FOR REVIEW. 202: the plan is
 * not ready when this returns, and the intern cannot see anything yet.
 */
router.post('/api/admin/internship/applications/:id/project/generate', requireSection('internship'), async (req: Request, res: Response) => {
  const parsed = generateProjectSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: 'Invalid project brief.', issues: parsed.error.issues }); return; }
  try {
    const result = await startInternProjectBuild({ applicationId: String(req.params.id), ...parsed.data });
    res.status(202).json(result);
  } catch (err: any) {
    generationFailure(res, 'internship_project_generate_failed', err, 'Could not start the generation.');
  }
});

/**
 * GET /api/admin/internship/applications/:id/project/:projectId/build
 * Poll while it generates, then read what the reviewer is being asked to
 * approve: the plan, its blocking violations and its advisory ones, split here
 * rather than in the browser.
 */
router.get('/api/admin/internship/applications/:id/project/:projectId/build', requireSection('internship'), async (req: Request, res: Response) => {
  try {
    res.json(await internProjectBuild(String(req.params.projectId)));
  } catch (err: any) {
    generationFailure(res, 'internship_project_build_failed', err, 'Could not load the generated plan.');
  }
});

/**
 * POST /api/admin/internship/applications/:id/project/assign
 * The reviewer says yes: publish the reviewed plan, materialise the tasks, make
 * it the intern's active project. `expected_sha256` makes "the plan I read is
 * the plan that shipped" enforced rather than assumed.
 */
router.post('/api/admin/internship/applications/:id/project/assign', requireSection('internship'), async (req: Request, res: Response) => {
  const parsed = assignProjectSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: 'Invalid request.', issues: parsed.error.issues }); return; }
  try {
    const result = await assignGeneratedProject({
      projectId: parsed.data.project_id,
      expectedSha: parsed.data.expected_sha256,
    });
    res.json(result);
  } catch (err: any) {
    generationFailure(res, 'internship_project_assign_failed', err, 'Could not assign the project.');
  }
});

/**
 * The review surface, addressed by the PROJECT rather than by an application.
 *
 *     "We will never build projects like this, one story at a time. We do not create
 *      manually. This is where I need to put my idea process in here. The same process
 *      that already exists for creating projects."  (Ali, 2026-09-29)
 *
 * The conversation intake creates a project for a student who may have no internship
 * application at all, so the four `/applications/:id/project/...` routes above cannot serve
 * it. These two are the same handlers with the honest scope: `internProjectBuild` and
 * `assignGeneratedProject` never read `:id` — they take a project id and always have — so
 * the application in those paths was decorative, and pretending otherwise here would mean
 * inventing an application to satisfy a URL.
 *
 * `requireSection('internship')` deliberately, matching the routes above rather than the
 * `requireAdmin` of the conversation door. Narrowing to `requireAdmin` would take the
 * review away from internship-scoped staff who have it today.
 */
router.get('/api/admin/internship/projects/:projectId/build', requireSection('internship'), async (req: Request, res: Response) => {
  try {
    res.json(await internProjectBuild(String(req.params.projectId)));
  } catch (err: any) {
    generationFailure(res, 'internship_project_build_failed', err, 'Could not load the generated plan.');
  }
});

router.post('/api/admin/internship/projects/:projectId/assign', requireSection('internship'), async (req: Request, res: Response) => {
  const parsed = assignProjectSchema.safeParse({ ...(req.body ?? {}), project_id: String(req.params.projectId) });
  if (!parsed.success) { res.status(400).json({ error: 'Invalid request.', issues: parsed.error.issues }); return; }
  try {
    const result = await assignGeneratedProject({
      projectId: parsed.data.project_id,
      expectedSha: parsed.data.expected_sha256,
    });
    res.json(result);
  } catch (err: any) {
    generationFailure(res, 'internship_project_assign_failed', err, 'Could not assign the project.');
  }
});

/**
 * POST /api/admin/internship/applications/:id/assess
 * Generate the AI assessment on demand (a reviewer clicks Generate), so the LLM
 * cost is paid when a human is actually reviewing, not on every queue load.
 */
router.post('/api/admin/internship/applications/:id/assess', requireSection('internship'), async (req: Request, res: Response) => {
  try {
    const assessment = await assessApplicant(String(req.params.id));
    res.json(assessment);
  } catch (err: any) {
    if (err?.message === 'application_not_found') {
      res.status(404).json({ error: 'Application not found.' });
      return;
    }
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_assess_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
    res.status(500).json({ error: 'Could not generate the assessment.' });
  }
});

/** POST /api/admin/internship/applications/:id/decide */
router.post('/api/admin/internship/applications/:id/decide', requireSection('internship'), async (req: Request, res: Response) => {
  const parsed = decideSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid decision.', issues: parsed.error.issues });
    return;
  }

  // The reviewer's identity comes from the TOKEN, never the body. A `decided_by`
  // field in the request would let one admin record a decision under another's
  // name, in a table whose whole purpose is saying who decided.
  const decidedBy = (req.admin as any)?.email
    ?? (req.admin as any)?.sub
    ?? 'unknown-admin';

  try {
    const application = await InternshipApplication.findByPk(String(req.params.id));
    if (!application) { res.status(404).json({ error: 'Application not found.' }); return; }

    const result = await decide({
      application,
      decision: parsed.data.decision,
      reasonCode: parsed.data.reason_code ?? '',
      studentMessage: parsed.data.student_message,
      reviewerNotes: parsed.data.reviewer_notes,
      conditions: parsed.data.conditions,
      decidedBy: String(decidedBy),
    });

    if (!result.ok) {
      res.status(400).json({ error: result.error, field: result.field });
      return;
    }
    res.json(result);
  } catch (err: any) {
    if (err instanceof InvalidInternshipTransitionError) {
      res.status(409).json({
        error: 'That decision is not available from this application\'s current status.',
        error_class: err.error_class,
      });
      return;
    }
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_decide_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message, application_id: String(req.params.id) },
    }));
    res.status(500).json({ error: 'Could not record that decision.' });
  }
});

const verifySchema = z.object({
  accept: z.boolean(),
  rejection_reason: z.string().max(2000).nullish(),
}).strict();

/** GET /api/admin/internship/applications/:id/documents */
router.get('/api/admin/internship/applications/:id/documents', requireSection('internship'), async (req: Request, res: Response) => {
  try {
    const applicationId = String(req.params.id);
    const [rows, outstanding] = await Promise.all([
      documentsFor(applicationId),
      outstandingRequirements(applicationId),
    ]);
    res.json({
      ...outstanding,
      documents: rows.map((d) => ({
        id: d.id,
        document_type: d.document_type,
        kind: d.kind,
        revision: d.revision,
        status: d.status,
        original_filename: d.original_filename,
        mime_type: d.mime_type,
        byte_size: d.byte_size,
        // The hash, not the file. A reviewer comparing two revisions wants to know
        // whether they differ, and the first 12 hex characters answer that on sight.
        checksum_short: d.checksum_sha256 ? d.checksum_sha256.slice(0, 12) : null,
        document_public_id: d.document_public_id,
        verified_by: d.verified_by,
        verified_at: d.verified_at ? new Date(d.verified_at).toISOString() : null,
        rejection_reason: d.rejection_reason,
        created_at: new Date(d.created_at).toISOString(),
      })),
    });
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_admin_documents_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
    res.status(500).json({ error: 'Could not load the documents.' });
  }
});

/**
 * GET /api/admin/internship/documents/:documentId/file
 *
 * A reviewer has to actually LOOK at a signed page to verify it, so this streams
 * the stored file. `storage_key` comes from the database and is a UUID filename we
 * generated, never anything the applicant supplied — and `path.basename` is applied
 * anyway, so a corrupted row cannot become a path traversal.
 */
router.get('/api/admin/internship/documents/:documentId/file', requireSection('internship'), async (req: Request, res: Response) => {
  try {
    const InternshipDocument = (await import('../../models/InternshipDocument')).default;
    const row = await InternshipDocument.findByPk(String(req.params.documentId));
    if (!row?.storage_key) { res.status(404).json({ error: 'Document not found.' }); return; }

    const safeName = path.basename(row.storage_key);
    const full = path.join(SIGNED_DOC_DIR, safeName);
    if (!fs.existsSync(full)) { res.status(404).json({ error: 'File is missing from storage.' }); return; }

    res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    fs.createReadStream(full).pipe(res);
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_admin_file_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
    res.status(500).json({ error: 'Could not open the file.' });
  }
});

/** POST /api/admin/internship/documents/:documentId/verify */
router.post('/api/admin/internship/documents/:documentId/verify', requireSection('internship'), async (req: Request, res: Response) => {
  const parsed = verifySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request.', issues: parsed.error.issues });
    return;
  }

  const reviewerId = String((req.admin as any)?.email ?? (req.admin as any)?.sub ?? 'unknown-admin');

  try {
    const InternshipDocument = (await import('../../models/InternshipDocument')).default;
    const doc = await InternshipDocument.findByPk(String(req.params.documentId));
    if (!doc) { res.status(404).json({ error: 'Document not found.' }); return; }

    const application = await InternshipApplication.findByPk(doc.application_id);
    if (!application) { res.status(404).json({ error: 'Application not found.' }); return; }

    const result = await verifyDocument({
      application,
      documentId: doc.id,
      accept: parsed.data.accept,
      reviewerId,
      rejectionReason: parsed.data.rejection_reason,
    });

    if (!result.ok) { res.status(400).json({ error: result.error }); return; }
    res.json(result);
  } catch (err: any) {
    if (err instanceof InvalidInternshipTransitionError) {
      res.status(409).json({ error: "That is not available from this application’s current status." });
      return;
    }
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_verify_document_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
    res.status(500).json({ error: 'Could not record that.' });
  }
});

/** GET /api/admin/internship/applications/:id/onboarding */
router.get('/api/admin/internship/applications/:id/onboarding', requireSection('internship'), async (req: Request, res: Response) => {
  try {
    const application = await InternshipApplication.findByPk(String(req.params.id));
    if (!application) { res.status(404).json({ error: 'Application not found.' }); return; }
    const view = await activeInternView(application);
    res.json({ state: application.state, ...view });
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_admin_onboarding_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
    res.status(500).json({ error: 'Could not load onboarding.' });
  }
});

/**
 * POST /api/admin/internship/applications/:id/activate
 *
 * The ONLY route that puts someone in the internship cohort. Reviewer-gated, and
 * it refuses with the outstanding blockers rather than a bare error, so the
 * reviewer sees WHY — most often an unverified document or an inactive membership.
 */
router.post('/api/admin/internship/applications/:id/activate', requireSection('internship'), async (req: Request, res: Response) => {
  const actorId = String((req.admin as any)?.email ?? (req.admin as any)?.sub ?? 'unknown-admin');
  try {
    const application = await InternshipApplication.findByPk(String(req.params.id));
    if (!application) { res.status(404).json({ error: 'Application not found.' }); return; }

    const result = await activate({ application, actor: 'reviewer', actorId });

    if (!result.ok && result.reason === 'blocked') {
      res.status(409).json({
        error: 'Not ready to activate yet.',
        blockers: result.blockers.map((b) => ({ key: b.key, label: b.label, waiting_on: b.waiting_on })),
      });
      return;
    }
    if (!result.ok) {
      res.status(409).json({ error: `Cannot activate from ${result.state}.` });
      return;
    }

    const checklist = await buildChecklist(application);
    res.json({ ...result, checklist });
  } catch (err: any) {
    if (err instanceof InvalidInternshipTransitionError) {
      res.status(409).json({ error: 'That is not available from this status.' });
      return;
    }
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_activate_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message, application_id: String(req.params.id) },
    }));
    res.status(500).json({ error: 'Could not activate.' });
  }
});

// ── Phase 7: tracking, KPIs, and existing-intern conversion ─────────────────

/** GET /api/admin/internship/kpis */
router.get('/api/admin/internship/kpis', requireSection('internship'), async (_req: Request, res: Response) => {
  try {
    res.json({ kpis: await internshipKpis() });
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_kpis_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
    res.status(500).json({ error: 'Could not load the KPIs.' });
  }
});

/** GET /api/admin/internship/profile/:enrollmentId */
router.get('/api/admin/internship/profile/:enrollmentId', requireSection('internship'), async (req: Request, res: Response) => {
  try {
    res.json(await internshipProfileSection(String(req.params.enrollmentId)));
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_profile_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
    res.status(500).json({ error: 'Could not load the internship profile.' });
  }
});

const internSchema = z.object({
  email: z.string().email().max(255),
  full_name: z.string().max(255).nullish(),
  started_on: z.string().max(20).nullish(),
  interview_grandfathered: z.boolean().optional(),
  documents_already_verified: z.boolean().optional(),
  notes: z.string().max(1000).nullish(),
}).strict();

const conversionPlanSchema = z.object({
  interns: z.array(internSchema).min(1).max(200),
}).strict();

/**
 * POST /api/admin/internship/conversion/plan
 *
 * THE DRY RUN. Writes nothing and sends nothing — `planConversion` contains no
 * write statement at all, which is the guarantee rather than a flag it honours.
 */
router.post('/api/admin/internship/conversion/plan', requireSection('internship'), async (req: Request, res: Response) => {
  const parsed = conversionPlanSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid roster.', issues: parsed.error.issues });
    return;
  }
  try {
    res.json(await planConversion({ interns: parsed.data.interns }));
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_conversion_plan_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
    res.status(500).json({ error: 'Could not build the conversion plan.' });
  }
});

/**
 * POST /api/admin/internship/conversion/commit
 *
 * Re-plans from the submitted roster and commits THAT, rather than trusting a plan
 * posted back by the browser. A plan is a read of the database at a moment in
 * time; accepting one from a client would let a stale or edited plan decide who
 * gets added to the cohort.
 *
 * `confirm: true` is required so a commit cannot be a mis-click on the dry run.
 */
const conversionCommitSchema = conversionPlanSchema.extend({
  confirm: z.literal(true),
}).strict();

router.post('/api/admin/internship/conversion/commit', requireSection('internship'), async (req: Request, res: Response) => {
  const parsed = conversionCommitSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request.', issues: parsed.error.issues });
    return;
  }
  const actorId = String((req.admin as any)?.email ?? (req.admin as any)?.sub ?? 'unknown-admin');
  try {
    const plan = await planConversion({ interns: parsed.data.interns });
    const report = await commitConversion({ plan, actorId });
    res.json({ plan_summary: plan.summary, ...report });
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_conversion_commit_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
    res.status(500).json({ error: 'Could not commit the conversion.' });
  }
});

export default router;
