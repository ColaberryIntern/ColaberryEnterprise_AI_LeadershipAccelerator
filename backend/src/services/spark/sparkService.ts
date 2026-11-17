/**
 * Spark Hour - storage, unlock, planning and switching for Ali + Addie's weekly Sparks.
 *
 * Privacy model (Ali, 2026-11-16): the email only carries a QR code and a vague "check-in" card. The
 * page needs the private link key AND the last 4 digits of the person's own phone. Nothing anyone
 * answered is ever sent back to a browser: the API returns only what is still to do, the plan, and
 * what Spark learned. Each person's answers are invisible to the other; Spark reads both to decide.
 *
 * Storage is one self-created table, spark_records (kind + person + week + day + JSONB data), so the
 * feature needs no migration and no model registration. The PINs and the link key are stored only as
 * hashes and were seeded on the server, never committed.
 *
 * The planner: busy time = each person's calendar screenshot (read by a vision model) + Ali's Google
 * work calendar (free/busy) + timed events on the family calendar. It finds midday hours where both
 * are free, picks 3 weekdays + 1 weekend slot, and asks the model for activities that fit both
 * people's answers, each with a stated "why". The code, not the model, enforces the time limits.
 */
import crypto from 'crypto';
import { QueryTypes } from 'sequelize';
import { google } from 'googleapis';
import { sequelize } from '../../config/database';
import { env } from '../../config/env';
import { SURVEY, DAILY, Question, dailyFor, answerLines } from './sparkContent';
import {
  Busy, Slot, PlanItem, RawPick, ctNow, mondayOf, weekDates, addDays, candidateSlots, pickWeekdaySlots,
  weekendSlots, pendingDays, weekdayIndex, shapeItem, nextSlot, fitsSlot, prettyDay, prettyTime, toMin, fromMin,
} from './sparkLogic';

export type Person = 'ali' | 'addie';
export const PEOPLE: Record<Person, { name: string; email: string }> = {
  ali: { name: 'Ali', email: 'ali@colaberry.com' },
  addie: { name: 'Addie', email: 'addie.m.mack@gmail.com' },
};
const other = (p: Person): Person => (p === 'ali' ? 'addie' : 'ali');
export const isPerson = (x: unknown): x is Person => x === 'ali' || x === 'addie';

const HOME_AREA = 'Rowlett / Garland, northeast of Dallas, Texas';
const MODEL = 'gpt-4o';
const SESSION_HOURS = 8;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

interface Row { id: number; kind: string; person: string | null; week: string | null; day: string | null; data: any; created_at: string }

