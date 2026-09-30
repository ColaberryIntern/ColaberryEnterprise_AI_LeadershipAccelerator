#!/usr/bin/env node
/**
 * week09_from_scratch_sql.js — emit scripts/week09_from_scratch.sql.
 *
 * Week 9 (sessions 18 + 19) was rebuilt from scratch on 2026-09-21: the decks
 * are full KitConfig replacements in backend/src/scripts/session-decks/
 * session18-week9-monday.js and session19-week9-thursday.js. Two other
 * surfaces have to say the same thing as the decks:
 *
 *   1. live_sessions.description for sessions 18 and 19 — the admin table and
 *      the student calendar. The old text promised the authored week9.ts
 *      content ("your Intensive 1–3 system … ready to wrap").
 *   2. The Week 9 Build Day timeline card (prod id prefix afae46b7, week 9,
 *      bucket 'build') — the student-facing lab in the portal. Its steps are
 *      generated HERE from the Thursday composer's prompts, so the portal card
 *      and the Present deck cannot drift apart. Same contract as the Week 8
 *      card (scripts/week08_build_day_shorten.sql): parseArtifacts() reads only
 *      DIRECT children of body_html — <h4> starts a step, <p> is the blurb,
 *      <pre> is the copy-to-clipboard prompt; exactly one <pre> per step, no
 *      wrapper divs; metadata.locked = true so ensureFreshContent() never
 *      regenerates over the hand-authored body.
 *
 * The SQL is idempotent: keyed on cohort + session_number, and on the card's
 * id prefix + week + bucket with a one-row guard that aborts the transaction
 * if the prefix ever matches zero or many rows.
 *
 * Usage:  node scripts/week09_from_scratch_sql.js   (writes the .sql next to it)
 */
const fs = require('fs');
const path = require('path');

const thu = require('../backend/src/scripts/session-decks/session19-week9-thursday.js');

const COHORT_ID = '1f1d86f4-6da5-4767-a250-cd8310570bea';
const CARD_ID_PREFIX = 'afae46b7';

const DESCRIPTIONS = {
  18: 'Architecture Day. Built from an empty folder: a small order desk and the vendor it depends on, with a switch that makes the vendor hang, fail or send nonsense on command. Two short builds (about ten minutes of running time): the desk and its vendor, then a timeout and a capped retry proven against all four vendor modes. Everything lives in a new reliability-lab/ folder inside your own repository and touches nothing else. Bring a laptop with Claude Code signed in. Nothing from earlier weeks is needed.',
  19: 'Build Day (Build It Thursday). Four checkpoints on the order desk from Monday, one prompt each, with a single prompt that gets anyone who missed Monday to the start line in about four minutes: a circuit breaker with a fallback and a dead-letter replay, an idempotency key proven by a test that runs the same order twice, a quality gate that refuses a wrong message, and a receipt with a correlation id. Then the same chaos against an unprotected copy, a price on what it cost, and RELIABILITY.md answering the four questions. Everything stays inside reliability-lab/; nothing else in your repository changes.',
};

