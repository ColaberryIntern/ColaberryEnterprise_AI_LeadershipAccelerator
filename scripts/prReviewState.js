#!/usr/bin/env node
/**
 * prReviewState.js
 *
 * Deterministic state tracker for the pr-approval-review autopilot. It decides
 * which open PRs are NEW or have a CHANGED head commit since they were last
 * reviewed, so the autopilot reviews only those instead of the whole queue.
 *
 * State file: .claude/pr-review-state.json  -> { "<pr#>": { oid, recommendation, reviewedAt } }
 *
 * Modes:
 *   diff                  Print {toReview, unchanged, total} as JSON. toReview =
 *                         open non-draft PRs that are new or whose head SHA moved.
 *   record <verdicts.json> Update state for every PR in the verdicts file with its
 *                         current head SHA + recommendation + timestamp.
 *
 * Single responsibility: queue-state bookkeeping. No review logic, no email.
 * Idempotent: `diff` is read-only; a second `record` of the same verdicts is a no-op
 * unless the head SHA moved.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = 'ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator';
// PR_REVIEW_STATE lets a deployment point the state file outside the repo tree
// (e.g. so a `git reset --hard` on the VPS email clone never clobbers it).
const STATE = process.env.PR_REVIEW_STATE || path.join(__dirname, '..', '.claude', 'pr-review-state.json');

function ghOpenPRs() {
  const out = execFileSync(
    'gh',
    ['pr', 'list', '-R', REPO, '--state', 'open', '--limit', '100', '--json', 'number,isDraft,headRefOid,title'],
    { encoding: 'utf8' }
  );
  return JSON.parse(out).filter((p) => !p.isDraft);
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; }
}
function saveState(s) {
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2) + '\n');
}

function diff() {
  const prs = ghOpenPRs();
  const st = loadState();
  const toReview = [];
  const unchanged = [];
  for (const p of prs) {
    const prev = st[String(p.number)];
    if (!prev || prev.oid !== p.headRefOid) toReview.push(p.number);
    else unchanged.push(p.number);
  }
  // prune state entries for PRs that are no longer open
  const openSet = new Set(prs.map((p) => String(p.number)));
  let pruned = 0;
  for (const k of Object.keys(st)) if (!openSet.has(k)) { delete st[k]; pruned++; }
  if (pruned) saveState(st);
  process.stdout.write(JSON.stringify({ toReview, unchanged, total: prs.length, pruned }, null, 2) + '\n');
}

function record(verdictsPath) {
  if (!verdictsPath) { console.error('record needs <verdicts.json>'); process.exit(1); }
  const raw = JSON.parse(fs.readFileSync(verdictsPath, 'utf8'));
  const data = raw.result && raw.result.verdicts ? raw.result : raw;
  const verdicts = data.verdicts || [];
  const oidByNum = Object.fromEntries(ghOpenPRs().map((p) => [String(p.number), p.headRefOid]));
  const st = loadState();
  const now = new Date().toISOString();
  for (const v of verdicts) {
    const k = String(v.pr);
    st[k] = { oid: oidByNum[k] || (st[k] && st[k].oid) || null, recommendation: v.recommendation, reviewedAt: now };
  }
  saveState(st);
  process.stdout.write('recorded ' + verdicts.length + ' verdict(s) to ' + STATE + '\n');
}

const mode = process.argv[2] || 'diff';
if (mode === 'diff') diff();
else if (mode === 'record') record(process.argv[3]);
else { console.error('unknown mode: ' + mode + ' (use: diff | record <verdicts.json>)'); process.exit(1); }