let ready: Promise<void> | null = null;
export function ensureTable(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await sequelize.query(`CREATE TABLE IF NOT EXISTS spark_records (
        id BIGSERIAL PRIMARY KEY, kind TEXT NOT NULL, person TEXT, week TEXT, day TEXT,
        data JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await sequelize.query('CREATE INDEX IF NOT EXISTS spark_records_kind_idx ON spark_records (kind, person, week)');
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

async function rows(kind: string, where: { person?: string | null; week?: string; day?: string } = {}, limit = 500): Promise<Row[]> {
  await ensureTable();
  const conds = ['kind = :kind']; const repl: Record<string, unknown> = { kind, limit };
  if (where.person !== undefined) { conds.push(where.person === null ? 'person IS NULL' : 'person = :person'); repl.person = where.person; }
  if (where.week !== undefined) { conds.push('week = :week'); repl.week = where.week; }
  if (where.day !== undefined) { conds.push('day = :day'); repl.day = where.day; }
  return sequelize.query<Row>(`SELECT id, kind, person, week, day, data, created_at FROM spark_records WHERE ${conds.join(' AND ')} ORDER BY id DESC LIMIT :limit`, { type: QueryTypes.SELECT, replacements: repl });
}
async function one(kind: string, where: { person?: string | null; week?: string; day?: string } = {}): Promise<Row | null> {
  return (await rows(kind, where, 1))[0] || null;
}
async function insert(kind: string, person: string | null, week: string | null, day: string | null, data: unknown): Promise<number> {
  await ensureTable();
  const r = await sequelize.query<{ id: number }>(
    'INSERT INTO spark_records (kind, person, week, day, data) VALUES (:kind, :person, :week, :day, CAST(:data AS jsonb)) RETURNING id',
    { type: QueryTypes.SELECT, replacements: { kind, person, week, day, data: JSON.stringify(data) } },
  );
  return r[0].id;
}
async function update(id: number, data: unknown): Promise<void> {
  await sequelize.query('UPDATE spark_records SET data = CAST(:data AS jsonb), updated_at = now() WHERE id = :id', { replacements: { id, data: JSON.stringify(data) } });
}
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const same = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// ---------------------------------------------------------------------------------- unlock

export async function keyOk(key: unknown): Promise<boolean> {
  if (typeof key !== 'string' || key.length < 16 || key.length > 100) return false;
  const cfg = await one('config', { person: null });
  return !!cfg && same(sha(key), String(cfg.data.keyHash || ''));
}

export async function unlock(who: Person, pin: string): Promise<{ ok: true; session: string } | { ok: false; error: string }> {
  const recent = await sequelize.query<{ n: string }>(
    `SELECT count(*) AS n FROM spark_records WHERE kind = 'fail' AND person = :who AND created_at > now() - (:mins || ' minutes')::interval`,
    { type: QueryTypes.SELECT, replacements: { who, mins: String(LOCK_MINUTES) } },
  );
  if (Number(recent[0]?.n || 0) >= MAX_FAILS) return { ok: false, error: `Too many tries. Locked for ${LOCK_MINUTES} minutes.` };
  const p = await one('person', { person: who });
  const good = !!p && /^\d{4}$/.test(pin) && same(crypto.scryptSync(pin, String(p.data.salt), 32).toString('hex'), String(p.data.pinHash));
  if (!good) { await insert('fail', who, null, null, {}); return { ok: false, error: 'That code did not match.' }; }
  const token = crypto.randomBytes(24).toString('hex');
  await insert('session', who, null, null, { hash: sha(token), exp: Date.now() + SESSION_HOURS * 3600000 });
  return { ok: true, session: token };
}

export async function sessionPerson(token: unknown): Promise<Person | null> {
  if (typeof token !== 'string' || !/^[0-9a-f]{48}$/.test(token)) return null;
  await ensureTable();
  const r = await sequelize.query<Row>(`SELECT id, kind, person, week, day, data, created_at FROM spark_records WHERE kind = 'session' AND data->>'hash' = :h LIMIT 1`, { type: QueryTypes.SELECT, replacements: { h: sha(token) } });
  const s = r[0];
  if (!s || Number(s.data.exp) < Date.now() || !isPerson(s.person)) return null;
  return s.person;
}

// ---------------------------------------------------------------------------------- today

async function answeredSurvey(p: Person): Promise<Record<string, unknown>> {
  return (await one('survey', { person: p }))?.data.answers || {};
}

export async function today(p: Person) {
  const now = ctNow(); const week = mondayOf(now.date);
  const survey = await answeredSurvey(p);
  const remaining = SURVEY.filter((q) => survey[q.id] === undefined);
  const answeredDays = (await rows('daily', { person: p })).map((r) => String(r.day));
  const cal = await one('calendar', { person: p, week });
  const partnerCal = await one('calendar', { person: other(p), week });
  const plan = await one('plan', { person: null, week });
  const lessons = (await rows('lesson', {}, 4)).map((r) => String(r.data.text));
  return {
    name: PEOPLE[p].name,
    partner: PEOPLE[other(p)].name,
    today: prettyDay(now.date),
    survey: remaining.length ? { answered: SURVEY.length - remaining.length, total: SURVEY.length, questions: remaining } : null,
    planning: {
      needed: !cal?.data.done && !(plan && plan.data.status === 'ready'),
      carried: now.date > week, // anything not done on Monday rolls forward (Ali, 2026-11-16)
      partnerDone: !!partnerCal?.data.done,
      autoCalendar: p === 'ali',
      shots: Number(cal?.data.shots || 0),
    },
    daily: pendingDays(now.date, answeredDays).map((d) => ({ day: d, label: prettyDay(d), carried: d !== now.date, questions: dailyFor(weekdayIndex(d)) })),
    plan: plan ? { status: plan.data.status, error: plan.data.status === 'failed' ? 'Planning hit a snag. Tap "Plan our week" to try again.' : null, items: (plan.data.items || []).map(view) } : null,
    learned: lessons,
  };
}

function view(i: PlanItem) {
  return {
    id: i.id, kind: i.kind, day: prettyDay(i.date), time: `${prettyTime(i.start)} to ${prettyTime(i.end)}`,
    place: i.place, title: i.title, emoji: i.emoji, plan: i.plan, why: i.why, venue: i.venue, driveMinutes: i.driveMinutes,
  };
}

// ---------------------------------------------------------------------------------- answers

function cleanAnswers(qs: Question[], input: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!input || typeof input !== 'object') return out;
  for (const q of qs) {
    const v = (input as Record<string, unknown>)[q.id];
    if (v === undefined || v === null || v === '') continue;
    if (q.type === 'open') out[q.id] = String(v).slice(0, 1000);
    else if (q.type === 'rank') { if (Array.isArray(v)) out[q.id] = v.map(String).filter((x) => q.options?.includes(x)).slice(0, 8); }
    else if (q.options?.includes(String(v))) out[q.id] = String(v);
  }
  return out;
}

export async function saveSurvey(p: Person, input: unknown): Promise<number> {
  const add = cleanAnswers(SURVEY, input);
  const row = await one('survey', { person: p });
  const answers = { ...(row?.data.answers || {}), ...add };
  if (row) await update(row.id, { answers }); else await insert('survey', p, null, null, { answers });
  return Object.keys(add).length;
}

export async function saveDaily(p: Person, day: string, input: unknown): Promise<number> {
  const now = ctNow();
  if (!pendingDays(now.date, []).includes(day)) throw new Error('not an open day');
  if (await one('daily', { person: p, day })) return 0;
  const answers = cleanAnswers(dailyFor(weekdayIndex(day)), input);
  await insert('daily', p, mondayOf(day), day, { answers });
  return Object.keys(answers).length;
}

// ---------------------------------------------------------------------------------- the model

async function chat(messages: unknown[], temperature = 0.7): Promise<any> {
  if (!env.openaiApiKey) throw new Error('no model key');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 90000);
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: ctl.signal,
      headers: { Authorization: `Bearer ${env.openaiApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, temperature, response_format: { type: 'json_object' }, messages }),
    });
    if (!r.ok) throw new Error(`model ${r.status}`);
    const j: any = await r.json();
    return JSON.parse(j.choices?.[0]?.message?.content || '{}');
  } finally { clearTimeout(t); }
}

