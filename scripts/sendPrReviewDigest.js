#!/usr/bin/env node
/**
 * sendPrReviewDigest.js
 *
 * Emails the pr-approval-review digest to ali@colaberry.com via Mandrill SMTP.
 * This is an internal ops self-notification (not outbound correspondence to a
 * third party), so per sendWithBcAttach's own guidance it uses raw nodemailer
 * rather than the BC-ticket-attached helper. It still runs the repo's em-dash /
 * style preflight before sending.
 *
 * Usage:
 *   MANDRILL_API_KEY=... node scripts/sendPrReviewDigest.js <verdicts.json> [report.html]
 *
 * Idempotency (CLAUDE.md NON-NEGOTIABLE for Mandrill sends): dedups on a
 * business_event_id = hash of (pr#, head-SHA-from-state, recommendation) for the
 * reviewed set. The same review re-sent is a no-op; a re-pushed PR (new SHA) or a
 * changed verdict produces a new id and does send. Sent ids are logged to
 * .claude/pr-review-digests-sent.json.
 *
 * Fails loud if MANDRILL_API_KEY is absent (no silent swallow).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
// Both paths are env-overridable so the VPS email clone can keep state/send-log
// outside the repo tree (a `git reset --hard origin/bot/pr-reviews` would otherwise
// reset the committed state, and must never lose the local send-log dedup).
const STATE = process.env.PR_REVIEW_STATE || path.join(ROOT, '.claude', 'pr-review-state.json');
const SENT_LOG = process.env.PR_DIGEST_SENT_LOG || path.join(ROOT, '.claude', 'pr-review-digests-sent.json');
const REPO = 'ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator';
const PR_URL = (n) => `https://github.com/${REPO}/pull/${n}`;
const RECIPIENT = process.env.PR_DIGEST_TO || process.env.MANDRILL_USERNAME || 'ali@colaberry.com';

function requireNodemailer() {
  const candidates = [
    path.join(ROOT, 'node_modules', 'nodemailer'),
    path.join(ROOT, 'backend', 'node_modules', 'nodemailer'),
  ];
  for (const c of candidates) { try { return require(c); } catch (_) { /* try next */ } }
  return require('nodemailer');
}
function requirePreflight() {
  try { return require(path.join(ROOT, 'backend', 'src', 'scripts', 'lib', 'mandrillPreflight')); }
  catch (_) { return { validateBeforeSend: () => {} }; }
}

const VERDICT_META = {
  APPROVE: { label: 'APPROVE', color: '#1a7f5a' },
  APPROVE_WITH_NITS: { label: 'APPROVE w/ nits', color: '#0e7490' },
  REQUEST_CHANGES: { label: 'REQUEST CHANGES', color: '#b7791f' },
  BLOCK: { label: 'BLOCK', color: '#b42318' },
};
const RANK = { APPROVE: 0, APPROVE_WITH_NITS: 1, REQUEST_CHANGES: 2, BLOCK: 3 };

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }
function load(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; } }

function eventId(verdicts, state) {
  const parts = verdicts
    .map((v) => `${v.pr}:${(state[String(v.pr)] || {}).oid || '?'}:${v.recommendation}`)
    .sort();
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}

