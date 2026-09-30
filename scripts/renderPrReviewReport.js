#!/usr/bin/env node
/**
 * renderPrReviewReport.js
 *
 * Deterministic renderer for the pr-approval-review workflow output.
 * Reads a verdicts JSON file ({ prs, verdicts, reviewedAt }) and writes a
 * styled, self-contained HTML report. Recommend-only: it never approves or
 * merges — it presents what the multi-agent review found so a human decides.
 *
 * Usage:
 *   node scripts/renderPrReviewReport.js <verdicts.json> [out.html]
 *
 * Single responsibility: JSON -> HTML. No network, no git, no side effects
 * beyond writing the one output file. Idempotent: same input -> same output.
 */
const fs = require('fs');
const path = require('path');

const REPO = 'ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator';
const PR_URL = (n) => `https://github.com/${REPO}/pull/${n}`;

const VERDICT_META = {
  APPROVE:           { label: 'APPROVE',          rank: 0, color: '#1a7f5a', bg: '#e7f5ef', accent: '#1a7f5a' },
  APPROVE_WITH_NITS: { label: 'APPROVE w/ nits',  rank: 1, color: '#0e7490', bg: '#e6f4f7', accent: '#0e7490' },
  REQUEST_CHANGES:   { label: 'REQUEST CHANGES',  rank: 2, color: '#b7791f', bg: '#fbf3e2', accent: '#b7791f' },
  BLOCK:             { label: 'BLOCK',             rank: 3, color: '#b42318', bg: '#fbeceb', accent: '#b42318' },
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pill(text, color, bg) {
  return `<span class="pill" style="color:${color};background:${bg};border-color:${color}33">${esc(text)}</span>`;
}

function findingList(items, kind) {
  const arr = Array.isArray(items) ? items : [];
  if (!arr.length) return '';
  const cls = { blocker: 'b', major: 'm', nit: 'n' }[kind] || 'n';
  const head = { blocker: 'Blockers', major: 'Majors', nit: 'Nits / notes' }[kind] || kind;
  const lis = arr.map((t) => `<li>${esc(t)}</li>`).join('');
  return `<div class="findings ${cls}"><div class="findings-h">${head} <span class="ct">${arr.length}</span></div><ul>${lis}</ul></div>`;
}

function card(v) {
  const meta = VERDICT_META[v.recommendation] || VERDICT_META.BLOCK;
  const conf = typeof v.confidence === 'number' ? Math.round(v.confidence * 100) + '%' : '—';
  const mr = v.mergeReady
    ? pill('merge-ready', '#1a7f5a', '#e7f5ef')
    : pill('not merge-ready', '#b42318', '#fbeceb');
  return `
  <article class="card" style="border-left-color:${meta.accent}">
    <header class="card-h">
      <div class="card-h-l">
        <a class="prno" href="${PR_URL(v.pr)}" target="_blank" rel="noopener">#${esc(v.pr)}</a>
        <h2>${esc(v.title || '(title in PR)')}</h2>
        <div class="meta">by <strong>${esc(v.author || 'unknown')}</strong> &middot; confidence ${conf} &middot; ${mr}</div>
      </div>
      <div class="card-h-r">${pill(meta.label, '#fff', meta.color)}</div>
    </header>
    <div class="rationale"><span class="lbl">Why</span>${esc(v.rationale)}</div>
    <div class="action"><span class="lbl">Do next</span>${esc(v.suggestedAction)}</div>
    ${findingList(v.blockers, 'blocker')}
    ${findingList(v.majors, 'major')}
    ${findingList(v.nits, 'nit')}
  </article>`;
}

function render(data) {
  const verdicts = (data.verdicts || []).slice().sort((a, b) => {
    const ra = (VERDICT_META[a.recommendation] || {}).rank ?? 9;
    const rb = (VERDICT_META[b.recommendation] || {}).rank ?? 9;
    if (ra !== rb) return ra - rb;
    return (a.pr || 0) - (b.pr || 0);
  });

  const counts = verdicts.reduce((acc, v) => {
    acc[v.recommendation] = (acc[v.recommendation] || 0) + 1;
    return acc;
  }, {});
  const conflictBlocked = verdicts.filter(
    (v) => (v.blockers || []).some((b) => /conflict|CONFLICTING|DIRTY/i.test(b))
  ).length;

  const stat = (label, n, color) =>
    `<div class="stat"><div class="stat-n" style="color:${color}">${n || 0}</div><div class="stat-l">${label}</div></div>`;

  const insight = conflictBlocked >= 2
    ? `<div class="insight"><strong>Pattern:</strong> ${conflictBlocked} of ${verdicts.length} PRs are blocked by merge conflicts &mdash; almost all on the append-only <code>PROGRESS.md</code> log. Concurrent sessions are colliding there. Worth a process fix (append-only merge driver, or per-session changelog fragments) independent of these PRs.</div>`
    : '';

  const reviewedAt = data.reviewedAt || '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>PR Approval Review${reviewedAt ? ' — ' + esc(reviewedAt) : ''}</title>
<style>
  :root { --ink:#1a2233; --muted:#5b6677; --line:#e2e8f0; --bg:#f5f7fa; --navy:#1e293b; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
    font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  .wrap { max-width:1040px; margin:0 auto; padding:32px 24px 80px; }
  header.top { border-bottom:1px solid var(--line); padding-bottom:20px; margin-bottom:24px; }
  header.top h1 { margin:0 0 4px; font-size:24px; letter-spacing:-.01em; color:var(--navy); }
  header.top .sub { color:var(--muted); font-size:13.5px; }
  header.top .sub .badge { display:inline-block; margin-left:8px; padding:1px 8px; border-radius:999px;
    background:#eef2f7; color:var(--muted); font-size:11.5px; font-weight:600; text-transform:uppercase; letter-spacing:.04em; }
  .stats { display:flex; gap:12px; margin:20px 0 4px; flex-wrap:wrap; }
  .stat { background:#fff; border:1px solid var(--line); border-radius:12px; padding:14px 18px; min-width:120px; }
  .stat-n { font-size:26px; font-weight:700; line-height:1; }
  .stat-l { color:var(--muted); font-size:12px; margin-top:6px; text-transform:uppercase; letter-spacing:.04em; }
  .insight { background:#fff8e6; border:1px solid #f1d99a; color:#7a5a12; border-radius:12px;
    padding:14px 16px; margin:18px 0 0; font-size:13.5px; }
  .insight code { background:#00000010; padding:1px 5px; border-radius:5px; }
  .card { background:#fff; border:1px solid var(--line); border-left-width:5px; border-radius:14px;
    padding:20px 22px; margin:18px 0; box-shadow:0 1px 2px rgba(16,24,40,.04); }
  .card-h { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }
  .card-h-l h2 { margin:4px 0 2px; font-size:17px; color:var(--navy); letter-spacing:-.01em; }
  .prno { font-weight:700; color:#0e7490; text-decoration:none; font-size:13px; }
  .prno:hover { text-decoration:underline; }
  .meta { color:var(--muted); font-size:13px; }
  .pill { display:inline-block; padding:2px 10px; border-radius:999px; border:1px solid;
    font-size:11.5px; font-weight:700; letter-spacing:.03em; white-space:nowrap; }
  .rationale, .action { margin-top:14px; font-size:14px; }
  .lbl { display:block; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em;
    color:var(--muted); margin-bottom:3px; }
  .action { background:#f3f6fb; border-radius:10px; padding:12px 14px; }
  .findings { margin-top:14px; }
  .findings-h { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px; }
  .findings .ct { display:inline-block; background:#eef2f7; color:var(--muted); border-radius:999px;
    padding:0 7px; font-size:11px; margin-left:4px; }
  .findings.b .findings-h { color:#b42318; }
  .findings.m .findings-h { color:#b7791f; }
  .findings.n .findings-h { color:var(--muted); }
  .findings ul { margin:0; padding-left:18px; }
  .findings li { margin:5px 0; font-size:13.5px; }
  .findings.b li::marker { color:#b42318; }
  .findings.m li::marker { color:#b7791f; }
  footer { margin-top:40px; color:var(--muted); font-size:12px; text-align:center; }
</style></head>
<body><div class="wrap">
  <header class="top">
    <h1>PR Approval Review</h1>
    <div class="sub">${esc(REPO)}<span class="badge">recommend-only</span><span class="badge">${verdicts.length} PRs</span>${reviewedAt ? '<span class="badge">' + esc(reviewedAt) + '</span>' : ''}</div>
    <div class="stats">
      ${stat('Approve', counts.APPROVE, '#1a7f5a')}
      ${stat('Approve w/ nits', counts.APPROVE_WITH_NITS, '#0e7490')}
      ${stat('Request changes', counts.REQUEST_CHANGES, '#b7791f')}
      ${stat('Block', counts.BLOCK, '#b42318')}
    </div>
    ${insight}
  </header>
  ${verdicts.map(card).join('\n')}
  <footer>Generated by the pr-approval-review multi-agent workflow &middot; verdicts are advisory; a human performs every approval and merge.</footer>
</div></body></html>`;
}

function main() {
  const inPath = process.argv[2];
  if (!inPath) {
    console.error('usage: node scripts/renderPrReviewReport.js <verdicts.json> [out.html]');
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  // accept either the workflow's full output ({result:{...}}) or the bare result
  const data = raw.result && raw.result.verdicts ? raw.result : raw;
  const outPath = process.argv[3] || path.join(path.dirname(inPath), 'PR_REVIEW.html');
  fs.writeFileSync(outPath, render(data), 'utf8');
  console.log('Wrote ' + outPath + ' (' + (data.verdicts || []).length + ' verdicts)');
}

main();
