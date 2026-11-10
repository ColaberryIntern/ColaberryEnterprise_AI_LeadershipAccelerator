import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { buildBriefFor, UnknownInternError } from '../../services/internship/nudgeBrief/build';
import { sendBrief } from '../../services/internship/nudgeBrief/send';
import { briefProblems } from '../../services/internship/nudgeBrief/types';

/**
 * The admin surface for per-intern nudge briefs.
 *
 * ## Why these are separate routes from `/api/admin/agent-nudges`
 *
 * That router is keyed on an agent DOMAIN and refuses anyone who does not own one, which is the
 * whole reason the Agent nudges tab showed seven people out of fourteen. These are keyed on an
 * ENROLLMENT, so a gov-contract intern, an intern with no project at all, and an agent builder are
 * all addressable by the same route. The two coexist: the weekday run still drives the domain
 * nudges, and this is the on-demand, full-detail, every-intern path.
 *
 * ## There is no bulk send here, on purpose
 *
 * A brief is long, specific, and partly a judgement call about somebody's job. "Send to all" is
 * right for a three-line check-in and wrong for thirteen detailed messages a manager has not read.
 * The bulk button stays on the agent-nudge route where the message is short and uniform.
 *
 * ## Section is `internship`
 *
 * Every response carries an intern's name, their email, their project and the text of their own
 * messages to us. That is applicant data, so it sits on the wider `internship` section exactly as
 * `agentNudgeRoutes` does, and for the reason given in that file's header.
 *
 * `scripts/lint-route-auth.js` is a per-FILE check, so `__tests__/internNudgeRoutes.access.test.ts`
 * enumerates both routes and asserts each one individually.
 */
const router = Router();

const sendSchema = z.object({
  send: z.boolean().optional(),
  /** The exact text shown on screen. Required on a real send: we deliver what was approved. */
  body: z.string().min(1).max(20000).optional(),
  subject: z.string().min(1).max(300).optional(),
  /**
   * The `generatedAt` of the brief the manager actually read. The server regenerates to recover the
   * recipient and the idempotency key, so without this the staleness check would always compare
   * against a timestamp one millisecond old and never fire.
   */
  generatedAt: z.string().datetime().optional(),
}).strict();

function fail(res: Response, event: string, err: unknown, message: string): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'intern-nudge-brief', event,
    outcome: 'failure', error_class: (err as any)?.name ?? 'Error',
    context: { message: String((err as any)?.message ?? err).slice(0, 300) },
  }));
  res.status(500).json({ error: message });
}

/**
 * GET /api/admin/intern-nudges/:enrollmentId
 *
 * Generate this intern's brief from the database, right now. This is the "click the row and get
 * live information" path: nothing is cached, so the message always describes the person as they are
 * at the moment it is opened rather than as the page's last load found them.
 *
 * It costs a narrowed run of the report pipeline, which is why it is per-intern and on demand
 * rather than folded into the roster.
 */
router.get(
  '/api/admin/intern-nudges/:enrollmentId',
  requireSection('internship'),
  async (req: Request, res: Response) => {
    try {
      const brief = await buildBriefFor(String(req.params.enrollmentId));
      res.json({ brief });
    } catch (err: any) {
      if (err instanceof UnknownInternError) {
        res.status(404).json({ error: 'That is not an active intern.' });
        return;
      }
      fail(res, 'intern_brief_build_failed', err, 'Could not build that brief.');
    }
  },
);

/**
 * POST /api/admin/intern-nudges/:enrollmentId
 *
 * Send it. Previews unless `send: true`, matching every other nudge route on this console.
 *
 * The body is regenerated here ONLY to recover the recipient and the idempotency key; the text that
 * goes out is the `body` the client posted, which is the text the manager actually read and may
 * have edited. Delivering a freshly generated message would mean approving one thing and sending
 * another, which is the one failure this screen must not have.
 */
router.post(
  '/api/admin/intern-nudges/:enrollmentId',
  requireSection('internship'),
  async (req: Request, res: Response) => {
    const parsed = sendSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid send request.', issues: parsed.error.issues });
      return;
    }
    const dryRun = parsed.data.send !== true;
    try {
      const fresh = await buildBriefFor(String(req.params.enrollmentId));
      // Age is measured from when the MANAGER's copy was generated, not from this regeneration.
      const brief = { ...fresh, generatedAt: parsed.data.generatedAt ?? fresh.generatedAt };
      const body = parsed.data.body ?? brief.body;
      const subject = parsed.data.subject ?? brief.subject;

      const problems = briefProblems(body);
      if (problems.length) {
        res.status(400).json({ error: `That message would be refused by the sender: ${problems.join('; ')}` });
        return;
      }

      const outcome = await sendBrief({ brief, body, subject, dryRun });
      res.json(outcome);
    } catch (err: any) {
      if (err instanceof UnknownInternError) {
        res.status(404).json({ error: 'That is not an active intern.' });
        return;
      }
      fail(res, 'intern_brief_send_failed', err, 'Could not send that message.');
    }
  },
);

export default router;
