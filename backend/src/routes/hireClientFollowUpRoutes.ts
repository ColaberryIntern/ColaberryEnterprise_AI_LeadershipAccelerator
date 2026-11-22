import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { logFailure, sendValidated } from './campusRoutes';
import { requireHireClient, type ClientRequest } from '../services/placement/clientAuth';
import * as clients from '../services/placement/clientStore';
import * as store from '../services/placement/followUpStore';
import { draftProblem, MAX_BODY, MAX_LINK, MAX_SUBJECT, ONLY_IF, sendOnProblem, TEMPLATES } from '../services/placement/followUpRules';
import { isSwitchOn, SWITCHES, type Read } from '../services/placement/darkSwitches';

/**
 * Career Prep v27, CP10.3 (kit F8 "Follow-ups"): the employer portal's follow-ups. Behind the same guard as every other
 * /api/hire/client/* route (requireHireClient: switch hire_client_portal_enabled, a session, the member still present),
 * and scoped in SQL by the session's client.
 *
 *   GET  /api/hire/client/follow-ups              this client's follow-ups (to, subject, when, status, opens and clicks),
 *                                                 and mailOn: whether employer email is switched on right now (off: due
 *                                                 follow-ups are held, not sent; the page says so)
 *   POST /api/hire/client/follow-ups              schedule one: id is the idempotency key (a retry stores one: 200
 *                                                 replay); the candidate must be put forward to THIS client and an offerId
 *                                                 must be this client's offer for that candidate (404); the message rules
 *                                                 (followUpRules.ts) and the send time are checked first (400 with the
 *                                                 reason). sendNow: due at once, sent by the next pass (within 5 minutes).
 *   POST /api/hire/client/follow-ups/:id/cancel   cancel one still waiting to go (409 once it is sending or done)
 * Never answers the candidate's address. Inputs: Zod, strict (unknown keys, such as attachments, are 400).
 */
const uuid = z.string().uuid();
export const ScheduleBody = z.object({
  id: uuid,
  enrollmentId: uuid,
  offerId: uuid.nullable().optional(),
  template: z.enum(TEMPLATES),
  subject: z.string().max(MAX_SUBJECT * 2),
  body: z.string().max(MAX_BODY * 2),
  bookingLink: z.string().max(MAX_LINK * 2).nullable().optional(),
  sendOn: z.string().datetime().nullable().optional(),
  sendNow: z.boolean().optional(),
  onlyIf: z.enum(ONLY_IF),
}).strict();

const iso = z.string().datetime();
const FollowUp = z.object({ id: uuid, enrollmentId: uuid, candidateName: z.string(), subject: z.string(), template: z.enum(TEMPLATES), sendOn: iso, onlyIf: z.enum(ONLY_IF),
  status: z.enum(['scheduled', 'sending', 'sent', 'opened', 'clicked', 'replied', 'cancelled', 'failed', 'held']), reason: z.string().nullable(), retrying: z.boolean(),
  sentAt: iso.nullable(), opens: z.number().int().min(0), clicks: z.object({ link: z.number().int().min(0), other: z.number().int().min(0) }).strict() }).strict();
export const FollowUpsResponse = z.object({ followUps: z.array(FollowUp), mailOn: z.boolean() }).strict();
export const FollowUpResponse = z.object({ followUp: FollowUp, replay: z.boolean(), mailOn: z.boolean() }).strict();

const NOT_FOUND = { error: 'Not found' };
const isoOf = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);
const n = (v: unknown) => Math.max(0, Math.trunc(Number(v) || 0));

/** A stored row as the portal shows it. "Replied" when the candidate answered one of this client's offers after it went. */
export function followUpView(r: store.FollowUpRow): z.infer<typeof FollowUp> {
  const engaged = ['sent', 'opened', 'clicked'].includes(r.status);
  return { id: r.id, enrollmentId: r.enrollment_id, candidateName: r.full_name || 'Candidate', subject: r.subject, template: r.template as z.infer<typeof FollowUp>['template'],
    sendOn: new Date(r.send_on).toISOString(), onlyIf: r.only_if as z.infer<typeof FollowUp>['onlyIf'],
    status: (engaged && r.replied ? 'replied' : r.status) as z.infer<typeof FollowUp>['status'], reason: r.status_reason ?? null,
    retrying: r.status === 'scheduled' && Number(r.attempts) > 0, sentAt: isoOf(r.sent_at), opens: n(r.opens), clicks: { link: n(r.clicks?.link), other: n(r.clicks?.other) } };
}

