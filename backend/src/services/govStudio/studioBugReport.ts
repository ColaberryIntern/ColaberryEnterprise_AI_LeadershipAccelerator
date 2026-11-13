import { z } from 'zod';
import { guardedSendMail } from '../emailService';
import { readSendOutcome } from '../email/sendOutcome';
import { env } from '../../config/env';
import { getSetting } from '../settingsService';
import { decodeScreenshot, parseRecipients } from '../../routes/admin/marketingBugReportRoutes';
import { buildPlainTextBody, buildHtmlBody, type BugReportInput } from '../marketing/bugReportEmail';

/**
 * The Gov Proposal Studio's "Report a problem" core, shared by the admin route
 * (`/api/admin/gov-contracts/:projectId/bug-report`) and the intern portal mirror
 * (`/api/portal/gov-projects/:projectId/bug-report`).
 *
 * Ali, 2026-11-05: the Studio needs the same "Report a problem" button Marketing has, so a problem
 * emails him and the Gov-contract Claude Code tab — which already checks email — picks it up and
 * starts on the fix. So the subject carries a stable `[Gov Studio bug]` tag the email check can match,
 * and the body reuses Marketing's actionable email (route, what/expected, console errors, failed
 * requests, screenshot attached) so an agent can act without a conversation.
 *
 * It reuses Marketing's hardened screenshot decoder (size-first, linear base64 scan — no regex-stack
 * cliff) and recipient parser rather than re-deriving them. The email transport is the same guarded
 * nodemailer path with its kill-switch, so Gov reports obey the same send guard.
 */

const CapturedError = z.object({
  at: z.string().max(40), kind: z.string().max(40), message: z.string().max(4000), stack: z.string().max(4000).optional(),
});
const CapturedRequest = z.object({
  at: z.string().max(40), method: z.string().max(10), url: z.string().max(600), status: z.union([z.number(), z.string().max(40)]), ms: z.number(),
  // Optional, so an older bundle still posts a valid report rather than a 400.
  count: z.number().optional(),
});

export const StudioBugReportSchema = z.object({
  summary: z.string().trim().min(5).max(160),
  whatHappened: z.string().trim().min(10).max(5000),
  whatExpected: z.string().trim().max(5000).optional(),
  stepsToReproduce: z.string().trim().max(5000).optional(),
  contractName: z.string().trim().max(200).nullable().optional(),
  pageUrl: z.string().trim().min(1).max(1000),
  routePath: z.string().trim().min(1).max(300),
  reportedAtCentral: z.string().trim().min(1).max(100),
  browser: z.string().trim().max(500),
  viewport: z.string().trim().max(60),
  errors: z.array(CapturedError).max(25).optional(),
  failedRequests: z.array(CapturedRequest).max(25).optional(),
  /** A `data:image/png;base64,...` URL, or absent. */
  screenshot: z.string().max(12 * 1024 * 1024).optional(),
});

export type StudioBugReportBody = z.infer<typeof StudioBugReportSchema>;

/** The subject the Gov-contract Claude tab's email check matches on. Route included so an inbox scans. */
export function buildGovStudioSubject(summary: string, contractName: string | null | undefined, projectId: string): string {
  const where = (contractName && contractName.trim()) || `project ${projectId}`;
  return `[Gov Studio bug] ${summary.trim().slice(0, 80)} — ${where}`;
}

/** The dedicated setting wins; otherwise the admin notification list (same precedence as Marketing). */
async function recipients(): Promise<string[]> {
  const dedicated = parseRecipients(await getSetting('gov_studio_bug_report_emails').catch(() => null));
  if (dedicated.length > 0) return dedicated;
  return parseRecipients(await getSetting('admin_notification_emails').catch(() => null));
}

