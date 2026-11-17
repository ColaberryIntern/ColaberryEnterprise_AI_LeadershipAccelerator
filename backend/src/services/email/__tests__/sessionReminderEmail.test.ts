/**
 * The reminder email's Join button must land on the portal check-in page, not
 * on Zoom. Attendance is only ever captured by a portal join; a button that
 * bypassed it marked students absent for classes they sat through (four
 * corrected on 2026-09-15 for one student alone, 16 of 49 and 18 of 49
 * present on the two sessions before that).
 */
import { buildSessionReminderHtml, buildOpenHouseReminderHtml, openHouseReminderSubject, longSessionDate, sessionCheckinUrl, SessionReminderData } from '../sessionReminderEmail';

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

describe('Open House reminder (OH1, Ali 2026-11-17)', () => {
  const OH_ID = '8c92ba87-4766-4a83-9da4-ad529f68b2dc';
  const oh = (over: Partial<SessionReminderData> = {}): SessionReminderData => data({
    sessionId: OH_ID,
    sessionTitle: 'Colaberry AI Systems Architect Accelerator Open House',
    sessionNumber: 0,
    sessionDate: '2026-11-19',
    startTime: '18:30',
    fullName: 'Jordan Rivera',
    isOneHour: false,
    isOpenHouse: true,
    ...over,
  });
  const text = (html: string) => html.replace(/<[^>]+>/g, ' ');

  it('reads as an Open House, never as a class', () => {
    const t = text(buildSessionReminderHtml(oh(), 'Tomorrow'));
    expect(t).not.toMatch(/Session 0|Session #0|#0/);
    expect(t).not.toMatch(/pre-work/i);
    expect(t).not.toMatch(/upcoming Accelerator session/i);
    expect(t).toMatch(/Open House/);
  });

  it('never mentions price, an offer or a discount (the offer is announced live only)', () => {
    for (const isOneHour of [false, true]) {
      const t = text(buildSessionReminderHtml(oh({ isOneHour }), isOneHour ? 'Starting in 1 Hour' : 'Tomorrow')).toLowerCase();
      for (const w of ['discount', 'offer', 'price', '$', '50%', 'early bird', 'scholarship', 'free', 'save']) expect(t).not.toContain(w);
    }
  });

  it('sends the button to the portal check-in for THIS session, where attendance is recorded', () => {
    const html = buildOpenHouseReminderHtml(oh(), 'Tomorrow');
    expect(ctaHref(html)).toMatch(new RegExp(`/portal/class-checkin/${OH_ID}$`));
  });

  it('greets by first name, and falls back cleanly when there is none', () => {
    expect(buildOpenHouseReminderHtml(oh(), 'Tomorrow')).toContain('Hi Jordan,');
    expect(buildOpenHouseReminderHtml(oh({ fullName: '' }), 'Tomorrow')).toContain('Hi,');
    expect(buildOpenHouseReminderHtml(oh({ fullName: 'someone@example.com' }), 'Tomorrow')).toContain('Hi,');
  });

  it('says the day and the Central time', () => {
    const t = text(buildOpenHouseReminderHtml(oh(), 'Tomorrow'));
    expect(t).toContain('Thursday, November 19');
    expect(t).toMatch(/6:30 PM C[SD]T/);
  });

  it('subject leads with when, with no [Accelerator] prefix or session number', () => {
    expect(openHouseReminderSubject(oh(), 'Tomorrow')).toMatch(/^Tomorrow at 6:30 PM C[SD]T: the Colaberry Open House$/);
    expect(openHouseReminderSubject(oh({ isOneHour: true }), 'Starting in 1 Hour')).toBe('Starting in 1 hour: the Colaberry Open House');
  });

  it('escapes the name and the Zoom link', () => {
    const html = buildOpenHouseReminderHtml(oh({ fullName: '<b>x', meetingLink: 'https://x.test/"><script>alert(1)</script>' }), 'Tomorrow');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>x');
  });

  it('leaves the class email untouched when isOpenHouse is not set', () => {
    expect(buildSessionReminderHtml(data(), 'Tomorrow')).toMatch(/upcoming Accelerator session/);
  });

  it('longSessionDate passes through a value that is not a date key', () => {
    expect(longSessionDate('soon')).toBe('soon');
  });
});
