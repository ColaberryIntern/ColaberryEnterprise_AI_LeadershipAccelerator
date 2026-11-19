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
 * work calendar (free/busy) + timed events on the family calendar. It finds midday or evening hours
 * where both are free, picks 3 weekdays + 1 weekend slot, and asks the model for activities that fit both
 * people's answers, each with a stated "why". The code, not the model, enforces the time limits.
 */
import crypto from 'crypto';
import { QueryTypes } from 'sequelize';
import { google } from 'googleapis';
import { sequelize } from '../../config/database';
import { env } from '../../config/env';
import { SURVEY, DAILY, Question, dailyFor, answerLines, GAMES, WAGER, gameForDay } from './sparkContent';
import {
  Busy, Slot, PlanItem, RawPick, ctNow, mondayOf, weekDates, addDays, candidateSlots, pickWeekdaySlots,
  weekendSlots, pendingDays, weekdayIndex, shapeItem, nextSlot, fitsSlot, prettyDay, prettyTime, toMin, fromMin,
  isWeekday, prevWeekday, decideWinner, PROGRAM_START, mergeBusy, looksLikeGrid, removeRange, similarPrize,
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
  const lessons = (await rows('lesson', {}, 12)).filter((r) => !r.data.private).slice(0, 4).map((r) => String(r.data.text));
  return {
    name: PEOPLE[p].name,
    partner: PEOPLE[other(p)].name,
    today: prettyDay(now.date),
    survey: remaining.length ? { answered: SURVEY.length - remaining.length, total: SURVEY.length, questions: remaining } : null,
    planning: {
      // Needed until this person is done; a planned week only skips it for someone who never started (Ali's calendar is automatic).
      needed: !cal?.data.done && !(plan?.data.status === 'ready' && !cal),
      carried: now.date > week, // anything not done on Monday rolls forward (Ali, 2026-11-16)
      partnerDone: !!partnerCal?.data.done,
      autoCalendar: p === 'ali',
      shots: Number(cal?.data.shots || 0),
      retake: !!cal?.data.retake, // Spark asked for a new picture: the page shows only the photo step, then plans by itself
    },
    daily: pendingDays(now.date, answeredDays).map((d) => ({ day: d, label: prettyDay(d), carried: d !== now.date, questions: dailyFor(weekdayIndex(d)) })),
    plan: plan ? { status: plan.data.status, error: plan.data.status === 'failed' ? 'Planning hit a snag. Tap "Plan our week" to try again.' : null, items: (plan.data.items || []).map(view) } : null,
    learned: lessons,
    calendar: calendarView(cal?.data, week),
    game: await gameState(p, now.date),
    reveal: await reveal(now.date),
  };
}

// ---------------------------------------------------------------------------------- game of the day

const TRIES = 3;
interface Try { id: string; score: number | null; at: string }

async function gameRow(p: Person, day: string): Promise<Row | null> { return one('game', { person: p, day }); }

async function gameState(p: Person, day: string) {
  if (!isWeekday(day) || day < PROGRAM_START) return null;
  const game = gameForDay(weekdayIndex(day));
  const row = await gameRow(p, day);
  const tries: Try[] = row?.data.tries || [];
  const done = tries.filter((t) => t.score !== null).map((t) => Number(t.score));
  const wager = await one('wager', { person: p, day });
  return {
    day, game: { id: game.id, name: game.name, emoji: game.emoji, how: game.how },
    triesLeft: TRIES - tries.length, scores: done, best: done.length ? Math.max(...done) : null,
    locked: !!row?.data.locked || tries.length >= TRIES,
    wager: wager ? { locked: true } : null, // the prize stays a surprise until the reveal
    wagerGroups: wager ? null : WAGER,
  };
}

/** Use up one try (so a reload mid-game cannot buy a 4th) and return its id. */
export async function startTry(p: Person): Promise<{ tryId: string; triesLeft: number }> {
  const day = ctNow().date;
  if (!(await gameState(p, day))) throw new Error('no game today');
  const row = await gameRow(p, day);
  // gameState() gave the same game; keep its id on the row so a later rotation change cannot rename the day.
  const data = row?.data || { gameId: gameForDay(weekdayIndex(day)).id, tries: [] };
  if (data.locked || data.tries.length >= TRIES) throw new Error('no tries left');
  const t: Try = { id: crypto.randomBytes(8).toString('hex'), score: null, at: new Date().toISOString() };
  data.tries.push(t);
  if (row) await update(row.id, data); else await insert('game', p, mondayOf(day), day, data);
  return { tryId: t.id, triesLeft: TRIES - data.tries.length };
}

