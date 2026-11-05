import { QueryTypes } from 'sequelize';

/**
 * Claim a once-per-Central-day run slot in system_settings, so several scheduler instances cannot both run a daily job.
 * Atomic: the UPDATE only matches when the stored day differs, so exactly one caller gets a row back per day.
 */
export async function claimDailySlot(settingKey: string): Promise<boolean> {
  const { sequelize } = await import('../../../config/database');
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  await sequelize.query(
    `INSERT INTO system_settings (id, key, value, created_at, updated_at)
     VALUES (gen_random_uuid(), :k, '{}'::jsonb, NOW(), NOW()) ON CONFLICT (key) DO NOTHING`,
    { replacements: { k: settingKey } });
  const claimed = await sequelize.query(
    `UPDATE system_settings SET value = jsonb_set(COALESCE(value,'{}'::jsonb), ARRAY['lastRun'], to_jsonb(:today::text), true), updated_at = NOW()
      WHERE key = :k AND COALESCE(value->>'lastRun','') <> :today RETURNING key`,
    { replacements: { k: settingKey, today }, type: QueryTypes.SELECT });
  return Array.isArray(claimed) && claimed.length > 0;
}
