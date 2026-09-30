#!/usr/bin/env node
/**
 * week10_from_scratch_sql.js — emit scripts/week10_from_scratch.sql.
 *
 * Week 10 (sessions 20 + 21) was rebuilt from scratch on 2026-09-28: the decks
 * are full KitConfig replacements in backend/src/scripts/session-decks/
 * session20-week10-monday.js and session21-week10-thursday.js. Two other
 * surfaces have to say the same thing as the decks:
 *
 *   1. live_sessions.description for sessions 20 and 21 — the admin table and
 *      the student calendar. The old text promised the authored week10.ts
 *      content ("your Intensive 1–3 system, with the reliability layer").
 *   2. The Week 10 Build Day timeline card (prod id prefix d326c4ca, week 10,
 *      bucket 'build') — the student-facing lab in the portal. Its steps are
 *      generated HERE from the Thursday composer's prompts, so the portal card
 *      and the Present deck cannot drift apart. Same contract as the Week 9
 *      card (scripts/week09_from_scratch.sql): parseArtifacts() reads only
 *      DIRECT children of body_html — <h4> starts a step, <p> is the blurb,
 *      <pre> is the copy-to-clipboard prompt; exactly one <pre> per step, no
 *      wrapper divs; metadata.locked = true so ensureFreshContent() never
 *      regenerates over the hand-authored body.
 *
 * The SQL is idempotent: keyed on cohort + session_number, and on the card's
 * id prefix + week + bucket with a one-row guard that aborts the transaction
 * if the prefix ever matches zero or many rows.
 *
 * Usage:  node scripts/week10_from_scratch_sql.js   (writes the .sql next to it)
 */
const fs = require('fs');
const path = require('path');

const thu = require('../backend/src/scripts/session-decks/session21-week10-thursday.js');

const COHORT_ID = '1f1d86f4-6da5-4767-a250-cd8310570bea';
const CARD_ID_PREFIX = 'd326c4ca';

const DESCRIPTIONS = {
  20: 'Architecture Day. Built from an empty folder: an agent that can refund money, delete a customer record and email a whole customer list, with a switch that makes it propose something unreasonable on command — and, deliberately, no rules at all. Two short builds (about ten minutes of running time): the agent and the thing that carries out its actions, then one policy rule and a closed default, proven against all four agent modes. You write one rule and watch it stop three things you never wrote a rule for. Everything lives in a new governance-lab/ folder inside your own repository and touches nothing else. Bring a laptop with Claude Code signed in. Nothing from earlier weeks is needed.',
  21: 'Build Day (Build It Thursday). Four checkpoints on the agent from Monday, one prompt each, with a single prompt that gets anyone who missed Monday to the start line in about four minutes: a five-factor policy evaluator that refuses an action and names the rule and the fact it lost on, a human approval gate where the approval can be spent only once and an unanswered request expires as a denial, and a tamper-evident audit chain that replays any decision from one id — which you then break on purpose by editing your own log, and watch the verifier name the exact row. Then the same four actions against a copy with the gate removed, and GOVERNANCE.md answering the four questions. Everything stays inside governance-lab/; nothing else in your repository changes.',
};

/** Short blurbs for the portal card, one per prompt, in deck order. */
const CARD_BLURBS = [
  'Everything lives in one new folder inside your repository, governance-lab/, and nothing outside it changes. If you built the agent on Monday this verifies it in about a minute; if not, it builds it in about four. Either way you end with a four-row table showing one action allowed and three refused.',
  'One rule is a limit; five factors and an order is a policy. The proof is the same $2,400 refund coming back denied in one context and escalated in another, from the same policy file, with a reason that names the rule and the deciding fact.',
  'A high-risk action waits for a named human instead of running. The approval can be spent exactly once, a denial means it never runs, and anything nobody answers expires as a denial — because silence is not consent.',
  'One correlation id threads a decision through everything it touched, and each audit entry carries the fingerprint of the one before it. Then you edit your own audit log on purpose and watch the verifier name the exact row where the chain breaks.',
  'A copy with the gate removed, the same four actions, and a count of what went out the door: the dollars, the deleted record, the people who would have to be notified — and how many of the four runs produced any warning at all.',
  'The governed agent under the identical four actions, a side-by-side table, and GOVERNANCE.md answering the four questions every governed system owes in writing — including the honest one about what is still not covered. Then one commit containing only the folder.',
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
    title: 'Build — The Agent That Cannot Act Without Permission',
    summary: 'Six prompts, about thirty-five minutes, all inside one new folder in your own repository: governance-lab/. Nothing outside it changes. Step 1 gets you to the start line whether or not you were in class on Monday. You end with a five-factor policy that refuses an action and says exactly why, a human approval gate whose yes works only once and whose silence is a no, a tamper-evident audit chain that replays any decision from one id and catches you editing it, a side-by-side table showing an ungoverned copy doing all the damage instead, and GOVERNANCE.md answering the four questions. Work the steps in order using the picker above.',
    body_html: bodyHtml,
    questions: [],
    reflection: '',
  };
}

