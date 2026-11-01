/**
 * AF6.1: re-measure the 21 unresolved legacy agents. READ-ONLY, SELECTs only.
 *
 *   docker exec -e NODE_PATH=/app/node_modules accelerator-backend node /tmp/af61Measure.js
 *
 * Why re-measure at all: the tracked file was measured 2026-10-28 and the decision package
 * 2026-10-14. A decision record that quotes a stale run count for a LIVE agent invites the
 * reader to believe something was verified today that was not.
 *
 * Why ai_agent_activity_logs and not agent_runs: agent_runs holds 2 rows and is vestigial.
 * Reading it would show zero activity for agents that run constantly and make retirement look
 * safe. That is the most expensive mistake available on this ticket.
 *
 * TWO THINGS THE FIRST VERSION OF THIS SCRIPT GOT WRONG, both worth keeping in view:
 *
 *  1. It guessed the column names. The table is `ai_agents.agent_name`, not `name`, and
 *     `ai_agent_activity_logs` has NO agent_name at all -- it carries `agent_id`, a uuid, so
 *     activity only joins through the agents table.
 *  2. Far worse: it caught the query failure, printed `0 of 21 found`, and then listed all 21
 *     under "no activity rows at all". A failed lookup rendered as a confident zero -- the exact
 *     shape of error this ticket warns about, where reading the wrong thing makes retiring a
 *     live agent look safe. A failed query is now FATAL. An unreadable measurement is not a
 *     measurement of zero.
 */
'use strict';

const { Client } = require('pg');

const NAMES = [
  'BehavioralSignalDetector', 'BehavioralTriggerEvaluator', 'ICPInsightComputer',
  'IntentScoreRecomputer', 'OpportunityScoreRecomputer', 'PortfolioGitHubSyncAgent',
  'SessionLifecycle', 'SessionReminders',
  'Alumni_Outreach_Agent', 'Alumni_Reengagement_Agent', 'Alumni_Referral_Agent',
  'Corporate_Training_Agent', 'Employer_Relationship_Agent', 'Enterprise_Partnership_Agent',
  'Opportunity_Detection_Agent', 'Trend_Detection_Agent',
  'calendar_intent_booster', 'forecast_engine', 'intent_scorer', 'revenue_aggregator',
  'visitor_tracker',
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set -- run inside accelerator-backend.');
    process.exit(2);
  }
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    /* One query. The activity counts hang off the agent row by uuid, so a LEFT JOIN keeps an
       agent with zero activity visible as zero rather than dropping it from the result. */
    const r = await c.query(
      `SELECT a.agent_name,
              a.enabled,
              a.status,
              a.autonomy_level,
              COALESCE(a.autonomy_level_source, '')        AS autonomy_source,
              a.record_kind,
              a.agent_group,
              a.department,
              a.run_count,
              a.created_at,
              a.last_run_at,
              COUNT(l.id)                                                           AS rows_all,
              COUNT(l.id) FILTER (WHERE l.created_at > now() - interval '30 days')  AS rows_30d,
              MAX(l.created_at)                                                     AS last_at
         FROM public.ai_agents a
         LEFT JOIN public.ai_agent_activity_logs l ON l.agent_id = a.id
        WHERE a.agent_name = ANY($1::text[])
        GROUP BY a.id, a.agent_name, a.enabled, a.status, a.autonomy_level,
                 a.autonomy_level_source, a.record_kind, a.agent_group, a.department,
                 a.run_count, a.created_at, a.last_run_at
        ORDER BY COUNT(l.id) DESC, a.agent_name`, [NAMES],
    );

    console.log(`== ${r.rows.length} of ${NAMES.length} found in ai_agents\n`);
    for (const a of r.rows) {
      console.log([
        String(a.agent_name).padEnd(30),
        `en=${a.enabled}`.padEnd(9),
        String(a.status || '-').padEnd(10),
        String(a.autonomy_level || '-').padEnd(10),
        `src=${a.autonomy_source || 'EMPTY'}`.padEnd(12),
        `runs=${a.run_count == null ? '-' : a.run_count}`.padStart(14),
        `act=${a.rows_all}`.padStart(13),
        `30d=${a.rows_30d}`.padStart(12),
        `last=${a.last_at ? new Date(a.last_at).toISOString().slice(0, 16) : 'never'}`,
      ].join(' '));
    }

    const found = new Set(r.rows.map((x) => x.agent_name));
    const missing = NAMES.filter((n) => !found.has(n));
    console.log(`\nnot present in ai_agents (${missing.length}): ${missing.join(', ') || '(none)'}`);
    console.log(`\nmeasured_on ${new Date().toISOString().slice(0, 10)}`);
  } finally {
    await c.end();
  }
}

/* No catch that swallows. A failed measurement exits non-zero and prints nothing reassuring. */
main().catch((e) => {
  console.error(`MEASURE FAILED (this is NOT a measurement of zero): ${e.message}`);
  process.exit(1);
});
