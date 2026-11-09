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
 *
 * Idempotency: the send is claimed in email_send_ledger on (recipient, "[Internship Report] <date>",
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
import { renderInternshipPortfolio } from '../services/internship/portfolioReport/render';
import type { CollectedPortfolio } from '../services/internship/portfolioReport/types';
import { claimSend, recordSendFailure, recordSendSuccess } from '../services/email/idempotentSend';
import { lintAliEmail } from '../services/email/aliEmailStyle';
import { getInstrumentedOpenAI } from '../services/openaiInstrumented';

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

async function send(subject: string, html: string, text: string, now: Date): Promise<'sent' | 'skipped'> {
  const businessEventId = `internship-report-${centralDate(now)}`;
  const claim = await claimSend({ recipient: TO, subject, businessEventId });
  if (!claim.granted) { log('send_skipped', { reason: claim.reason, businessEventId }); return 'skipped'; }
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  try {
    const r = await transport.sendMail({
      from: '"Ali Muwwakkil" <ali@colaberry.com>', to: TO, cc: CC, subject, html, text,
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

  const report = composeInternshipPortfolio(data, { now: fromJson ? new Date(data.generatedAt) : now });
  const client: ChatClient | null = has('--no-llm') || !process.env.OPENAI_API_KEY
    ? null
    : getInstrumentedOpenAI({ workflow_id: 'internship_portfolio_report' }, { timeout: 30000, maxRetries: 0 }) as unknown as ChatClient;
  log('asks_digest', await narrateAsks(report, client));

  const { subject, html, text } = renderInternshipPortfolio(report);
  const out = opt('--out');
  if (out) { fs.writeFileSync(out, html); log('written', { file: out }); }

  const lint = lintAliEmail({ subject, html, text });
  // Only the dash rule is a gate here: the others (branded signature, one full name) are for mail
  // sent AS Ali to a person, and this is an internal report whose body quotes interns' commits.
  if (lint.hardFails.some((f) => f.rule === 'no-emdash')) throw new Error('ContractViolation: report contains an em/en-dash');

  let outcome: string = 'dry';
  if (!has('--dry') && !fromJson) outcome = await send(subject, html, text, now);
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
