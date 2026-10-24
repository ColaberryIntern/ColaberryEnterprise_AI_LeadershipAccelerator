/**
 * C8.8 — the weekly report's scheduled runner and delivery.
 *
 * IT SHIPS DARK, AND THAT IS NOT CAUTION FOR ITS OWN SAKE. C8.8 says plainly that the
 * recipient list is Ali's decision, so a job that mailed anyone the moment it merged
 * would have made that decision for him. The runner no-ops unless
 * COMMERCIAL_WEEKLY_REPORT_ENABLED is true, which is the same pattern
 * GovOpportunityDailySync already uses in this registry ("Ships DARK: the runner no-ops
 * unless ENABLE_GOV_DAILY_SYNC=true... so registering this changes nothing until it is
 * switched on").
 *
 * REUSE, NOT A NEW SCHEDULER. A new scheduler is explicitly out of scope on this ticket.
 * This registers one entry in the existing DYNAMIC_SCHEDULE_REGISTRY in aiOpsScheduler,
 * and recipients come from the same `admin_notification_emails` setting the existing
 * executive briefings read, rather than from a list invented here.
 *
 * Note for whoever switches it on: there are three scheduler instances in this estate.
 * Enable the flag on ONE of them, or Ali receives the report three times.
 */
import { buildWeeklyReport, WeeklyReport } from './weeklyCommercialReport';

export const ENABLE_FLAG = 'COMMERCIAL_WEEKLY_REPORT_ENABLED';

/** Monday 08:15, deliberately clear of the 06:45 daily and 07:45 weekly briefings. */
export const WEEKLY_SCHEDULE = '15 8 * * 1';
export const AGENT_NAME = 'CommercializationWeeklyReport';

export function isEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[ENABLE_FLAG] === 'true';
}

/** Plain text, because the report's value is that it can be read in thirty seconds. */
export function renderReportText(report: WeeklyReport): string {
  const out: string[] = [];
  out.push(report.headline);
  out.push('');

  for (const s of report.sections) {
    out.push(s.heading.toUpperCase());
    for (const line of s.lines) out.push(`  ${line}`);
    out.push('');
  }

  if (report.caveats.length) {
    out.push('WHY SOME FIGURES READ AS NOT MEASURABLE');
    for (const c of report.caveats) out.push(`  ${c}`);
    out.push('');
  }

  out.push('Assembled from the commercial funnel. No figure in this report was typed in '
    + 'by hand, and a stage the funnel cannot measure is reported as not measurable '
    + 'rather than as zero.');
  return out.join('\n');
}

export interface RunResult {
  ran: boolean;
  reason?: string;
  recipients?: number;
  report?: WeeklyReport;
}

/**
 * The scheduled runner.
 *
 * Returns rather than throws on the disabled and no-recipient paths: a dark job that
 * threw every Monday would fill the cron error log with a non-problem, and the
 * instrumentation wrapper would start reporting a healthy job as failing.
 */
export async function runWeeklyCommercialReport(
  deps: {
    env?: NodeJS.ProcessEnv;
    loadRecipients?: () => Promise<string[]>;
    deliver?: (recipients: string[], subject: string, body: string) => Promise<void>;
  } = {},
): Promise<RunResult> {
  const env = deps.env ?? process.env;

  if (!isEnabled(env)) {
    return { ran: false, reason: `${ENABLE_FLAG} is not true; the recipient list is Ali's to approve first` };
  }

  const report = await buildWeeklyReport();

  const loadRecipients = deps.loadRecipients ?? defaultRecipients;
  const recipients = await loadRecipients();
  if (!recipients.length) {
    // Not an error. Nobody has been approved yet, which is the expected state until
    // Ali sets the list.
    return { ran: false, reason: 'no approved recipients configured', report };
  }

  const deliver = deps.deliver ?? defaultDeliver;
  await deliver(recipients, 'Commercialization weekly report', renderReportText(report));
  return { ran: true, recipients: recipients.length, report };
}

/** The same setting the existing executive briefings read. No second list. */
async function defaultRecipients(): Promise<string[]> {
  const { default: SystemSetting } = await import('../../models/SystemSetting');
  const setting = await SystemSetting.findOne({
    where: { key: 'admin_notification_emails' },
  });
  const raw = setting?.getDataValue('value');
  return String(raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Delivery through the existing transport chokepoint. This module adds no new transport
 * and no new export to emailService.
 *
 * `guardedSendMail` is the single point every one of that file's senders goes through,
 * and it is already exported, so the report inherits the test-mode redirect, the kill
 * switch and the dev routing guard without restating any of them. The typed senders were
 * the wrong reuse: each is shaped to its own payload, and forcing a commercial report
 * into the alert or executive-briefing shape would break the moment someone edited that
 * template for its real purpose.
 */
async function defaultDeliver(
  recipients: string[], subject: string, body: string,
): Promise<void> {
  const { guardedSendMail, resolveDeliveryAddress, emailHeaders } = await import('../emailService');
  const { env } = await import('../../config/env');

  for (const to of recipients) {
    const address = await resolveDeliveryAddress(to);
    await guardedSendMail({
      from: `"Cory - AI Operations" <${env.emailFrom}>`,
      to: address,
      subject,
      text: body,
      headers: emailHeaders('commercialization-weekly-report'),
    });
  }
}
