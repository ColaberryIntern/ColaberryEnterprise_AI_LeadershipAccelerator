/**
 * familyThrowbacks - "Throw Back Pics" for the Family Dashboard: older family photos from the phone
 * camera roll, chosen to connect with what this edition of the newsletter is talking about (the week's
 * calendar and school items) or, failing that, with this time of year. Every throwback carries the
 * date it was taken.
 *
 * Ali, 2026-11-14: "Always try to find pictures even if they are throw back and have something to do
 * with what we are talking about, just make sure you put a date on them and specifically call them
 * 'Throw Back Pics'."
 *
 * Throwbacks share the photo ledger with the new-photo feed (familyPhotoFeed), so the one-time rule is
 * the same: once a throwback is posted, that photo, any copy of it and its whole moment are never shown
 * again, as a throwback or as a new photo. Ledger entries carry section "throwback" so a same-day
 * resend reuses the day's throwbacks and the two sections never borrow each other's picks.
 *
 * Only photos whose capture date is known (phone file name or the camera's EXIF time) are eligible:
 * an upload date is not a "taken" date, and a throwback with a wrong date is worse than none.
 *
 * Helpers from familyPhotoFeed are passed in as `h` ({ takenAt, isBlocked, hashOf, groupMoments,
 * hasTrueDate, fetchJson }) rather than required, which avoids a require cycle.
 *
 * Failure modes: the ranking model call failing or returning junk falls back to a deterministic
 * "same time of year" pick, so the section still fills. An empty pool returns no throwbacks.
 */

const THROWBACK_PER_DAY = 2;
const OLD_LABEL_BUDGET = 60; // archive photos classified per run; the labelled pool grows daily
const SEASON_DAYS = 10;
const RANK_CANDIDATES = 80;

