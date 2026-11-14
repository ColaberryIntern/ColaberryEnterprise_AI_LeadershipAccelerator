/**
 * familyCalendarFeed - "This week" for the Family Dashboard: the next 7 days of the family Google
 * Calendar (owned by Addie, shared to ali@colaberry.com), with each kid's school dates from
 * familySchoolNews laid onto the same days, so a busy day is visible in one place.
 *
 * Ali, 2026-11-13: "For the family calendar can you not see our family calendar?" It could; the
 * calendar fed the retired Family Command Center email and was never wired into this dashboard.
 *
 * Access: the Workspace service account impersonates ali@colaberry.com. The scope must be the full
 * .../auth/calendar (calendar.readonly is not on the domain-wide delegation allowlist and returns
 * unauthorized_client). Read-only use.
 * Failure path: one bounded list call (20s). Any failure throws; the caller drops the section and
 * marks the source broken, and the email still sends.
 */
const TZ = 'America/Chicago';
const DAYS = 7;
const KIDS = [
  { re: /\bcreed\b/i, who: 'Creed' },
  { re: /\baddison\b/i, who: 'Addison' },
  { re: /\bjay[cs]e\b/i, who: 'Jayce' },
];

/** Central-time calendar date of an event start (all-day dates are already local). Pure. */
function eventDay(start) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) return start;
  return new Date(start).toLocaleDateString('en-CA', { timeZone: TZ });
}
function eventTime(start) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) return 'All day';
  return new Date(start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
}
function whoOf(title) {
  const hit = KIDS.find((k) => k.re.test(title || ''));
  return hit ? hit.who : 'Family';
}
function addDays(ymd, n) { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

/**
 * Pure: calendar events + school items -> [{ ymd, label, isToday, items:[{time, title, who, source}], busy }].
 * Days with nothing are kept (an empty day is information too). `busy` marks a day that has a school
 * date AND at least one calendar event, the clash Ali wants to see coming.
 */
function buildWeek(events, schoolItems, today) {
  const days = [];
  for (let i = 0; i < DAYS; i++) {
    const ymd = addDays(today, i);
    const cal = events.filter((e) => eventDay(e.start) === ymd)
      .map((e) => ({ time: eventTime(e.start), title: String(e.summary || '(no title)').replace(/\s*[–—]\s*/g, ', ').trim(), who: whoOf(e.summary), source: 'calendar', sort: e.start }));
    const school = (schoolItems || []).filter((s) => s.date === ymd)
      .map((s) => ({ time: 'School', title: s.title, who: s.child, source: 'school', sort: `${ymd}T00:00` }));
    const items = [...school, ...cal.sort((a, b) => String(a.sort).localeCompare(String(b.sort)))].map(({ sort, ...rest }) => rest);
    days.push({
      ymd,
      label: new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }),
      isToday: i === 0,
      items,
      busy: school.length > 0 && cal.length > 0,
    });
  }
  return days;
}

async function listFamilyEvents(today) {
  const calendarId = process.env.GOOGLE_FAMILY_CALENDAR_ID;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!calendarId || !email || !key) throw new Error('family calendar not configured (GOOGLE_FAMILY_CALENDAR_ID / service account)');
  const { google } = require('googleapis'); // lazy: only resolvable from the repo root on the host
  const auth = new google.auth.JWT({ email, key, scopes: ['https://www.googleapis.com/auth/calendar'], subject: process.env.GOOGLE_CALENDAR_OWNER_EMAIL || 'ali@colaberry.com' });
  const cal = google.calendar({ version: 'v3', auth });
  // Pad a day each side in UTC, then let buildWeek keep only the 7 Central-time days.
  const res = await cal.events.list({
    calendarId,
    timeMin: new Date(`${addDays(today, -1)}T00:00:00Z`).toISOString(),
    timeMax: new Date(`${addDays(today, DAYS + 1)}T00:00:00Z`).toISOString(),
    singleEvents: true, orderBy: 'startTime', maxResults: 250,
  }, { timeout: 20000 });
  return (res.data.items || []).filter((e) => e.status !== 'cancelled')
    .map((e) => ({ summary: e.summary, start: (e.start && (e.start.dateTime || e.start.date)) || '' }));
}

async function compileFamilyWeek({ today, schoolItems }) {
  const days = buildWeek(await listFamilyEvents(today), schoolItems, today);
  return { days, eventCount: days.reduce((n, d) => n + d.items.filter((i) => i.source === 'calendar').length, 0) };
}

module.exports = { compileFamilyWeek, buildWeek, eventDay, eventTime, whoOf };
