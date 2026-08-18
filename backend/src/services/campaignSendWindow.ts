/**
 * Campaign send/call window predicates.
 *
 * Extracted from schedulerService.ts so campaignWatchdogService.ts can ask
 * "should anything be sending right now?" without importing the scheduler —
 * schedulerService already requires the watchdog, so the reverse import would
 * close a cycle (forbidden by CLAUDE.md's Modular Composition Rule).
 *
 * Why the watchdog needs this at all: its no-recent-sends check treated
 * "0 sends AND a pending backlog" as a fault. Overnight and at weekends that is
 * the CORRECT state — campaigns are deliberately outside their send window and
 * the backlog is simply waiting for morning. The check fired every cycle all
 * night, every night, against healthy campaigns.
 */

/** Shared window test: is `now`, in `tz`, inside [startTime, endTime] on an active weekday? */
export function isWithinScheduleWindow(
  tz: string,
  startTime: string,
  endTime: string,
  activeDays: number[],
): boolean {
  try {
    const nowStr = new Date().toLocaleString('en-US', { timeZone: tz });
    const nowInTz = new Date(nowStr);
    const day = nowInTz.getDay(); // 0=Sun, 1=Mon...
    const hours = nowInTz.getHours();
    const minutes = nowInTz.getMinutes();

    if (!activeDays.includes(day)) return false;

    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const currentMinutes = hours * 60 + minutes;
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } catch {
    return true; // On error, allow the send
  }
}

export function isWithinCallSchedule(settings: Record<string, any>): boolean {
  return isWithinScheduleWindow(
    settings.call_timezone || 'America/Chicago',
    settings.call_time_start || '09:00',
    settings.call_time_end || '17:00',
    settings.call_active_days || [1, 2, 3, 4, 5],
  );
}

/**
 * Check if current time is within the email/SMS send window.
 * Uses send_time_start/end if configured, otherwise defaults to 08:00-17:00 CT.
 */
export function isWithinSendWindow(settings: Record<string, any>): boolean {
  return isWithinScheduleWindow(
    settings.send_timezone || settings.call_timezone || 'America/Chicago',
    settings.send_time_start || '08:00',
    settings.send_time_end || '17:00',
    settings.send_active_days || settings.call_active_days || [1, 2, 3, 4, 5],
  );
}

/** Get campaign settings (with defaults) from a campaign record */
export function getCampaignSettingsFromRecord(campaign: any): Record<string, any> {
  const defaults = {
    test_mode_enabled: false,
    test_email: '',
    test_phone: '',
    delay_between_sends: 120,
    max_leads_per_cycle: 10,
    call_time_start: '09:00',
    call_time_end: '17:00',
    call_timezone: 'America/Chicago',
    call_active_days: [1, 2, 3, 4, 5],
    max_call_duration: 300,
    max_daily_calls: 50,
    voicemail_enabled: true,
    pass_prior_conversations: true,
  };
  return { ...defaults, ...(campaign.settings || {}) };
}

/** Convenience: is this campaign record currently inside its own send window? */
export function isCampaignWithinSendWindow(campaign: any): boolean {
  return isWithinSendWindow(getCampaignSettingsFromRecord(campaign));
}
