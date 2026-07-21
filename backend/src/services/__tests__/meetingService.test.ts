import { shouldGenerateMeetLink } from '../meetingService';

// Session Meet-link auto-generation (follow-up to the Live Sessions build-out,
// Session CC-20260721-s7h4). Pure decision logic for when to generate a link.

describe('shouldGenerateMeetLink', () => {
  it('generates for an upcoming session with no link when Meet is configured', () => {
    expect(shouldGenerateMeetLink({ meeting_link: null, status: 'scheduled' }, true)).toBe(true);
    expect(shouldGenerateMeetLink({ meeting_link: null, status: 'live' }, true)).toBe(true);
  });

  it('never regenerates when a link already exists', () => {
    expect(shouldGenerateMeetLink({ meeting_link: 'https://meet/x', status: 'scheduled' }, true)).toBe(false);
  });

  it('does not generate for completed or cancelled sessions', () => {
    expect(shouldGenerateMeetLink({ meeting_link: null, status: 'completed' }, true)).toBe(false);
    expect(shouldGenerateMeetLink({ meeting_link: null, status: 'cancelled' }, true)).toBe(false);
  });

  it('does not generate when Meet is not configured (no Google creds)', () => {
    expect(shouldGenerateMeetLink({ meeting_link: null, status: 'scheduled' }, false)).toBe(false);
  });
});
