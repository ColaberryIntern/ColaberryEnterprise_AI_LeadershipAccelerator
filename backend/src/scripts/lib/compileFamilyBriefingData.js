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
  if (/\bjays?e\b/.test(s)) return { key: 'jayse', label: 'Jayse' };
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

// CT calendar date (YYYY-MM-DD) for a UTC instant — used to place dated extras.
function ctDateISO(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

// Build the 7-day week grid from family-calendar events PLUS dated "extras"
// (Procare announcements, travel, conflict markers) placed on their day.
// extras: [{ dateISO: 'YYYY-MM-DD', colorKey, label }].
function buildWeek(now, familyWeek, extras = []) {
  const days = [];
  const todayBounds = ctDayBounds(now, 0);
  for (let i = 0; i < 7; i++) {
    const b = ctDayBounds(now, i);
    const parts = ctParts(b.start);
    const dayISO = ctDateISO(b.start);
    const calEvents = familyWeek
      .filter((ev) => { const s = new Date(ev.start); return s >= b.start && s < b.end; })
      .map((ev) => ({ colorKey: categorize(ev.summary).key, label: truncate(ev.summary, 22) }));
    const extraEvents = (extras || [])
      .filter((x) => x.dateISO === dayISO)
      .map((x) => ({ colorKey: x.colorKey, label: truncate(x.label, 22) }));
    // extras (conflicts/Procare/travel) first so they're visible, then calendar
    days.push({
      dow: parts.dow, dnum: parts.day,
      today: b.start.getTime() === todayBounds.start.getTime(),
      events: [...extraEvents, ...calEvents].slice(0, 5),
    });
  }
  const first = ctParts(ctDayBounds(now, 0).start);
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
function cleanBody(bodyText, maxLen = 240) {
  let b = String(bodyText || '');
  const m = b.match(/Office Chat message\s*\([^)]*\):\s*([\s\S]+)/i);
  if (m) b = m[1];
  b = b
    .replace(/^\s*Kinderlime\s*/i, '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')                           // css <style> blocks
    .replace(/<[^>]+>/g, ' ')                                            // any html tags
    .replace(/@import[^;]*;/gi, ' ')                                     // css @import
    .replace(/url\([^)]*\)/gi, ' ')                                      // css url(...)
    .replace(/\{[^}]*\}/g, ' ')                                          // css declaration blocks
    .replace(/&(?:zwnj|zwj|nbsp|shy|amp|#x?[0-9a-f]+);/gi, ' ')          // html entities
    .replace(/[​‌‍⁠﻿­]/g, '')             // zero-width unicode
    .replace(/You can reply in the Procare[\s\S]*$/i, '')               // procare app tail
    .replace(/If you want to adjust your email notifications[\s\S]*$/i, '')
    .replace(/Hello\s+[^,.!]{1,40}[,.!]/i, '')                          // "Hello Ali Muwwakkil,"
    .replace(/Below are recent activities for [^-.\n]*/i, '')           // daily-summary header (stop at dash/period)
    .replace(/[*_=~]{2,}/g, ' ')                                        // ****  ====  ____ runs
    .replace(/-{3,}/g, ' ')                                             // ---- separators
    .replace(/\s+/g, ' ')
    .trim();
  // reject CSS/code leftovers and padding-only bodies
  if (!b || !/[A-Za-z]{3,}/.test(b)) return undefined;
  if (/(display\s*:\s*swap|font-family|googleapis\.com|=EML\||PRODUCT_AWRN)/i.test(b)) return undefined;
  return truncate(b, maxLen);
}

// Marketing/promotional travel email? (drop from New-Since — keep real itineraries.)
function isPromoTravel(subject) {
  const s = (subject || '').toLowerCase();
  if (/%|\boff\b|\bsale\b|\bdeal\b|\bsave\b|\bdiscount\b|up to|earn|points|members?|prepare for your upcoming/i.test(s)) return true;
  return false;
}

// "New since yesterday" from inbox_emails rows. Tags colored by category:
// School -> Creed (blue), Travel -> travel (teal). Drops promo travel + junk-only bodies.
function buildNewSince(rows) {
  const items = [];
  for (const r of (rows || [])) {
    const label = r.label || 'New';
    if (label === 'Travel' && isPromoTravel(r.subject)) continue;
    const from = (r.from_name || (r.from_address || '').replace(/<[^>]*>/, '')).trim();
    const when = r.received_at
      ? new Date(r.received_at).toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : '';
    const colorKey = label === 'School' ? 'creed' : label === 'Travel' ? 'travel' : 'neutral';
    items.push({
      label,
      colorKey,
      title: r.subject || '(no subject)',
      src: `${from}${when ? ' . ' + when : ''}`,
      quote: cleanBody(r.body_text),
    });
  }
  return items;
}

// --------------------------------------------------------------------------
// Procare extraction — Creed's school comms are ~1-paragraph emails whose
// announcements/tasks must be pulled out (teacher out, dress-up days, what-to-bring,
// closures). LLM (OpenAI) does the extraction; a deterministic heuristic is the
// fallback so the briefing never hard-fails on an API hiccup.
// --------------------------------------------------------------------------

async function callOpenAI(messages, { timeoutMs = 15000, model = 'gpt-4o-mini' } = {}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, temperature: 0, response_format: { type: 'json_object' }, messages }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
  } finally {
    clearTimeout(timer);
  }
}

