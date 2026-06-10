// compileFamilyBriefingData
//
// V2 live data compiler for the Family Command Center daily briefing.
//
// Produces the `briefingData` object consumed by renderFamilyBriefingEmail.js from
// live sources, replacing the V1 baked-in content:
//   - Google Calendar (service account, impersonating ali@colaberry.com):
//       * Family calendar  -> today's family events, upcoming-week grid, travel cards
//       * Work calendar    -> only events that COLLIDE with a family event (conflicts)
//   - inbox_emails DB table (already synced from all 3 mailboxes by inboxSyncService):
//       * "New since yesterday" -> Procare/school Office Chat + daily summaries +
//         travel confirmations. Sourced from the DB (NOT the live Gmail API) because
//         the Gmail OAuth creds are shared with the prod inbox-sync and get rate-
//         limited; the DB already holds every forwarded Procare/Hotmail message.
//
// FAILURE-FIRST design (per root CLAUDE.md):
//   - Each source is wrapped independently. If a source throws or is unconfigured,
//     that section renders EMPTY and the source name is recorded in meta.degraded.
//     A stale day's data can never be shown because nothing is baked in.
//   - hasFamilyData() lets the caller refuse to send a content-less briefing rather
//     than emailing Addie an empty shell.
//   - The daily script runs HOST-SIDE where Postgres' port is not published, so the
//     inbox query goes through `docker exec <container> psql` (cron runs as root).
//     Locally (no container) it throws and the New-Since section degrades cleanly.
//
// Time handling: the family lives in America/Chicago; the prod container is UTC.
// All day-bucketing is computed against CT wall-clock, not server local time.
//
// Session originator: CC-20260610-k7m2

// googleapis is required LAZILY (inside the client builders, not at module top) so
// that a host environment missing the package degrades the affected source rather
// than crashing the whole send script at require-time. The send script runs host-side
// via cron-env-wrapper.sh, where googleapis may not be resolvable up the tree.
function gapi() { return require('googleapis').google; }

const { execFileSync } = require('child_process');

const TZ = 'America/Chicago';

// --------------------------------------------------------------------------
// Time helpers (CT-correct, no external tz library)
// --------------------------------------------------------------------------

// Milliseconds to add to a UTC instant to get CT wall-clock for that instant.
function tzOffsetMs(date, timeZone = TZ) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const m = {};
  for (const p of dtf.formatToParts(date)) m[p.type] = p.value;
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour === 24 ? 0 : +m.hour, +m.minute, +m.second);
  return asUTC - date.getTime();
}

// Returns { start, end, y, m, d } for the CT calendar day that `now` falls in.
function ctDayBounds(now, dayOffset = 0) {
  const offset = tzOffsetMs(now);
  const ctNow = new Date(now.getTime() + offset);
  const y = ctNow.getUTCFullYear();
  const mo = ctNow.getUTCMonth();
  const da = ctNow.getUTCDate() + dayOffset;
  const startUtc = new Date(Date.UTC(y, mo, da, 0, 0, 0) - offset);
  const endUtc = new Date(startUtc.getTime() + 24 * 3600 * 1000);
  return { start: startUtc, end: endUtc };
}

function fmtCtTimeParts(iso) {
  if (!iso) return { time: '', ampm: '' };
  const s = new Date(iso).toLocaleTimeString('en-US', {
    timeZone: TZ, hour: 'numeric', minute: '2-digit',
  });
  // "3:00 PM" -> { time:'3:00', ampm:'pm' }
  const m = s.match(/^(\d{1,2}:\d{2})\s*([AP]M)$/i);
  if (!m) return { time: s, ampm: '' };
  return { time: m[1], ampm: m[2].toLowerCase() };
}

function ctParts(date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric',
  });
  const m = {};
  for (const p of dtf.formatToParts(date)) m[p.type] = p.value;
  return { dow: m.weekday, month: m.month, day: m.day };
}

// --------------------------------------------------------------------------
// Clients
// --------------------------------------------------------------------------

function getCalendarClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const subject = process.env.GOOGLE_CALENDAR_OWNER_EMAIL || 'ali@colaberry.com';
  if (!email || !key) throw new Error('Calendar service account not configured (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY)');
  const google = gapi();
  // Full 'calendar' scope (NOT calendar.readonly): domain-wide delegation matches
  // scope strings exactly, and only the full scope is authorized in Workspace Admin
  // for this service account (same scope the booking + inbox-COS services use).
  const auth = new google.auth.JWT({
    email, key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
    subject,
  });
  return google.calendar({ version: 'v3', auth });
}

