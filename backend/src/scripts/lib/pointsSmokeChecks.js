'use strict';
/**
 * pointsSmokeChecks.js — the pure decision logic behind the daily points-earn
 * smoke test (backend/src/scripts/pointsEarnSmoke.js).
 *
 * WHY THIS FILE IS SEPARATE FROM THE RUNNER
 * -----------------------------------------
 * The runner talks to production: it mints a guest, completes a card, and can
 * send mail. None of that is testable in CI. Everything that DECIDES something —
 * which cards are eligible, whether the award matches the badge, whether an
 * alert should actually be sent — is pure, lives here, and is covered by
 * __tests__/pointsSmokeChecks.test.js.
 *
 * The split exists because of how this monitor's predecessor failed. A cloud
 * routine ran this same check daily from 2026-07-19 and produced zero valid
 * results: July runs died on a weekly model rate limit, August runs were blocked
 * by the sandbox egress proxy before the first HTTP request. Every failure it
 * reported was a failure of the monitor, not of the product. Pushing the
 * assertions down into pure functions means the part that says "the points
 * economy is broken" is the part CI actually exercises.
 *
 * ALERT POLICY (the no-noise rule, made deterministic)
 * ----------------------------------------------------
 * - Passing runs send nothing.
 * - A failing run sends at most ONE email per UTC day. Re-running the cron (or a
 *   manual re-run during triage) does not re-send. This is the idempotency
 *   contract: same input, same day, same end state, one side effect.
 * - The first passing run AFTER a failure sends exactly one recovery notice, so
 *   silence always means "green", never "the monitor died again".
 */

/** Render bands whose completion needs a watch-gate or a bespoke submit flow,
 *  so a plain POST /complete cannot legitimately award them. Excluding them is
 *  what keeps the smoke test from reporting a false failure on a healthy app. */
const GATED_BANDS = Object.freeze(['media', 'survey', 'quiz', 'evaluation']);

/** The "+N pts" badge a card renders, which is the number the award must match. */
function badgeOf(card) {
  const p = (card && card.points) || {};
  return (p.learning || 0) + (p.builder || 0) + (p.community || 0);
}

/**
 * Cards this test may legitimately complete: available, not gated, worth points.
 * Feed order is preserved — the runner tries them in order and stops at the
 * first that actually awards.
 */
function selectCandidates(cards, gatedBands = GATED_BANDS) {
  const gated = new Set(gatedBands);
  return (Array.isArray(cards) ? cards : []).filter(
    (c) => c && c.status === 'available' && !gated.has(c.render_band) && badgeOf(c) > 0,
  );
}

/**
 * The two assertions that are the entire point of the monitor:
 *   badge parity — a completion awards EXACTLY what the card advertised, and
 *   accrual      — the points total rises by exactly that award.
 *
 * Returns every violation rather than the first, so one email explains the whole
 * picture instead of hiding the second defect behind the first.
 */
function evaluateEarn({ total0, total1, awarded, badge }) {
  const failures = [];
  if (awarded !== badge) {
    failures.push({
      check: 5,
      error_class: 'ContractViolation',
      message: `award/badge mismatch: card advertised ${badge} pts, completion awarded ${awarded}`,
    });
  }
  const expected = total0 + awarded;
  if (total1 !== expected) {
    failures.push({
      check: 6,
      error_class: 'ContractViolation',
      message: `accrual mismatch: total went ${total0} -> ${total1}, expected ${expected}`,
    });
  }
  return { ok: failures.length === 0, failures };
}

/**
 * Should this run send mail, and of what kind?
 *
 * @param {object|null} prev      previous persisted state (null on first run)
 * @param {'pass'|'fail'} outcome this run's result
 * @param {string} todayUtc       YYYY-MM-DD in UTC
 */
function decideAlert({ prev, outcome, todayUtc }) {
  if (outcome === 'fail') {
    if (prev && prev.lastAlertKind === 'failure' && prev.lastAlertDate === todayUtc) {
      return { send: false, kind: null, reason: 'failure already alerted today (dedup)' };
    }
    return { send: true, kind: 'failure', reason: 'first failure alert for this UTC day' };
  }
  if (prev && prev.status === 'fail') {
    return { send: true, kind: 'recovery', reason: 'transition fail -> pass' };
  }
  return { send: false, kind: null, reason: 'healthy, no-noise rule' };
}

/** The state to persist after a run. Pure so the dedup contract is testable. */
function nextState({ prev, outcome, todayUtc, nowIso, alert }) {
  const state = {
    status: outcome,
    lastRunDate: todayUtc,
    updatedAt: nowIso,
    lastAlertDate: (prev && prev.lastAlertDate) || null,
    lastAlertKind: (prev && prev.lastAlertKind) || null,
  };
  if (alert && alert.send) {
    state.lastAlertDate = todayUtc;
    state.lastAlertKind = alert.kind;
  }
  return state;
}

/** Plain-text failure email. No em-dashes, no secrets, no HTML. */
function formatFailureEmail({ base, failures, context = {} }) {
  const lines = [
    `The daily points-earn smoke test FAILED against ${base}.`,
    '',
    `Failed check(s): ${failures.map((f) => f.check).join(', ')}`,
    '',
  ];
  failures.forEach((f, i) => {
    lines.push(`${i + 1}. [check ${f.check}] ${f.error_class}: ${f.message}`);
    if (f.detail) lines.push(`   ${f.detail}`);
  });
  lines.push('');
  const keys = Object.keys(context);
  if (keys.length) {
    lines.push('Context:');
    keys.forEach((k) => lines.push(`  ${k}: ${context[k]}`));
    lines.push('');
  }
  lines.push(
    'This test runs on the production host, so a failure here means the API itself',
    'misbehaved. It is not a sandbox or network artifact.',
    '',
    'Runbook: reproduce with',
    '  /opt/colaberry-accelerator/scripts/cron-env-wrapper.sh \\',
    '    /opt/colaberry-accelerator/backend/src/scripts/pointsEarnSmoke.js --dry',
    'then check the classroom card completion path and the points ledger.',
    'Full log: /var/log/points-earn-smoke.log',
    '',
    'You will get one email per day for this, and one when it goes green again.',
  );
  return lines.join('\n');
}

/** Plain-text recovery notice, sent once on the fail -> pass transition. */
function formatRecoveryEmail({ base, awarded, badge, total0, total1, renderBand }) {
  return [
    `The daily points-earn smoke test is GREEN again against ${base}.`,
    '',
    `Award matched the badge: ${awarded} == ${badge} (${renderBand} card).`,
    `Points total: ${total0} -> ${total1}.`,
    '',
    'No further email until it fails again.',
  ].join('\n');
}

module.exports = {
  GATED_BANDS,
  badgeOf,
  selectCandidates,
  evaluateEarn,
  decideAlert,
  nextState,
  formatFailureEmail,
  formatRecoveryEmail,
};
