#!/usr/bin/env node
/*
 * scaffold-demo-spec: read a project's Command Center data and write a first-pass
 * demo-spec.json at schema_version 2: screens, navigation, the Human / Agent split, seeded
 * sample rows, AND the trust-and-work timeline the spec contract requires.
 *
 *   node tools/scaffold-demo-spec.mjs --repo <repo root> [--out demo/demo-spec.json]
 *
 * READS (all written by the spine or by STORY-000, never by this tool):
 *   .colaberry/plan.json            requirements, stories, agents, derived roles/systems/guardrails
 *   .colaberry/manifest.json        plan version + hash (stamped on the demo so staleness shows)
 *   command-center/data-model.json  the proposed tables: the shape of the sample data
 *
 * PURE apart from the file reads and the one write: no clock, no network, no Math.random.
 * The sample is seeded from the plan hash, so the same plan always gives the same demo
 * and a reviewer can tell "the plan changed" from "the dice changed".
 *
 * This is the FLOOR, not the finished demo. It is correct and connected but generic.
 * The story prompt has the builder's agent refine it into one believable scenario.
 */
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const repo = args.repo || '.';
const out = args.out || path.join(repo, 'demo', 'demo-spec.json');
const read = (p) => JSON.parse(fs.readFileSync(path.join(repo, p), 'utf8'));
const tryRead = (p) => { try { return read(p); } catch { return null; } };

const plan = read('.colaberry/plan.json');
const manifest = tryRead('.colaberry/manifest.json') || {};
const model = tryRead('command-center/data-model.json') || { tables: [] };
const tables = model.tables || [];
const derived = plan.derived || {};
const project = plan.project || {};
const sha = manifest.plan_sha256 || project.plan_sha256 || '';

