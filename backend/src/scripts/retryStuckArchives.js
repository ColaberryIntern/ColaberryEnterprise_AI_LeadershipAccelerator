// One-off: retry archive for emails that classified as AUTOMATION but had
// archive_failed audits (no successful archive yet). Uses the existing
// autoArchiveService so behavior matches the live scheduler.
//
// Run inside the backend container:
//   docker exec accelerator-backend node /app/dist/scripts/retryStuckArchives.js [provider]
// Example:
//   docker exec accelerator-backend node /app/dist/scripts/retryStuckArchives.js gmail_colaberry

(async () => {
  const provider = process.argv[2] || 'gmail_colaberry';
  const { sequelize } = require('../config/database');
  await sequelize.authenticate();

  const { archiveEmail } = require('../services/inbox/autoArchiveService');

  const [rows] = await sequelize.query(`
    SELECT e.id, e.provider, e.provider_message_id, e.from_address, e.subject
    FROM inbox_emails e
    JOIN inbox_classifications c ON c.email_id = e.id
    JOIN inbox_audit_logs a ON a.email_id = e.id
    WHERE e.provider = :provider
      AND c.state = 'AUTOMATION'
      AND a.action = 'archive_failed'
      AND NOT EXISTS (
        SELECT 1 FROM inbox_audit_logs a2
        WHERE a2.email_id = e.id AND a2.action = 'archived'
      )
    GROUP BY e.id, e.provider, e.provider_message_id, e.from_address, e.subject
    ORDER BY e.received_at DESC
  `, { replacements: { provider } });

  console.log(`[RetryStuck] ${provider}: ${rows.length} stuck emails to retry`);

  let success = 0;
  let failure = 0;
  const failureReasons = {};

  for (let i = 0; i < rows.length; i++) {
    const e = rows[i];
    try {
      await archiveEmail({
        id: e.id,
        provider: e.provider,
        provider_message_id: e.provider_message_id,
      });
      // archiveEmail logs its own audit row on success/failure. We treat
      // a no-throw return as success — the audit log will reflect reality.
      success++;
      if (i % 25 === 0 || i === rows.length - 1) {
        console.log(`[RetryStuck] Progress ${i + 1}/${rows.length} (success=${success}, fail=${failure})`);
      }
    } catch (err) {
      failure++;
      const key = (err && err.message ? err.message : String(err)).slice(0, 80);
      failureReasons[key] = (failureReasons[key] || 0) + 1;
    }
  }

  // Cross-check actual archived audits (archiveEmail might log archived without throwing)
  const [confirmRows] = await sequelize.query(`
    SELECT COUNT(DISTINCT a.email_id) AS archived_now
    FROM inbox_audit_logs a
    JOIN inbox_emails e ON e.id = a.email_id
    WHERE a.action = 'archived'
      AND e.provider = :provider
      AND a.created_at > NOW() - INTERVAL '5 minutes'
  `, { replacements: { provider } });

  console.log(`\n[RetryStuck] DONE`);
  console.log(`  attempted: ${rows.length}`);
  console.log(`  no-throw:  ${success}`);
  console.log(`  thrown:    ${failure}`);
  console.log(`  audits 'archived' added in last 5 min: ${confirmRows[0]?.archived_now ?? '?'}`);
  if (Object.keys(failureReasons).length) {
    console.log(`\n[RetryStuck] Failure reasons:`);
    for (const [k, v] of Object.entries(failureReasons)) console.log(`  ${v}x  ${k}`);
  }

  await sequelize.close();
  process.exit(0);
})().catch((err) => {
  console.error('[RetryStuck] Fatal:', err.message);
  process.exit(1);
});
