/**
 * Career Prep v27, CP8.2: one time label for the booking page and every booking message. PURE (no imports), so copy
 * modules can use it without loading the booking service.
 * Intl puts a narrow or plain no-break space before AM/PM in some ICU versions; labels use a plain space.
 */
const ODD_SPACE = new RegExp(`[${String.fromCharCode(0x202f, 0x00a0)}]`, 'g');

/** "Mon, Nov 23, 9:00 AM CST" */
export function label(t: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
    .format(t).replace(ODD_SPACE, ' ');
}