export async function finishTry(p: Person, tryId: string, score: unknown): Promise<{ best: number }> {
  const day = ctNow().date;
  const row = await gameRow(p, day);
  const t: Try | undefined = row?.data.tries?.find((x: Try) => x.id === tryId);
  if (!row || !t || t.score !== null) throw new Error('not found');
  const cap = (GAMES.find((g) => g.id === row.data.gameId) || { maxScore: 0 }).maxScore;
  t.score = Math.max(0, Math.min(cap, Math.round(Number(score) || 0)));
  await update(row.id, row.data);
  return { best: Math.max(...row.data.tries.filter((x: Try) => x.score !== null).map((x: Try) => Number(x.score))) };
}

/** Stop playing early: keeps the best score so far and opens the wager. */
export async function lockScore(p: Person): Promise<void> {
  const row = await gameRow(p, ctNow().date);
  if (row) await update(row.id, { ...row.data, locked: true });
}

/**
 * The 15-minute prize, chosen by Spark from this person's own answers and their group ranking (Ali,
 * 2026-11-18: "you should pick the prize for the 15 minutes based on our answers"). The partner owes it.
 */
async function pickPrize(p: Person, groups: string[], avoid: string[] = []): Promise<{ prize: string; why: string }> {
  const top = groups.find((g) => g in WAGER) || 'Sweet 💗';
  const fresh = (x: string) => !avoid.some((a) => similarPrize(a, x));
  const order = [top, ...groups.filter((g) => g !== top && g in WAGER), ...Object.keys(WAGER)];
  const listed = order.map((g) => ({ g, x: WAGER[g].find(fresh) })).find((o) => o.x);
  const fallback = listed
    ? { prize: String(listed.x), why: `From the ${listed.g.replace(/\s\S+$/, '')} prizes you ranked.` }
    : { prize: WAGER[top][0], why: `From the group you ranked first (${top.replace(/\s\S+$/, '')}).` };
  const avoidText = avoid.length ? `\nPrizes they already got (choose something clearly DIFFERENT, a different kind of thing, not a variation of these): ${avoid.slice(0, 15).join('; ')}.` : '';
  for (let attempt = 0; attempt < 2; attempt++) try {
    const out = await chat([
      { role: 'system', content: `You choose a 15-minute game prize for one partner in a married couple. The other partner gives it to them tonight or tomorrow, at home or nearby, with no planning and little or no cost. Make it specific to this person's answers (a concrete action, not a category), warm or playful; flirty is fine, explicit is not. No em dashes. Phrase the prize as what they receive, a short noun phrase that reads after "Your prize:" (for example "A 15-minute back rub with the lavender lotion"). Reply only in JSON: {"prize": "under 90 characters", "why": "1 sentence, citing their answers, written to them as you"}` },
      { role: 'user', content: `Their answers:\n${(await personLines(p)).map((x) => `- ${x}`).join('\n') || '- (no answers yet)'}\n\nPrize groups they ranked today, favorite first: ${groups.length ? groups.join(' > ') : 'not ranked'}.\nExamples of the kind of prize in their top group: ${WAGER[top].join('; ')}.\nPick one prize from their top group's spirit that fits them best.${avoidText}` },
    ], attempt ? 1 : 0.8);
    const clean = (s: unknown, n: number) => String(s || '').replace(/\s+/g, ' ').replace(/ ?[—–] ?/g, ', ').trim().slice(0, n);
    const prize = clean(out.prize, 110);
    if (prize && fresh(prize)) return { prize, why: clean(out.why, 220) };
  } catch (e: any) { console.warn('[Spark] prize pick failed, using the list:', e.message); }
  return fallback;
}

/** Every prize this person has had before `day` (Ali, 2026-11-19: "avoid doing the same prize"). */
async function pastPrizes(p: Person, day: string): Promise<string[]> {
  return (await rows('wager', { person: p }, 100)).filter((r) => r.day && String(r.day) < day && r.data.prize).map((r) => String(r.data.prize));
}

