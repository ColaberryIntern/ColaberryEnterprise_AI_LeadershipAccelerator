/**
 * Admin, Enterprise clients (W32, Phase 5): every "Book a demo pilot" intake from form to
 * signed, and the steps a person takes on it.
 *
 *     "manage the client until they become an actual customer and then they get their own
 *      project"  (Ali, 2026-11-20)
 *
 * Reads are the list and one client. Writes are the deliberate actions in
 * enterpriseIntakeActions (send the options email, draft and send the proposal, mark signed
 * or lost). Nothing here sends anything by itself.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { isCoryAuthorizedIdentity, requireAdmin } from '../../middlewares/authMiddleware';
import EnterpriseIntake from '../../models/EnterpriseIntake';
import ProjectUnderstandingRecord from '../../models/ProjectUnderstandingRecord';
import { env } from '../../config/env';
import { stageOf } from '../../services/enterpriseIntake/enterpriseIntakeSync';
import {
  ActionRefused,
  PRICE_PLACEHOLDER,
  draftProposal,
  markLost,
  markSigned,
  sendOptionsEmail,
  sendProposal,
} from '../../services/enterpriseIntake/enterpriseIntakeActions';

const router = Router();

/**
 * Ali, 2026-11-20: "proposals Ali only". Sending a proposal and marking a client signed (which
 * opens their Basecamp project) are Ali's alone; every other step stays open to admins. Runs after
 * requireAdmin, which verified the token and set req.admin. "Ali" is the repo's one definition of
 * it: ali@colaberry.com or the owner role (super_admin).
 */
function requireAli(req: Request, res: Response, next: NextFunction): void {
  if (isCoryAuthorizedIdentity(req.admin)) return next();
  res.status(403).json({ error: 'Only Ali can send a proposal or mark a client signed.' });
}
const BASE = '/api/admin/enterprise-clients';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const listUrl = (i: EnterpriseIntake) =>
  i.bc_todolist_id && env.enterpriseIntakeBcProjectId
    ? `https://3.basecamp.com/3945211/buckets/${env.enterpriseIntakeBcProjectId}/todolists/${i.bc_todolist_id}`
    : null;

const yearly = (h: unknown) => (h === null || h === undefined ? null : Math.round(Number(h) * 52));

function summary(i: EnterpriseIntake) {
  return {
    id: i.id,
    company: i.company,
    fullName: i.full_name,
    role: i.role,
    email: i.email,
    stage: stageOf(i),
    service: i.service,
    startTiming: i.start_timing,
    peopleCount: i.people_count,
    hoursPerWeek: i.hours_per_week === null ? null : Number(i.hours_per_week),
    hoursPerYear: yearly(i.hours_per_week),
    createdAt: i.createdAt,
    interviewedAt: i.interviewed_at,
    basecampUrl: listUrl(i),
  };
}

router.get(BASE, requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await EnterpriseIntake.findAll({ order: [['created_at', 'DESC']], limit: 500 });
    res.json({ clients: rows.map(summary) });
  } catch (err) {
    next(err);
  }
});

router.get(`${BASE}/:id`, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!UUID.test(String(req.params.id))) return res.status(404).json({ error: 'No such client' });
    const i = await EnterpriseIntake.findByPk(String(req.params.id));
    if (!i) return res.status(404).json({ error: 'No such client' });
    const record = i.understanding_id ? await ProjectUnderstandingRecord.findByPk(i.understanding_id) : null;
    res.json({
      client: {
        ...summary(i),
        phone: i.phone,
        website: i.website,
        department: i.department,
        process: i.process,
        requiredReturn: i.required_return,
        otherDeciders: i.other_deciders,
        leadId: i.lead_id,
        callConsent: i.call_consent,
        interviewedVia: i.interviewed_via,
        writeup: ((record?.items as Array<{ dimension: string; value: string }>) || []).map((x) => ({ dimension: x.dimension, value: x.value })),
        transcript: i.transcript,
        research: i.research,
        pilotOptions: i.pilot_options,
        optionsEmail: { subject: i.options_email_subject, body: i.options_email_body, sentAt: i.options_email_sent_at },
        proposal: { subject: i.proposal_subject, body: i.proposal_body, draftedAt: i.proposal_drafted_at, sentAt: i.proposal_sent_at },
        signedAt: i.signed_at,
        lostAt: i.lost_at,
        lostReason: i.lost_reason,
        projectUrl: i.bc_project_id ? `https://3.basecamp.com/3945211/projects/${i.bc_project_id}` : null,
        pricePlaceholder: PRICE_PLACEHOLDER,
        // v2: what the client planned in their visit, and whether Ali's brief went out.
        plan: {
          interviewMode: i.interview_mode || null,
          interviewScheduledFor: i.interview_scheduled_for,
          meeting: i.meeting_start ? { start: i.meeting_start, end: i.meeting_end, link: i.meeting_link } : null,
          files: (i.client_files || []).map((f) => ({ name: f.name, size: f.size, chars: f.chars, uploadedAt: f.uploaded_at })),
          aliBriefSentAt: i.ali_brief_sent_at,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

const messageSchema = z.object({ subject: z.string().trim().min(1).max(255), body: z.string().trim().min(1).max(10000) });
const lostSchema = z.object({ reason: z.string().trim().max(500).default('') });

/** One shape for every action: 200 with the result, or the refusal's status and its reason. */
const act =
  (fn: (id: string, body: unknown) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!UUID.test(String(req.params.id))) return res.status(404).json({ error: 'No such client' });
      res.json({ ok: true, result: await fn(String(req.params.id), req.body) });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: 'The subject and the message are both needed' });
      if (err instanceof ActionRefused) return res.status(err.status).json({ error: err.message });
      next(err);
    }
  };

router.post(`${BASE}/:id/options-email`, requireAdmin, act((id, b) => {
  const m = messageSchema.parse(b);
  return sendOptionsEmail(id, m.subject, m.body);
}));
router.post(`${BASE}/:id/proposal/draft`, requireAdmin, act((id) => draftProposal(id)));
router.post(`${BASE}/:id/proposal/send`, requireAdmin, requireAli, act((id, b) => {
  const m = messageSchema.parse(b);
  return sendProposal(id, m.subject, m.body);
}));
router.post(`${BASE}/:id/signed`, requireAdmin, requireAli, act((id) => markSigned(id)));
router.post(`${BASE}/:id/lost`, requireAdmin, act((id, b) => markLost(id, lostSchema.parse(b || {}).reason)));

export default router;
