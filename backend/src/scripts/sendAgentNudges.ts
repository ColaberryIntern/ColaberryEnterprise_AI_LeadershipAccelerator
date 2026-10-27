#!/usr/bin/env node
/**
 * sendAgentNudges - the weekday run behind the agent-builder nudges.
 *
 * Ali, 23 Oct: "I want to send out a message M-F but they need to be different each time. We can
 * send them out if they aren't sending me issues and I don't detect movement or commits."
 *
 * Usage (inside the backend container, which is where Postgres is reachable):
 *
 *   node dist/scripts/sendAgentNudges.js            # DRY RUN: print what would go out
 *   node dist/scripts/sendAgentNudges.js --apply     # actually send
 *
 * The host wrapper `scripts/agentNudges.sh` is what cron calls; it does the `docker exec`.
 *
 * ## Why this is a script and not a job in `aiOpsScheduler`
 *
 * `aiOpsScheduler.ts` is 797 lines, well past the 500-line ceiling in `CLAUDE.md`, which means the
 * next change to it has to split it first. Splitting a live scheduler that owns dozens of jobs is a
 * large refactor and its own decision, not something to do in passing while adding a nudge. The
 * repo's other scheduled work already runs this way - a thin script, a host wrapper, a crontab
 * line, the pattern `scripts/schemaDriftCheck.sh` documents.
 *
 * ## Running twice is safe, which is not an accident
 *
 * There are three scheduler instances on this box and cron can be re-run by hand, so "it fired
 * more than once" is a normal event rather than an incident. Every send goes through
 * `sendOnce` against a business event of `agent-nudge-<domain>-<date>`, arbitrated by a unique
 * index in Postgres. A second run the same day claims nothing and mails nobody. That property is
 * what makes it safe to install this on a schedule at all.
 *
 * ## It reports every builder, including the ones it skipped
 *
 * "Ran, sent two" is not a report when there are seven builders. A skip is the interesting line:
 * it means somebody committed, or we owe them a reply and have not sent it.
 */

import { sequelize } from '../config/database';
import { sendAllNudges } from '../services/internship/agentNudgeSend';

const APPLY = process.argv.includes('--apply');

async function main(): Promise<number> {
  const started = Date.now();
  const result = await sendAllNudges({ dryRun: !APPLY });

  // Human-readable first, because a person reads this in a cron log.
  console.log(`agent nudges: ${APPLY ? 'LIVE' : 'DRY RUN'} - ${result.outcomes.length} builder(s), `
    + `${result.attempted} attempted, ${result.sent} sent`);
  for (const o of result.outcomes) {
    const detail = o.outcome === 'skipped'
      ? `skipped (${o.reason})`
      : o.outcome === 'failed'
        ? `FAILED (${o.errorClass}: ${o.error})`
        : `${o.outcome} - ${o.variant} - "${o.subject}"`;
    console.log(`  ${o.domain.padEnd(14)} ${o.email.padEnd(32)} ${detail}`);
  }

  // Then the structured line, for anything parsing stdout.
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    service: 'agent-nudges',
    event: 'agent_nudge_run_complete',
    duration_ms: Date.now() - started,
    outcome: result.outcomes.some((o) => o.outcome === 'failed') ? 'partial' : 'success',
    context: {
      mode: APPLY ? 'live' : 'dry_run',
      builders: result.outcomes.length,
      attempted: result.attempted,
      sent: result.sent,
      skipped: result.outcomes.filter((o) => o.outcome === 'skipped').length,
      failed: result.outcomes.filter((o) => o.outcome === 'failed').length,
    },
  }));

  // A failed send is a non-zero exit so cron's own mail and the log agree that something broke.
  // A SKIP is not a failure: it is the system deciding correctly not to mail somebody.
  return result.outcomes.some((o) => o.outcome === 'failed') ? 1 : 0;
}

main()
  .then(async (code) => {
    // Close the pool explicitly. A script that leaves a connection open hangs the container's
    // process table on a box that runs this five times a week.
    await sequelize.close().catch(() => undefined);
    process.exit(code);
  })
  .catch(async (err: any) => {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'agent-nudges',
      event: 'agent_nudge_run_failed',
      outcome: 'failure',
      error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
    await sequelize.close().catch(() => undefined);
    process.exit(1);
  });
