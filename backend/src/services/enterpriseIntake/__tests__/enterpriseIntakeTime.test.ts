import { TZ, meetingWhen } from '../enterpriseIntakeTime';

describe('meetingWhen', () => {
  it('says the time in Central, both sides of daylight saving', () => {
    expect(TZ).toBe('America/Chicago');
    expect(meetingWhen(new Date('2026-11-23T15:00:00Z'))).toBe('Monday, November 23 at 9:00 AM Central');
    expect(meetingWhen(new Date('2026-10-26T14:30:00Z'))).toBe('Monday, October 26 at 9:30 AM Central');
  });
});
