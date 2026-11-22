import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { requireCareerPrep } from './careerPrepRoutes';
import { logFailure, sendValidated } from './campusRoutes';
import { getInbox, listReceived, saveInboxAddress } from '../services/placement/inboxService';
import { sendTest } from '../services/placement/inboxTestJob';

/**
 * Career Prep v27, CP6.1 (kit F2): the student's job-search inbox, behind the same two gates as every Career Prep route
 * (a participant session, and Career Prep on for that enrollment). Everything is the caller's own: the enrollment comes
 * only from the token. Mounted through boot/placementBoot.ts.
 *
 *   GET /api/portal/career-prep/inbox            the address, its health and the four setup steps
 *   PUT /api/portal/career-prep/inbox            { address }: Gmail only; 409 if another learner already uses that inbox
 *   GET /api/portal/career-prep/inbox/received   "Everything it received", newest first
 *   POST /api/portal/career-prep/inbox/test      {}: send a forwarding test now (409 while the tests switch is off)
 */
const iso = z.string().datetime().nullable();
const InboxViewSchema = z.object({
  address: z.string().nullable(),
  health: z.enum(['setup', 'broken', 'quiet', 'untested', 'healthy']),
  healthLabel: z.string(),
  verifiedAt: iso, forwardingConfirmedAt: iso, lastReceivedAt: iso, lastTestAt: iso,
  lastTestMs: z.number().int().min(0).nullable(),
  receivedThisMonth: z.number().int().min(0),
  steps: z.object({ create: z.boolean(), added: z.boolean(), forwarding: z.boolean(), tested: z.boolean() }).strict(),
}).strict();
export const InboxResponse = z.object({ inbox: InboxViewSchema }).strict();
export const ReceivedResponse = z.object({
  items: z.array(z.object({
    messageId: z.string(), receivedAt: z.string().datetime(), fromName: z.string().nullable(), subject: z.string().nullable(),
    category: z.string().nullable(), confidence: z.number().min(0).max(1).nullable(), outcome: z.string().nullable(),
  }).strict()),
}).strict();

const PutBody = z.object({ address: z.string().trim().min(3).max(254) }).strict();
const ReceivedQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }).strict();
const REASON: Record<string, string> = {
  empty: 'Enter the Gmail address you made for your job search.',
  not_gmail: 'Use a Gmail address: the forwarding steps are Gmail\'s.',
  invalid: 'That does not look like a Gmail address. Check it and try again.',
};

export async function getInboxRoute(req: Request, res: Response): Promise<void> {
  try { sendValidated(res, InboxResponse, { inbox: await getInbox(req.participant!.sub) }, 'career_prep_inbox'); } catch (err) {
    logFailure('career_prep_inbox_read_failed', err);
    res.status(500).json({ error: 'Could not load your job-search inbox.' });
  }
}

export async function putInboxRoute(req: Request, res: Response): Promise<void> {
  const b = PutBody.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: REASON.empty }); return; }
  try {
    const r = await saveInboxAddress(req.participant!.sub, b.data.address);
    if (r.status === 'invalid') { res.status(400).json({ error: REASON[r.reason] ?? REASON.invalid }); return; }
    if (r.status === 'taken') { res.status(409).json({ error: 'Another learner already uses that Gmail inbox. Make one just for your own job search.' }); return; }
    sendValidated(res, InboxResponse, { inbox: r.inbox }, 'career_prep_inbox_save');
  } catch (err) {
    logFailure('career_prep_inbox_save_failed', err);
    res.status(500).json({ error: 'Could not save the address. Try again.' });
  }
}

export async function getReceivedRoute(req: Request, res: Response): Promise<void> {
  const q = ReceivedQuery.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: 'limit must be 1 to 200.' }); return; }
  try { sendValidated(res, ReceivedResponse, { items: await listReceived(req.participant!.sub, q.data.limit) }, 'career_prep_inbox_received'); } catch (err) {
    logFailure('career_prep_inbox_received_failed', err);
    res.status(500).json({ error: 'Could not load what your inbox received.' });
  }
}

const TestBody = z.object({}).strict();
export const TestResponse = z.object({ test: z.object({ status: z.enum(['sent', 'already_today']) }).strict(), inbox: InboxViewSchema }).strict();
const TEST_REFUSAL: Record<string, [number, string]> = {
  switched_off: [409, 'Inbox tests are switched off'],
  no_inbox: [409, 'Add your job-search address first.'],
  failed: [502, 'Could not send the test. Try again in a moment.'],
};

/** CP6.1c step 4: send a test now. Gated server-side by career_prep_inbox_tests_enabled (inboxTestJob.sendTest). */
export async function postTestRoute(req: Request, res: Response): Promise<void> {
  if (!TestBody.safeParse(req.body ?? {}).success) { res.status(400).json({ error: 'Send an empty body.' }); return; }
  try {
    const r = await sendTest(req.participant!.sub);
    const refusal = TEST_REFUSAL[r.status];
    if (refusal) { res.status(refusal[0]).json({ error: refusal[1] }); return; }
    sendValidated(res, TestResponse, { test: { status: r.status as 'sent' | 'already_today' }, inbox: await getInbox(req.participant!.sub) }, 'career_prep_inbox_test');
  } catch (err) {
    logFailure('career_prep_inbox_test_failed', err);
    res.status(500).json({ error: 'Could not send the test. Try again in a moment.' });
  }
}

const router = Router();
router.get('/api/portal/career-prep/inbox', requireParticipant, requireCareerPrep, getInboxRoute);
router.put('/api/portal/career-prep/inbox', requireParticipant, requireCareerPrep, putInboxRoute);
router.get('/api/portal/career-prep/inbox/received', requireParticipant, requireCareerPrep, getReceivedRoute);
router.post('/api/portal/career-prep/inbox/test', requireParticipant, requireCareerPrep, postTestRoute);
export default router;
