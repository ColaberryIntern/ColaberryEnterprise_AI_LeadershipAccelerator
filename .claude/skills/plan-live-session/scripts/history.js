#!/usr/bin/env node
/**
 * history.js: reads and appends docs/live-sessions/history.json, the record of every blueprint.
 *
 *   node history.js init      [--history=<path>]                 create the file if it is missing
 *   node history.js next-date [--history=<path>] [--from=YYYY-MM-DD] [--min-lead-days=1]
 *        the next open weekly slot: the first date at least --min-lead-days after --from (default
 *        today, Central time) that falls on schedule.weekday and has no blueprint yet. Prints the
 *        date on stdout; an assumed (unconfirmed) weekday is flagged on stderr.
 *   node history.js episode   [--history=<path>]                 the next episode number of the weekly series
 *   node history.js last      [--history=<path>]                 the most recent entry (for the callback)
 *   node history.js append <blueprint.json> [--history=<path>]   add one entry from a validated blueprint
 *
 * Results (views, attendance, clips used) are filled in later by hand under `results`; once ten
 * sessions have results, references/evidence.md says to prefer our own numbers over the benchmarks.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const HISTORY = path.resolve(opt('history', path.join(REPO, 'docs', 'live-sessions', 'history.json')));
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const EMPTY = {
  about: 'Every live-session blueprint written by the plan-live-session skill. Append-only via history.js; fill `results` by hand after the session airs.',
  schedule: { weekday: 'Tuesday', time: '18:30', timezone: 'America/Chicago', note: 'Confirmed by Ali 2026-11-19: Tuesdays 6:30 pm Central. Used when no date= is given.' },
  sessions: [],
};

function load() {
  if (!fs.existsSync(HISTORY)) return null;
  return JSON.parse(fs.readFileSync(HISTORY, 'utf8'));
}
function save(h) {
  fs.mkdirSync(path.dirname(HISTORY), { recursive: true });
  fs.writeFileSync(HISTORY, JSON.stringify(h, null, 2) + '\n');
}
function todayCentral() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

// US federal holidays (observed dates for fixed holidays that fall on a weekend are not shifted;
// the weekly slot is a weekday, so the nth-weekday ones are what matter).
function usHoliday(iso) {
  const [y, m, day] = iso.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  const nth = (n, wd) => day > 7 * (n - 1) && day <= 7 * n && dow === wd;
  const last = (wd) => dow === wd && day + 7 > new Date(Date.UTC(y, m, 0)).getUTCDate();
  const md = `${m}-${day}`;
  if (md === '1-1') return "New Year's Day";
  if (m === 1 && nth(3, 1)) return 'Martin Luther King Jr. Day';
  if (m === 2 && nth(3, 1)) return "Presidents' Day";
  if (m === 5 && last(1)) return 'Memorial Day';
  if (md === '6-19') return 'Juneteenth';
  if (md === '7-4') return 'Independence Day';
  if (m === 9 && nth(1, 1)) return 'Labor Day';
  if (m === 10 && nth(2, 1)) return 'Columbus Day';
  if (md === '11-11') return 'Veterans Day';
  if (m === 11 && nth(4, 4)) return 'Thanksgiving';
  if (md === '12-25') return 'Christmas Day';
  return null;
}

if (cmd === 'init') {
  if (load()) console.log(`exists: ${HISTORY}`); else { save(EMPTY); console.log(`created: ${HISTORY}`); }
} else if (cmd === 'next-date') {
  const h = load() || EMPTY;
  const want = DAYS.indexOf((h.schedule && h.schedule.weekday) || 'Tuesday');
  const taken = new Set(h.sessions.map((s) => s.date));
  // --min-lead-days (default 1): never plan a session for today; it needs at least a day of prep.
  // US federal holidays are skipped unless --allow-holidays (a live on Thanksgiving draws nobody).
  let d = addDays(opt('from', todayCentral()), Number(opt('min-lead-days', '1')));
  const skipped = [];
  for (let i = 0; i < 400; i++, d = addDays(d, 1)) {
    if (new Date(`${d}T12:00:00Z`).getUTCDay() !== want || taken.has(d)) continue;
    const hol = usHoliday(d);
    if (hol && !args.includes('--allow-holidays')) { skipped.push(`${d} (${hol})`); continue; }
    break;
  }
  console.log(d);
  if (skipped.length) console.error(`assumption: skipped ${skipped.join(', ')}, a US federal holiday; record this in meta.assumptions`);
  if (h.schedule && /ASSUMED/.test(h.schedule.note || '')) {
    console.error(`assumption: ${h.schedule.weekday} is an assumed weekly slot, not confirmed; record this in meta.assumptions`);
  }
  if (!h.schedule || !h.schedule.time) console.error('assumption: no air time in history.json schedule.time; write "time to be confirmed (Central)" wherever a time would go');
} else if (cmd === 'episode') {
  const h = load() || EMPTY;
  console.log(h.sessions.filter((s) => !(s.results && s.results.aired === false)).length + 1);
} else if (cmd === 'last') {
  const h = load() || EMPTY;
  const last = h.sessions.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  // notYetAired: the "last" session may still be in the future. Then (or when it is more than 7
  // days before the new date) the callback says "last session", never "last week".
  console.log(last ? JSON.stringify({ ...last, notYetAired: last.date > todayCentral() }, null, 2) : 'none');
} else if (cmd === 'append') {
  const file = args[1];
  const bp = JSON.parse(fs.readFileSync(file, 'utf8'));
  const h = load() || JSON.parse(JSON.stringify(EMPTY));
  const entry = {
    date: bp.header.airDate,
    week: bp.header.week.number,
    title: bp.header.title,
    lens: bp.header.lens,
    slug: bp.meta.slug,
    audience: bp.header.audience,
    lengthMinutes: bp.header.lengthMinutes,
    scores: { idea: bp.scores.idea, room: bp.scores.room.total, yield: bp.scores.yield.total },
    belowPassMark: bp.meta.belowPassMark,
    covered: bp.header.promise,
    blueprint: (() => { const rel = path.relative(REPO, path.resolve(file)); return (rel.startsWith('..') ? path.resolve(file) : rel).replace(/\\/g, '/'); })(),
    createdAt: new Date().toISOString(),
    results: null,
  };
  h.sessions = h.sessions.filter((s) => !(s.date === entry.date && s.slug === entry.slug));
  h.sessions.push(entry);
  save(h);
  console.log(`appended: ${entry.date} week ${entry.week} "${entry.title}" → ${HISTORY} (${h.sessions.length} session(s))`);
} else {
  console.error('usage: history.js init | next-date [--from=] | last | append <blueprint.json>   [--history=<path>]');
  process.exit(1);
}