// ---- seeded randomness -------------------------------------------------------
const seed = parseInt(sha.slice(0, 8), 16) || 1;
let state = seed >>> 0;
const rnd = () => { state = (state + 0x6D2B79F5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const one = (xs) => xs[Math.floor(rnd() * xs.length)];

const FIRST = ['Ana', 'Ben', 'Elena', 'Jo', 'Leah', 'Marcus', 'Priya', 'Sam', 'Tomas', 'Noor', 'Wei', 'Imani', 'Luca', 'Dara'];
const LAST = ['Flores', 'Carter', 'Ruiz', 'Tanaka', 'Brandt', 'Bell', 'Nair', 'Okafor', 'Vega', 'Haddad', 'Chen', 'Mbeki', 'Rossi', 'Quinn'];
const AREAS = ['North side', 'Riverside', 'Old Town', 'East End', 'Hillcrest', 'Lakeview'];
const ACCENTS = ['#0F766E', '#1D4ED8', '#7C3AED', '#9D174D', '#0E7490', '#3F6212'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// The demo's "today" is the day the plan was synced: a fact, not a clock read.
const base = new Date(manifest.generated_at || '2026-01-05T12:00:00Z');
const dayStr = (offset) => { const d = new Date(base.getTime() + offset * 86400000); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const timeStr = (mins) => { const h = Math.floor(mins / 60), m = mins % 60; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };

const human = (s) => { const t = String(s).replace(/_id$/, '').replace(/_/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };
const plural = (s) => (/[^aeiou]y$/.test(s) ? s.slice(0, -1) + 'ies' : /(s|x|ch|sh)$/.test(s) ? s + 'es' : s + 's');
const tableNames = tables.map((t) => t.name);

// ---- tables -> entities ------------------------------------------------------
const OK = /^(filled|approved|yes|connected|closed|done|complete|active|resolved|paid|sent)$/i;
const ATT = /^(open|pending|waiting|escalated|error|overdue|new|draft)$/i;

function fieldOf(table, f) {
  const note = f.note || '';
  const baseDef = { key: f.name, label: human(f.name) };
  if (/RESTRICTED/i.test(note)) return { ...baseDef, type: 'private', shown_as: 'Private. Never shared.' };
  if (f.type === 'ref') {
    const named = tableNames.find((n) => note.split(/[\s,]/)[0] === n) || tableNames.filter((n) => f.name.includes(n)).sort((a, b) => b.length - a.length)[0];
    if (!named) return { ...baseDef, type: 'text' };
    return { ...baseDef, type: 'ref', ref: named, nullable: /null/i.test(note) };
  }
  if (f.type === 'enum') {
    const values = note.split('|').map((v) => v.trim()).filter(Boolean);
    const tones = Object.fromEntries(values.map((v) => [v, OK.test(v) ? 'ok' : ATT.test(v) ? 'attention' : '']).filter(([, t]) => t));
    return { ...baseDef, type: 'enum', values, tones };
  }
  if (f.type === 'boolean') return { ...baseDef, type: 'bool' };
  if (f.type === 'timestamp') return { ...baseDef, type: 'datetime' };
  if (['date', 'time', 'number', 'text'].includes(f.type)) return { ...baseDef, type: f.type };
  return null; // json and anything unknown is not shown
}

const entities = {};
for (const t of tables) {
  const fields = (t.fields || []).filter((f) => f.type !== 'id').map((f) => fieldOf(t, f)).filter(Boolean);
  const isPeople = fields.some((f) => f.key === 'name') && fields.some((f) => /email|mobile|phone/.test(f.key));
  const isLog = /audit|event|log|activity|history/.test(t.name) && fields.some((f) => f.type === 'datetime');
  const refs = fields.filter((f) => f.type === 'ref');
  // A record with no name is titled by what it belongs to and when: "Office B · Nov 20".
  // Prefer a ref to a named place or thing, then a named person, then anything.
  const named = (f) => (tables.find((x) => x.name === f.ref).fields || []).some((x) => x.name === 'name');
  const person = (f) => (tables.find((x) => x.name === f.ref).fields || []).some((x) => /email|mobile|phone/.test(x.name));
  const bestRef = [...refs].sort((a, b) => (named(a) ? (person(a) ? 1 : 0) : 2) - (named(b) ? (person(b) ? 1 : 0) : 2))[0];
  let title = fields.some((f) => f.key === 'name') ? 'name' : null;
  if (!title) {
    const parts = [bestRef, fields.find((f) => ['date', 'datetime'].includes(f.type))].filter(Boolean).map((f) => `{${f.key}}`);
    title = parts.length ? parts.join(' · ') : 'id';
  }
  const inTitle = (title.match(/\{(\w+)\}/g) || [title]).map((k) => k.replace(/[{}]/g, ''));
  const status = fields.find((f) => f.type === 'enum' && /status|decision|response|state/.test(f.key)) || fields.find((f) => f.type === 'enum');
  entities[t.name] = {
    label: human(t.name), plural: plural(human(t.name)), table: t.name, purpose: t.purpose, derived_from: t.derived_from || [],
    title, status: status ? status.key : undefined, isPeople, isLog,
    columns: fields.filter((f) => f.type !== 'private' && !inTitle.includes(f.key)).slice(0, 5).map((f) => f.key),
    fields, rows: [],
  };
}

// ---- sample rows: ids first, so every ref can point at a real row -------------
const agents = plan.agents || [];
const personaName = (() => {
  for (const r of plan.requirements || []) {
    const m = /\b(?:page|notify|alert|ask)\s+([A-Z][a-z]+)\b/.exec(r.statement) || /\b([A-Z][a-z]+)\s+approv/.exec(r.statement);
    if (m && !['The', 'System'].includes(m[1])) return m[1];
  }
  return 'You';
})();
const roles = derived.roles || [];
// "As Dana, …" and "As a hygienist, …" both narrate a story; the article is optional.
const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const narratedBy = (role) => new RegExp(`^\\s*As\\s+(?:an?\\s+)?${reEsc(role)}\\s*,`, 'i');
// The demo is the screen of whoever narrates the most stories. ShiftFill v12 took the LAST
// role instead, and showed Dana as "Hygienist" though 16 of 17 stories were hers.
const ownRole = [...roles]
  .map((role, i) => ({ role, i, n: (plan.stories || []).filter((s) => narratedBy(role).test(s.narrative || '')).length }))
  .sort((a, b) => b.n - a.n || a.i - b.i)[0]?.role;
// A role that is the person's own name ("Dana") is not a job title to print under it.
const personaRole = !ownRole || ownRole.toLowerCase() === personaName.toLowerCase() ? 'Operator' : human(ownRole);

// Lower-case letters and digits, as DEMO_SPEC_CONTRACT.md requires ("g101", not "G-101").
const prefix = (name) => name.split('_').map((w) => w[0]).join('').toLowerCase();
const countFor = (e) => (e.isLog ? 10 : e.isPeople ? 8 : e.fields.some((f) => f.type === 'ref') ? 6 : 3);
for (const [key, e] of Object.entries(entities)) e.rows = Array.from({ length: countFor(e) }, (_, i) => ({ id: `${prefix(key)}${101 + i}` }));

const usedNames = new Set();
function value(key, e, f, i) {
  if (f.type === 'private') return undefined;
  if (f.type === 'ref') return f.nullable && rnd() < 0.4 ? null : one(entities[f.ref].rows).id;
  if (f.type === 'enum') return f.values[i < f.values.length ? i : int(0, f.values.length - 1)];
  if (f.type === 'bool') return rnd() < 0.85;
  if (f.type === 'date') return dayStr(int(-2, 2));
  if (f.type === 'time') return timeStr(one([420, 480, 540, 720, 780, 900]));
  if (f.type === 'datetime') return e.isLog ? `${dayStr(0)}, ${timeStr(420 - i * 6)}` : `${dayStr(int(-1, 0))}, ${timeStr(int(36, 90) * 10)}`;
  if (f.type === 'number') {
    if (/weekly|projected/.test(f.key)) return int(6, 11) * 4;
    if (/hour/.test(f.key)) return one([4, 6, 8]);
    if (/minute/.test(f.key)) return int(5, 30);
    if (/rank|wave|number/.test(f.key)) return (i % 3) + 1;
    if (/adjust/.test(f.key)) return int(-2, 2);
    return int(1, 20);
  }
  // text
  if (f.key === 'name' && e.isPeople) { let n; do { n = `${one(FIRST)} ${one(LAST)}`; } while (usedNames.has(n)); usedNames.add(n); return n; }
  if (f.key === 'name') return `${e.label} ${String.fromCharCode(65 + i)}`;
  if (/email/.test(f.key)) return null; // filled from the name below
  if (/mobile|phone/.test(f.key)) return `555-01${String(10 + i).padStart(2, '0')}`;
  if (/location|address/.test(f.key)) return AREAS[i % AREAS.length];
  if (/_ref$/.test(f.key)) return `ref-${(seed + i * 7919).toString(16).slice(-5)}`;
  if (/actor/.test(f.key) && agents.length) return agents[i % agents.length].name;
  if (/action|text|what|message|statement/.test(f.key) && agents.length) return `Produced: ${(agents[i % agents.length].outputs || [])[0] || 'a result'}`; // v13: an agent with outputs: [] printed "Produced: undefined"
  if (/(_to|_by)$/.test(f.key)) return personaName;
  if (/channel/.test(f.key)) return one((derived.systems || ['Email']));
  return `Sample ${f.label.toLowerCase()}`;
}
/*
 * A row must never claim something happened that its own state says has not.
 *
 * ShiftFill v13 (2026-11-24): three agency messages read `review: pending` with a `sent_at`,
 * which is a sample row breaking the plan's own guardrail ("Dana approves any message to a temp
 * agency before it is sent"), and the demo story's Trust line forbids exactly that. The check
 * above only read ONE status field per entity, and never blanked a sent time.
 *
 * Every enum on the row is read, and its state decides what cannot have happened yet:
 *   - a GATE state (held, pending review, awaiting approval, draft, queued) on any field that is
 *     not about a reply: nothing past the gate happened, so no sent / delivered / approved /
 *     decided / accepted / filled / replied value;
 *   - a waiting state on a REPLY field (reply, response, answer): the message went out, but no
 *     reply came, so only the reply's own values are blanked. A sent offer keeps its sent time.
 */
const GATE_STATE = /^(held|on[ _]hold|pending|awaiting(?:[ _]\w+)?|draft|queued|in[ _]review|not[ _]sent|unsent)$/i;
// "held" on a reply field is still a gate (v13: an offer held for overtime approval read
// `response: held` with a sent time); "pending" there only means no reply yet.
const HELD = /^(held|on[ _]hold|draft|queued|not[ _]sent|unsent)$/i;
const WAITING_REPLY = /^(pending|waiting|awaiting(?:[ _]\w+)?|none|no[ _]reply)$/i;
// A person refused it, so it never went out (v13: a `rejected` agency message with a sent time).
// Not on reply fields: a hygienist answering "no" does not unsend the offer.
const REFUSED = /^(rejected|declined|denied|cancell?ed|not[ _]approved)$/i;
const REPLY_FIELD = /reply|response|answer/;
const PAST_GATE = /(^|_)(sent|delivered|released|approved|decided|accepted|filled|replied|responded|answered|closed|resolved|completed)(_|$)/;
const REPLIED = /(^|_)(replied|responded|answered|accepted)(_|$)/;
const SENT = /(^|_)(sent|delivered|released)(_|$)/;
function blankFor(key, state) {
  if (REPLY_FIELD.test(key)) return HELD.test(state) ? PAST_GATE : WAITING_REPLY.test(state) ? REPLIED : null;
  return GATE_STATE.test(state) ? PAST_GATE : REFUSED.test(state) ? SENT : null;
}
// "Nov 22, 1:20 PM" as minutes, for ordering only. Null for anything else.
const MON = 'JanFebMarAprMayJunJulAugSepOctNovDec';
function stamp(v) {
  const m = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{1,2}):(\d{2}) (AM|PM)$/.exec(String(v ?? ''));
  if (!m || MON.indexOf(m[1]) < 0) return null;
  return (((MON.indexOf(m[1]) / 3) * 31 + Number(m[2])) * 24 + (Number(m[3]) % 12) + (m[5] === 'PM' ? 12 : 0)) * 60 + Number(m[4]);
}
function keepRowCoherent(e, row) {
  // A reply never comes before what it answers (v13: an offer answered a day before it was sent).
  const sentKey = e.fields.find((g) => SENT.test(g.key) && stamp(row[g.key]) !== null)?.key;
  const replyKey = e.fields.find((g) => REPLIED.test(g.key) && stamp(row[g.key]) !== null)?.key;
  if (sentKey && replyKey && stamp(row[replyKey]) < stamp(row[sentKey])) [row[sentKey], row[replyKey]] = [row[replyKey], row[sentKey]];
  for (const f of e.fields) {
    if (f.type !== 'enum' || row[f.key] == null) continue;
    const blank = blankFor(f.key, String(row[f.key]));
    if (!blank) continue;
    for (const g of e.fields) if (g !== f && g.type !== 'enum' && blank.test(g.key)) row[g.key] = null;
  }
}

for (const [key, e] of Object.entries(entities)) {
  e.rows.forEach((row, i) => {
    for (const f of e.fields) { const v = value(key, e, f, i); if (v !== undefined) row[f.key] = v; }
    for (const f of e.fields) if (/email/.test(f.key) && row.name) row[f.key] = `${row.name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`;
    // Something still open or pending has not been filled, decided or answered yet.
    if (e.status && ATT.test(String(row[e.status]))) {
      for (const f of e.fields) if (/filled|decided|responded|closed|resolved|completed/.test(f.key)) row[f.key] = null;
    }
    keepRowCoherent(e, row);
  });
}

// ---- which entity is which kind of screen ------------------------------------
const logKey = Object.keys(entities).find((k) => entities[k].isLog) || null;
const gated = agents.filter((a) => a.autonomy_level !== 'acts_autonomously');
// The approval queue is the table that records the decision a gated agent waits for:
// it carries pending/approved, and it was derived from the requirement that agent stops at.
const gateIds = gated.flatMap((a) => (a.approval_gates || []).map((t) => t.split(/\s/)[0]));
const queueScore = (k) => entities[k].derived_from.filter((r) => gateIds.includes(r)).length * 2 + (/approv|decision|review|sign/.test(k) ? 3 : 0);
const queueKey = gated.length ? Object.keys(entities)
  .filter((k) => entities[k].fields.some((f) => f.type === 'enum' && f.values.includes('pending') && f.values.some((v) => /approved|declined|rejected/.test(v))))
  .sort((a, b) => queueScore(b) - queueScore(a))[0] || null : null;

if (logKey) {
  const L = entities[logKey];
  L.fields.push({ key: 'actor_kind', label: 'Done by', type: 'who' });
  L.rows.forEach((r) => { r.actor_kind = 'agent'; });
}

// Stories that give a person something to open decide what is in "Work".
const workStories = (plan.stories || []).filter((s) => s.workspace && s.workspace.kind === 'workspace');
const score = (key) => workStories.reduce((n, s) => n + (s.fulfills || []).filter((r) => entities[key].derived_from.includes(r)).length, 0);
const storiesFor = (key) => workStories.filter((s) => (s.fulfills || []).some((r) => entities[key].derived_from.includes(r)));
const listable = Object.keys(entities).filter((k) => k !== logKey && k !== queueKey);
const work = listable.filter((k) => entities[k].status && score(k) > 0).sort((a, b) => score(b) - score(a)).slice(0, 4);
const records = listable.filter((k) => !work.includes(k));

const screens = {};
const ICON = (e) => (e.isPeople ? 'people' : e.fields.some((f) => f.type === 'date') ? 'calendar' : 'grid');
const listScreen = (key) => {
  const e = entities[key], st = storiesFor(key);
  const filter = e.status || (e.fields.find((f) => f.type === 'ref') || {}).key;
  screens[plural(key).replace(/_/g, '-')] = {
    type: 'list', title: e.plural, subtitle: e.purpose, entity: key, filter,
    from: st.map((s) => s.id), release: st.length ? st.map((s) => s.release).sort()[0] : undefined,
  };
  return { screen: plural(key).replace(/_/g, '-'), label: e.plural, icon: ICON(e) };
};
const workItems = work.map(listScreen);
// Every table gets a screen, so every record can be opened. Only the ones a person would
// go looking for get a place in the navigation; the rest are reached from the records they belong to.
const recordItems = records.map((k) => [k, listScreen(k)]).filter(([k]) => entities[k].isPeople || entities[k].title === 'name' || entities[k].status).map(([, item]) => item);

if (queueKey) {
  const e = entities[queueKey], f = e.fields.find((x) => x.type === 'enum' && x.values.includes('pending'));
  const yes = f.values.find((v) => /approved/.test(v)), no = f.values.find((v) => /declined|rejected/.test(v));
  const who = (e.fields.find((x) => x.type === 'ref' && entities[x.ref].isPeople) || e.fields.find((x) => x.type === 'ref') || { key: 'id' }).key;
  const gate = (derived.guardrails || []).find((g) => gated.some((a) => (a.approval_gates || []).some((t) => t.startsWith(g.id))));
  screens.approvals = {
    type: 'queue', title: 'Approvals', subtitle: `Work an agent has prepared and may not release without ${personaName}.`,
    entity: queueKey, pending: { [f.key]: 'pending' }, card_title: `${e.label}: {${who}}`,
    facts: e.columns.filter((c) => c !== f.key),
    actions: [
      { label: 'Approve', tone: 'primary', set: { [f.key]: yes }, log: `{persona} approved: {${who}}`, toast: 'Approved. The agent carries on from here.' },
      ...(no ? [{ label: 'Decline', set: { [f.key]: no }, log: `{persona} declined: {${who}}`, toast: 'Declined. The agent skips this one.' }] : []),
    ],
    rule: gate ? gate.statement : undefined,
    from: gated.flatMap((a) => a.owns || []),
  };
}
if (logKey) {
  const L = entities[logKey], t = (k) => (L.fields.find((f) => k.test(f.key)) || {}).key;
  screens.activity = { type: 'feed', title: 'Activity log', subtitle: 'Every step each agent and person took, newest first.', entity: logKey, time: (L.fields.find((f) => f.type === 'datetime') || {}).key, actor: t(/actor/) || 'id', kind: 'actor_kind', text: t(/action|text|what|message/) || 'id' };
}
screens['who-does-what'] = { type: 'roster', title: 'Who does what', subtitle: 'The split the plan made between agents and people.' };
screens.rules = { type: 'rules', title: 'Rules and connections', subtitle: 'What the finished system must never do, and what it plugs into.' };

// A tile counts the state that needs watching (open, pending, ...). A table with no such state gets no tile.
const firstOf = (key) => { const e = entities[key], f = e.fields.find((x) => x.key === e.status); const v = f.values.find((x) => ATT.test(x)); return v ? { field: f.key, value: v } : null; };
screens.today = {
  type: 'home', title: personaName === 'You' ? project.name || 'Home' : `Good morning, ${personaName}`, subtitle: project.descriptor || plan.descriptor || '',
  blocks: [
    { type: 'counts', items: [
      ...(queueKey ? [{ label: 'Waiting on you', entity: queueKey, where: screens.approvals.pending, to: 'approvals', tone: 'attention' }] : []),
      ...work.filter((k) => firstOf(k)).map((k) => { const s = firstOf(k); return { label: `${human(s.value)} ${entities[k].plural.toLowerCase()}`, entity: k, where: { [s.field]: s.value }, to: plural(k).replace(/_/g, '-') }; }),
    ] },
    ...(queueKey ? [{ type: 'queue', queue: 'approvals', limit: 1 }] : []),
    ...(work[0] ? [{ type: 'list', title: entities[work[0]].plural, entity: work[0], limit: 5, more: plural(work[0]).replace(/_/g, '-') }] : []),
    ...(logKey ? [{ type: 'feed', title: 'What the agents did', feed: 'activity', limit: 6 }] : []),
  ],
};

const nav = [
  { group: 'Work', items: [{ screen: 'today', label: 'Today', icon: 'home' }, ...workItems, ...(queueKey ? [{ screen: 'approvals', label: 'Approvals', icon: 'check', badge: { entity: queueKey, where: screens.approvals.pending, tone: 'attention' } }] : [])] },
  ...(recordItems.length || logKey ? [{ group: 'Records', items: [...recordItems, ...(logKey ? [{ screen: 'activity', label: 'Activity log', icon: 'list' }] : [])] }] : []),
  { group: 'System', items: [{ screen: 'who-does-what', label: 'Who does what', icon: 'flow' }, { screen: 'rules', label: 'Rules', icon: 'shield' }] },
];

// ---- the Human / Agent split, straight from the plan --------------------------
const people = roles.map((role) => {
  const re = narratedBy(role);
  const mine = role === ownRole;
  const decides = workStories.filter((s) => re.test(s.narrative || '')).map((s) => `${human(s.workspace.action || 'review')} in ${s.workspace.ref}`);
  if (mine) agents.forEach((a) => (a.escalation_rules || []).forEach((r) => decides.push(r)));
  return { role: human(role), decides, screen: queueKey && mine ? 'approvals' : undefined };
}).filter((p) => p.decides.length);

// One row per story: where a reviewer can see it, or an honest "not shown".
const coverage = (plan.stories || []).map((s) => {
  const hit = Object.keys(screens).find((k) => (screens[k].from || []).includes(s.id));
  const headless = !s.workspace || s.workspace.kind !== 'workspace';
  return { story: s.id, title: s.title, screen: hit || (headless ? 'who-does-what' : null), label: hit ? screens[hit].title : headless ? 'Runs in the background: Who does what' : undefined, note: hit || headless ? undefined : 'No screen yet. Add one when you refine the demo.' };
});

// ---- the trust-and-work timeline (demo-spec v2) -------------------------------
/*
 * WHY THIS BLOCK EXISTS, and why it was missing.
 *
 * The spec contract moved to v2 when the trust standard landed: `schema_version: 2`, an
 * `environment`, and an `events` array where every action carries a structured actor, an
 * accountable human, a causal reason, evidence and policy references, an approval state, its
 * side effects, whether it is reversible, and where to recover. `demoRender.ts` validates
 * against that contract and REFUSES anything else.
 *
 * This tool kept emitting v1 with no events at all. The engine shipped beside it reads
 * `SPEC.events` and renders the timeline, so a hand-scaffolded spec rendered a demo with no
 * timeline, and the platform's public route rejected it outright. A student following this
 * kit's own instructions produced a file that could not be published.
 *
 * THE SHAPE MIRRORS `connectedDemoSpec.ts`, deliberately, because two derivations of the same
 * contract is the duplicate-truth failure the kit is vendored in one place to prevent. One
 * difference, and it is an improvement rather than a divergence: the generator picks actors and
 * owners from a fixed list because it has only a plan, while this tool is run inside the
 * student's repo and can name the agents and the persona THEIR plan declares.
 *
 * THE LIFECYCLE IS SPREAD ON PURPOSE. A timeline where every action succeeded is the demo the
 * trust standard exists to prevent: it teaches a viewer that the system always works, which is
 * the one thing no system does. Every third action fails and every fifth is reverted, so a
 * scaffolded demo always shows at least one action that did not complete, and what was done
 * about it.
 */
const specStories = (plan.stories || []).filter((s) => s && s.id && s.title);

/* The actors this plan actually declares. A plan with no agents gets the system as the actor,
 * which is true rather than convenient: something performed the action. */
const eventActors = agents.length
  ? agents.map((a) => ({ type: 'agent', id: a.id, label: a.name || a.id }))
  : [{ type: 'system', id: 'system', label: `${project.name || plan.project_name || 'The build'} runtime` }];

const events = specStories.map((s, i) => {
  const failed = i > 0 && i % 3 === 0;
  const reverted = i > 0 && i % 5 === 0;
  const status = reverted ? 'reverted' : failed ? 'failed' : i === 1 ? 'executing' : 'succeeded';
  const highRisk = failed || reverted;
  const actor = eventActors[i % eventActors.length];
  const occurred = new Date(base.getTime() + i * 37 * 60 * 1000);

  return {
    event_id: `${s.id}-E1`,
    occurred_at: occurred.toISOString(),
    work_id: s.id,
    trace_id: `trace-${String(s.id).toLowerCase()}`,
    parent_event_id: i === 0 ? null : `${specStories[i - 1].id}-E1`,

    // `verified: false` is not a placeholder. A demo can verify no identity, and the contract
    // requires it be able to say so rather than implying a guarantee it does not have.
    actor: { ...actor, verified: false },
    human_owner_id: personaName === 'You' ? personaRole : personaName,

    action: s.title,
    status,
    risk_level: highRisk ? 'high' : i % 2 === 0 ? 'low' : 'medium',
    autonomy_tier: highRisk ? 'A2' : i % 2 === 0 ? 'A1' : 'A3',

    reason_summary: s.narrative || `${s.title} (no narrative on this story)`,
    evidence_refs: [`${s.id}/acceptance`],
    // The requirements this story fulfills ARE its policy references: they are the stated rules
    // the action is answerable to, and they come from the plan rather than from this tool.
    policy_refs: (s.fulfills || []).slice(0, 2),

    approval: highRisk
      ? { required: true, status: 'granted', assigned_to: personaName === 'You' ? personaRole : personaName }
      : { required: false, status: 'not_required', assigned_to: null },

    side_effects: failed ? [] : ['demo-fixtures'],
    reversible: !reverted,
    recovery_ref: reverted ? `${s.id}/recovery` : null,
    environment: 'demo',
  };
});

const privateTables = Object.values(entities).filter((e) => e.fields.some((f) => f.type === 'private'));
const spec = {
  schema_version: 2,
  environment: 'demo',
  events,
  // Every key here is a STRING or omitted, never null. The contract types them as optional
  // strings, and Zod treats null as a type error rather than as absence, so a repo without a
  // manifest used to emit `plan_version: null` and the whole spec was refused. `seed` was a
  // number for the same reason: nobody had ever validated this block, because the version
  // check failed first, so the first validation of it found both at once.
  source: Object.fromEntries(Object.entries({
    project: project.name || plan.project_name,
    plan_version: manifest.plan_version ?? project.plan_version,
    plan_sha256: sha,
    generated_at: manifest.generated_at,
    seed: String(seed),
  }).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])),
  app: {
    name: project.name || plan.project_name || 'Project', descriptor: project.descriptor || plan.descriptor || '', accent: ACCENTS[seed % ACCENTS.length],
    persona: { name: personaName, role: personaRole }, clock: `${DAYS[base.getUTCDay()]}, ${LONG_MONTHS[base.getUTCMonth()]} ${base.getUTCDate()}`,
    command_center_href: '../index.html',
    ...(logKey ? { log: { entity: logKey, time: screens.activity.time, actor: screens.activity.actor, kind: 'actor_kind', text: screens.activity.text } } : {}),
  },
  nav, screens,
  entities: Object.fromEntries(Object.entries(entities).map(([k, e]) => { const { isPeople, isLog, purpose, derived_from, ...keep } = e; return [k, { ...keep, derived_from }]; })),
  agents: agents.map((a) => ({ id: a.id, name: a.name, purpose: a.purpose, trigger: a.trigger, autonomy: a.autonomy_level, stops_when: (a.escalation_rules || []).join('; ') || undefined, screen: a.autonomy_level !== 'acts_autonomously' && queueKey ? 'approvals' : undefined })),
  people,
  guardrails: (derived.guardrails || []).map((g) => ({
    id: g.id, statement: g.statement,
    shown_as: queueKey && entities[queueKey].derived_from.includes(g.id) ? 'The work is held in Approvals until a person decides.'
      : privateTables.some((e) => e.derived_from.includes(g.id)) && /share|reason|private|disclos/i.test(g.statement) ? 'The field shows as private on every screen and holds no sample value.' : undefined,
  })),
  systems: derived.systems || [],
  coverage,
};

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(spec, null, 2)}\n`);
console.log(`wrote ${out}: ${Object.keys(screens).length} screens, ${Object.keys(entities).length} entities, ${Object.values(entities).reduce((n, e) => n + e.rows.length, 0)} sample rows, ${events.length} timeline events, seed ${seed}`);
