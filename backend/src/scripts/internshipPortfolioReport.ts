/**
 * Internship Portfolio Report - the internship automated report.
 *
 * Replaces weeklyInternReport.js and dailyInternNudges.js, which read Basecamp project 24865175.
 * The program moved off Basecamp: interns now build in repos attached to platform projects (7 agent
 * projects, 3 gov contract projects), and the admin page /admin/internship is the record. This
 * report reads the same services that page renders from (see services/internship/portfolioReport).
 *
 * One email every morning (Ali, 10 Nov 2026: "focus on the 10 most impactful and I can open the
 * html and take the guided tour or just dive into the data"):
 *   the email    the 10 most impactful things, "Your move", everyone at a glance (renderBriefing.ts)
 *   attached     internship-report-<date>.html: the full report with the guided tour, one timeline
 *                for everyone, filter by person, every intern card (dashboard/renderDashboard.ts)
 *   attached     internship-report-<date>.json: the same data for an agent (sidecar/)
 *
 * Autopilot: reportingRegistry.js "Internship Portfolio Report", sendCT 08:00 with a 09:00 retry,
 * every day, plus "Internship Portfolio Report (Tuesday intern meeting)", Tuesdays 10:00 with an
 * 11:00 retry (--edition meeting), both fired by the --ct-now runner cron. The ledger makes each
 * retry a no-op once its edition has sent.
 *
 * Run inside the backend container (cron):  node dist/scripts/internshipPortfolioReport.js
 *   --dry               build only, never send
 *   --edition meeting   the Tuesday 10:00 AM intern-meeting copy: its own subject and ledger key,
 *                       so it sends in addition to the 8:00 AM report (default: daily)
 *   --test-to <email>   send ONE test copy to <email> only (subject marked TEST, own idempotency
 *                       key, no snapshot): never consumes or changes the real daily send
 *   --out <file>        also write the email HTML to <file>
 *   --json-out <file>   also write the collected facts to <file>
 *   --from-json <file>  render from saved facts (no DB); never sends
 *   --no-llm            skip the email-asks digest
 *   --no-store          do not read or write the snapshot / model-cache tables (no delta, live model)
 *   --sidecar-out <f>   also write the JSON sidecar to <f> (it is always attached to the email as
 *                       internship-report-<YYYY-MM-DD>.json; contract in portfolioReport/sidecar/types.ts)
 *   --dashboard-out <f> also write the interactive page to <f> (always attached as
 *                       internship-report-<YYYY-MM-DD>.html)
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
import { jsonFileName, pageFileName, renderBriefing } from '../services/internship/portfolioReport/renderBriefing';
import { centralDate, meetingSubject, parseEdition, sendPlanFor, testSubject, type SendPlan } from '../services/internship/portfolioReport/sendPlan';
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

function log(event: string, context: Record<string, unknown> = {}, level: 'info' | 'warn' | 'error' = 'info'): void {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'internship-portfolio-report', event, context }));
}

interface Attachment { filename: string; content: string; contentType: string }

async function send(subject: string, html: string, text: string, plan: SendPlan, attachments: Attachment[]): Promise<'sent' | 'skipped'> {
  const { to, cc, businessEventId } = plan;
  const claim = await claimSend({ recipient: to, subject, businessEventId });
  if (!claim.granted) { log('send_skipped', { reason: claim.reason, businessEventId }); return 'skipped'; }
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  try {
    const r = await transport.sendMail({
      from: '"Ali Muwwakkil" <ali@colaberry.com>', to, cc, subject, html, text, attachments,
      headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
    });
    await recordSendSuccess(claim.ledgerId, r.messageId);
    log('sent', { businessEventId, messageId: r.messageId, cc: cc.length, attachments: attachments.map((a) => a.filename) });
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

  // The JSON sidecar: built from the composed report; the email and the page both render from it.
  const reportDate = centralDate(reportNow);
  const previous = useStore ? await loadPreviousSnapshot(reportDate) : null;
  const sidecar = buildSidecar(report, { reportDate, previous, lastOutbound: data.lastOutbound ?? [], conversations: data.conversations ?? [] });
  const sidecarText = serializeSidecar(sidecar);
  const problems = sidecarProblems(sidecarText);
  if (problems.length) throw new Error(`ContractViolation: sidecar ${problems.slice(0, 5).join('; ')}`);
  const sidecarOut = opt('--sidecar-out');
  if (sidecarOut) { fs.writeFileSync(sidecarOut, sidecarText); log('sidecar_written', { file: sidecarOut, previous: previous?.report_date ?? null }); }
  // The interactive page: the full report (guided tour, one timeline for everyone, filter by
  // person, every intern card), from the same report and sidecar.
  const dashboard = renderDashboard(report, sidecar);
  const dashboardOut = opt('--dashboard-out');
  if (dashboardOut) { fs.writeFileSync(dashboardOut, dashboard); log('dashboard_written', { file: dashboardOut }); }
  const attachments: Attachment[] = [
    { filename: pageFileName(reportDate), content: dashboard, contentType: 'text/html; charset=utf-8' },
    { filename: jsonFileName(reportDate), content: sidecarText, contentType: 'application/json; charset=utf-8' },
  ];

  // The email: the 10 most impactful things, Ali's moves and everyone at a glance; the page is attached.
  const testTo = opt('--test-to');
  const edition = parseEdition(opt('--edition'));
  const briefing = renderBriefing(report, sidecar, { edition });
  const editioned = edition === 'meeting' ? meetingSubject(briefing.subject) : briefing.subject;
  const subject = testTo ? testSubject(editioned) : editioned;
  const { html, text } = briefing;
  const out = opt('--out');
  if (out) { fs.writeFileSync(out, html); log('written', { file: out }); }

  const lint = lintAliEmail({ subject, html, text });
  // Only the dash rule is a gate here: the others (branded signature, one full name) are for mail
  // sent AS Ali to a person, and this is an internal report whose body quotes interns' commits.
  if (lint.hardFails.some((f) => f.rule === 'no-emdash')) throw new Error('ContractViolation: report contains an em/en-dash');

  let outcome: string = 'dry';
  if (!has('--dry') && !fromJson) {
    outcome = await send(subject, html, text, sendPlanFor(now, testTo, edition), attachments);
    // Only the real daily send moves the delta baseline; a dry run or a test copy never changes
    // tomorrow's comparison.
    if (outcome === 'sent' && !testTo && useStore) log('snapshot', { saved: await saveSnapshot(snapshotOf(sidecar), sidecarText), report_date: reportDate });
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