/** The wager: rank the 5 groups secretly. Spark picks the exact prize from your answers; you see it only if you win. */
export async function saveWager(p: Person, groups: unknown): Promise<{ ok: true }> {
  const day = ctNow().date;
  const st = await gameState(p, day);
  if (!st || !st.locked) throw new Error('finish your tries first');
  if (st.wager) return { ok: true };
  const g = Array.isArray(groups) ? groups.map(String).filter((x) => x in WAGER) : [];
  if (g.length !== Object.keys(WAGER).length) throw new Error('rank every group');
  const { prize, why } = await pickPrize(p, g, await pastPrizes(p, day));
  await insert('wager', p, mondayOf(day), day, { groups: g, picks: [], prize, why });
  await insert('lesson', p, mondayOf(day), day, { text: `One of you put "${g[0].replace(/\s\S+$/, '')}" prizes first today.`, private: true });
  return { ok: true };
}

/** The winner's prize for a day: their wager's, or (when they skipped the wager, or it repeats an earlier prize) one Spark picks now and keeps. */
async function prizeFor(p: Person, day: string): Promise<{ prize: string; why: string | null }> {
  const w = await one('wager', { person: p, day });
  const past = await pastPrizes(p, day);
  if (w?.data.prize && !past.some((x) => similarPrize(x, String(w.data.prize)))) return { prize: String(w.data.prize), why: w.data.why ? String(w.data.why) : null };
  const recent = (await rows('wager', { person: p }, 5)).find((r) => (r.data.groups || []).length);
  const groups: string[] = (w?.data.groups || []).length ? w!.data.groups : recent ? recent.data.groups : [];
  const { prize, why } = await pickPrize(p, groups, past);
  if (w) await update(w.id, { ...w.data, prize, why, repicked: String(w.data.prize) }); // a repeat: picked again, once, and kept
  else await insert('wager', p, mondayOf(day), day, { groups: [], picks: [], prize, why, auto: true });
  return { prize, why };
}

