/**
 * Internship Portfolio Report - the internship automated report.
 *
 * Replaces weeklyInternReport.js and dailyInternNudges.js, which read Basecamp project 24865175.
 * The program moved off Basecamp: interns now build in repos attached to platform projects (7 agent
 * projects, 3 gov contract projects), and the admin page /admin/internship is the record. This
 * report reads the same services that page renders from (see services/internship/portfolioReport).
 *
 * One email: per intern, training/triage, 28-day activity, what they built lately, what they have
 * emailed Ali for, next steps, and the nudge Ali would send; plus "Your move" for Ali.
 *
 * Run inside the backend container (cron):  node dist/scripts/internshipPortfolioReport.js
 *   --dry               build only, never send
 *   --out <file>        also write the HTML to <file>
 *   --json-out <file>   also write the collected facts to <file>
 *   --from-json <file>  render from saved facts (no DB); never sends
 *   --no-llm            skip the email-asks digest
 *   --no-store          do not read or write the snapshot / model-cache tables (no delta, live model)
 *   --sidecar-out <f>   also write the JSON sidecar to <f> (it is always attached to the email as
 *                       internship-report-<YYYY-MM-DD>.json; contract in portfolioReport/sidecar/types.ts)
 *   --dashboard-out <f> also write the interactive page to <f> (always attached as
 *                       internship-report-<YYYY-MM-DD>.html: filter by person or tier, the 10 most
 *                       insightful communications, every suggested prompt with copy buttons)
 *
 * Sidecar: built from the same composed report the HTML renders from. A real send also saves a
 * snapshot (internship_report_snapshots) that the next run's `delta` compares against; dry runs
 * never write one. Model replies are cached by request hash, so a re-run is byte-identical.
 *
 * Idempotency: the send is claimed in email_send_ledger on (recipient, "Ali, here's your Internship Report for <date>",
 * "internship-report-<CT date>"), so a re-run the same day sends nothing; a FAILED send is retried
 * by the next run. Failure path: roster failure or Mandrill failure exits 1 (cron log + the ledger
 * row record it); any other source degrades to empty and is logged; the asks digest failing leaves
 * thread subjects in place.
 */
import fs from 'fs';
import nodemailer from 'nodemailer';
import { sequelize } from '../config/database';
import { collectInternshipPortfolio } from '../services/internship/portfolioReport/collect';
import { composeInternshipPortfolio } from '../services/internship/portfolioReport/compose';
import { narrateAsks, type ChatClient } from '../services/internship/portfolioReport/narrate';
import { summarizeInterns } from '../services/internship/portfolioReport/summary';
import { renderInternshipPortfolio } from '../services/internship/portfolioReport/render';
import type { CollectedPortfolio } from '../services/internship/portfolioReport/types';
import { claimSend, recordSendFailure, recordSendSuccess } from '../services/email/idempotentSend';
import { lintAliEmail } from '../services/email/aliEmailStyle';
import { getInstrumentedOpenAI } from '../services/openaiInstrumented';
import { buildSidecar, serializeSidecar, sidecarProblems, snapshotOf } from '../services/internship/portfolioReport/sidecar/build';
import { renderDashboard } from '../services/internship/portfolioReport/dashboard/renderDashboard';
import { cachedChatClient, ensureSidecarSchema, loadPreviousSnapshot, saveSnapshot } from '../services/internship/portfolioReport/sidecar/store';

const argv = process.argv.slice(2);
const has = (f: string): boolean => argv.includes(f);
const opt = (f: string): string | null => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] ?? null : null; };

const TO = process.env.INTERN_REPORT_TO || 'ali@colaberry.com';
const CC = (process.env.INTERN_REPORT_CC ?? 'alimuwwakkil@gmail.com,ram@colaberry.com').split(',').map((s) => s.trim()).filter(Boolean);

function log(event: string, context: Record<string, unknown> = {}, level: 'info' | 'warn' | 'error' = 'info'): void {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'internship-portfolio-report', event, context }));
}

export function centralDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

interface Attachment { filename: string; content: string; contentType: string }

async function send(subject: string, html: string, text: string, now: Date, attachments: Attachment[]): Promise<'sent' | 'skipped'> {
  const businessEventId = `internship-report-${centralDate(now)}`;
  const claim = await claimSend({ recipient: TO, subject, businessEventId });
  if (!claim.granted) { log('send_skipped', { reason: claim.reason, businessEventId }); return 'skipped'; }
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  try {
    const r = await transport.sendMail({
      from: '"Ali Muwwakkil" <ali@colaberry.com>', to: TO, cc: CC, subject, html, text, attachments,
      headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
    });
    await recordSendSuccess(claim.ledgerId, r.messageId);
    log('sent', { businessEventId, messageId: r.messageId, cc: CC.length });
    return 'sent';
  } catch (err) {
    const e = err as Error;
    await recordSendFailure(claim.ledgerId, e.name || 'UpstreamUnavailable', e.message);
    throw err;
  }
}

