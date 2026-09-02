/**
 * TodayShell — "RSVP for the next event" must open THE event it names.
 *
 * Reported by Ali 2026-09-01: "There is already a blue card for the next event —
 * we can keep it there, but it needs to point to the upcoming event. Right now
 * it's taking you to the wrong place."
 *
 * Root cause: `doRsvp` recorded the RSVP against the correct `oh.id`, then
 * finished with
 *
 *     window.open(EVENTBRITE_OPEN_HOUSE_URL, '_blank', 'noopener')
 *
 * where that constant was a hardcoded link to
 * `colaberry-ai-systems-architect-accelerator-open-house-tickets-1992498063344`
 * — the Open House of 16 July 2026, `Status = completed`. So the card correctly
 * displayed (for example) "AI Strategy And Collaboration Session · Sep 2" and
 * then sent every student to a finished event's Eventbrite page.
 *
 * Verified on production CCPP 2026-09-01: all 46 upcoming public events carry
 * their own `registration_url`, so there was never a reason to hardcode one.
 * The next event's real link is
 * `.../ai-strategy-collaboration-session-tickets-1993959926817`.
 *
 * jest cannot easily drive this deep inside TodayShell, so this asserts the
 * source-level contract that actually broke: the component must not contain a
 * literal Eventbrite event link, and must open the event's own field.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', 'TodayShell.tsx');
const source = fs.readFileSync(SRC, 'utf8');

describe('TodayShell RSVP destination', () => {
  it('contains no hardcoded Eventbrite event link', () => {
    // Any `eventbrite.com/e/<slug>-tickets-<id>` literal pins one specific
    // event forever, which is precisely the defect.
    const hardcoded = source.match(/https?:\/\/[^'"`\s]*eventbrite\.com\/e\/[^'"`\s]*/gi) || [];
    expect(hardcoded).toEqual([]);
  });

  it('does not reference the completed July 2026 Open House by id or slug', () => {
    expect(source).not.toContain('1992498063344');
    expect(source).not.toContain('colaberry-ai-systems-architect-accelerator-open-house');
  });

  it('opens the registration_url carried by the event being shown', () => {
    expect(source).toMatch(/const\s+registrationUrl\s*=\s*oh\.registration_url/);
    expect(source).toMatch(/window\.open\(\s*registrationUrl\s*,/);
  });

  it('guards the open so a missing url sends nobody to the wrong event', () => {
    // Sending a student to a stale event is worse than sending them nowhere.
    expect(source).toMatch(/if\s*\(\s*registrationUrl\s*\)\s*window\.open\(/);
  });

  it('still records the RSVP against the displayed event id', () => {
    // The points/ledger side was always correct; keep it that way.
    expect(source).toMatch(/rsvpOpenHouse\(\s*oh\.id\s*\)/);
  });

  it('captures the url before the awaits, so a refresh cannot swap the target', () => {
    // `loadAll()` replaces `oh` mid-handler; reading oh.registration_url after
    // that could open a different event than the one clicked.
    const handler = source.slice(source.indexOf('const doRsvp'), source.indexOf('const onFilePicked'));
    expect(handler.indexOf('const registrationUrl')).toBeGreaterThan(-1);
    expect(handler.indexOf('const registrationUrl')).toBeLessThan(handler.indexOf('await rsvpOpenHouse'));
  });
});