/** This morning's reveal: yesterday's (last weekday's) scores, winner and the prize owed. */
async function reveal(today: string) {
  const day = prevWeekday(today);
  if (day < PROGRAM_START) return null;
  const best = async (p: Person) => {
    const r = await gameRow(p, day);
    const s = (r?.data.tries || []).filter((t: Try) => t.score !== null).map((t: Try) => Number(t.score));
    return s.length ? Math.max(...s) : null;
  };
  const a = await best('ali'); const b = await best('addie');
  const win = decideWinner(a, b);
  if (!win.length) return null;
  const winners: Array<{ name: string; prize: string }> = []; // never the prize's why: it quotes the winner's answers
  for (const w of win) { const p: Person = w === 'a' ? 'ali' : 'addie'; winners.push({ name: PEOPLE[p].name, prize: (await prizeFor(p, day)).prize }); }
  const played = (await gameRow('ali', day)) || (await gameRow('addie', day));
  const g = GAMES.find((x) => x.id === played?.data.gameId) || gameForDay(weekdayIndex(day));
  return { day: prettyDay(day), game: `${g.emoji} ${g.name}`, scores: { Ali: a, Addie: b }, winners, tie: win.length === 2 };
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
export async function readScreenshot(p: Person, dataUrl: string): Promise<{ blocks: number; suspect: boolean; note: string }> {
  if (!/^data:image\/(png|jpe?g|webp);base64,/.test(dataUrl) || dataUrl.length > 1_200_000) throw new Error('bad image');
  const now = ctNow(); const week = mondayOf(now.date);
  const dates = weekDates(week).map((d) => `${prettyDay(d)} = ${d}`).join(', ');
  const out = await chat([
    { role: 'system', content: 'You read calendar screenshots. Return only JSON.' },
    { role: 'user', content: [
      { type: 'text', text: `This is a screenshot, or a phone photo of a computer screen, showing a person's calendar for the week of ${prettyDay(week)}. The dates this week are: ${dates}. List every block of time that is busy (meetings, appointments, any event), using the dates shown in the screenshot. Use 24-hour local times. Ignore all-day banners. Only a filled, colored event box with its own title counts as busy. The hour grid lines, hour labels, empty rows, the current-time line and shaded "working hours" or out-of-office backgrounds are NOT events: an empty calendar has none. Give each event its real start and end as drawn; do not split it into hours. A photo may be tilted, glared or partly cut off: read what you can and never guess a block you cannot see. Reply as {"readable": true|false, "busy": [{"date": "YYYY-MM-DD", "start": "HH:MM", "end": "HH:MM"}], "note": "one short sentence on what you saw"}.` },
      { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
    ] },
  ], 0);
  const valid = (b: any): b is Busy => b && /^\d{4}-\d{2}-\d{2}$/.test(b.date) && /^\d{2}:\d{2}$/.test(b.start) && /^\d{2}:\d{2}$/.test(b.end) && b.date >= week && b.date <= addDays(week, 6);
  const busy: Busy[] = (Array.isArray(out.busy) ? out.busy : []).filter(valid);
  const row = await one('calendar', { person: p, week });
  const data = row?.data || { busy: [], shots: 0, done: false };
  const have = new Set((data.busy || []).map((b: Busy) => `${b.date} ${b.start} ${b.end}`));
  data.busy = [...(data.busy || []), ...busy.filter((b) => !have.has(`${b.date} ${b.start} ${b.end}`))]; // a second photo of the same week adds no duplicates
  data.shots = Number(data.shots || 0) + 1;
  if (row) await update(row.id, data); else await insert('calendar', p, week, null, data);
  const suspect = [...new Set(busy.map((b) => b.date))].some((d) => looksLikeGrid(data.busy, d));
  return { blocks: busy.length, suspect, note: String(out.note || '').slice(0, 200) };
}

/**
 * What Spark read from this person's own calendar photos this week, day by day, so they can confirm
 * or fix it before (or after) planning. Only ever sent to that person. A day that looks like the hour
 * grid rather than meetings is flagged.
 */
function calendarView(data: any, week: string) {
  if (!data || !Number(data.shots || 0)) return null;
  const busy: Busy[] = data.busy || [];
  const days = weekDates(week).map((date) => ({
    date, label: prettyDay(date),
    ranges: mergeBusy(busy, date).map(([s, e]) => ({ start: fromMin(s), end: fromMin(e), text: `${prettyTime(fromMin(s))} to ${prettyTime(fromMin(e))}` })),
    suspect: looksLikeGrid(busy, date),
  }));
  return { shots: Number(data.shots), done: !!data.done, suspect: days.some((d) => d.suspect), days };
}

/** "That is wrong, I am open then": remove a busy range Spark read. */
export async function removeBusy(p: Person, date: unknown, start: unknown, end: unknown): Promise<void> {
  const hm = /^\d{2}:\d{2}$/;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !hm.test(String(start)) || !hm.test(String(end))) throw new Error('not found');
  const row = await one('calendar', { person: p, week: mondayOf(ctNow().date) });
  if (!row) throw new Error('not found');
  await update(row.id, { ...row.data, busy: removeRange(row.data.busy || [], String(date), String(start), String(end)) });
}

/**
 * Ask one person for a new calendar picture this week (Ali, 2026-11-18: "show nothing but prompt her to
 * take another picture ... when she uploads, then search and have the updates ready"). Their old read is
 * dropped; the page shows only the photo step, and a clean read plans the week by itself.
 */
export async function requestRetake(p: Person): Promise<void> {
  const week = mondayOf(ctNow().date);
  const row = await one('calendar', { person: p, week });
  const data = { busy: [], shots: 0, done: false, retake: true, note: String(row?.data.note || '') };
  if (row) await update(row.id, data); else await insert('calendar', p, week, null, data);
}

/** Start over: forget this week's photos so new ones can be taken. Spark re-plans when they tap done again. */
export async function clearCalendar(p: Person): Promise<void> {
  const row = await one('calendar', { person: p, week: mondayOf(ctNow().date) });
  if (row) await update(row.id, { ...row.data, busy: [], shots: 0, done: false });
}

/** Mark this person's planning done (with any off-calendar note). Plans the week once both are in. */
export async function finishPlanning(p: Person, note: string, force = false): Promise<{ planning: boolean }> {
  const week = mondayOf(ctNow().date);
  const row = await one('calendar', { person: p, week });
  const prev = row?.data || { busy: [], shots: 0 };
  const data = { ...prev, done: true, retake: false, note: String(note || prev.note || '').slice(0, 600) };
  if (row) await update(row.id, data); else await insert('calendar', p, week, null, data);
  const partner = await one('calendar', { person: other(p), week });
  // A retake photo still on its way must not hold up the week (Ali, 2026-11-19).
  if (partner?.data.done || partner?.data.retake || force) { void planWeek(week, { fill: true }).catch((e) => console.error('[Spark] plan failed:', e.message)); return { planning: true }; }
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
    // Photo not in yet: plan anyway, in the daytime (Ali, 2026-11-19: "the goal is to find time throughout
    // the day"). Never assume a full workday, which pushes every Spark into the evening.
    if (c?.data.retake && !(c.data.busy || []).length) notes.push(`${PEOPLE[p].name}'s new calendar photo is not in yet; either of you can move a time that does not work.`);
    else if (!c?.data.done) missing.push(PEOPLE[p].name);
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

/** One person's survey answers, recent daily answers and prize rankings, as plain lines. */
async function personLines(p: Person): Promise<string[]> {
  const s = answerLines(SURVEY, await answeredSurvey(p));
  const d = (await rows('daily', { person: p }, 15)).flatMap((r) => answerLines(DAILY, r.data.answers || {}));
  const w = (await rows('wager', { person: p }, 5)).filter((r) => (r.data.groups || []).length)
    .map((r) => `Game prize ranking (${r.day}): groups ${r.data.groups.join(' > ')}`);
  return [...s, ...d, ...w];
}

async function profiles(): Promise<string> {
  const parts: string[] = [];
  for (const [n, p] of [['Partner 1', 'ali'], ['Partner 2', 'addie']] as Array<[string, Person]>) {
    parts.push(`${n}:\n${(await personLines(p)).map((x) => `- ${x}`).join('\n') || '- (no answers yet)'}`);
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
- Weekday Sparks happen at the slot's time: a midday break or a weekday evening. An evening Spark must still work with a young son at home (after bedtime, or something he can be near), unless it is an outing. Every weekday Spark is 60 minutes, "home" or "out". For "out", walk first: a stroll around the neighborhood or the nearest park or spot you can walk to from home (driveMinutesEachWay 0). Drive only when nothing walkable fits, and then to the CLOSEST place of that kind, at most 10 minutes each way (never pass nearer options to reach a farther one), and only well-known, long-standing places that are reliably open at that time. Only for a real special occasion (a birthday, anniversary or holiday that falls that day) set "special" to the occasion's name: then it can be 90 minutes with up to 20 minutes' drive each way. Otherwise "special" is null.
- It is dark by about 5:30 PM from November through February: an evening outing must be indoors or at a lit, busy spot, never a trail, park walk, sunset or anything that needs daylight.
- The weekend date can be morning, afternoon or evening, 2 to 3 hours, at most 1.5 hours' drive each way.
- Match what BOTH partners said. When they differ, find the overlap or alternate. Be creative and specific: a concrete plan, not a category. Give each Spark one playful prompt, question or small dare to do during it.
- "why" must cite their answers WITHOUT revealing who said what: say "one of you", never "Partner 1/2". Say "you both" ONLY when both partners' answers actually say it.
- Name a specific business only if you are certain it exists in that area and offers that activity. Otherwise describe the kind of place ("a taqueria near home", "a lakeside park in Rowlett") and set venue to that description. Never invent a business, class or event.
- Keep it warm and fun; flirty is fine, explicit is not. Never repeat a past Spark or anything marked not a fit. Follow the lessons.
- No em dashes.
Reply only in JSON.`; // json_object mode refuses any request whose messages never say "JSON"

const ITEM_SHAPE = '{"slot": "<slot id>", "place": "home"|"out", "title": "short name", "emoji": "one emoji", "venue": "place name and city, or null for home", "driveMinutesEachWay": number, "minutes": number, "special": "occasion name or null", "plan": "2 to 3 sentences: what you do, plus the playful prompt", "why": "1 to 2 sentences"}';

function slotLine(id: string, s: Slot, kind: string): string {
  return `${id}: ${kind}, ${prettyDay(s.date)} starting ${prettyTime(s.start)}, up to ${toMin(s.maxEnd) - toMin(s.start)} minutes${kind === 'weekday' ? ' (plan 60; 90 only for a special occasion)' : ''}`;
}

const FALLBACK: RawPick[] = [
  { place: 'home', title: 'Five-ingredient cook-off', emoji: '🍳', plan: 'Pick the same 5 ingredients; each of you makes one small dish in 30 minutes, then trade plates and score each other out of 10. Loser does the dishes.', why: 'A quick, playful way to cook together when the week is full.' },
  { place: 'home', title: 'Backyard picnic and 10 questions', emoji: '🧺', plan: 'Blanket, snacks and your phones in another room. Take turns asking each other questions you have never asked before.', why: 'Time together with nothing else competing for it.' },
  { place: 'home', title: 'Kitchen dance lesson', emoji: '💃', plan: 'Pull up a beginner dance video and learn the first minute of a routine together. Perform it once, no laughing allowed.', why: 'Something new to learn together, right at home.' },
  { place: 'home', title: 'Song swap and story', emoji: '🎧', plan: 'Each picks three songs that mean something; play them and tell the story behind each one.', why: 'Music and memories, with no planning needed.' },
];

/**
 * Plan the week. With `fill`, a week that is already planned keeps every Spark it has and only adds
 * the weekday ones it is missing (up to 3) in the time still ahead, plus a weekend date if it has none.
 */
export async function planWeek(week: string, opts: { fill?: boolean } = {}): Promise<{ added: number }> {
  const existing = await one('plan', { person: null, week });
  if (existing?.data.status === 'planning') return { added: 0 };
  if (!opts.fill && existing?.data.status === 'ready') return { added: 0 };
  const keep: PlanItem[] = opts.fill && existing?.data.status === 'ready' ? existing.data.items || [] : [];
  const before = existing?.data || {};
  const id = existing ? existing.id : await insert('plan', null, week, null, { status: 'planning' });
  if (existing) await update(id, { ...before, status: 'planning' });
  try {
    const now = ctNow();
    const { busy, notes, missing } = await weekBusy(week);
    const keptDays = new Set(keep.filter((i) => i.kind === 'weekday').map((i) => i.date));
    const needWeekdays = 3 - keptDays.size;
    const wk = needWeekdays > 0 ? pickWeekdaySlots(candidateSlots(weekDates(week), busy, now).filter((s) => !keptDays.has(s.date)), needWeekdays) : [];
    const we = keep.some((i) => i.kind === 'weekend') ? [] : weekendSlots(week, busy, now).slice(0, 1);
    const taken = new Set(keep.map((i) => i.id));
    const freeId = (prefix: string) => { let k = 1; while (taken.has(`${week}-${prefix}${k}`)) k++; taken.add(`${week}-${prefix}${k}`); return `${prefix}${k}`; };
    const slots: Array<{ id: string; kind: 'weekday' | 'weekend'; slot: Slot }> = [
      ...wk.map((s) => ({ id: freeId('S'), kind: 'weekday' as const, slot: s })),
      ...we.map((s) => ({ id: freeId('W'), kind: 'weekend' as const, slot: s })),
    ];
    if (!slots.length) { await update(id, { ...before, status: 'ready', items: keep, busy, missing }); return { added: 0 }; }
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
    const used = new Set(past.map((t) => t.toLowerCase()));
    const spare = FALLBACK.filter((f) => !used.has(String(f.title).toLowerCase()));
    slots.forEach((s, n) => {
      const raw = picks.find((x) => x && x.slot === s.id);
      const item = (raw && shapeItem(`${week}-${s.id}`, s.kind, s.slot, raw)) || shapeItem(`${week}-${s.id}`, s.kind, s.slot, (spare.length ? spare : FALLBACK)[n % (spare.length || FALLBACK.length)]);
      if (item) items.push(item);
    });
    for (const i of items) await syncEvent(i);
    for (const i of items) await insert('reason', null, week, i.date, { text: `Picked "${i.title}" for ${prettyDay(i.date)}: ${i.why}` });
    const all = [...keep, ...items].sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
    await update(id, { status: 'ready', items: all, busy, missing, plannedAt: new Date().toISOString() });
    return { added: items.length };
  } catch (e: any) {
    // A fill that fails must not lose the Sparks the week already had.
    await update(id, keep.length ? { ...before, status: 'ready' } : { status: 'failed', error: String(e.message).slice(0, 300) });
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