async function main(): Promise<number> {
  const started = Date.now();
  const now = new Date();
  const fromJson = opt('--from-json');
  const data: CollectedPortfolio = fromJson
    ? JSON.parse(fs.readFileSync(fromJson, 'utf8'))
    : await collectInternshipPortfolio({ now });
  const jsonOut = opt('--json-out');
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(data));
  log('collected', { interns: data.roster.length });

  const reportNow = fromJson ? new Date(data.generatedAt) : now;
  const report = composeInternshipPortfolio(data, { now: reportNow });
  // The sidecar's tables. Failure degrades (no delta, no model cache); it never fails the report.
  // --from-json stays database-free, and --no-store keeps a dry run from touching them at all.
  const useStore = !fromJson && !has('--no-store');
  if (useStore) await ensureSidecarSchema().catch((err) => log('sidecar_schema_failed', { message: (err as Error).message }, 'warn'));
  const live: ChatClient | null = has('--no-llm') || !process.env.OPENAI_API_KEY
    ? null
    : getInstrumentedOpenAI({ workflow_id: 'internship_portfolio_report' }, { timeout: 30000, maxRetries: 0 }) as unknown as ChatClient;
  // Same request, same reply: a re-run on unchanged data renders byte-identical HTML and JSON.
  const client = live ? (useStore ? cachedChatClient(live) : live) : null;
  log('asks_digest', await narrateAsks(report, client));
  // After the asks, so the paragraph can use them.
  log('summaries', await summarizeInterns(report, client));

  const { subject, html, text } = renderInternshipPortfolio(report);
  const out = opt('--out');
  if (out) { fs.writeFileSync(out, html); log('written', { file: out }); }

  // The JSON sidecar: built from the SAME report object the HTML was just rendered from.
  const reportDate = centralDate(reportNow);
  const previous = useStore ? await loadPreviousSnapshot(reportDate) : null;
  const sidecar = buildSidecar(report, { reportDate, previous, lastOutbound: data.lastOutbound ?? [], conversations: data.conversations ?? [] });
  const sidecarText = serializeSidecar(sidecar);
  const problems = sidecarProblems(sidecarText);
  if (problems.length) throw new Error(`ContractViolation: sidecar ${problems.slice(0, 5).join('; ')}`);
  const sidecarOut = opt('--sidecar-out');
  if (sidecarOut) { fs.writeFileSync(sidecarOut, sidecarText); log('sidecar_written', { file: sidecarOut, previous: previous?.report_date ?? null }); }
  // The interactive page (filter by person or tier, top communications, every prompt in full),
  // rendered ONLY from the sidecar, so it cannot disagree with the JSON beside it.
  const dashboard = renderDashboard(report, sidecar);
  const dashboardOut = opt('--dashboard-out');
  if (dashboardOut) { fs.writeFileSync(dashboardOut, dashboard); log('dashboard_written', { file: dashboardOut }); }
  const attachments: Attachment[] = [
    { filename: `internship-report-${reportDate}.html`, content: dashboard, contentType: 'text/html; charset=utf-8' },
    { filename: `internship-report-${reportDate}.json`, content: sidecarText, contentType: 'application/json; charset=utf-8' },
  ];

  const lint = lintAliEmail({ subject, html, text });
  // Only the dash rule is a gate here: the others (branded signature, one full name) are for mail
  // sent AS Ali to a person, and this is an internal report whose body quotes interns' commits.
  if (lint.hardFails.some((f) => f.rule === 'no-emdash')) throw new Error('ContractViolation: report contains an em/en-dash');

  let outcome: string = 'dry';
  if (!has('--dry') && !fromJson) {
    outcome = await send(subject, html, text, now, attachments);
    // Only a real send moves the delta baseline; a dry run must never change tomorrow's comparison.
    if (outcome === 'sent') log('snapshot', { saved: await saveSnapshot(snapshotOf(sidecar), sidecarText), report_date: reportDate });
  }
  log('done', { duration_ms: Date.now() - started, outcome, totals: report.totals });
  // The instrumented OpenAI client records each call with a fire-and-forget emitAiEvent (no flush
  // to await). Closing the pool immediately lost the last write on the 9 Nov dry run, so give the
  // in-flight inserts a moment before main() returns and the pool closes.
  if (client) await new Promise((r) => setTimeout(r, 2000));
  return 0;
}

if (require.main === module) {
  main()
    .then(async (code) => { await sequelize.close().catch(() => undefined); process.exit(code); })
    .catch(async (err) => {
      const e = err as Error;
      log('failed', { error_class: e.name || 'UnknownError', message: e.message }, 'error');
      await sequelize.close().catch(() => undefined);
      process.exit(1);
    });
}
