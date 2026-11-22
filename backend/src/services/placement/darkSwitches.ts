import { getSetting } from '../settingsService';

/**
 * Career Prep v27 R2/R3: the dark switches (execution contract, "The dark switches"). One rule for all of them: ON only
 * when the system_settings value is exactly true (or the string 'true'); absent, false, anything else or UNREADABLE is
 * OFF, and an unreadable switch is logged once per read with a stable error_class. Every outward send checks its switch
 * here, so none of them can drift to a different rule.
 */
export const SWITCHES = {
  employerMail: 'career_prep_employer_mail_enabled',
  inboxTests: 'career_prep_inbox_tests_enabled',
  clientPortal: 'hire_client_portal_enabled', // CP10.2: employer sign-in and every /api/hire/client/* route
} as const;

export type Read = (key: string) => Promise<unknown>;

export async function isSwitchOn(key: string, read: Read = getSetting): Promise<boolean> {
  try {
    const v = await read(key);
    return v === true || v === 'true';
  } catch (err) {
    const name = (err as Error)?.name;
    console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event: 'placement_switch_unreadable',
      outcome: 'failure', error_class: name && name !== 'Error' ? name : 'UpstreamUnavailable', context: { switch: key } }));
    return false;
  }
}
