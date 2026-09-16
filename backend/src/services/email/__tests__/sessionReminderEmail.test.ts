/**
 * The reminder email's Join button must land on the portal check-in page, not
 * on Zoom. Attendance is only ever captured by a portal join; a button that
 * bypassed it marked students absent for classes they sat through (four
 * corrected on 2026-09-15 for one student alone, 16 of 49 and 18 of 49
 * present on the two sessions before that).
 */
import { buildSessionReminderHtml, sessionCheckinUrl, SessionReminderData } from '../sessionReminderEmail';

const SESSION_ID = '8e8df597-ad52-4b1a-bb5c-b51057e24226';
const ZOOM = 'https://us06web.zoom.us/j/89332271631?pwd=5a1zlO0NB47TqUDKHCSAarpUdJWZUm.1';

const data = (over: Partial<SessionReminderData> = {}): SessionReminderData => ({
  to: 'student@example.com',
  fullName: 'A Student',
  sessionId: SESSION_ID,
  sessionTitle: 'Week 8 · Architecture Day — Claude Code Workflows + Automation',
  sessionNumber: 16,
  sessionDate: '2026-09-14',
  startTime: '18:30:00',
  meetingLink: ZOOM,
  materialsJson: null,
  isOneHour: true,
  ...over,
});

/** The href of the one element carrying class="cta". */
function ctaHref(html: string): string | null {
  const m = /<a href="([^"]+)" class="cta">/.exec(html);
  return m ? m[1] : null;
}

describe('sessionCheckinUrl', () => {
  it('builds the same URL the Class Kit QR code encodes', () => {
    expect(sessionCheckinUrl(SESSION_ID, 'https://enterprise.colaberry.ai'))
      .toBe(`https://enterprise.colaberry.ai/portal/class-checkin/${SESSION_ID}`);
  });
  it('tolerates a trailing slash on the base and encodes the id', () => {
    expect(sessionCheckinUrl('a b', 'https://x.test/')).toBe('https://x.test/portal/class-checkin/a%20b');
  });
});

describe('buildSessionReminderHtml — the Join button', () => {
  it('goes to the portal check-in page for THIS session, never straight to Zoom', () => {
    const html = buildSessionReminderHtml(data(), 'Starting in 1 Hour');
    const href = ctaHref(html);
    expect(href).toMatch(new RegExp(`/portal/class-checkin/${SESSION_ID}$`));
    expect(href).not.toContain('zoom.us');
  });

  it('keeps the direct Zoom link, but only as a labelled fallback below the button', () => {
    const html = buildSessionReminderHtml(data(), 'Starting in 1 Hour');
    expect(html).toContain(ZOOM);
    expect(html).toMatch(/Attendance is not recorded that way/);
    // The fallback sits after the button, not in it.
    expect(html.indexOf('class="cta"')).toBeLessThan(html.indexOf(ZOOM));
  });

  it('still shows the button when no meeting link exists yet, and says the link is coming', () => {
    const html = buildSessionReminderHtml(data({ meetingLink: null }), 'Tomorrow');
    expect(ctaHref(html)).toMatch(/\/portal\/class-checkin\//);
    expect(html).toMatch(/will be shared before the session starts/);
    expect(html).not.toContain('zoom.us');
  });

  it('says what the button does, because "Join" used to mean something else', () => {
    const html = buildSessionReminderHtml(data(), 'Tomorrow');
    expect(html).toMatch(/records your attendance/);
  });

  it('renders the urgency label it is given, for both reminders', () => {
    expect(buildSessionReminderHtml(data({ isOneHour: false }), 'Tomorrow')).toContain('<div class="urgency">Tomorrow</div>');
    expect(buildSessionReminderHtml(data(), 'Starting in 1 Hour')).toContain('<div class="urgency">Starting in 1 Hour</div>');
  });

  it('escapes a hostile meeting link rather than injecting it', () => {
    const html = buildSessionReminderHtml(data({ meetingLink: 'https://x.test/"><script>alert(1)</script>' }), 'Tomorrow');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
