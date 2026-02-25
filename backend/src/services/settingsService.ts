import SystemSetting from '../models/SystemSetting';
import { logEvent } from './ledgerService';

const DEFAULTS: Record<string, any> = {
  high_intent_threshold: 60,
  follow_up_enabled: true,
  sequence_send_hour: 9,
  max_daily_emails: 50,
  price_per_enrollment: 4500,
  enable_voice_calls: false,
  enable_auto_email: true,
};

export async function getSetting(key: string): Promise<any> {
  const setting = await SystemSetting.findOne({ where: { key } });
  if (setting) return setting.value;
  return DEFAULTS[key] !== undefined ? DEFAULTS[key] : null;
}

export async function getAllSettings(): Promise<Record<string, any>> {
  const settings = await SystemSetting.findAll();
  const result: Record<string, any> = { ...DEFAULTS };
  for (const s of settings) {
    result[s.key] = s.value;
  }
  return result;
}

export async function setSetting(key: string, value: any, adminId?: string): Promise<void> {
  const existing = await SystemSetting.findOne({ where: { key } });

  if (existing) {
    const oldValue = existing.value;
    await existing.update({ value, updated_by: adminId || null, updated_at: new Date() });
    await logEvent('setting_changed', adminId || 'system', 'setting', key, { old_value: oldValue, new_value: value });
  } else {
    await SystemSetting.create({
      key,
      value,
      updated_by: adminId || null,
    } as any);
    await logEvent('setting_created', adminId || 'system', 'setting', key, { value });
  }
}

export async function setMultipleSettings(
  updates: Record<string, any>,
  adminId?: string
): Promise<void> {
  for (const [key, value] of Object.entries(updates)) {
    await setSetting(key, value, adminId);
  }
}
