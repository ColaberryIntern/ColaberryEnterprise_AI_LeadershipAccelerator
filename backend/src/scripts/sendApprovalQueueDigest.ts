/**
 * Send the daily "approvals you owe" digest.
 *
 *   node dist/scripts/sendApprovalQueueDigest.js            # dry run, sends nothing
 *   AGENT_APPROVAL_DIGEST_SEND=on \
 *     node dist/scripts/sendApprovalQueueDigest.js --apply  # sends
 *
 * ## Why a script and a host cron rather than a registered cron job
 *
 * `aiOpsScheduler.ts` is past the 500-line ceiling, so new scheduled work does not go in it --
 * `sendAgentNudges.ts:16-22` states that convention. The alternative, a new module under
 * `services/scheduling/`, means adding an importer to `EXPECTED_CRON_IMPORT_FILES` in the pinned
 * `cronRegistryBaseline` fixture and seeding a registry row. That is a deliberate change to a
 * governance fixture and belongs in its own diff, not folded into the feature that prompted it.
 * So this follows the `scripts/agentNudges.sh` precedent: a script, a wrapper, and the crontab
 * line left for the owner to install.
 *
 * ## Dry run is the default
 *
 * Two independent gates, and both must be open to send: `--apply` on the command line AND
 * `AGENT_APPROVAL_DIGEST_SEND=on` in the environment. One flag would be enough to make it work;
 * two is what makes an accidental run on the wrong box harmless. **This estate runs three
 * scheduler instances**, which is why the environment gate exists at all.
 *
 * ## Failure path
 *
 * A send failure for one mailbox is logged and the next mailbox is still attempted. The exit
 * code is non-zero when any mailbox failed or when any request had nobody to notify, because
 * both mean a builder is waiting on a decision that nobody has been told about.
 */
import { sequelize } from '../config/database';
import { sendApprovalQueueDigests } from '../services/briefings/approvalQueueDigestSender';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  const summary = await sendApprovalQueueDigests({
    dryRun: !apply,
    // The env gate still applies on an --apply run; passing `enabled` here would bypass it.
    ...(apply ? {} : { enabled: true }),
  });

  console.log(JSON.stringify({ mode: apply ? 'APPLY' : 'DRY RUN', ...summary }, null, 2));

  if (!apply) console.log('\nDry run only. Re-run with --apply and AGENT_APPROVAL_DIGEST_SEND=on to send.');
  if (summary.failed > 0 || summary.orphaned > 0) process.exitCode = 1;
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('[approval-digest] fatal:', err?.message ?? err);
      process.exitCode = 1;
    })
    .finally(() => sequelize.close());
}

export { main };
