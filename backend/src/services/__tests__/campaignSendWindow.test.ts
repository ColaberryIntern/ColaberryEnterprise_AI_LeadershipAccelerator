/**
 * Send-window predicates.
 *
 * These gained a second caller when the campaign watchdog started using them to
 * decide whether "0 sends right now" is a fault or the expected overnight quiet
 * period. The watchdog previously alerted every cycle, all night, every night,
 * about campaigns that were behaving correctly — so the boundary behaviour here
 * is what decides whether that alert is signal or noise.
 */
import {
  isWithinScheduleWindow,
  isWithinSendWindow,
  isCampaignWithinSendWindow,
  getCampaignSettingsFromRecord,
} from '../campaignSendWindow';

/** Freeze the clock at a specific UTC instant so timezone maths is deterministic. */
function atUtc(iso: string, fn: () => void): void {
  jest.useFakeTimers().setSystemTime(new Date(iso));
  try {
    fn();
  } finally {
    jest.useRealTimers();
  }
}

const CT = 'America/Chicago';
const WEEKDAYS = [1, 2, 3, 4, 5];

describe('isWithinScheduleWindow', () => {
  it('is inside the window mid-morning on a weekday', () => {
    // 2026-08-13 is a Thursday. 15:00Z = 10:00 CDT.
    atUtc('2026-08-13T15:00:00Z', () => {
      expect(isWithinScheduleWindow(CT, '08:00', '17:00', WEEKDAYS)).toBe(true);
    });
  });

  it('is outside the window overnight — the case that caused the nightly false alarm', () => {
    // 05:00Z = 00:00 CDT, the middle of the quiet period.
    atUtc('2026-08-14T05:00:00Z', () => {
      expect(isWithinScheduleWindow(CT, '08:00', '17:00', WEEKDAYS)).toBe(false);
    });
  });

  it('is outside the window at the weekend even during business hours', () => {
    // 2026-08-15 is a Saturday. 15:00Z = 10:00 CDT.
    atUtc('2026-08-15T15:00:00Z', () => {
      expect(isWithinScheduleWindow(CT, '08:00', '17:00', WEEKDAYS)).toBe(false);
    });
  });

  it('includes both boundaries rather than excluding them', () => {
    atUtc('2026-08-13T13:00:00Z', () => { // 08:00 CDT exactly
      expect(isWithinScheduleWindow(CT, '08:00', '17:00', WEEKDAYS)).toBe(true);
    });
    atUtc('2026-08-13T22:00:00Z', () => { // 17:00 CDT exactly
      expect(isWithinScheduleWindow(CT, '08:00', '17:00', WEEKDAYS)).toBe(true);
    });
  });

  it('is outside one minute past the close', () => {
    atUtc('2026-08-13T22:01:00Z', () => { // 17:01 CDT
      expect(isWithinScheduleWindow(CT, '08:00', '17:00', WEEKDAYS)).toBe(false);
    });
  });

  it('fails open on a malformed timezone so a config typo cannot halt all sending', () => {
    atUtc('2026-08-14T05:00:00Z', () => {
      expect(isWithinScheduleWindow('Not/AZone', '08:00', '17:00', WEEKDAYS)).toBe(true);
    });
  });
});

describe('isWithinSendWindow defaults', () => {
  it('defaults to 08:00-17:00 CT Mon-Fri when nothing is configured', () => {
    atUtc('2026-08-13T15:00:00Z', () => {
      expect(isWithinSendWindow({})).toBe(true);
    });
    atUtc('2026-08-14T05:00:00Z', () => {
      expect(isWithinSendWindow({})).toBe(false);
    });
  });

  it('honours a per-campaign override rather than the default', () => {
    // 05:00Z = 00:00 CDT — outside the default, inside a 24h override.
    atUtc('2026-08-14T05:00:00Z', () => {
      expect(isWithinSendWindow({
        send_time_start: '00:00',
        send_time_end: '23:59',
        send_active_days: [0, 1, 2, 3, 4, 5, 6],
      })).toBe(true);
    });
  });

  it('falls back to call_timezone when send_timezone is absent', () => {
    atUtc('2026-08-13T15:00:00Z', () => {
      expect(isWithinSendWindow({ call_timezone: 'UTC' })).toBe(true); // 15:00 UTC
      expect(isWithinSendWindow({ call_timezone: 'Asia/Tokyo' })).toBe(false); // 00:00 JST
    });
  });
});

describe('isCampaignWithinSendWindow', () => {
  it('reads the window off the campaign record', () => {
    atUtc('2026-08-13T15:00:00Z', () => {
      expect(isCampaignWithinSendWindow({ settings: {} })).toBe(true);
    });
    atUtc('2026-08-14T05:00:00Z', () => {
      expect(isCampaignWithinSendWindow({ settings: {} })).toBe(false);
    });
  });

  it('treats a campaign with no settings at all as using the defaults', () => {
    atUtc('2026-08-14T05:00:00Z', () => {
      expect(isCampaignWithinSendWindow({})).toBe(false);
    });
  });

  it('keeps campaign settings layered over defaults, not replacing them', () => {
    const merged = getCampaignSettingsFromRecord({ settings: { send_time_end: '21:00' } });
    expect(merged.send_time_end).toBe('21:00');
    expect(merged.call_timezone).toBe('America/Chicago'); // default survives
  });
});