function render() {
  const card = buildCard();
  const contentJson = JSON.stringify(card, null, 2);
  // Dollar-quote collision guard: the card body is embedded inside $json$…$json$
  // and the scalar columns inside $t$…$t$. Prompts are full of dollar amounts,
  // so prove neither delimiter appears in the payload before shipping it.
  if (/\$json\$|\$t\$/.test(contentJson)) throw new Error('dollar-quote collision in card content');

  return `-- week10_from_scratch.sql — GENERATED by scripts/week10_from_scratch_sql.js.
-- Do not hand-edit; change the composer or the generator and re-run it.
--
-- Week 10 rebuilt from scratch (2026-09-28, session CC-20260928-m7t4). The two
-- Present decks are applied separately by the session-decks composers; this
-- file aligns the two surfaces that must agree with them:
--   1. live_sessions.description for sessions 20 and 21 (cohort ${COHORT_ID})
--   2. the Week 10 Build Day timeline card (id prefix ${CARD_ID_PREFIX}, week 10, bucket build)
--
-- Idempotent: keyed on cohort + session_number and on the card prefix with a
-- one-row guard. Safe to re-run. NOTE: live_sessions has no updated_at column.

BEGIN;

UPDATE live_sessions
SET description = '${sqlStr(DESCRIPTIONS[20])}'
WHERE cohort_id = '${COHORT_ID}' AND session_number = 20;

UPDATE live_sessions
SET description = '${sqlStr(DESCRIPTIONS[21])}'
WHERE cohort_id = '${COHORT_ID}' AND session_number = 21;

-- One-row guard: the card is addressed by id prefix because the full uuid was
-- never committed to the repo. Zero or many matches aborts the transaction.
DO $guard$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM timeline_cards
   WHERE id::text LIKE '${CARD_ID_PREFIX}%' AND week = 10 AND bucket = 'build';
  IF n <> 1 THEN
    RAISE EXCEPTION 'expected exactly one Week 10 build card with prefix ${CARD_ID_PREFIX}, found %', n;
  END IF;
END
$guard$;

UPDATE timeline_cards
SET
  title          = $t$${card.title}$t$,
  subtitle       = $t$Six prompts, one isolated folder, thirty-five minutes$t$,
  description    = $t$Build an agent that can move money, delete a record and email a customer list — and then make it impossible for it to do any of that without a policy that permits it, a named human who approves it once, and a record you can replay and prove nobody edited. All inside one new folder in your own repository, without touching your project.$t$,
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
WHERE id::text LIKE '${CARD_ID_PREFIX}%' AND week = 10 AND bucket = 'build';

COMMIT;

-- Read-back (run separately): expect 20 + 21 descriptions to start "Architecture Day. Built from an empty folder" /
-- "Build Day (Build It Thursday). Four checkpoints", and the card to show estimated_time 35, locked true,
-- six h4 steps and six pre prompts in metadata->'content'->>'body_html'.
`;
}

if (require.main === module) {
  const out = path.join(__dirname, 'week10_from_scratch.sql');
  const sql = render();
  fs.writeFileSync(out, sql, 'utf8');
  const h4 = (sql.match(/<h4>/g) || []).length;
  const pre = (sql.match(/<pre>/g) || []).length;
  console.error(`wrote ${out} (${sql.length} bytes) — steps: ${h4} <h4>, ${pre} <pre>`);
  if (h4 !== pre || h4 !== CARD_BLURBS.length) { console.error('STEP COUNT MISMATCH'); process.exit(1); }
}

module.exports = { render, buildCard, DESCRIPTIONS };
