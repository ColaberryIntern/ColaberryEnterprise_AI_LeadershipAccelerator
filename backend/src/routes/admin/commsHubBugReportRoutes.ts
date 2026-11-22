/**
 * `POST /api/admin/comms-hub/bug-report`: "Report a problem", on every Communications Hub tab (CH9.1).
 *
 * Ali, 2026-11-21: "She also needs a feedback mechanism like marketing section has in the bottom
 * right corner that will allow them to create feedback tickets to facilitate fixes."
 *
 * WHY ITS OWN ROUTE. Marketing's endpoint sits under `/api/admin/marketing`, which mgmtSectionGate
 * maps to `campaigns`. Neither Jackie (community_organizer) nor Taiwo (lead_intake + comms_hub)
 * holds `campaigns`, so pointing the hub's button at it would refuse the two people it is for.
 * This path is under `/api/admin/comms-hub`, which the gate maps to `comms_hub`, and the route
 * also carries requireSection('comms_hub') so it is guarded on its own.
 *
 * WHAT IS REUSED. Marketing's schema, recipient list, screenshot decoder, store and email builders.
 * The glue is written out here, like the agent route (agentBugReportRoutes.ts), because Marketing's
 * handler carries incident fixes (an explicit `from`, reading the send outcome, settling the row)
 * that are safer copied than refactored.
 *
 * TWO DIFFERENCES FROM MARKETING'S HANDLER.
 *  - The subject is tagged `[Comms Hub bug]`, so the mail check that turns reports into Basecamp
 *    tickets can tell them apart.
 *  - A duplicate inside the store's five-minute window is NOT emailed again (CLAUDE.md send dedup).
 *    Marketing's handler still sends on a duplicate; this one answers 200 { duplicate: true }.
 *
 * FAILURE MODES. No recipients: 503, said plainly. Store failure: the send still goes (a database
 * problem must not stop reporting). Send not delivered: the row is marked failed and kept with its
 * screenshot for replay, 502. Anything thrown: the row is settled failed, 500. No retry here: the
 * reporter sees the outcome and can send again.
 */
import { Router, type Request, type Response } from 'express';
import { requireSection } from '../../middlewares/authMiddleware';
import { guardedSendMail } from '../../services/emailService';
import { readSendOutcome } from '../../services/email/sendOutcome';
import { env } from '../../config/env';
import { buildHtmlBody, buildPlainTextBody, buildSubject } from '../../services/marketing/bugReportEmail';
import { markBugReportDelivered, markBugReportFailed, recordBugReportDetailed } from '../../services/marketing/bugReportStore';
import { logActivity } from '../../services/commsHub/activityLog';
import { BugReportSchema, decodeScreenshot, recipients } from './marketingBugReportRoutes';
import { actorOf } from './commsHubEventRoutes';

const SERVICE = 'comms-hub-bug-report';
export const COMMS_HUB_BUG_TAG = 'Comms Hub bug';
/** Stored in the report row's brand_label column, so hub reports are findable in the one reports table. */
export const COMMS_HUB_REPORT_LABEL = 'comms-hub';

function log(level: 'info' | 'error', event: string, outcome: string, context: Record<string, unknown>, errorClass?: string): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(), level, service: SERVICE, event, outcome,
    ...(errorClass ? { error_class: errorClass } : {}), context,
  });
  if (level === 'error') console.error(line); else console.log(line);
}

