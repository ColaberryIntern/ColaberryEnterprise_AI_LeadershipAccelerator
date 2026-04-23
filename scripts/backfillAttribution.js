/**
 * Backfill campaign_id and scheduled_email_id on interaction_outcomes
 * that were created by the Mandrill poll without attribution.
 */
const { connectDatabase, sequelize } = require('./dist/config/database');
const { QueryTypes } = require('sequelize');

async function main() {
  await connectDatabase();

  // Find all unattributed opens/clicks
  const unattributed = await sequelize.query(`
    SELECT io.id, io.lead_id, io.outcome
    FROM interaction_outcomes io
    WHERE io.campaign_id IS NULL
      AND io.outcome IN ('opened', 'clicked')
      AND io.metadata->>'source' = 'mandrill_poll'
  `, { type: QueryTypes.SELECT });

  console.log('Unattributed records:', unattributed.length);

  let fixed = 0;
  for (const row of unattributed) {
    // Find the most recent sent email to this lead
    const [sentEmail] = await sequelize.query(`
      SELECT id, campaign_id, step_index
      FROM scheduled_emails
      WHERE lead_id = :leadId AND status = 'sent'
      ORDER BY sent_at DESC
      LIMIT 1
    `, { replacements: { leadId: row.lead_id }, type: QueryTypes.SELECT });

    if (sentEmail && sentEmail.campaign_id) {
      await sequelize.query(`
        UPDATE interaction_outcomes
        SET campaign_id = :campaignId, scheduled_email_id = :emailId, step_index = :stepIndex
        WHERE id = :id
      `, {
        replacements: {
          campaignId: sentEmail.campaign_id,
          emailId: sentEmail.id,
          stepIndex: sentEmail.step_index,
          id: row.id,
        },
        type: QueryTypes.UPDATE,
      });
      fixed++;
    }
  }

  console.log('Fixed:', fixed, 'of', unattributed.length);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