type Handler = (req: ClientRequest, res: Response, read?: Read) => Promise<void>;
const data = (event: string, run: Handler, read?: Read) => async (req: Request, res: Response): Promise<void> => {
  try { await run(req as ClientRequest, res, read); } catch (err) {
    logFailure(`hire_client_${event}_failed`, err);
    res.status(500).json({ error: 'Could not load this right now. Try again in a moment.' });
  }
};

const list: Handler = async (req, res, read) => {
  const [rows, mailOn] = await Promise.all([store.clientFollowUps(req.hireClient!.clientId), isSwitchOn(SWITCHES.employerMail, read)]);
  sendValidated(res, FollowUpsResponse, { followUps: rows.map(followUpView), mailOn }, 'hire_client_follow_ups');
};

/** The first reason this request cannot be stored, or null. */
function requestProblem(b: z.infer<typeof ScheduleBody>, now: Date): string | null {
  if (b.sendNow !== true && !b.sendOn) return 'Pick a send time, or send it now.';
  if (b.sendNow === true && b.sendOn) return 'Pick a send time, or send it now, not both.';
  return draftProblem({ subject: b.subject, body: b.body, bookingLink: b.bookingLink ?? null }) ?? (b.sendOn ? sendOnProblem(new Date(b.sendOn), now) : null);
}

const schedule: Handler = async (req, res, read) => {
  const p = ScheduleBody.safeParse(req.body ?? {});
  if (!p.success) { res.status(400).json({ error: p.error.issues[0]?.code === 'unrecognized_keys' ? 'Attachments and other extras cannot be sent with a follow-up.' : 'Check the follow-up and try again.' }); return; }
  const b = p.data; const s = req.hireClient!; const now = new Date();
  const problem = requestProblem(b, now);
  if (problem) { res.status(400).json({ error: problem }); return; }
  if (!(await clients.clientCandidate(s.clientId, b.enrollmentId))) { res.status(404).json(NOT_FOUND); return; }
  if (b.offerId && !(await clients.clientOffers(s.clientId)).some((o) => o.id === b.offerId && o.enrollment_id === b.enrollmentId)) { res.status(404).json(NOT_FOUND); return; }
  const fresh = await store.insertFollowUp({ id: b.id, clientId: s.clientId, memberId: s.memberId, enrollmentId: b.enrollmentId, offerId: b.offerId ?? null,
    subject: b.subject.trim(), body: b.body, bookingLink: b.bookingLink?.trim() || null, template: b.template, sendOn: b.sendNow ? now : new Date(String(b.sendOn)),
    onlyIf: b.onlyIf, createdBy: `hire_client_member:${s.memberId}` });
  // Re-read through THIS client's scope: an id already used by another client finds nothing here (404).
  const [row] = await store.clientFollowUps(s.clientId, b.id);
  if (!row) { res.status(404).json(NOT_FOUND); return; }
  res.status(fresh ? 201 : 200);
  sendValidated(res, FollowUpResponse, { followUp: followUpView(row), replay: !fresh, mailOn: await isSwitchOn(SWITCHES.employerMail, read) }, 'hire_client_follow_up');
};

const cancel: Handler = async (req, res) => {
  const id = uuid.safeParse(req.params.id);
  if (!id.success) { res.status(404).json(NOT_FOUND); return; }
  const s = req.hireClient!;
  if (await store.cancelFollowUp(s.clientId, id.data)) { res.json({ cancelled: true }); return; }
  const [row] = await store.clientFollowUps(s.clientId, id.data);
  if (!row) { res.status(404).json(NOT_FOUND); return; }
  res.status(409).json({ error: 'This follow-up is no longer waiting to go, so it cannot be cancelled.' });
};

export function createHireClientFollowUpRouter(opts: { read?: Read; portalRead?: Read } = {}): Router {
  const r = Router();
  const guard = requireHireClient(opts.portalRead);
  r.use('/api/hire/client/follow-ups', (_req: Request, res: Response, next: () => void) => { res.set('Cache-Control', 'no-store'); next(); });
  r.get('/api/hire/client/follow-ups', guard, data('follow_ups', list, opts.read));
  r.post('/api/hire/client/follow-ups', guard, data('schedule_follow_up', schedule, opts.read));
  r.post('/api/hire/client/follow-ups/:id/cancel', guard, data('cancel_follow_up', cancel, opts.read));
  return r;
}

export default createHireClientFollowUpRouter();
