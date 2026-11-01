/**
 * Write Ali's AF6.1 ruling into the tracked undomained bucket.
 *
 *   node applyAf61Ruling.js <path-to-_unresolved.json>
 *
 * Deterministic and idempotent: running it twice produces a byte-identical file, because every
 * value it writes is derived from the ruling below rather than from the file's current state.
 *
 * It refuses rather than guesses. If a row's name is not in one of the three groups, or a group
 * does not have exactly the membership the ruling named, nothing is written. A partial apply
 * here would mark some agents decided and leave others silently untouched, which is worse than
 * not running at all -- the whole point of the bucket is that nothing is lost quietly.
 */
'use strict';

const fs = require('fs');

const DECIDED_BY = 'Ali Muwwakkil';
const DECIDED_ON = '2026-11-01';

/* Ali Muwwakkil, 2026-11-01, answering AF6.1 as `Q2: B`. */
const RETIRE = [
  'Alumni_Outreach_Agent', 'Alumni_Reengagement_Agent', 'Alumni_Referral_Agent',
  'Corporate_Training_Agent', 'Employer_Relationship_Agent', 'Enterprise_Partnership_Agent',
  'Opportunity_Detection_Agent', 'Trend_Detection_Agent',
];
const ABSORB = [
  'BehavioralSignalDetector', 'BehavioralTriggerEvaluator', 'ICPInsightComputer',
  'IntentScoreRecomputer', 'OpportunityScoreRecomputer', 'PortfolioGitHubSyncAgent',
  'SessionLifecycle', 'SessionReminders',
];
const PARKED = [
  'calendar_intent_booster', 'forecast_engine', 'intent_scorer', 'revenue_aggregator',
  'visitor_tracker',
];

const ABSORB_BLOCKER = 'No domain owner. These serve two domains at once -- visitor intent '
  + 'scoring is both marketing and sales -- which is why they were undomained in the first '
  + 'place. The ruling is to absorb; the domain that absorbs each one is still unnamed, so this '
  + 'row cannot reach a terminal disposition yet.';
const PARKED_BLOCKER = 'Explicitly deferred on 2026-11-01. Live, production-only, no owner '
  + 'recorded and no autonomy source. Parking is a recorded answer, not a decision, and it must '
  + 'not be counted as one.';

function main() {
  const p = process.argv[2];
  if (!p) throw new Error('usage: applyAf61Ruling.js <path-to-_unresolved.json>');
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));

  const byName = new Map(j.rows.map((r) => [r.agent_name, r]));
  const groups = [['retire', RETIRE], ['absorb', ABSORB], ['parked', PARKED]];

  /* Refuse on any mismatch, before writing a single field. */
  const problems = [];
  const named = new Set([...RETIRE, ...ABSORB, ...PARKED]);
  for (const r of j.rows) if (!named.has(r.agent_name)) problems.push(`${r.agent_name}: in the file but not in the ruling`);
  for (const n of named) if (!byName.has(n)) problems.push(`${n}: in the ruling but not in the file`);
  if (j.rows.length !== 21) problems.push(`expected 21 rows, found ${j.rows.length}`);
  if (problems.length) {
    console.error('REFUSED, nothing written:\n  ' + problems.join('\n  '));
    process.exit(1);
  }

  for (const [ruling, names] of groups) {
    for (const n of names) {
      const r = byName.get(n);
      r.owner_decision = {
        ruling,
        decided_by: DECIDED_BY,
        decided_on: DECIDED_ON,
        ...(ruling === 'absorb' ? { blocked_on: ABSORB_BLOCKER } : {}),
        ...(ruling === 'parked' ? { blocked_on: PARKED_BLOCKER } : {}),
      };
      r.disposition = ruling === 'retire' ? 'retired' : 'unresolved';
    }
  }

  j.needs_owner_decision = j.rows.some((r) => r.disposition === 'unresolved');
  j.owner_ruling = {
    ticket: 'AF6.1',
    answer: 'Q2: B',
    decided_by: DECIDED_BY,
    decided_on: DECIDED_ON,
    text: 'Retire the eight that have never run, absorb the eight that run constantly, park the '
      + 'five live production-only rows.',
    retired: RETIRE.length,
    absorb_pending_domain: ABSORB.length,
    parked: PARKED.length,
    note: 'Sixteen rulings, EIGHT terminal dispositions. Absorb cannot resolve a row without '
      + 'naming the domain that absorbs it, and parked is a deferral. Counting rulings as '
      + 'resolutions would report sixteen of twenty-one done where the truth is eight.',
  };

  fs.writeFileSync(p, `${JSON.stringify(j, null, 2)}\n`, 'utf8');
  const term = j.rows.filter((r) => r.disposition === 'retired').length;
  console.log(`wrote ${p}`);
  console.log(`  rulings recorded: 21 (retire ${RETIRE.length}, absorb ${ABSORB.length}, parked ${PARKED.length})`);
  console.log(`  TERMINAL dispositions: ${term}`);
  console.log(`  still unresolved:     ${j.rows.length - term}`);
  console.log(`  needs_owner_decision: ${j.needs_owner_decision}`);
}

main();