// Idempotency: the same person re-firing the same one-line summary on the same contract within a
// short window (a double-click, a retry) must not send twice. In-process is enough — a report is a
// convenience, not a ledger, and a missed dedupe across a restart is one extra email, not a defect.
const recent = new Map<string, number>();
const DEDUPE_MS = 5 * 60 * 1000;
export function __resetDedupeForTests(): void { recent.clear(); }
function isDuplicate(key: string): boolean {
  const now = Date.now();
  for (const [k, t] of recent) if (now - t > DEDUPE_MS) recent.delete(k);
  if (recent.has(key)) return true;
  recent.set(key, now);
  return false;
}

export interface BugReportResult { status: number; body: Record<string, unknown>; }

/**
 * Validate, dedupe, and email one Gov Studio bug report. Pure of Express: it takes the raw body and
 * the reporter's email, and returns the status + JSON for the caller to send. That keeps it testable
 * without a request object and lets the admin route and the portal mirror share one implementation.
 */
export async function handleGovStudioBugReport(
  projectId: string, reporterEmail: string | undefined, rawBody: unknown,
): Promise<BugReportResult> {
  const parsed = StudioBugReportSchema.safeParse(rawBody);
  if (!parsed.success) {
    return { status: 400, body: { error: 'That report is missing something.', error_class: 'ValidationError', details: parsed.error.flatten() } };
  }

  const to = await recipients();
  if (to.length === 0) {
    return { status: 503, body: { error: 'No one is set up to receive Gov Studio bug reports yet. Set `gov_studio_bug_report_emails` (or `admin_notification_emails`) in settings.', error_class: 'NoRecipient' } };
  }

  const email = reporterEmail?.trim() || 'unknown';
  const dedupeKey = `${email}|${projectId}|${parsed.data.summary.trim().toLowerCase()}`;
  if (isDuplicate(dedupeKey)) {
    return { status: 200, body: { sent: true, deduped: true } };
  }

  const shot = decodeScreenshot(parsed.data.screenshot);
  const contract = parsed.data.contractName?.trim();
  const input: BugReportInput = {
    summary: parsed.data.summary,
    whatHappened: parsed.data.whatHappened,
    whatExpected: parsed.data.whatExpected,
    stepsToReproduce: parsed.data.stepsToReproduce,
    pageUrl: parsed.data.pageUrl,
    routePath: parsed.data.routePath,
    // The contract (and project id) is the "where" for a Gov report, carried in the body's Brand row.
    brandLabel: contract ? `Gov contract: ${contract} · project ${projectId}` : `Gov contract · project ${projectId}`,
    reportedAtCentral: parsed.data.reportedAtCentral,
    browser: parsed.data.browser,
    viewport: parsed.data.viewport,
    reporterName: email.split('@')[0] ?? 'someone',
    reporterEmail: email,
    errors: parsed.data.errors,
    failedRequests: parsed.data.failedRequests,
    hasScreenshot: Boolean(shot),
  };

  // Same missing `from` as the Marketing route had, same silent drop. See emailService.
  const info = await guardedSendMail({
    from: env.emailFrom,
    to: to.join(','),
    subject: buildGovStudioSubject(parsed.data.summary, parsed.data.contractName, projectId),
    text: buildPlainTextBody(input),
    html: buildHtmlBody(input),
    attachments: shot ? [{ filename: shot.filename, content: shot.buffer }] : undefined,
  });

  const outcome = readSendOutcome(info);
  if (!outcome.delivered) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'gov-studio-bug-report',
      event: 'bug_report_not_delivered', outcome: 'failure', error_class: 'BugReportNotDelivered',
      context: { projectId, route: parsed.data.routePath, reason: outcome.reason, recipients: to.length },
    }));
    return {
      status: 502,
      body: {
        error: 'The report was accepted but could not be delivered. Please tell Ali directly - nothing was lost on your side.',
        error_class: 'BugReportNotDelivered',
      },
    };
  }

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'info', service: 'gov-studio-bug-report',
    event: 'bug_report_sent', outcome: 'success',
    context: { projectId, route: parsed.data.routePath, recipients: to.length, screenshot: Boolean(shot), errors: parsed.data.errors?.length ?? 0 },
  }));

  return { status: 201, body: { sent: true, recipients: to.length, screenshotAttached: Boolean(shot) } };
}