/** Short blurbs for the portal card, one per prompt, in deck order. */
const CARD_BLURBS = [
  'Everything lives in one new folder inside your repository, reliability-lab/, and nothing outside it changes. If you built the desk on Monday this verifies it in about a minute; if not, it builds it in about four. Either way you end with a four-row table.',
  'A breaker that stops calling a vendor that is down, a fallback message you can stand behind, and a dead-letter file so nothing is lost. The proof is five failing runs where the fourth and fifth never reach the vendor.',
  'The same order twice must produce one send. The key comes from the order, never from the attempt, and the proof is a test in the folder that you break on purpose and then fix.',
  'Reliability gets an answer back; quality decides whether it is worth sending. Score it, refuse it below the line, and put one correlation id on every line so one order can be followed through everything it touched.',
  'A copy with the protections switched off, the same chaos, and a price on what it cost. Twenty vendor calls for one order and two confirmations for one customer, cleanly, with nothing noticing.',
  'The real desk under the identical chaos, one clean end state, and RELIABILITY.md answering the four questions every production system owes in writing. Then one commit containing only the folder.',
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sqlStr = (s) => String(s).replace(/'/g, "''");

function buildCard() {
  const steps = thu.TEACH.filter((s) => s.code);
  if (steps.length !== CARD_BLURBS.length) {
    throw new Error(`expected ${CARD_BLURBS.length} prompts in the Thursday deck, found ${steps.length}`);
  }
  const bodyHtml = steps.map((s, i) => {
    const heading = `Step ${i + 1} &middot; ${esc(s.title)} <small>(${esc((/⏱ ([^)]+)/.exec(s.code.label) || [])[1] || '')})</small>`;
    return `<h4>${heading}</h4>\n<p>${esc(CARD_BLURBS[i])}</p>\n<pre>${esc(s.code.code)}</pre>`;
  }).join('\n\n');
  return {
    title: 'Build — The Order Desk That Survives a Bad Vendor',
    summary: 'Six prompts, about thirty-five minutes, all inside one new folder in your own repository: reliability-lab/. Nothing outside it changes. Step 1 gets you to the start line whether or not you were in class on Monday. You end with a breaker, a fallback, a dead-letter replay, an idempotency test, a quality gate, a receipt with a correlation id, a side-by-side table showing an unprotected copy failing, and RELIABILITY.md answering the four questions. Work the steps in order using the picker above.',
    body_html: bodyHtml,
    questions: [],
    reflection: '',
  };
}

function render() {
  const card = buildCard();
  const contentJson = JSON.stringify(card, null, 2);
  if (/\$json\$|\$s\$/.test(contentJson)) throw new Error('dollar-quote collision in card content');

  return `-- week09_from_scratch.sql — GENERATED by scripts/week09_from_scratch_sql.js.
-- Do not hand-edit; change the composer or the generator and re-run it.
--
-- Week 9 rebuilt from scratch (2026-09-21, session CC-20260921-k3p9). The two
-- Present decks are applied separately by the session-decks composers; this
-- file aligns the two surfaces that must agree with them:
--   1. live_sessions.description for sessions 18 and 19 (cohort ${COHORT_ID})
--   2. the Week 9 Build Day timeline card (id prefix ${CARD_ID_PREFIX}, week 9, bucket build)
--
-- Idempotent: keyed on cohort + session_number and on the card prefix with a
-- one-row guard. Safe to re-run. NOTE: live_sessions has no updated_at column.

BEGIN;

UPDATE live_sessions
SET description = '${sqlStr(DESCRIPTIONS[18])}'
WHERE cohort_id = '${COHORT_ID}' AND session_number = 18;

UPDATE live_sessions
SET description = '${sqlStr(DESCRIPTIONS[19])}'
WHERE cohort_id = '${COHORT_ID}' AND session_number = 19;

-- One-row guard: the card is addressed by id prefix because the full uuid was
-- never committed to the repo. Zero or many matches aborts the transaction.
DO $guard$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM timeline_cards
   WHERE id::text LIKE '${CARD_ID_PREFIX}%' AND week = 9 AND bucket = 'build';
  IF n <> 1 THEN
    RAISE EXCEPTION 'expected exactly one Week 9 build card with prefix ${CARD_ID_PREFIX}, found %', n;
  END IF;
END
$guard$;

UPDATE timeline_cards
SET
  title          = $t$${card.title}$t$,
  subtitle       = $t$Six prompts, one isolated folder, thirty-five minutes$t$,
  description    = $t$Build a small order desk that survives a vendor that hangs, fails or sends nonsense — a breaker, a fallback, a dead-letter replay, an idempotency test, a quality gate and a receipt — inside one new folder in your own repository, without touching your project.$t$,
  estimated_time = 35,
  metadata       = jsonb_set(
                     jsonb_set(
                       jsonb_set(metadata, '{locked}', 'true'::jsonb, true),
                       '{content_at}', to_jsonb(now()::text), true
                     ),
                     '{content}',
                     $json$
${contentJson}
                     $json$::jsonb,
                     true
                   ),
  updated_at     = now()
WHERE id::text LIKE '${CARD_ID_PREFIX}%' AND week = 9 AND bucket = 'build';

COMMIT;

-- Read-back (run separately): expect 18 + 19 descriptions to start "Architecture Day. Built from an empty folder" /
-- "Build Day (Build It Thursday). Four checkpoints", and the card to show estimated_time 35, locked true,
-- six h4 steps and six pre prompts in metadata->'content'->>'body_html'.
`;
}

if (require.main === module) {
  const out = path.join(__dirname, 'week09_from_scratch.sql');
  const sql = render();
  fs.writeFileSync(out, sql, 'utf8');
  const h4 = (sql.match(/<h4>/g) || []).length;
  const pre = (sql.match(/<pre>/g) || []).length;
  console.error(`wrote ${out} (${sql.length} bytes) — steps: ${h4} <h4>, ${pre} <pre>`);
  if (h4 !== pre || h4 !== CARD_BLURBS.length) { console.error('STEP COUNT MISMATCH'); process.exit(1); }
}

module.exports = { render, buildCard, DESCRIPTIONS };
