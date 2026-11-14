/**
 * familySchoolNews - the "School" section of the Family Dashboard: the important things from each
 * kid's school, pulled from the school mail that lands in ali@colaberry.com (synced into the
 * inbox_emails table) and boiled down to dates, deadlines and things a parent has to do.
 *
 * Ali, 2026-11-13: "get all the important details from Harrison for Addison, Naaman Forest for Jayce
 * and Watkins for Creed and put the important stuff in our newsletter."
 *
 *   Harrison Intermediate (Wylie ISD)   -> Addison   (ParentSquare)
 *   Watkins Elementary (Wylie ISD)      -> Creed     (ParentSquare)
 *   Naaman Forest High (Garland ISD)    -> Jayce     (no mail reaches any synced inbox as of
 *                                                     2026-11-13; the section says so plainly)
 *   Wylie ISD district posts            -> Family    (apply to both Wylie kids)
 *
 * Failure path: the summary is one bounded OpenAI call. If it fails or returns junk, the section
 * falls back to the plain subject lines of the school mail (deterministic, still useful) rather
 * than disappearing. If the DB read fails, the caller drops the section and the dashboard still sends.
 */
const { execFileSync } = require('child_process');

const SCHOOLS = [
  { re: /harrison/i, school: 'Harrison Intermediate', child: 'Addison' },
  { re: /watkins/i, school: 'Watkins Elementary', child: 'Creed' },
  { re: /naaman/i, school: 'Naaman Forest High School', child: 'Jayce' },
  { re: /wylie independent school district|wylie isd/i, school: 'Wylie ISD', child: 'Family' },
];
const LOOKBACK_DAYS = 7;
const MAX_ITEMS = 12;

/** Which school a ParentSquare mail belongs to: the "Connect user in X" footer wins, then subject, then body. */
function schoolOf(row) {
  const footer = /Connect user in ([^.\n]+)\./i.exec(row.body_text || '');
  for (const probe of [footer && footer[1], row.subject, (row.body_text || '').slice(0, 1500)]) {
    if (!probe) continue;
    const hit = SCHOOLS.find((s) => s.re.test(probe));
    if (hit) return hit;
  }
  return null;
}

/** Strip ParentSquare boilerplate and signed tracking links so the model sees only the message. */
function cleanBody(text) {
  return String(text || '')
    .replace(/To see the post and comment[\s\S]*?(?=\n-{5,}|$)/gi, '')
    .replace(/You received this email because[\s\S]*$/i, '')
    .replace(/https:\/\/www\.parentsquare\.com\/\S+/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 3500);
}

function readSchoolMail() {
  const sql = `select coalesce(json_agg(t), '[]') from (
      select distinct on (subject, received_at::date) received_at, from_address, subject, left(body_text, 9000) body_text
      from inbox_emails
      where provider = 'gmail_colaberry' and received_at > now() - interval '${LOOKBACK_DAYS} days'
        and (from_address ilike '%parentsquare.com' or from_address ilike '%garlandisd%' or subject ilike '%naaman%')
      order by subject, received_at::date, received_at desc
    ) t`.replace(/\s+/g, ' ');
  const out = execFileSync('docker', ['exec', 'accelerator-db', 'psql', '-U', process.env.PROD_DB_USER || 'accelerator', '-d', process.env.PROD_DB_NAME || 'accelerator_prod', '-t', '-A', '-c', sql], { encoding: 'utf8', timeout: 20000, maxBuffer: 20 * 1024 * 1024 });
  return JSON.parse(out.trim() || '[]');
}

const PROMPT = (today) => `Today is ${today}. Below are school emails for a family. Kids: Addison (Harrison Intermediate), `
  + `Creed (Watkins Elementary, kindergarten), Jayce (Naaman Forest High School, senior). "Family" means a district-wide post.\n`
  + `Pull out only what a busy parent must know: events with dates, deadlines, forms to fill, money to send, things to bring, `
  + `schedule changes, grade concerns. Skip fundraising pitches, generic reminders and anything already in the past. `
  + `Merge duplicates. Reply with JSON only: {"items":[{"email":<the number of the email it came from>,"date":"YYYY-MM-DD or null",`
  + `"title":"under 12 words","detail":"one plain sentence","action":"what the parent must do, or null","link":"a form or `
  + `signup URL from the email, or null"}]}. Plain words, no dashes. At most ${MAX_ITEMS} items, soonest first.`;

async function summarise(rows, today) {
  const corpus = rows.map((r, i) => `### Email ${i + 1} | ${r.child} | ${r.school} | received ${String(r.received_at).slice(0, 10)}\nSubject: ${r.subject}\n${cleanBody(r.body_text)}`).join('\n\n').slice(0, 60000);
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(60000),
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: PROMPT(today) }, { role: 'user', content: corpus }] }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = JSON.parse((await r.json()).choices[0].message.content);
  return normaliseItems(attributeItems(j.items, rows), today);
}

/**
 * The child comes from the school of the email the item was pulled from, never from the model:
 * on 2026-11-14 the model tagged Harrison's 5th-grade scoliosis screening as Jayce's. Items that
 * do not name a real email are dropped. Pure.
 */
function attributeItems(items, rows) {
  return (Array.isArray(items) ? items : []).map((it) => {
    const src = it && Number.isInteger(Number(it.email)) ? rows[Number(it.email) - 1] : null;
    return src ? { ...it, child: src.child } : null;
  }).filter(Boolean);
}

/** Validate model output: known child, sane date, not in the past, dashes removed, capped. Pure. */
function normaliseItems(items, today) {
  const kids = new Set(['Addison', 'Creed', 'Jayce', 'Family']);
  const clean = (s) => (s == null ? null : String(s).replace(/\s*[–—]\s*/g, ', ').trim() || null);
  return (Array.isArray(items) ? items : [])
    .filter((it) => it && kids.has(it.child) && it.title)
    .map((it) => ({
      child: it.child,
      date: /^\d{4}-\d{2}-\d{2}$/.test(it.date || '') ? it.date : null,
      title: clean(it.title),
      detail: clean(it.detail),
      action: clean(it.action),
      link: /^https?:\/\/\S+$/.test(it.link || '') && !/parentsquare\.com/.test(it.link) ? it.link : null,
    }))
    .filter((it) => !it.date || it.date >= today)
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'))
    .slice(0, MAX_ITEMS);
}

/** { items, coverage: [{child, school, emails}], fallback: bool } */
async function compileSchoolNews({ today }) {
  const rows = readSchoolMail().map((r) => ({ ...r, ...(schoolOf(r) || {}) })).filter((r) => r.school);
  const coverage = SCHOOLS.map((s) => ({ child: s.child, school: s.school, emails: rows.filter((r) => r.school === s.school).length }));
  if (!rows.length) return { items: [], coverage, fallback: false };
  try {
    return { items: await summarise(rows, today), coverage, fallback: false };
  } catch (e) {
    console.warn(`[SchoolNews] summary failed, using subject lines: ${e.message}`);
    const items = rows.slice(0, MAX_ITEMS).map((r) => ({ child: r.child, date: null, title: String(r.subject).replace(/[–—]/g, ', '), detail: `${r.school}, received ${String(r.received_at).slice(0, 10)}`, action: null, link: null }));
    return { items, coverage, fallback: true };
  }
}

module.exports = { compileSchoolNews, schoolOf, cleanBody, normaliseItems, attributeItems };