export async function postHubBugReport(req: Request, res: Response): Promise<void> {
  const parsed = BugReportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'That report is missing something.', error_class: 'ValidationError', details: parsed.error.flatten() });
    return;
  }

  let reportId: string | null = null;
  let shot: { buffer: Buffer; filename: string } | null = null;
  try {
    const to = await recipients();
    if (to.length === 0) {
      res.status(503).json({ error: 'No one is set up to receive problem reports yet. Tell Ali directly.', error_class: 'NoRecipient' });
      return;
    }

    shot = decodeScreenshot(parsed.data.screenshot);
    const input = {
      ...parsed.data,
      brandLabel: COMMS_HUB_REPORT_LABEL,
      reporterName: req.admin?.email?.split('@')[0] ?? 'someone',
      reporterEmail: req.admin?.email ?? 'unknown',
      hasScreenshot: Boolean(shot),
    };

    // Written down before the send. Fields one by one, so the screenshot data URL cannot reach the row.
    const stored = await recordBugReportDetailed({
      summary: parsed.data.summary,
      whatHappened: parsed.data.whatHappened,
      whatExpected: parsed.data.whatExpected,
      stepsToReproduce: parsed.data.stepsToReproduce,
      pageUrl: parsed.data.pageUrl,
      routePath: parsed.data.routePath,
      brandLabel: COMMS_HUB_REPORT_LABEL,
      reportedAtCentral: parsed.data.reportedAtCentral,
      browser: parsed.data.browser,
      viewport: parsed.data.viewport,
      errors: parsed.data.errors,
      failedRequests: parsed.data.failedRequests,
      hasScreenshot: Boolean(shot),
      reporterEmail: input.reporterEmail,
      recipients: to,
    });
    reportId = stored.id;

    if (stored.duplicate) {
      // The same person sent the same report in the last five minutes: it was already emailed once.
      log('info', 'bug_report_duplicate_not_resent', 'success', { route: parsed.data.routePath, report_id: reportId });
      res.status(200).json({ sent: false, duplicate: true });
      return;
    }

    const info = await guardedSendMail({
      from: env.emailFrom,
      to: to.join(','),
      subject: buildSubject(input, { tag: COMMS_HUB_BUG_TAG }),
      text: buildPlainTextBody(input),
      html: buildHtmlBody(input),
      attachments: shot ? [{ filename: shot.filename, content: shot.buffer }] : undefined,
    });

    const outcome = readSendOutcome(info);
    if (!outcome.delivered) {
      await markBugReportFailed(reportId, outcome.reason ?? 'not delivered', shot);
      log('error', 'bug_report_not_delivered', 'failure',
        { route: parsed.data.routePath, reason: outcome.reason, recipients: to.length, report_id: reportId, stored: Boolean(reportId) },
        'BugReportNotDelivered');
      res.status(502).json({
        error: 'The report was saved but could not be emailed. Please tell Ali directly; nothing was lost on your side.',
        error_class: 'BugReportNotDelivered',
      });
      return;
    }

    await markBugReportDelivered(reportId);
    // The hub's activity log says a report went in: summary and screen only, never the body or screenshot.
    await logActivity(actorOf(req), 'bug.reported', 'report', null, { summary: parsed.data.summary, route: parsed.data.routePath })
      .catch((err: unknown) => log('error', 'bug_report_activity_failed', 'partial',
        { message: String((err as Error)?.message ?? err).slice(0, 200) }, 'ActivityWriteFailed'));
    log('info', 'bug_report_sent', 'success', {
      route: parsed.data.routePath, recipients: to.length, screenshot: Boolean(shot),
      errors: parsed.data.errors?.length ?? 0, failed_requests: parsed.data.failedRequests?.length ?? 0, report_id: reportId,
    });
    res.status(201).json({ sent: true, recipients: to.length, screenshotAttached: Boolean(shot) });
  } catch (err: unknown) {
    await markBugReportFailed(reportId, String((err as Error)?.message ?? err), shot);
    log('error', 'bug_report_failed', 'failure',
      { route: parsed.data.routePath, message: String((err as Error)?.message ?? err).slice(0, 300), report_id: reportId },
      'BugReportSendFailed');
    res.status(500).json({ error: 'The report could not be sent.', error_class: 'BugReportSendFailed' });
  }
}

const router = Router();
router.post('/api/admin/comms-hub/bug-report', requireSection('comms_hub'), postHubBugReport);

export default router;
