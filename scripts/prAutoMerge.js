#!/usr/bin/env node
/**
 * prAutoMerge.js — the autonomous merge step of the pr-review-autopilot, with guardrails.
 *
 * Given a verdicts JSON (from pr-approval-review), it merges the ELIGIBLE PRs into main
 * SERIALLY — one at a time, re-syncing main between each so the PROGRESS.md union driver
 * resolves cleanly and concurrent PRs do not thrash (the cascade we hit when merging in
 * parallel). Everything not eligible is FLAGGED for a human, never force-merged.
 *
 * A truly autonomous system still refuses to merge what it shouldn't. Eligibility:
 *   1. recommendation is APPROVE or APPROVE_WITH_NITS (never BLOCK / REQUEST_CHANGES)
 *   2. mergeReady === true
 *   3. the PR's changed files touch NO guardrail path (money / auth / schema / infra)
 *   4. the diff is not oversized (> MAX_FILES files or > MAX_LINES changed)
 * Anything failing 1-4 is flagged with the reason; a human decides.
 *
 * Guardrail paths ALWAYS require a human even when the gate is green, because a wrong
 * auto-merge there sends real money/comms, leaks secrets, or corrupts schema:
 *   payments/webhooks (stripe, paysimple, billing, enrollment, payment, webhook),
 *   auth/secrets (auth, token, password, secret, credential),
 *   schema (models/index, migration, *.sql, seeds that alter prod data).
 *
 * Usage:
 *   node scripts/prAutoMerge.js <verdicts.json>            # dry-run: print the plan
 *   node scripts/prAutoMerge.js <verdicts.json> --execute  # perform the serial merges
 *
 * Requires: gh + git authed; admin rights (branch-protection bypass for self-authored PRs).
 * Idempotent: an already-merged PR is skipped; a dry-run changes nothing.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO = 'ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator';
const REMOTE = `https://github.com/${REPO}.git`;
const MAX_FILES = 40;
const MAX_LINES = 1500;
const GUARDRAIL = /(stripe|paysimple|billing|enrollment|payment|webhook|\bauth\b|token|password|secret|credential|models\/index|migration|\.sql$|seeds\/)/i;
const MERGEABLE_RECS = new Set(['APPROVE', 'APPROVE_WITH_NITS']);

const EXECUTE = process.argv.includes('--execute');
const verdictsPath = process.argv[2];
if (!verdictsPath) { console.error('usage: node scripts/prAutoMerge.js <verdicts.json> [--execute]'); process.exit(1); }

function gh(args) { return execFileSync('gh', args, { encoding: 'utf8' }); }
function git(cwd, args) { return execFileSync('git', args, { cwd, encoding: 'utf8' }); }

function prFacts(pr) {
  const j = JSON.parse(gh(['pr', 'view', String(pr), '-R', REPO, '--json', 'state,headRefName,mergeable,files,author']));
  const files = (j.files || []).map((f) => f.path);
  const changed = (j.files || []).reduce((a, f) => a + (f.additions || 0) + (f.deletions || 0), 0);
  return { state: j.state, branch: j.headRefName, mergeable: j.mergeable, files, changed, author: j.author && j.author.login };
}

/** Decide, for one verdict, whether it is auto-merge eligible. Returns {eligible, reason}. */
function classify(v, facts) {
  if (facts.state !== 'OPEN') return { eligible: false, reason: `already ${facts.state}` };
  if (!MERGEABLE_RECS.has(v.recommendation)) return { eligible: false, reason: `verdict ${v.recommendation} (only APPROVE/APPROVE_WITH_NITS auto-merge)` };
  if (!v.mergeReady) return { eligible: false, reason: 'not mergeReady per verdict' };
  const hit = facts.files.find((f) => GUARDRAIL.test(f));
  if (hit) return { eligible: false, reason: `touches guardrail path (${hit}) — human review required` };
  if (facts.files.length > MAX_FILES || facts.changed > MAX_LINES) return { eligible: false, reason: `oversized diff (${facts.files.length} files / ${facts.changed} lines) — human review` };
  return { eligible: true, reason: 'eligible' };
}

/** Serially merge one branch into main via local union-merge + push (the proven mechanism). */
function mergeIntoMain(wt, pr, branch) {
  git(wt, ['fetch', 'origin', 'main', branch, '--quiet']);
  git(wt, ['reset', '--hard', 'origin/main', '--quiet']);
  try {
    git(wt, ['merge', `origin/${branch}`, '--no-edit', '-m', `Merge pull request #${pr} from ${branch} [autopilot]`]);
  } catch (e) {
    git(wt, ['merge', '--abort']);
    return { merged: false, reason: 'code conflict on merge (not PROGRESS.md) — flagged' };
  }
  const markers = git(wt, ['grep', '-cE', '^<<<<<<<|^>>>>>>>', '--', 'PROGRESS.md']).trim();
  if (markers && markers !== '0') { git(wt, ['reset', '--hard', 'origin/main', '--quiet']); return { merged: false, reason: 'unresolved markers' }; }
  git(wt, ['push', 'origin', 'HEAD:main', '--quiet']);
  return { merged: true, reason: 'merged' };
}

function main() {
  const raw = JSON.parse(fs.readFileSync(verdictsPath, 'utf8'));
  const data = raw.result && raw.result.verdicts ? raw.result : raw;
  const verdicts = data.verdicts || [];

  const plan = verdicts.map((v) => {
    let facts;
    try { facts = prFacts(v.pr); } catch (e) { return { pr: v.pr, eligible: false, reason: 'gh lookup failed', facts: null }; }
    const c = classify(v, facts);
    return { pr: v.pr, branch: facts.branch, eligible: c.eligible, reason: c.reason };
  });

  const eligible = plan.filter((p) => p.eligible);
  const flagged = plan.filter((p) => !p.eligible);

  console.log(`\n=== AUTO-MERGE PLAN (${EXECUTE ? 'EXECUTE' : 'dry-run'}) ===`);
  console.log(`Eligible (${eligible.length}): ${eligible.map((p) => '#' + p.pr).join(', ') || '(none)'}`);
  for (const f of flagged) console.log(`  FLAG #${f.pr}: ${f.reason}`);

  if (!EXECUTE) { console.log('\n(dry-run; re-run with --execute to merge the eligible set)'); return; }

  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-automerge-'));
  try {
    execFileSync('git', ['clone', '--branch', 'main', '--single-branch', REMOTE, wt], { stdio: 'ignore' });
    const merged = [];
    for (const p of eligible) {
      const r = mergeIntoMain(wt, p.pr, p.branch);
      console.log(`  ${r.merged ? '✓ MERGED' : '✗ skip'} #${p.pr}: ${r.reason}`);
      if (r.merged) merged.push(p.pr);
    }
    console.log(`\nMerged ${merged.length}: ${merged.map((n) => '#' + n).join(', ')}`);
    console.log(`Flagged for human: ${flagged.map((f) => '#' + f.pr).join(', ') || '(none)'}`);
  } finally {
    fs.rmSync(wt, { recursive: true, force: true });
  }
}

main();