// Map an extracted item to the Section-4 action shape (ico + colorKey supplied).
function toAction(it, ico, colorKey) {
  const tone = it.tone === 'urgent' ? 'urgent' : it.tone === 'upcoming' ? 'upcoming' : 'info';
  return { tone, ico, colorKey, title: it.title, sub: it.detail || undefined, due: it.when || undefined };
}
// Back-compat alias used by tests.
function toCreedAction(it) { return toAction(it, 'CRD', 'creed'); }

// A YYYY-MM-DD string within the next ~14 days (so a hallucinated date won't land).
function validGridDate(dateISO, now) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO || '')) return false;
  const d = new Date(`${dateISO}T12:00:00Z`).getTime();
  const lo = now.getTime() - 2 * 86400000;
  const hi = now.getTime() + 14 * 86400000;
  return d >= lo && d <= hi;
}

// Turn extracted LLM items into { actions, grid } with a category color.
function itemsToActionsAndGrid(items, now, { ico, colorKey }) {
  const valid = (items || []).filter((it) => it && it.title);
  const actions = dedupeActions(valid.map((it) => toAction(it, ico, colorKey))).slice(0, 5);
  const grid = [];
  const seen = new Set();
  for (const it of valid) {
    if (!validGridDate(it.dateISO, now)) continue;
    const label = String(it.gridLabel || it.title);
    const key = `${it.dateISO}|${label.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    grid.push({ dateISO: it.dateISO, colorKey, label });
  }
  return { actions, grid: grid.slice(0, 8) };
}

// Collapse near-duplicate action titles (the same announcement re-sent across days
// produces variants like "Ms. Brenda out, returns Monday" vs "Ms. Brenda will be on
// vacation..."). Two items are dupes if their significant words overlap >= 50%.
function dedupeActions(items) {
  const kept = [];
  const sigs = [];
  for (const it of (items || [])) {
    const words = new Set(String(it.title || '').toLowerCase().match(/[a-z]{4,}/g) || []);
    if (!words.size) { kept.push(it); sigs.push(words); continue; }
    const isDup = sigs.some((prev) => {
      const inter = [...words].filter((w) => prev.has(w)).length;
      // need >=2 shared significant words (so a single common word like "Thursday"
      // doesn't merge "Jersey Day" into "Kona Ice"), plus >=50% overlap.
      return inter >= 2 && inter / (Math.min(words.size, prev.size) || 1) >= 0.5;
    });
    if (!isDup) { kept.push(it); sigs.push(words); }
  }
  return kept;
}

async function extractProcareItems(procareRows, now) {
  // Dedupe re-sent emails by cleaned-body prefix, keep the 3 most recent.
  const seenBodies = new Set();
  const rows = (procareRows || [])
    .filter((r) => cleanBody(r.body_text, 600))
    .filter((r) => {
      const key = (cleanBody(r.body_text, 120) || '').toLowerCase();
      if (seenBodies.has(key)) return false;
      seenBodies.add(key);
      return true;
    })
    .slice(0, 3);
  if (!rows.length) return [];
  const todayISO = ctDateISO(now);
  const today = ctParts(now);
  const blocks = rows
    .map((r, i) => `EMAIL ${i + 1} [${r.subject}] (received ${new Date(r.received_at).toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' })}):\n${cleanBody(r.body_text, 600)}`)
    .join('\n\n');
  const sys =
    `You extract parent-relevant items from a daycare/preschool (Procare) about a child named Creed. ` +
    `Today is ${today.dow} ${today.month} ${today.day} (${todayISO}). Return ONLY JSON of the form ` +
    `{"items":[{"title":string,"detail":string,"when":string,"dateISO":string,"gridLabel":string,"tone":"urgent|upcoming|info"}]}. ` +
    `Include: teacher absences/returns, special/dress-up days (e.g. Jersey Day), what-to-bring, ` +
    `treats/events (e.g. Kona Ice), closures, payments due, schedule changes. ` +
    `title = short fact or task ("Ms. Brenda out, returns Monday"). detail = one short clarifying line. ` +
    `when = short human timing label ("Thu Jun 11", "Through Mon"), else "". ` +
    `dateISO = the single most relevant calendar date as YYYY-MM-DD computed from today (${todayISO}); ` +
    `for a teacher returning Monday use that Monday's date; "" if no specific day. ` +
    `gridLabel = a VERY short calendar-cell label (<=18 chars, e.g. "Jersey Day", "Kona Ice", "Ms. Brenda back"). ` +
    `tone = "urgent" if today, "upcoming" if future-dated, else "info". ` +
    `Ignore greetings, sign-offs, app-download links. CONSOLIDATE the same announcement across emails into ONE. Max 5. ` +
    `Nothing noteworthy => {"items":[]}.`;
  try {
    const out = await callOpenAI([{ role: 'system', content: sys }, { role: 'user', content: blocks }]);
    const parsed = JSON.parse(out);
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return itemsToActionsAndGrid(items, now, { ico: 'CRD', colorKey: 'creed' });
  } catch (err) {
    console.error('[compileFamily] procare LLM extract failed, using heuristic:', err.message);
    return { actions: dedupeActions(heuristicProcareItems(rows)).slice(0, 5), grid: [] };
  }
}

// Travel: synthesize the actual upcoming trips/flights from itinerary/confirmation
// emails (ignoring marketing, resolving cancellations) -> dated grid (teal) + tasks.
async function extractTravelItems(travelRows, now) {
  const rows = (travelRows || []).filter((r) => !isPromoTravel(r.subject)).slice(0, 6);
  if (!rows.length) return { actions: [], grid: [] };
  const todayISO = ctDateISO(now);
  const today = ctParts(now);
  const blocks = rows
    .map((r, i) => `EMAIL ${i + 1} [${r.subject}] (received ${new Date(r.received_at).toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' })}):\n${(cleanBody(r.body_text, 500) || r.subject)}`)
    .join('\n\n');
  const sys =
    `You extract the family's ACTUAL upcoming travel from airline/booking emails. ` +
    `Today is ${today.dow} ${today.month} ${today.day} (${todayISO}). Ignore marketing/promotions; ` +
    `if a flight was cancelled, drop it. Return ONLY JSON ` +
    `{"items":[{"title":string,"detail":string,"when":string,"dateISO":string,"gridLabel":string,"tone":"urgent|upcoming|info"}]}. ` +
    `title = the trip/flight ("Flight DFW to BNA" or "Check in for AA flight"). detail = route/conf if known. ` +
    `when = short timing ("Sat Jun 13"). dateISO = that flight's date YYYY-MM-DD (from today ${todayISO}), else "". ` +
    `gridLabel = very short cell label (<=18 chars, e.g. "Flight DFW->BNA"). ` +
    `tone = "urgent" if within 24h (e.g. check-in), "upcoming" otherwise. Max 4 items, consolidate duplicates. ` +
    `Nothing real => {"items":[]}.`;
  try {
    const out = await callOpenAI([{ role: 'system', content: sys }, { role: 'user', content: blocks }]);
    const parsed = JSON.parse(out);
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return itemsToActionsAndGrid(items, now, { ico: 'TRIP', colorKey: 'travel' });
  } catch (err) {
    console.error('[compileFamily] travel extract failed:', err.message);
    return { actions: [], grid: [] };
  }
}

// Fallback: split the cleaned body into sentences and keep the substantive ones.
function heuristicProcareItems(rows) {
  const items = [];
  for (const r of (rows || [])) {
    // protect abbreviation periods (Ms./Dr./...) so they don't split sentences
    const body = (cleanBody(r.body_text, 600) || '').replace(/\b(Mr|Mrs|Ms|Dr|St|Jr|Sr)\.\s/g, '$1<DOT> ');
    const sentences = body
      .split(/(?<=[.!?])\s+|\s*[••]\s*/)
      .map((s) => s.replace(/<DOT>/g, '.').replace(/^[^\w$]+/, '').trim());
    for (const s of sentences) {
      if (s.length < 12) continue;
      if (/reply in the procare|adjust your email|notification|download|app store|google play|thank you|good (after|even|morn)|^announcements|wonderful week|let us know/i.test(s)) continue;
      items.push({ tone: 'info', ico: 'CRD', title: truncate(s, 100) });
      if (items.length >= 5) break;
    }
    if (items.length >= 5) break;
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
      tone: 'urgent', ico: '!', colorKey: 'action',
      title: `Resolve conflict - ${truncate(c.family.summary, 40)} vs ${truncate(c.work.summary, 30)}`,
      sub: 'Decide who covers the family event or move the work item. Settle before it arrives.',
      due: 'Today',
    });
  }
  return actions;
}

// Conflict markers for the week grid (red chip on the conflicting day).
function conflictGrid(now, today) {
  return (today.conflicts || []).map((c) => ({
    dateISO: ctDateISO(new Date(c.family.start)),
    colorKey: 'action',
    label: '! conflict',
  }));
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
    note: 'Why only these photos? They are the ones currently reachable by email — Karla Estrada at Primrose Wylie sent them to your Hotmail on Apr 30 and they forwarded to Gmail (how this report sees them). Older school comms lived in Hotmail and the Hotmail-to-Gmail forward only started Jun 3, 2026; Liberty and Procare send photos through the Procare Parent Portal app, not email. Once Google Photos is wired in, the rest of Creed’s history will surface here automatically.',
  };
}