// --------------------------------------------------------------------------
// Calendar reads
// --------------------------------------------------------------------------

// Lists events between timeMin/timeMax for one calendar. Normalizes to a flat shape.
async function listEvents(cal, calendarId, timeMin, timeMax) {
  const res = await cal.events.list({
    calendarId,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 100,
  });
  return (res.data.items || [])
    .filter((e) => e.status !== 'cancelled')
    .map((e) => ({
      summary: e.summary || '(no title)',
      start: e.start && (e.start.dateTime || e.start.date) || '',
      end: e.end && (e.end.dateTime || e.end.date) || '',
      allDay: !!(e.start && e.start.date && !e.start.dateTime),
      location: e.location || '',
      htmlLink: e.htmlLink || '',
    }));
}

// Deterministic category mapping by name match. Returns { key, label }.
function categorize(summary) {
  const s = (summary || '').toLowerCase();
  if (/\bcreed\b/.test(s)) return { key: 'creed', label: 'Creed' };
  if (/\baddison\b/.test(s)) return { key: 'addison', label: 'Addison' };
  if (/\b(flight|trip|nashville|hotel|airbnb|depart|arrive|vacation)\b/.test(s)) return { key: 'travel', label: 'Travel' };
  if (/\b(school|drop ?off|pick ?up|carpool|kids)\b/.test(s)) return { key: 'parents', label: 'Parents' };
  return { key: 'neutral', label: 'Family' };
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

// Build today's snapshot from family events, flagging any that collide with a
// timed work event. Returns { events, conflicts:[{family, work}] }.
function buildToday(familyToday, workToday) {
  const conflicts = [];
  const timedWork = workToday.filter((w) => !w.allDay && w.start && w.end);

  const events = familyToday.map((ev) => {
    const cat = categorize(ev.summary);
    let conflict = null;
    if (!ev.allDay && ev.start && ev.end) {
      const fS = new Date(ev.start), fE = new Date(ev.end);
      for (const w of timedWork) {
        if (overlaps(fS, fE, new Date(w.start), new Date(w.end))) { conflict = w; break; }
      }
    }
    if (conflict) conflicts.push({ family: ev, work: conflict });
    const t = ev.allDay ? { time: 'All', ampm: 'day' } : fmtCtTimeParts(ev.start);
    return {
      time: t.time, ampm: t.ampm,
      category: cat.label, categoryColorKey: cat.key,
      title: ev.summary,
      meta: ev.location || undefined,
      href: ev.htmlLink || undefined,
      conflict: !!conflict,
    };
  });

  // Append the conflicting work events as muted "work (conflict only)" rows.
  for (const c of conflicts) {
    const t = fmtCtTimeParts(c.work.start);
    events.push({
      time: t.time, ampm: t.ampm,
      category: 'Work (conflict only)', categoryColorKey: 'work',
      title: c.work.summary,
      meta: 'overlaps a family event above',
      href: c.work.htmlLink || undefined,
      conflict: true,
    });
  }
  return { events, conflicts };
}

// Build the 7-day week grid from family events keyed by CT day.
function buildWeek(now, familyWeek) {
  const days = [];
  const todayBounds = ctDayBounds(now, 0);
  for (let i = 0; i < 7; i++) {
    const b = ctDayBounds(now, i);
    const parts = ctParts(b.start);
    const dayEvents = familyWeek
      .filter((ev) => {
        const s = new Date(ev.start);
        return s >= b.start && s < b.end;
      })
      .slice(0, 4)
      .map((ev) => ({ colorKey: categorize(ev.summary).key, label: truncate(ev.summary, 22) }));
    days.push({
      dow: parts.dow, dnum: parts.day,
      today: b.start.getTime() === todayBounds.start.getTime(),
      events: dayEvents,
    });
  }
  const first = ctParts(days.length ? ctDayBounds(now, 0).start : now);
  const last = ctParts(ctDayBounds(now, 6).start);
  return {
    rangeLabel: `${first.month} ${first.day} - ${last.month} ${last.day} family calendar`,
    days,
  };
}

// Travel cards from upcoming multi-day / all-day family events with travel keywords.
function buildTravel(now, familyHorizon) {
  const seen = new Set();
  const cards = [];
  for (const ev of familyHorizon) {
    const cat = categorize(ev.summary);
    const looksTravel = cat.key === 'travel' || ev.allDay && /\b(trip|vacation|nashville|corpus|stay|inn|suites|resort)\b/i.test(ev.summary);
    if (!looksTravel) continue;
    const key = `${ev.summary}|${(ev.start || '').slice(0, 10)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const sParts = ctParts(new Date(ev.start));
    const eParts = ev.end ? ctParts(new Date(new Date(ev.end).getTime() - 1)) : null;
    const daysOut = Math.round((new Date(ev.start).getTime() - now.getTime()) / 86400000);
    cards.push({
      badgeChar: badgeFor(ev.summary),
      badgeColorKey: 'orange',
      title: ev.summary,
      meta: ev.location || undefined,
      whenLine: eParts ? `${sParts.month} ${sParts.day} -> ${eParts.month} ${eParts.day}` : `${sParts.month} ${sParts.day}`,
      whenSub: daysOut <= 0 ? 'now' : `in ${daysOut} day${daysOut === 1 ? '' : 's'}`,
      href: ev.htmlLink || undefined,
    });
    if (cards.length >= 4) break;
  }
  return { cards, notes: [] };
}

function badgeFor(summary) {
  const s = (summary || '').toUpperCase();
  if (s.includes('NASHVILLE')) return 'NSH';
  if (s.includes('CORPUS')) return 'CC';
  return 'TRIP';
}

function truncate(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// --------------------------------------------------------------------------
// Inbox DB reads ("new since yesterday")
// --------------------------------------------------------------------------

// Query the synced inbox_emails table for recent school/Procare + travel mail.
// Runs through `docker exec <container> psql` because the daily script runs on the
// host where Postgres' port is not published. Returns parsed rows; throws if the
// container/psql is unavailable (e.g. local dev), which the caller degrades.
function queryInboxEmails(windowHours) {
  const container = process.env.FAMILY_DB_CONTAINER || 'accelerator-db';
  const dbUser = process.env.PROD_DB_USER || 'accelerator';
  const dbName = process.env.PROD_DB_NAME || 'accelerator_prod';
  const sql = `
    select coalesce(json_agg(row_to_json(t)), '[]') from (
      select from_name, from_address, subject, left(body_text, 800) as body_text, received_at,
        case
          when subject ilike '%office chat%' or subject ilike '%daily summary%'
            or from_address ilike '%procare%' or from_address ilike '%kinderlime%'
            or from_address ilike '%primrose%' or from_address ilike '%liberty%' then 'School'
          else 'Travel'
        end as label
      from inbox_emails
      where received_at > now() - interval '${Number(windowHours)} hours'
        and (
          subject ilike '%office chat%' or subject ilike '%daily summary%'
          or from_address ilike '%expedia%' or from_address ilike '%booking%'
          or from_address ilike '%united%' or from_address ilike '%delta%'
          or from_address ilike '%southwest%' or from_address ilike '%aa.com%'
          or subject ilike '%itinerary%' or subject ilike '%reservation%'
          or subject ilike '%booking confirmation%'
        )
        and subject not ilike '%was signed in%'
        and subject not ilike '%was signed out%'
      order by received_at desc
      limit 12
    ) t;`.replace(/\s+/g, ' ').trim();
  const out = execFileSync('docker', ['exec', container, 'psql', '-U', dbUser, '-d', dbName, '-t', '-A', '-c', sql], { encoding: 'utf8', timeout: 20000 });
  return JSON.parse((out || '').trim() || '[]');
}

// Pull the meaningful message out of a Procare/Kinderlime Office Chat email body,
// stripping the "Hello <name> ... You've received a new Office Chat message (...):"
// boilerplate. For other mail, return a cleaned leading snippet.
function cleanBody(bodyText) {
  let b = String(bodyText || '');
  const m = b.match(/Office Chat message\s*\([^)]*\):\s*([\s\S]+)/i);
  if (m) b = m[1];
  b = b
    .replace(/^\s*Kinderlime\s*/i, '')
    // Procare/Kinderlime stuff their bodies with inbox-preview padding — strip it:
    .replace(/&(?:zwnj|zwj|nbsp|shy|#x?[0-9a-f]+);/gi, ' ')              // literal HTML entities
    .replace(/[​‌‍⁠﻿­]/g, '')             // zero-width unicode
    .replace(/\s+/g, ' ')
    .trim();
  // if nothing but padding/punctuation survives, show no quote rather than junk
  if (!b || !/[A-Za-z]{3,}/.test(b)) return undefined;
  return truncate(b, 240);
}

// "New since yesterday" from inbox_emails rows.
function buildNewSince(rows) {
  const items = [];
  for (const r of (rows || [])) {
    const from = (r.from_name || (r.from_address || '').replace(/<[^>]*>/, '')).trim();
    const when = r.received_at
      ? new Date(r.received_at).toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : '';
    items.push({
      label: r.label || 'New',
      title: r.subject || '(no subject)',
      src: `${from}${when ? ' . ' + when : ''}`,
      quote: cleanBody(r.body_text),
    });
  }
  return items;
}

// --------------------------------------------------------------------------
// Derived hero / actions / risks
// --------------------------------------------------------------------------

function buildHero(today, travel, newSince) {
  const conflicts = today.conflicts.length;
  const familyCount = today.events.filter((e) => e.categoryColorKey !== 'work').length;
  const nextTrip = travel.cards[0];
  const bits = [];
  if (familyCount) bits.push(`${familyCount} family event${familyCount === 1 ? '' : 's'} today`);
  if (conflicts) bits.push(`${conflicts} schedule conflict${conflicts === 1 ? '' : 's'}`);
  if (nextTrip) bits.push(`next trip: ${nextTrip.title} (${nextTrip.whenSub})`);
  const narrative = bits.length ? cap(bits.join(' . ')) + '.' : '';
  const stats = [];
  if (conflicts) stats.push({ label: `! ${conflicts} conflict${conflicts === 1 ? '' : 's'} today`, tone: 'alert' });
  if (nextTrip) stats.push({ label: `${nextTrip.badgeChar} ${nextTrip.whenSub}`, tone: 'info' });
  if (newSince.length) stats.push({ label: `${newSince.length} new since yesterday`, tone: 'neutral' });
  return { narrative, stats };
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function buildRisks(today) {
  const risks = [];
  for (const c of today.conflicts) {
    const ft = fmtCtTimeParts(c.family.start);
    risks.push({
      tone: 'urgent', ico: '!',
      title: `Schedule collision - ${ft.time} ${ft.ampm}`.trim(),
      sub: `"${c.family.summary}" overlaps the work event "${c.work.summary}". One parent needs to cover, or the work item moves.`,
    });
  }
  return risks;
}

function buildActions(today) {
  const actions = [];
  for (const c of today.conflicts) {
    actions.push({
      tone: 'urgent', ico: '!',
      title: `Resolve conflict - ${truncate(c.family.summary, 40)} vs ${truncate(c.work.summary, 30)}`,
      sub: 'Decide who covers the family event or move the work item. Settle before it arrives.',
      due: 'Today',
    });
  }
  return actions;
}

// --------------------------------------------------------------------------
// Flashback (curated static photos until a Google Photos feed is wired)
// --------------------------------------------------------------------------

// Creed's Primrose graduation pictures — real Google Drive files Karla Estrada
// (Primrose Wylie asst. director) shared Apr 30, 2026. Static curated asset; these
// are genuine photos, not faked daily data. Replace/extend when Google Photos lands.
const FLASHBACK_PHOTOS = [
  ['1Om6cz3ZrjufjTWuADcqBG2HJ9CQiOiqC', '7057'],
  ['12SfzRBL2uKh8PNxQ-_DScMGezDexj7DU', '7057b'],
  ['1jaEtLAkyq-EXbiupPbm_FVAGNGCV8Cxx', '7058'],
  ['1IFyt4AerB5AKzcdI1KmX0xfItLLpauxN', '7059'],
  ['1Li9_oPKa3nqc2MBM1hZkbxVW7LeqfPZr', '7060'],
  ['1SGDxIwG0NCbUdEgOBgaQrrwok95URadw', '7061'],
  ['1nLuGCx98dXiQV3uR3P0nlge09hFbWb7B', '7062'],
  ['1jFjhZ9RanwTBorSGQcCM3mPebkkEYwnz', '7063'],
  ['15twc93BlMiW8pXHKQJfC0I-sQ_20DawG', '7064'],
  ['1kE8RIrv1X4zLuwEaplFZLnrgkVoxSeKH', '7065'],
  ['1dy4vw6Cr7feUpQigYZX9zbdW5LJD248m', '7066'],
  ['1fHA3Dn9iqsm4HSa8AaQFYr83TLrolta5', '7067'],
  ['1RHq7gEnY0TOV1C2hZuL7PG6050_eFi8E', '7068'],
  ['1f72uJlp0evPPX8e9aeD5-4uiDwG3BezA', '7204'],
  ['1Q0IFOp60YsB-35uoOYypyXiCvIAx43ar', '7205'],
];

function buildFlashback() {
  return {
    heading: "Creed's Primrose Graduation Pictures",
    intro: 'From Karla Estrada (Primrose Wylie asst. director), sent Apr 30, 2026. 15 photos. Click any thumbnail to open it in Drive.',
    photos: FLASHBACK_PHOTOS,
    note: 'These 15 are the photos currently reachable by email (forwarded from Hotmail). Once Google Photos is wired in, the rest of Creed’s history will surface here automatically.',
  };
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

async function compileFamilyBriefingData({ date = new Date() } = {}) {
  const now = date;
  const degraded = [];
  const sources = [];

  const data = { date: now, meta: {} };

  const familyCalId = process.env.GOOGLE_FAMILY_CALENDAR_ID;
  const workCalId = process.env.GOOGLE_CALENDAR_ID;

  // ---- Calendar (family today + week + travel, work conflicts) ----
  let todayBlock = { events: [], conflicts: [] };
  try {
    if (!familyCalId) throw new Error('GOOGLE_FAMILY_CALENDAR_ID not set');
    const cal = getCalendarClient();
    const todayB = ctDayBounds(now, 0);
    const weekEnd = ctDayBounds(now, 7).start;
    const horizonEnd = new Date(now.getTime() + 75 * 86400000);

    const familyToday = await listEvents(cal, familyCalId, todayB.start, todayB.end);
    const familyWeek = await listEvents(cal, familyCalId, todayB.start, weekEnd);
    const familyHorizon = await listEvents(cal, familyCalId, todayB.start, horizonEnd);

    let workToday = [];
    if (workCalId) {
      try { workToday = await listEvents(cal, workCalId, todayB.start, todayB.end); }
      catch (e) { degraded.push('work calendar'); }
    }

    todayBlock = buildToday(familyToday, workToday);
    data.today = { events: todayBlock.events };
    data.week = buildWeek(now, familyWeek);
    const travel = buildTravel(now, familyHorizon);
    if (travel.cards.length) data.travel = travel;
    data.risks = buildRisks(todayBlock);
    data.actions = buildActions(todayBlock);
    sources.push('Google Calendar (Family)');
  } catch (err) {
    degraded.push('family calendar');
    console.error('[compileFamily] calendar source failed:', err.message);
  }

  // ---- Inbox emails (new since yesterday): school/Procare + travel ----
  try {
    const windowHours = Number(process.env.FAMILY_NEWSINCE_HOURS || 30);
    const rows = queryInboxEmails(windowHours);
    const newSince = buildNewSince(rows);
    if (newSince.length) data.newSince = newSince;
    sources.push('inbox_emails DB (school + travel)');
    data._newSinceCount = newSince.length;
  } catch (err) {
    degraded.push('inbox mail');
    console.error('[compileFamily] inbox_emails source failed:', err.message);
  }

  // ---- Flashback (curated static photos) ----
  data.flashback = buildFlashback();

  // ---- Hero (derived) ----
  data.hero = buildHero(todayBlock, data.travel || { cards: [] }, data.newSince || []);

  data.meta = { sources, degraded };
  return data;
}

// True when the briefing has real family content worth sending (not an empty shell).
function hasFamilyData(data) {
  if (!data) return false;
  const todayCount = data.today && Array.isArray(data.today.events) ? data.today.events.length : 0;
  const weekCount = data.week && Array.isArray(data.week.days)
    ? data.week.days.reduce((n, d) => n + ((d.events && d.events.length) || 0), 0) : 0;
  const newCount = Array.isArray(data.newSince) ? data.newSince.length : 0;
  const travelCount = data.travel && Array.isArray(data.travel.cards) ? data.travel.cards.length : 0;
  return (todayCount + weekCount + newCount + travelCount) > 0;
}

module.exports = {
  compileFamilyBriefingData,
  hasFamilyData,
  // exported for unit tests:
  _internals: { tzOffsetMs, ctDayBounds, fmtCtTimeParts, categorize, buildToday, buildWeek, buildTravel, buildHero, truncate, cleanBody, buildNewSince },
};
