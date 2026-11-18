/**
 * `POST /api/admin/agent-domain/bug-report` — "Report a problem", on the agent pages.
 *
 * ## Why this is not simply the Marketing endpoint
 *
 * Ali, 17 Nov 2026: *"Just like Marketing tab, we need 'Report a problem' so they can fill it out
 * when they are having issues and it can facilitate the fixes."*
 *
 * The obvious move is to point the existing button at `/api/admin/marketing/bug-report`, and it
 * would have failed for every single person it is for. That path is mapped to the `campaigns`
 * section by `mgmtSectionGate`, and **no builder role carries `campaigns`** — builders hold
 * `dashboard` plus their own department. `requireAdmin` would not have caught it either, because
 * bridge-minted staff tokens carry the role `admin`; this is exactly the AF11.9 failure, where a
 * route was classified but not reachable. So this is its own route on `dashboard`, and the test
 * beside it asserts reachability BY ROLE rather than by classification.
 *
 * ## Why the handler is reused in pieces rather than refactored into one
 *
 * The Marketing handler carries scar tissue: on 2026-11-11 three of Sohail's reports were
 * accepted, logged as successes, and delivered to nobody, and the fixes for that (an explicit
 * `from`, reading the send outcome, settling the stored row on failure) live inside it. Pulling
 * that handler apart at this hour to share it would put those fixes at risk for a convenience.
 * The schema, the recipient list, the screenshot decoder, the store and the email builders are
 * all shared; the glue is written out once more, deliberately.
 *
 * ## The reporter is the point
 *
 * The seven builders are told, in the instructions going out to them, that a screen which looks
 * wrong is more likely our bug than their mistake and that they should say so immediately. Until
 * this route existed that sentence named no mechanism. This is the mechanism.
 */
import { Router, type Request, type Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { guardedSendMail } from '../../services/emailService';
import { readSendOutcome } from '../../services/email/sendOutcome';
import { env } from '../../config/env';
import { buildHtmlBody, buildPlainTextBody, buildSubject } from '../../services/marketing/bugReportEmail';
import { markBugReportDelivered, markBugReportFailed, recordBugReport } from '../../services/marketing/bugReportStore';
import { BugReportSchema, decodeScreenshot, recipients } from './marketingBugReportRoutes';

const SERVICE = 'agent-domain-bug-report';

const router = Router();

router.post('/api/admin/agent-domain/bug-report', requireAdmin, async (req: Request, res: Response) => {
  const parsed = BugReportSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({
      error: 'That report is missing something.',
      error_class: 'ValidationError',
      details: parsed.error.flatten(),
    });
  }

  let reportId: string | null = null;
  let shot: { buffer: Buffer; filename: string } | null = null;

  try {
    const to = await recipients();
    if (to.length === 0) {
      // Said plainly. A builder who is thanked for a report nobody receives is worse off than
      // one who is told to go and find a person, because they stop reporting.
      return void res.status(503).json({
        error: 'No one is set up to receive problem reports yet. Tell Ali directly.',
        error_class: 'NoRecipient',
      });
    }

    shot = decodeScreenshot(parsed.data.screenshot);
    const input = {
      ...parsed.data,
      reporterName: req.admin?.email?.split('@')[0] ?? 'someone',
      reporterEmail: req.admin?.email ?? 'unknown',
      hasScreenshot: Boolean(shot),
    };

    // Written down BEFORE the send, so a send that fails loses nothing. Fields are listed one by
    // one rather than spread, so the multi-megabyte screenshot data URL cannot wander into the row.
    reportId = await recordBugReport({
      summary: parsed.data.summary,
      whatHappened: parsed.data.whatHappened,
      whatExpected: parsed.data.whatExpected,
      stepsToReproduce: parsed.data.stepsToReproduce,
      pageUrl: parsed.data.pageUrl,
      routePath: parsed.data.routePath,
      // Carries the agent the reporter was looking at. The column is named for Marketing's brand,
      // and reusing it keeps one table of reports rather than two half-populated ones.
      brandLabel: parsed.data.brandLabel ?? null,
      reportedAtCentral: parsed.data.reportedAtCentral,
      browser: parsed.data.browser,
      viewport: parsed.data.viewport,
      errors: parsed.data.errors,
      failedRequests: parsed.data.failedRequests,
      hasScreenshot: Boolean(shot),
      reporterEmail: input.reporterEmail,
      recipients: to,
    });

    // `from` is not optional: without it the relay answers 250 and drops the message.
    const info = await guardedSendMail({
      from: env.emailFrom,
      to: to.join(','),
      subject: buildSubject(input),
      text: buildPlainTextBody(input),
      html: buildHtmlBody(input),
      attachments: shot ? [{ filename: shot.filename, content: shot.buffer }] : undefined,
    });

    const outcome = readSendOutcome(info);
    if (!outcome.delivered) {
      await markBugReportFailed(reportId, outcome.reason ?? 'not delivered', shot);
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error', service: SERVICE, event: 'bug_report_not_delivered',
        outcome: 'failure', error_class: 'BugReportNotDelivered',
        context: {
          route: parsed.data.routePath, reason: outcome.reason, recipients: to.length,
          report_id: reportId, stored: Boolean(reportId),
        },
      }));
      return void res.status(502).json({
        error: 'The report was saved but could not be emailed. Please tell Ali directly; nothing was lost on your side.',
        error_class: 'BugReportNotDelivered',
      });
    }

    await markBugReportDelivered(reportId);
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info', service: SERVICE, event: 'bug_report_sent', outcome: 'success',
      context: {
        route: parsed.data.routePath, recipients: to.length,
        screenshot: Boolean(shot), errors: parsed.data.errors?.length ?? 0,
        failed_requests: parsed.data.failedRequests?.length ?? 0,
        report_id: reportId, stored: Boolean(reportId),
      },
    }));

    res.status(201).json({ sent: true, recipients: to.length, screenshotAttached: Boolean(shot) });
  } catch (err: any) {
    // The row may exist even though the send threw. Settle it rather than leaving it pending
    // forever with nothing that will ever resolve it.
    await markBugReportFailed(reportId, String(err?.message ?? err), shot);
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: SERVICE, event: 'bug_report_failed',
      outcome: 'failure', error_class: 'BugReportSendFailed',
      context: {
        route: parsed.data.routePath, message: String(err?.message ?? err).slice(0, 300),
        report_id: reportId, stored: Boolean(reportId),
      },
    }));
    res.status(500).json({ error: 'Could not send that report.', error_class: 'BugReportSendFailed' });
  }
});

export default router;