// --------------------------------------------------------------------------
// Recap + moments (derived live from past family-calendar events)
// --------------------------------------------------------------------------

function agoLabel(now, d) {
  const days = Math.max(0, Math.round((now.getTime() - d.getTime()) / 86400000));
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

// One-paragraph recap of the last 7 days from family-calendar events.
function buildRecap(now, pastEvents) {
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const recent = (pastEvents || []).filter((e) => { const s = new Date(e.start); return s >= weekAgo && s < now; });
  const start = ctParts(weekAgo), end = ctParts(new Date(now.getTime() - 86400000));
  const rangeLabel = `Last 7 days (${start.month} ${start.day} - ${end.month} ${end.day})`;
  if (!recent.length) return { rangeLabel, text: 'A quiet week on the family calendar — no logged events.' };
  // collapse repeated titles (e.g. recurring volleyball) into "(Nx)"
  const counts = {};
  for (const e of recent) {
    const k = String(e.summary || '').replace(/\s{2,}/g, ' ').trim();
    counts[k] = (counts[k] || 0) + 1;
  }
  const parts = Object.entries(counts).map(([k, c]) => (c > 1 ? `${k} (${c}x)` : k));
  return { rangeLabel, text: `On the family calendar this week: ${parts.join(', ')}.` };
}

// Recent past events as flashback "moments" (most recent first).
function buildMoments(now, pastEvents) {
  return (pastEvents || [])
    .filter((e) => new Date(e.start) < now)
    .sort((a, b) => new Date(b.start) - new Date(a.start))
    .slice(0, 8)
    .map((e) => {
      const d = new Date(e.start);
      const p = ctParts(d);
      return [`${p.dow} . ${p.month} ${p.day}`, e.summary, agoLabel(now, d)];
    });
}

// --------------------------------------------------------------------------
// Upcoming costs (curated projection from the known Procare billing pattern —
// NOT live receipts; school charges are not reliably in email yet. Labeled as such.)
// --------------------------------------------------------------------------

function buildCosts(now) {
  const mp = ctParts(now);
  return {
    intro: 'Procare tuition runs about $330 per charge (~$660/month). These are projected from the known billing pattern, not live receipts.',
    rows: [
      { date: `~mid-${mp.month} (proj)`, item: 'Procare monthly charge', for: 'Creed (Liberty)', amount: '$330' },
      { date: `~mid-${mp.month} (proj)`, item: 'Procare secondary charge', for: 'Creed (Liberty)', amount: '$330' },
    ],
    summary: [
      { label: 'Due this week', value: '$0' },
      { label: 'Projected this month', value: '$660' },
    ],
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

    const pastStart = new Date(todayB.start.getTime() - 60 * 86400000);

    const familyToday = await listEvents(cal, familyCalId, todayB.start, todayB.end);
    const familyWeek = await listEvents(cal, familyCalId, todayB.start, weekEnd);
    const familyHorizon = await listEvents(cal, familyCalId, todayB.start, horizonEnd);
    const familyPast = await listEvents(cal, familyCalId, pastStart, todayB.start);

    let workToday = [];
    if (workCalId) {
      try { workToday = await listEvents(cal, workCalId, todayB.start, todayB.end); }
      catch (e) { degraded.push('work calendar'); }
    }

    todayBlock = buildToday(familyToday, workToday);
    data.today = { events: todayBlock.events };
    data._familyWeek = familyWeek; // week grid is built later, after extraction extras
    const travel = buildTravel(now, familyHorizon);
    if (travel.cards.length) data.travel = travel;
    data.risks = buildRisks(todayBlock);
    data.actions = buildActions(todayBlock); // conflict actions first
    data.recap = buildRecap(now, familyPast);
    data._pastEvents = familyPast; // used to enrich the flashback moments below
    sources.push('Google Calendar (Family)');
  } catch (err) {
    degraded.push('family calendar');
    console.error('[compileFamily] calendar source failed:', err.message);
  }

  // ---- Inbox emails: "new since yesterday" (30h) + Procare announcements (7d) ----
  // One DB read over a 7-day window; new-since is the recent subset, while school
  // announcements stay relevant all week (e.g. "Ms. Brenda out till Monday").
  try {
    const newSinceHours = Number(process.env.FAMILY_NEWSINCE_HOURS || 30);
    const rows = queryInboxEmails(7 * 24);
    const newSinceCutoff = now.getTime() - newSinceHours * 3600 * 1000;
    const newSince = buildNewSince(rows.filter((r) => new Date(r.received_at).getTime() >= newSinceCutoff));
    if (newSince.length) data.newSince = newSince;
    sources.push('inbox_emails DB (school + travel)');
    data._newSinceCount = newSince.length;

    // Stash rows for the async extraction step below.
    data._procareRows = rows.filter((r) =>
      r.label === 'School' && /office chat|daily summary/i.test(r.subject || ''));
    data._travelRows = rows.filter((r) => r.label === 'Travel');
  } catch (err) {
    degraded.push('inbox mail');
    console.error('[compileFamily] inbox_emails source failed:', err.message);
  }

  // ---- Extraction: Procare (Creed) + travel -> actions + dated grid extras ----
  const gridExtras = conflictGrid(now, todayBlock);
  if (data._procareRows && data._procareRows.length) {
    try {
      const p = await extractProcareItems(data._procareRows, now);
      if (p.actions.length) { data.actions = [...(data.actions || []), ...p.actions]; sources.push('Procare extraction (Creed)'); }
      gridExtras.push(...p.grid);
    } catch (err) {
      console.error('[compileFamily] procare extraction failed:', err.message);
    }
  }
  if (data._travelRows && data._travelRows.length) {
    try {
      const t = await extractTravelItems(data._travelRows, now);
      if (t.actions.length) { data.actions = [...(data.actions || []), ...t.actions]; sources.push('Travel extraction'); }
      gridExtras.push(...t.grid);
    } catch (err) {
      console.error('[compileFamily] travel extraction failed:', err.message);
    }
  }
  delete data._procareRows;
  delete data._travelRows;

  // ---- Week grid: family-calendar events + dated extras (Procare/travel/conflicts) ----
  if (data._familyWeek) {
    data.week = buildWeek(now, data._familyWeek, gridExtras);
    delete data._familyWeek;
  }

  // ---- Flashback (curated photos + live "other moments" from past calendar) ----
  const flashback = buildFlashback();
  const moments = buildMoments(now, data._pastEvents || []);
  if (moments.length) flashback.moments = moments;
  data.flashback = flashback;
  delete data._pastEvents;

  // ---- Upcoming costs (curated Procare pattern, labeled as projection) ----
  data.costs = buildCosts(now);

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
  _internals: { tzOffsetMs, ctDayBounds, ctDateISO, fmtCtTimeParts, categorize, buildToday, buildWeek, buildTravel, buildHero, truncate, cleanBody, buildNewSince, isPromoTravel, buildRecap, buildMoments, buildCosts, heuristicProcareItems, toCreedAction, toAction, validGridDate, itemsToActionsAndGrid, extractProcareItems, dedupeActions, conflictGrid },
};