function dayOfYear(ymd) {
  const d = new Date(`${ymd}T12:00:00Z`);
  return Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5);
}
/** Days between two dates' positions in the year, ignoring the year (Dec 30 and Jan 2 are 3 apart). */
function seasonGap(a, b) {
  const g = Math.abs(dayOfYear(a) - dayOfYear(b));
  return Math.min(g, 365 - g);
}
function yearsAgo(takenYmd, today) {
  let y = Number(today.slice(0, 4)) - Number(takenYmd.slice(0, 4));
  if (today.slice(5) < takenYmd.slice(5)) y -= 1;
  return Math.max(0, y);
}
const ymdOf = (item, h) => h.takenAt(item).slice(0, 10);
const monthYear = (ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const clean = (s, n) => String(s || '').replace(/\s*[–—]\s*/g, ', ').replace(/\s+/g, ' ').trim().slice(0, n);

/** Archive photos (taken before the new-photo window) that may still be labelled, closest season first. */
function labelOrder(items, ledger, today, windowStart, h) {
  return items
    .filter((i) => h.hasTrueDate(i) && ymdOf(i, h) < windowStart && !ledger.labels[i.id] && !h.isBlocked(i, ledger))
    .sort((a, b) => seasonGap(ymdOf(a, h), today) - seasonGap(ymdOf(b, h), today) || h.takenAt(b).localeCompare(h.takenAt(a)));
}

/** Eligible throwbacks: labelled family photos from before the window, unblocked, one per moment. */
function throwbackPool(items, ledger, windowStart, h) {
  const seen = new Set();
  const eligible = items.filter((i) => {
    const l = ledger.labels[i.id];
    if (!h.hasTrueDate(i) || ymdOf(i, h) >= windowStart || !l || !l.family || h.isBlocked(i, ledger)) return false;
    const hash = h.hashOf(i);
    if (hash) { if (seen.has(hash)) return false; seen.add(hash); }
    return true;
  });
  return h.groupMoments(eligible).map((m) => m.slice().sort((a, b) => (ledger.labels[b.id].quality || 0) - (ledger.labels[a.id].quality || 0))[0]);
}

function seasonalWhy(takenYmd, today) {
  const y = yearsAgo(takenYmd, today);
  if (seasonGap(takenYmd, today) <= SEASON_DAYS && y >= 1) return `This time of year, ${y} year${y === 1 ? '' : 's'} ago`;
  return `From ${monthYear(takenYmd)}`;
}

/** Deterministic picks: closest to this time of year, then best rated, never two from the same day. */
function fallbackPicks(pool, ledger, today, h, n = THROWBACK_PER_DAY) {
  const sorted = pool.slice().sort((a, b) => seasonGap(ymdOf(a, h), today) - seasonGap(ymdOf(b, h), today)
    || (ledger.labels[b.id].quality || 0) - (ledger.labels[a.id].quality || 0));
  const days = new Set();
  const out = [];
  for (const it of sorted) {
    if (out.length >= n) break;
    if (days.has(ymdOf(it, h))) continue;
    days.add(ymdOf(it, h));
    out.push({ item: it, why: seasonalWhy(ymdOf(it, h), today) });
  }
  return out;
}

/** Keep only model picks that name a real candidate, once each, from distinct days. */
function validateRanking(raw, candidates, today, h, n = THROWBACK_PER_DAY) {
  const days = new Set();
  const used = new Set();
  const out = [];
  for (const p of (raw && Array.isArray(raw.picks) ? raw.picks : [])) {
    const idx = Number(p && p.n) - 1;
    const it = Number.isInteger(idx) ? candidates[idx] : null;
    if (!it || used.has(it.id) || days.has(ymdOf(it, h))) continue;
    used.add(it.id);
    days.add(ymdOf(it, h));
    out.push({ item: it, why: clean(p.why, 90) || seasonalWhy(ymdOf(it, h), today) });
    if (out.length >= n) break;
  }
  return out;
}

const RANK_PROMPT = 'You choose "Throw Back Pics" for a family\'s private weekday newsletter. '
  + 'Pick photos that connect to something this edition mentions (a holiday, a sport, a school event, a child\'s activity) '
  + 'or, if nothing connects, to this time of year. Never connect a photo to a funeral, an illness, a medical visit or anything sad. '
  + 'Prefer photos from different dates. Reply with JSON only: {"picks":[{"n":<candidate number>,"why":"<at most 12 plain words linking it to this week, no dashes>"}]}.';

async function rankThrowbacks(pool, ledger, topics, today, h) {
  const candidates = pool.slice().sort((a, b) => seasonGap(ymdOf(a, h), today) - seasonGap(ymdOf(b, h), today)).slice(0, RANK_CANDIDATES);
  const list = candidates.map((it, i) => `${i + 1}. ${ymdOf(it, h)}: ${ledger.labels[it.id].caption || 'family photo'}`).join('\n');
  const user = `Today is ${today}. This edition mentions:\n${topics.slice(0, 40).map((t) => `- ${clean(t, 120)}`).join('\n') || '- nothing specific'}\n\nCandidates:\n${list}\n\nChoose up to ${THROWBACK_PER_DAY}.`;
  const r = await h.fetchJson('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0, response_format: { type: 'json_object' }, max_tokens: 300,
      messages: [{ role: 'system', content: RANK_PROMPT }, { role: 'user', content: user }] }),
  });
  return validateRanking(JSON.parse(r.choices[0].message.content), candidates, today, h);
}

/** Today's throwbacks [{ item, why }]. Same-day re-run reuses the day's posted throwbacks. */
async function chooseThrowbacks({ items, ledger, today, windowStart, topics = [], h }) {
  const already = Object.entries(ledger.posted).filter(([, p]) => p.postedOn === today && p.section === 'throwback');
  if (already.length) {
    const byId = new Map(items.map((i) => [i.id, i]));
    return { reused: true, picks: already.filter(([id]) => byId.has(id)).map(([id, p]) => ({ item: byId.get(id), why: p.why || '' })) };
  }
  const pool = throwbackPool(items, ledger, windowStart, h);
  if (!pool.length) return { reused: false, picks: [] };
  let picks = [];
  try {
    picks = await rankThrowbacks(pool, ledger, topics, today, h);
  } catch (e) {
    console.warn(`[FamilyPhotos] throwback ranking failed (${e.name}): ${e.message.slice(0, 160)}; using time-of-year picks`);
  }
  if (!picks.length) picks = fallbackPicks(pool, ledger, today, h);
  return { reused: false, picks };
}

module.exports = {
  chooseThrowbacks, labelOrder, THROWBACK_PER_DAY, OLD_LABEL_BUDGET,
  // exported for tests
  seasonGap, yearsAgo, throwbackPool, fallbackPicks, validateRanking, seasonalWhy,
};
