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
  // Email (SMTP / Mandrill) configuration
  smtp_host: 'smtp.mandrillapp.com',
  smtp_port: 587,
  smtp_user: '',
  smtp_pass: '',
  email_from: 'ali@colaberry.com',
  email_from_name: 'Colaberry Enterprise AI',
  // Voice (Synthflow) configuration
  synthflow_api_key: '',
  synthflow_welcome_agent_id: '',
  synthflow_interest_agent_id: '',
  // SMS configuration (placeholder — plug in Twilio / other provider)
  sms_provider: 'none',
  sms_from_number: '',
  sms_api_key: '',
  // Test Mode — redirect all communications to test addresses
  test_mode_enabled: false,
  test_email: '',
  test_phone: '',
  // AI Configuration
  ai_model: 'gpt-4o-mini',
  ai_max_tokens: 1024,
  ai_system_prompt_default: 'You are a professional outreach specialist for Colaberry Enterprise AI Division. You write personalized, consultative messages that feel like 1:1 conversations, not marketing templates. You reference the lead\'s specific context naturally. You never sound like a mass email.',
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

export async function getTestOverrides(): Promise<{ enabled: boolean; email: string; phone: string }> {
  const enabled = await getSetting('test_mode_enabled');
  if (!enabled) return { enabled: false, email: '', phone: '' };
  return {
    enabled: true,
    email: (await getSetting('test_email')) || '',
    phone: (await getSetting('test_phone')) || '',
  };
}

export async function setMultipleSettings(
  updates: Record<string, any>,
  adminId?: string
): Promise<void> {
  for (const [key, value] of Object.entries(updates)) {
    await setSetting(key, value, adminId);
  }
}