function buildHtml(verdicts, counts, reportName) {
  const rows = verdicts.map((v) => {
    const m = VERDICT_META[v.recommendation] || VERDICT_META.BLOCK;
    return `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid #eef2f7"><a href="${PR_URL(v.pr)}" style="color:#0e7490;text-decoration:none;font-weight:700">#${esc(v.pr)}</a></td>
      <td style="padding:8px 10px;border-bottom:1px solid #eef2f7">${esc(v.title || '')}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eef2f7;white-space:nowrap"><span style="color:#fff;background:${m.color};padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700">${m.label}</span></td>
      <td style="padding:8px 10px;border-bottom:1px solid #eef2f7;font-size:13px;color:#475569">${esc(v.suggestedAction || '')}</td>
    </tr>`;
  }).join('');
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a2233;max-width:760px">
  <h2 style="color:#1e293b;margin:0 0 4px">PR Approval Review — autopilot digest</h2>
  <div style="color:#5b6677;font-size:13px;margin-bottom:14px">${esc(REPO)} &middot; ${verdicts.length} PR(s) reviewed this run &middot; recommend-only</div>
  <div style="font-size:14px;margin-bottom:14px">
    <strong style="color:#1a7f5a">${counts.APPROVE || 0}</strong> approve &middot;
    <strong style="color:#0e7490">${counts.APPROVE_WITH_NITS || 0}</strong> approve w/ nits &middot;
    <strong style="color:#b7791f">${counts.REQUEST_CHANGES || 0}</strong> request changes &middot;
    <strong style="color:#b42318">${counts.BLOCK || 0}</strong> block
  </div>
  <table style="border-collapse:collapse;width:100%;font-size:14px">
    <thead><tr style="text-align:left;color:#5b6677;font-size:12px;text-transform:uppercase;letter-spacing:.04em">
      <th style="padding:6px 10px">PR</th><th style="padding:6px 10px">Title</th><th style="padding:6px 10px">Verdict</th><th style="padding:6px 10px">Do next</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="margin-top:16px;font-size:13px;color:#5b6677">Full evidence (blockers, majors, nits, rationale per PR) is in the attached report <code>${esc(reportName || 'PR_REVIEW.html')}</code>. Every verdict is advisory; you perform the approval and merge.</div>
  <div style="margin-top:18px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8">Sent by the PR Approval Autopilot. Reply not monitored.</div>
</div>`;
}

function buildText(verdicts, counts) {
  const lines = verdicts.map((v) => `  #${v.pr} [${(VERDICT_META[v.recommendation] || {}).label || v.recommendation}] ${v.title || ''}\n    -> ${v.suggestedAction || ''}`);
  return `PR Approval Review - autopilot digest\n${REPO} - ${verdicts.length} PR(s) reviewed - recommend-only\n\n`
    + `${counts.APPROVE || 0} approve / ${counts.APPROVE_WITH_NITS || 0} approve-w-nits / ${counts.REQUEST_CHANGES || 0} request-changes / ${counts.BLOCK || 0} block\n\n`
    + lines.join('\n\n')
    + `\n\nFull evidence is in the attached HTML report. Verdicts are advisory; you perform the approval and merge.\n\nSent by the PR Approval Autopilot.`;
}

async function main() {
  const verdictsPath = process.argv[2];
  const reportPath = process.argv[3];
  if (!verdictsPath) { console.error('usage: node scripts/sendPrReviewDigest.js <verdicts.json> [report.html]'); process.exit(1); }

  const raw = load(verdictsPath);
  if (!raw) { console.error('cannot read ' + verdictsPath); process.exit(1); }
  const data = raw.result && raw.result.verdicts ? raw.result : raw;
  const verdicts = (data.verdicts || []).slice().sort((a, b) => (RANK[a.recommendation] ?? 9) - (RANK[b.recommendation] ?? 9) || a.pr - b.pr);
  if (!verdicts.length) { console.log('no verdicts to send; skipping email.'); return; }

  if (!process.env.MANDRILL_API_KEY) {
    console.error('MANDRILL_API_KEY is not set. On the VPS cron this is supplied by cron-env-wrapper.sh (pulled from the backend container). Refusing to send.');
    process.exit(1);
  }

  const state = load(STATE) || {};
  const id = eventId(verdicts, state);
  const sentLog = load(SENT_LOG) || {};
  if (sentLog[id]) { console.log(`digest ${id} already sent at ${sentLog[id].sentAt} (mandrill ${sentLog[id].mandrillId}); skipping (idempotent).`); return; }

  const counts = verdicts.reduce((a, v) => { a[v.recommendation] = (a[v.recommendation] || 0) + 1; return a; }, {});
  const reportName = reportPath ? path.basename(reportPath) : 'PR_REVIEW.html';
  const html = strip(buildHtml(verdicts, counts, reportName));
  const text = strip(buildText(verdicts, counts));

  requirePreflight().validateBeforeSend(html, text);

  const attachments = [];
  if (reportPath && fs.existsSync(reportPath)) {
    attachments.push({ filename: reportName, content: fs.readFileSync(reportPath), contentType: 'text/html' });
  }

  const nodemailer = requireNodemailer();
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });

  const subject = `PR Review Autopilot — ${verdicts.length} PR(s): ${counts.APPROVE || 0} approve / ${counts.REQUEST_CHANGES || 0} changes / ${counts.BLOCK || 0} block`;
  const sent = await transport.sendMail({
    from: '"Colaberry PR Autopilot" <ali@colaberry.com>',
    to: RECIPIENT,
    replyTo: 'ali@colaberry.com',
    subject: strip(subject),
    html, text, attachments,
    headers: { 'X-MC-Track': 'opens', 'X-MC-AutoText': 'false' },
  });

  sentLog[id] = { sentAt: new Date().toISOString(), mandrillId: sent.messageId, prs: verdicts.map((v) => v.pr) };
  fs.mkdirSync(path.dirname(SENT_LOG), { recursive: true });
  fs.writeFileSync(SENT_LOG, JSON.stringify(sentLog, null, 2) + '\n');
  console.log(`sent digest ${id} to ${RECIPIENT} (mandrill ${sent.messageId}); ${verdicts.length} PR(s).`);
}

main().catch((e) => { console.error('sendPrReviewDigest failed: ' + (e && e.stack || e)); process.exit(1); });
