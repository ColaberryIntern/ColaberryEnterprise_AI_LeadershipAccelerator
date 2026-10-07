import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { guardedSendMail } from '../../services/emailService';
import { getSetting } from '../../services/settingsService';
import { buildHtmlBody, buildPlainTextBody, buildSubject } from '../../services/marketing/bugReportEmail';

/**
 * `POST /api/admin/marketing/bug-report` — the Marketing section's "Report a problem" button.
 *
 * Ali, 2026-10-07, preparing to hand the Marketing work to Sohail and an intern: they need to
 * "easily report problems showing screenshots and explanations", the report should reach email,
 * and the email should carry everything Claude Code needs to start work.
 *
 * WHY THIS IS OURS RATHER THAN A SAAS WIDGET. The category leaders all work by embedding a
 * third-party script that uploads the capture to their servers. These screenshots are of an
 * internal admin showing real leads, real people and real revenue, and that is not data to hand
 * to a vendor for the convenience of a feedback button. Building it costs one endpoint and one
 * modal; the existing nodemailer transport already carries attachments and already routes
 * through the kill-switch guard.
 *
 * SIZE. A PNG of a 4K screen can exceed 10MB, which bounces off most mailboxes. The cap is
 * enforced here rather than only in the browser, because the browser's limit is a suggestion to
 * anyone holding a terminal.
 */

const MAX_SCREENSHOT_BYTES = 6 * 1024 * 1024;

const CapturedError = z.object({
  at: z.string().max(40),
  kind: z.string().max(40),
  message: z.string().max(4000),
  stack: z.string().max(4000).optional(),
});

const CapturedRequest = z.object({
  at: z.string().max(40),
  method: z.string().max(10),
  url: z.string().max(600),
  status: z.union([z.number(), z.string().max(40)]),
  ms: z.number(),
});

const BugReportSchema = z.object({
  summary: z.string().trim().min(5).max(160),
  whatHappened: z.string().trim().min(10).max(5000),
  whatExpected: z.string().trim().max(5000).optional(),
  stepsToReproduce: z.string().trim().max(5000).optional(),
  pageUrl: z.string().trim().min(1).max(1000),
  routePath: z.string().trim().min(1).max(300),
  brandLabel: z.string().trim().max(200).nullable().optional(),
  reportedAtCentral: z.string().trim().min(1).max(100),
  browser: z.string().trim().max(500),
  viewport: z.string().trim().max(60),
  errors: z.array(CapturedError).max(25).optional(),
  failedRequests: z.array(CapturedRequest).max(25).optional(),
  /** A `data:image/png;base64,...` URL, or absent. */
  screenshot: z.string().max(12 * 1024 * 1024).optional(),
});

/** Where reports go. The dedicated setting wins; otherwise the admin notification list. */
async function recipients(): Promise<string[]> {
  const dedicated = await getSetting('marketing_bug_report_emails').catch(() => null);
  const fallback = await getSetting('admin_notification_emails').catch(() => null);
  const raw = String(dedicated || fallback || '').trim();
  return raw ? raw.split(/[,;\s]+/).map((s) => s.trim()).filter((s) => s.includes('@')) : [];
}

/** Decode `data:image/png;base64,...` into something nodemailer can attach. */
export function decodeScreenshot(dataUrl: string | undefined): { buffer: Buffer; filename: string } | null {
  if (!dataUrl) return null;
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  // Anything that is not plainly a base64 image is dropped rather than guessed at: this value
  // reaches an email attachment, and a mislabelled one is somebody else's problem to open.
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > MAX_SCREENSHOT_BYTES) return null;
  const ext = match[1] === 'jpg' ? 'jpeg' : match[1];
  return { buffer, filename: `screenshot.${ext}` };
}

const router = Router();

router.post('/api/admin/marketing/bug-report', requireAdmin, async (req: Request, res: Response) => {
  const parsed = BugReportSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({ error: 'That report is missing something.', error_class: 'ValidationError', details: parsed.error.flatten() });
  }

  try {
    const to = await recipients();
    if (to.length === 0) {
      // Said plainly rather than swallowed: a reporter who gets "thanks!" for a report nobody
      // receives is worse off than one who is told to go and find a person.
      return void res.status(503).json({
        error: 'No one is set up to receive bug reports yet. Set `marketing_bug_report_emails` in settings.',
        error_class: 'NoRecipient',
      });
    }

    const shot = decodeScreenshot(parsed.data.screenshot);
    const input = {
      ...parsed.data,
      reporterName: req.admin?.email?.split('@')[0] ?? 'someone',
      reporterEmail: req.admin?.email ?? 'unknown',
      hasScreenshot: Boolean(shot),
    };

    await guardedSendMail({
      to: to.join(','),
      subject: buildSubject(input),
      text: buildPlainTextBody(input),
      html: buildHtmlBody(input),
      attachments: shot ? [{ filename: shot.filename, content: shot.buffer }] : undefined,
    });

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info', service: 'marketing-bug-report', event: 'bug_report_sent', outcome: 'success',
      context: {
        route: parsed.data.routePath, recipients: to.length,
        screenshot: Boolean(shot), errors: parsed.data.errors?.length ?? 0,
        failed_requests: parsed.data.failedRequests?.length ?? 0,
      },
    }));

    res.status(201).json({ sent: true, recipients: to.length, screenshotAttached: Boolean(shot) });
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'marketing-bug-report', event: 'bug_report_failed',
      outcome: 'failure', error_class: 'BugReportSendFailed',
      context: { route: parsed.data.routePath, message: String(err?.message ?? err).slice(0, 300) },
    }));
    res.status(500).json({ error: 'The report could not be sent.', error_class: 'BugReportSendFailed' });
  }
});

export default router;
