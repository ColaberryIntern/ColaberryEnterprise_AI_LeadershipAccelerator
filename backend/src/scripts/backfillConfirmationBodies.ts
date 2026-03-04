/**
 * One-time backfill: Generate confirmation email HTML for Step 0 actions
 * that were created before the body-saving fix was deployed.
 *
 * Run: node dist/scripts/backfillConfirmationBodies.js
 */
import '../models'; // init sequelize
import { ScheduledEmail } from '../models';
import StrategyCall from '../models/StrategyCall';
import { buildStrategyCallConfirmationHtml } from '../services/emailService';
import { Op } from 'sequelize';
import { sequelize } from '../config/database';

async function main() {
  await sequelize.authenticate();
  console.log('[Backfill] Connected to database');

  // Find all Step 0 confirmation emails with empty body
  const emptyConfirmations = await ScheduledEmail.findAll({
    where: {
      step_index: 0,
      status: 'sent',
      subject: 'Your Executive AI Strategy Call is Confirmed',
      body: '',
    },
  });

  console.log(`[Backfill] Found ${emptyConfirmations.length} confirmation emails to backfill`);

  let updated = 0;
  for (const action of emptyConfirmations) {
    const call = await StrategyCall.findOne({
      where: { lead_id: action.lead_id },
      order: [['created_at', 'DESC']],
    });

    if (!call) {
      console.log(`[Backfill] No strategy call found for lead ${action.lead_id}, skipping`);
      continue;
    }

    const html = buildStrategyCallConfirmationHtml({
      to: call.email,
      name: call.name,
      scheduledAt: new Date(call.scheduled_at),
      timezone: call.timezone || 'America/Chicago',
      meetLink: call.meet_link || '',
      prepToken: call.prep_token,
    });

    await action.update({ body: html } as any);
    updated++;
    console.log(`[Backfill] Updated lead ${action.lead_id} (${call.name})`);
  }

  console.log(`[Backfill] Done. Updated ${updated} records.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[Backfill] Error:', err);
  process.exit(1);
});