// ---------------------------------------------------------------------------------- calendars

/** Read busy blocks from one calendar screenshot. Returns the blocks it could read. */
export async function readScreenshot(p: Person, dataUrl: string): Promise<{ blocks: number; note: string }> {
  if (!/^data:image\/(png|jpe?g|webp);base64,/.test(dataUrl) || dataUrl.length > 1_200_000) throw new Error('bad image');
  const now = ctNow(); const week = mondayOf(now.date);
  const dates = weekDates(week).map((d) => `${prettyDay(d)} = ${d}`).join(', ');
  const out = await chat([
    { role: 'system', content: 'You read calendar screenshots. Return only JSON.' },
    { role: 'user', content: [
      { type: 'text', text: `This is a screenshot of a person's calendar for the week of ${prettyDay(week)}. The dates this week are: ${dates}. List every block of time that is busy (meetings, appointments, any event), using the dates shown in the screenshot. Use 24-hour local times. Ignore all-day banners. Reply as {"readable": true|false, "busy": [{"date": "YYYY-MM-DD", "start": "HH:MM", "end": "HH:MM"}], "note": "one short sentence on what you saw"}.` },
      { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
    ] },
  ], 0);
  const valid = (b: any): b is Busy => b && /^\d{4}-\d{2}-\d{2}$/.test(b.date) && /^\d{2}:\d{2}$/.test(b.start) && /^\d{2}:\d{2}$/.test(b.end) && b.date >= week && b.date <= addDays(week, 6);
  const busy: Busy[] = (Array.isArray(out.busy) ? out.busy : []).filter(valid);
  const row = await one('calendar', { person: p, week });
  const data = row?.data || { busy: [], shots: 0, done: false };
  data.busy = [...(data.busy || []), ...busy]; data.shots = Number(data.shots || 0) + 1;
  if (row) await update(row.id, data); else await insert('calendar', p, week, null, data);
  return { blocks: busy.length, note: String(out.note || '').slice(0, 200) };
}

/** Mark this person's planning done (with any off-calendar note). Plans the week once both are in. */
export async function finishPlanning(p: Person, note: string, force = false): Promise<{ planning: boolean }> {
  const week = mondayOf(ctNow().date);
  const row = await one('calendar', { person: p, week });
  const data = { ...(row?.data || { busy: [], shots: 0 }), done: true, note: String(note || '').slice(0, 600) };
  if (row) await update(row.id, data); else await insert('calendar', p, week, null, data);
  const partner = await one('calendar', { person: other(p), week });
  if (partner?.data.done || force) { void planWeek(week).catch((e) => console.error('[Spark] plan failed:', e.message)); return { planning: true }; }
  return { planning: false };
}

function calendarApi() {
  const auth = new google.auth.JWT({ email: env.googleServiceAccountEmail, key: env.googlePrivateKey, scopes: ['https://www.googleapis.com/auth/calendar'], subject: env.googleCalendarOwnerEmail });
  return google.calendar({ version: 'v3', auth });
}

/** Ali's work calendar (free/busy) and timed family-calendar events, as Central busy blocks. */
async function googleBusy(week: string): Promise<{ ali: Busy[]; both: Busy[] }> {
  const cal = calendarApi();
  const timeMin = new Date(Date.parse(`${week}T00:00:00Z`) - 86400000).toISOString();
  const timeMax = new Date(Date.parse(`${addDays(week, 7)}T00:00:00Z`) + 86400000).toISOString();
  const toBusy = (s: string, e: string): Busy[] => {
    const a = ctNow(new Date(s)); const b = ctNow(new Date(e));
    if (a.date === b.date) return [{ date: a.date, start: a.time, end: b.time }];
    return [{ date: a.date, start: a.time, end: '23:59' }, { date: b.date, start: '00:00', end: b.time }];
  };
  const ali: Busy[] = []; const both: Busy[] = [];
  try {
    const fb = await cal.freebusy.query({ requestBody: { timeMin, timeMax, timeZone: 'America/Chicago', items: [{ id: 'primary' }] } });
    for (const b of fb.data.calendars?.primary?.busy || []) if (b.start && b.end) ali.push(...toBusy(b.start, b.end));
  } catch (e: any) { console.warn('[Spark] work calendar unreadable:', e.message); }
  try {
    if (env.googleFamilyCalendarId) {
      const ev = await cal.events.list({ calendarId: env.googleFamilyCalendarId, timeMin, timeMax, singleEvents: true, maxResults: 250 });
      for (const e of ev.data.items || []) if (e.start?.dateTime && e.end?.dateTime && !/^💘/.test(e.summary || '')) both.push(...toBusy(e.start.dateTime, e.end.dateTime));
    }
  } catch (e: any) { console.warn('[Spark] family calendar unreadable:', e.message); }
  return { ali, both };
}

async function weekBusy(week: string): Promise<{ busy: Busy[]; notes: string[]; missing: string[] }> {
  const g = await googleBusy(week);
  const busy: Busy[] = [...g.ali, ...g.both]; const notes: string[] = []; const missing: string[] = [];
  for (const p of ['ali', 'addie'] as Person[]) {
    const c = await one('calendar', { person: p, week });
    if (c?.data.busy) busy.push(...c.data.busy);
    if (c?.data.note) notes.push(String(c.data.note));
    if (!c?.data.done) missing.push(PEOPLE[p].name);
  }
  return { busy, notes, missing };
}

const eventBody = (i: PlanItem) => ({
  summary: `💘 Spark: ${i.title}`,
  location: i.venue || (i.place === 'home' ? 'Home' : undefined),
  description: `${i.plan}\n\nWhy Spark picked it: ${i.why}\n\nNeed a different time? Open your check-in from the Family Dashboard email.`,
  start: { dateTime: `${i.date}T${i.start}:00`, timeZone: 'America/Chicago' },
  end: { dateTime: `${i.date}T${i.end}:00`, timeZone: 'America/Chicago' },
});

/** Put the Spark on the family calendar; if that calendar is read-only for us, on Ali's calendar with Addie invited. */
async function syncEvent(i: PlanItem): Promise<void> {
  if (process.env.SPARK_NO_CALENDAR === '1') return; // dry runs and smoke tests never touch the real calendar
  const cal = calendarApi();
  try {
    if (i.eventId && i.calendarId) {
      await cal.events.patch({ calendarId: i.calendarId, eventId: i.eventId, sendUpdates: i.calendarId === 'primary' ? 'all' : 'none', requestBody: eventBody(i) });
      return;
    }
    try {
      if (!env.googleFamilyCalendarId) throw new Error('no family calendar');
      const r = await cal.events.insert({ calendarId: env.googleFamilyCalendarId, requestBody: eventBody(i) });
      i.calendarId = env.googleFamilyCalendarId; i.eventId = r.data.id || null;
    } catch {
      const r = await cal.events.insert({ calendarId: 'primary', sendUpdates: 'all', requestBody: { ...eventBody(i), attendees: [{ email: PEOPLE.addie.email }] } });
      i.calendarId = 'primary'; i.eventId = r.data.id || null;
    }
  } catch (e: any) { console.warn('[Spark] calendar write failed:', e.message); }
}

// ---------------------------------------------------------------------------------- planning

async function profiles(): Promise<string> {
  const parts: string[] = [];
  for (const [n, p] of [['Partner 1', 'ali'], ['Partner 2', 'addie']] as Array<[string, Person]>) {
    const s = answerLines(SURVEY, await answeredSurvey(p));
    const d = (await rows('daily', { person: p }, 15)).flatMap((r) => answerLines(DAILY, r.data.answers || {}));
    parts.push(`${n}:\n${[...s, ...d].map((x) => `- ${x}`).join('\n') || '- (no answers yet)'}`);
  }
  return parts.join('\n\n');
}

async function history(): Promise<{ past: string[]; lessons: string[] }> {
  const past = (await rows('plan', { person: null }, 6)).flatMap((r) => (r.data.items || []).map((i: PlanItem) => i.title));
  const rejected = (await rows('plan', { person: null }, 6)).flatMap((r) => (r.data.items || []).flatMap((i: PlanItem) => i.rejected || []));
  const lessons = (await rows('lesson', {}, 20)).map((r) => String(r.data.text));
  return { past: [...past, ...rejected], lessons };
}

const RULES = `You plan "Spark Hour" dates for a married couple (Partner 1 and Partner 2) who live in ${HOME_AREA}, with a young son.
Rules:
- Weekday Sparks happen in the middle of a workday. "home" = about 60 minutes at the house. "out" = 90 minutes total INCLUDING the drive both ways, so a drive of at most 20 minutes each way, and only well-known, long-standing places that are reliably open at that time.
- The weekend date can be morning, afternoon or evening, 2 to 3 hours, at most 1.5 hours' drive each way.
- Match what BOTH partners said. When they differ, find the overlap or alternate. Be creative and specific: a concrete plan, not a category. Give each Spark one playful prompt, question or small dare to do during it.
- "why" must cite their answers WITHOUT revealing who said what: say "one of you", never "Partner 1/2". Say "you both" ONLY when both partners' answers actually say it.
- Name a specific business only if you are certain it exists in that area and offers that activity. Otherwise describe the kind of place ("a taqueria near home", "a lakeside park in Rowlett") and set venue to that description. Never invent a business, class or event.
- Keep it warm and fun; flirty is fine, explicit is not. Never repeat a past Spark or anything marked not a fit. Follow the lessons.
- No em dashes.
Reply only in JSON.`; // json_object mode refuses any request whose messages never say "JSON"

const ITEM_SHAPE = '{"slot": "<slot id>", "place": "home"|"out", "title": "short name", "emoji": "one emoji", "venue": "place name and city, or null for home", "driveMinutesEachWay": number, "minutes": number, "plan": "2 to 3 sentences: what you do, plus the playful prompt", "why": "1 to 2 sentences"}';

function slotLine(id: string, s: Slot, kind: string): string {
  return `${id}: ${kind}, ${prettyDay(s.date)} starting ${prettyTime(s.start)}, up to ${toMin(s.maxEnd) - toMin(s.start)} minutes`;
}

const FALLBACK: RawPick[] = [
  { place: 'home', title: 'Five-ingredient cook-off', emoji: '🍳', plan: 'Pick the same 5 ingredients; each of you makes one small dish in 30 minutes, then trade plates and score each other out of 10. Loser does the dishes.', why: 'A quick, playful way to cook together when the week is full.' },
  { place: 'home', title: 'Backyard picnic and 10 questions', emoji: '🧺', plan: 'Blanket, snacks and your phones in another room. Take turns asking each other questions you have never asked before.', why: 'Time together with nothing else competing for it.' },
  { place: 'home', title: 'Kitchen dance lesson', emoji: '💃', plan: 'Pull up a beginner dance video and learn the first minute of a routine together. Perform it once, no laughing allowed.', why: 'Something new to learn together, right at home.' },
  { place: 'home', title: 'Song swap and story', emoji: '🎧', plan: 'Each picks three songs that mean something; play them and tell the story behind each one.', why: 'Music and memories, with no planning needed.' },
];

export async function planWeek(week: string): Promise<void> {
  const existing = await one('plan', { person: null, week });
  if (existing && ['planning', 'ready'].includes(existing.data.status)) return;
  const id = existing ? existing.id : await insert('plan', null, week, null, { status: 'planning' });
  if (existing) await update(id, { status: 'planning' });
  try {
    const now = ctNow();
    const { busy, notes, missing } = await weekBusy(week);
    const wk = pickWeekdaySlots(candidateSlots(weekDates(week), busy, now), 3);
    const we = weekendSlots(week, busy, now).slice(0, 1);
    const slots: Array<{ id: string; kind: 'weekday' | 'weekend'; slot: Slot }> = [
      ...wk.map((s, n) => ({ id: `S${n + 1}`, kind: 'weekday' as const, slot: s })),
      ...we.map((s) => ({ id: 'W1', kind: 'weekend' as const, slot: s })),
    ];
    const { past, lessons } = await history();
    let out: any = {};
    try {
      out = await chat([
        { role: 'system', content: RULES },
        { role: 'user', content: `Their answers:\n${await profiles()}\n\nNotes they added for this week: ${notes.join(' | ') || 'none'}\nPast Sparks (do not repeat): ${past.join('; ') || 'none'}\nLessons learned: ${lessons.join(' | ') || 'none yet'}\n\nPlan one Spark for each slot:\n${slots.map((s) => slotLine(s.id, s.slot, s.kind)).join('\n')}\n\nReply as {"items": [${ITEM_SHAPE}, ...]}` },
      ], 0.9);
    } catch (e: any) { console.warn('[Spark] model plan failed, using fallbacks:', e.message); }
    const picks: any[] = Array.isArray(out.items) ? out.items : [];
    const items: PlanItem[] = [];
    slots.forEach((s, n) => {
      const raw = picks.find((x) => x && x.slot === s.id);
      const item = (raw && shapeItem(`${week}-${s.id}`, s.kind, s.slot, raw)) || shapeItem(`${week}-${s.id}`, s.kind, s.slot, FALLBACK[n % FALLBACK.length]);
      if (item) items.push(item);
    });
    for (const i of items) await syncEvent(i);
    for (const i of items) await insert('reason', null, week, i.date, { text: `Picked "${i.title}" for ${prettyDay(i.date)}: ${i.why}` });
    await update(id, { status: 'ready', items, busy, missing, plannedAt: new Date().toISOString() });
  } catch (e: any) {
    await update(id, { status: 'failed', error: String(e.message).slice(0, 300) });
    throw e;
  }
}

export async function planNow(p: Person): Promise<void> {
  await finishPlanning(p, (await one('calendar', { person: p, week: mondayOf(ctNow().date) }))?.data.note || '', true);
}

// ---------------------------------------------------------------------------------- switching

async function loadItem(itemId: string): Promise<{ row: Row; items: PlanItem[]; item: PlanItem }> {
  const week = String(itemId).slice(0, 10);
  const row = await one('plan', { person: null, week });
  const items: PlanItem[] = row?.data.items || [];
  const item = items.find((x) => x.id === itemId);
  if (!row || !item) throw new Error('not found');
  return { row, items, item };
}

async function pickFor(slot: Slot, kind: 'weekday' | 'weekend', avoid: string[], why: string): Promise<RawPick | null> {
  const { past, lessons } = await history();
  try {
    const out = await chat([
      { role: 'system', content: RULES },
      { role: 'user', content: `Their answers:\n${await profiles()}\n\nPast Sparks (do not repeat): ${[...past, ...avoid].join('; ') || 'none'}\nLessons learned: ${lessons.join(' | ') || 'none yet'}\nWhy a new pick is needed: ${why}\n\nPlan one Spark for this slot:\n${slotLine('S1', slot, kind)}\n\nReply as ${ITEM_SHAPE}` },
    ], 0.95);
    return out && out.title ? out : null;
  } catch { return null; }
}

const REASONS = ['Work ran over', 'Too far for midday', 'Weather', 'Just not feeling it', 'Too tired', 'Kids needed us', 'Did something like it recently'];
const cleanReason = (r: unknown) => (REASONS.includes(String(r)) ? String(r) : 'No reason given');

/** Change the time. Spark keeps the activity if it still fits the new time; otherwise Spark picks one that does. */
export async function changeTime(p: Person, itemId: string, reason: unknown): Promise<{ ok: boolean; message: string }> {
  const { row, items, item } = await loadItem(itemId);
  const now = ctNow(); const week = String(row.week);
  const busy: Busy[] = row.data.busy || [];
  const slot = nextSlot(item, items, candidateSlots(weekDates(week), busy, now), weekendSlots(week, busy, now));
  if (!slot) return { ok: false, message: 'There is no other shared open time left this week. Keep it, or tap "Not a fit".' };
  const was = `${prettyDay(item.date)} ${prettyTime(item.start)}`;
  item.tried = [...(item.tried || []), `${item.date} ${item.start}`];
  let message: string;
  let keep = fitsSlot(item, slot);
  if (keep && item.kind === 'weekend') {
    try {
      const v = await chat([{ role: 'system', content: 'Answer only JSON {"fits": true|false}.' }, { role: 'user', content: `Does "${item.title}" (${item.plan}) work on ${prettyDay(slot.date)} at ${prettyTime(slot.start)}? Think about opening hours, daylight and the kind of activity.` }], 0);
      keep = v.fits !== false;
    } catch { /* keep it */ }
  }
  if (keep) {
    const len = toMin(item.end) - toMin(item.start);
    Object.assign(item, { date: slot.date, start: slot.start, end: fromMin(toMin(slot.start) + len) });
    message = `Moved to ${prettyDay(item.date)} at ${prettyTime(item.start)}. "${item.title}" still fits, so it stays.`;
  } else {
    const inWeek = items.map((x) => x.title);
    const raw = await pickFor(slot, item.kind, inWeek, `the time moved to ${prettyDay(slot.date)} ${prettyTime(slot.start)} and "${item.title}" does not fit then`);
    const spare = FALLBACK.find((f) => !inWeek.includes(String(f.title)));
    const next = (raw && shapeItem(item.id, item.kind, slot, raw)) || (spare ? shapeItem(item.id, item.kind, slot, spare) : null);
    if (!next) return { ok: false, message: 'Could not find something that fits that time. Try again.' };
    Object.assign(item, { ...next, tried: item.tried, rejected: item.rejected, calendarId: item.calendarId, eventId: item.eventId });
    message = `Moved to ${prettyDay(item.date)} at ${prettyTime(item.start)}. The old plan did not fit that time, so Spark picked "${item.title}".`;
  }
  await syncEvent(item);
  await update(row.id, { ...row.data, items });
  await insert('lesson', p, week, item.date, { text: `A Spark moved off ${was} (${cleanReason(reason)}). Plan around that next time.` });
  return { ok: true, message };
}

/** Not a fit: Spark picks a different activity for the same time. They never choose it themselves. */
export async function notFit(p: Person, itemId: string, reason: unknown): Promise<{ ok: boolean; message: string }> {
  const { row, items, item } = await loadItem(itemId);
  const slot: Slot = { date: item.date, start: item.start, maxEnd: item.kind === 'weekend' ? fromMin(toMin(item.start) + 180) : fromMin(toMin(item.start) + 90) };
  const old = item.title;
  const inWeek = items.map((x) => x.title);
  const raw = await pickFor(slot, item.kind, [...inWeek, ...(item.rejected || [])], `"${old}" was not a fit (${cleanReason(reason)})`);
  const spare = FALLBACK.find((f) => !inWeek.includes(String(f.title)) && !(item.rejected || []).includes(String(f.title)));
  const next = (raw && shapeItem(item.id, item.kind, slot, raw)) || (spare ? shapeItem(item.id, item.kind, slot, spare) : null);
  if (!next) return { ok: false, message: 'Could not find a new pick. Try again.' };
  Object.assign(item, { ...next, tried: item.tried, rejected: [...(item.rejected || []), old], calendarId: item.calendarId, eventId: item.eventId });
  await syncEvent(item);
  await update(row.id, { ...row.data, items });
  await insert('lesson', p, String(row.week), item.date, { text: `"${old}" was not a fit (${cleanReason(reason)}). Fewer picks like it.` });
  return { ok: true, message: `Spark picked something new: "${item.title}".` };
}

export const SWITCH_REASONS = REASONS;
