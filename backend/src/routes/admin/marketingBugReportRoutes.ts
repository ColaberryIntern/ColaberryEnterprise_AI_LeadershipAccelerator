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

/**
 * Where reports go. The dedicated setting wins; otherwise the admin notification list.
 *
 * These settings live in a JSONB column, so the value can arrive as a parsed string, as an array,
 * or - if it was ever written as a raw JSON literal - as a string still wearing its quotes. All
 * three are handled, because the failure they cause is invisible: a recipient of
 * `"ali@colaberry.com` still contains an `@`, would pass a naive filter, and would simply never
 * be delivered to.
 */
export function parseRecipients(value: unknown): string[] {
  const flat = Array.isArray(value) ? value.join(',') : String(value ?? '');
  return flat
    .split(/[,;\s]+/)
    .map((s) => s.trim().replace(/^["']+|["']+$/g, '').trim())
    .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
}

async function recipients(): Promise<string[]> {
  const dedicated = await getSetting('marketing_bug_report_emails').catch(() => null);
  const fromDedicated = parseRecipients(dedicated);
  if (fromDedicated.length > 0) return fromDedicated;
  return parseRecipients(await getSetting('admin_notification_emails').catch(() => null));
}

/** Decode `data:image/png;base64,...` into something nodemailer can attach. */
/**
 * Is every character legal in base64? Checked by scanning, NOT by a regex.
 *
 * `([A-Za-z0-9+/=]+)$` against a multi-megabyte string overflows the regex engine's stack -
 * `RangeError: Maximum call stack size exceeded` - which turns an over-size upload from a
 * rejection into a crashed request. A linear scan has no such cliff. Found by the test that
 * sends a 9MB payload, which is exactly the input an operator produces on a 4K monitor.
 */
function isBase64Payload(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    const ok = (c >= 65 && c <= 90)      // A-Z
      || (c >= 97 && c <= 122)           // a-z
      || (c >= 48 && c <= 57)            // 0-9
      || c === 43 || c === 47 || c === 61; // + / =
    if (!ok) return false;
  }
  return true;
}

export function decodeScreenshot(dataUrl: string | undefined): { buffer: Buffer; filename: string } | null {
  if (!dataUrl) return null;
  const raw = dataUrl.trim();

  // SIZE IS CHECKED FIRST, before anything walks the string. base64 inflates by 4/3, so an
  // image at the byte cap encodes to roughly that; anything beyond is refused without being
  // parsed at all.
  if (raw.length > Math.ceil((MAX_SCREENSHOT_BYTES * 4) / 3) + 64) return null;

  // The prefix is matched with a BOUNDED pattern - it can only ever look at the first few dozen
  // characters - and the payload is validated separately by the scan above.
  const prefix = /^data:image\/(png|jpeg|jpg|webp);base64,/.exec(raw);
  // Anything that is not plainly a base64 image is dropped rather than guessed at: this value
  // reaches an email attachment, and a mislabelled one is somebody else's problem to open.
  if (!prefix) return null;

  const payload = raw.slice(prefix[0].length);
  if (payload.length === 0 || !isBase64Payload(payload)) return null;

  const buffer = Buffer.from(payload, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_SCREENSHOT_BYTES) return null;
  const ext = prefix[1] === 'jpg' ? 'jpeg' : prefix[1];
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
