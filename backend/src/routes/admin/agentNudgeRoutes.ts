import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import {
  previewAgentNudges, sendAllNudges, sendOneNudge,
} from '../../services/internship/agentNudgeSend';

/**
 * The admin surface for agent-builder nudges.
 *
 * Ali, 23 Oct: "I would like to create a nudge system, but one that is actually looking at what
 * they are doing... I want to send out a message M-F but they need to be different each time...
 * You can send it out but only to the 7 working on the Agent projects."
 *
 * ## Why this is its own router and not three more handlers in `agentDomainRoutes`
 *
 * That file is 408 lines and read-only by charter: its own header says it "provisions nothing,
 * approves nothing, and writes nothing". These routes send email. Folding a send path into a file
 * that documents itself as a pure read surface would make the next reader of that header wrong,
 * and would push it past the 500-line ceiling in `CLAUDE.md` on the same change.
 *
 * ## The section is `internship`, not `program`
 *
 * `agentDomainRoutes` splits these two deliberately and says why: intern names are applicant data,
 * so `program` sees the ten domains with a builder *state* while only `internship` learns who.
 * Every response here carries a builder's first name and their email address, which is a wider
 * grant than the names route, so it sits on the wider section. Putting a nudge button on the
 * `program`-gated All Domains page would hand every programme viewer the roster that split exists
 * to withhold.
 *
 * ## Sending requires `send: true`
 *
 * Every POST previews unless it is told otherwise, matching the internship console's own nudge
 * route. A mistaken or replayed call renders the message instead of mailing seven people, and the
 * console asks for the preview first so a manager reads the words before anybody else does.
 *
 * `scripts/lint-route-auth.js` is a per-FILE check, so it would pass this file if only one route
 * carried a guard. `__tests__/agentNudgeRoutes.access.test.ts` therefore enumerates all three and
 * asserts each one individually.
 */

const router = Router();

/**
 * Defaults to a DRY RUN on both POSTs. `.strict()` so a typo'd field is a 400 rather than a
 * silently ignored instruction - `{ sends: true }` must not read as a preview request.
 */
const sendSchema = z.object({
  send: z.boolean().optional(),
}).strict();

/** The shared failure shape, so one handler's error cannot leak a stack to the console. */
function fail(res: Response, event: string, err: any, message: string): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    service: 'backend',
    event,
    outcome: 'failure',
    error_class: err?.constructor?.name ?? 'Error',
    context: { message: err?.message },
  }));
  res.status(500).json({ error: message });
}

/**
 * GET /api/admin/agent-nudges
 *
 * Every builder, today's composed message, and whether the weekday run would send it. Read-only.
 *
 * The body is included, not just the subject, because the console's send button asks a manager to
 * approve words - and an approval given against a subject line alone is not an approval of the
 * message a builder reads.
 */
router.get(
  '/api/admin/agent-nudges',
  requireSection('internship'),
  async (_req: Request, res: Response) => {
    try {
      const builders = await previewAgentNudges();
      res.json({
        builders,
        disclosure:
          'Preview only. Nothing has been sent. The weekday run skips anyone we owe a reply to and '
          + 'anyone who has committed since yesterday, and a manager sending one by hand overrides '
          + 'that on purpose.',
      });
    } catch (err: any) {
      fail(res, 'agent_nudge_preview_failed', err, 'Could not read the nudge roster.');
    }
  },
);

/**
 * POST /api/admin/agent-nudges
 *
 * The bulk run: nudge everyone the automatic verdict says to nudge, and report every builder
 * either way. This is the same function the cron calls, so the button and the schedule cannot
 * drift apart.
 */
router.post(
  '/api/admin/agent-nudges',
  requireSection('internship'),
  async (req: Request, res: Response) => {
    const parsed = sendSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid nudge request.', issues: parsed.error.issues });
      return;
    }
    try {
      const result = await sendAllNudges({ dryRun: parsed.data.send !== true });
      res.json(result);
    } catch (err: any) {
      fail(res, 'agent_nudge_bulk_failed', err, 'Could not run the nudges.');
    }
  },
);

/**
 * POST /api/admin/agent-nudges/:domain
 *
 * One builder, on a manager's explicit instruction, overriding the automatic verdict. The verdict
 * it overrode comes back in the response rather than being dropped, so the console can say "sent,
 * though the run would have held this one because we owe them a reply".
 *
 * A domain that is not one of the builders' is a 404 and not a 500: the service throws for it, and
 * an unknown domain is a bad request about a real route rather than a server fault.
 */
router.post(
  '/api/admin/agent-nudges/:domain',
  requireSection('internship'),
  async (req: Request, res: Response) => {
    const parsed = sendSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid nudge request.', issues: parsed.error.issues });
      return;
    }
    try {
      const result = await sendOneNudge(String(req.params.domain), { dryRun: parsed.data.send !== true });
      res.json(result);
    } catch (err: any) {
      if (/refusing to nudge/.test(String(err?.message ?? ''))) {
        res.status(404).json({ error: 'That is not an agent domain with an assigned builder.' });
        return;
      }
      fail(res, 'agent_nudge_single_failed', err, 'Could not send this nudge.');
    }
  },
);

export default router;
