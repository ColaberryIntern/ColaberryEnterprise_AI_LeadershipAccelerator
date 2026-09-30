/**
 * session19-week9-thursday.js — Session 19, Thursday 2026-09-24, "Week 9 ·
 * Build Day" (Reliability Engineering + Quality Layer), rebuilt FROM SCRATCH
 * as a full KitConfig replacement. Companion to session18-week9-monday.js.
 *
 * WHY THIS EXISTS
 * Same brief as Monday (Ali, 2026-09-21): built from scratch, nothing from
 * earlier weeks, everything inside ./reliability-lab/ in the student's own
 * repo, short enough to finish early. Thursday MAY link to Monday — and does —
 * but it is self-sufficient: CP0 is one prompt that VERIFIES Monday's folder
 * if it exists and BUILDS it in ~4 minutes if it does not, so somebody who
 * missed Monday is at the start line with everyone else.
 *
 * DELIVERED FROM A HOTEL
 * Ali teaches this one remotely. Nothing in the deck requires him to run
 * anything: every proof is on a student's screen, and the notes say which
 * student to ask to read their terminal. The three longest prompts are
 * "paste, then ADVANCE" — the next slide is taught while Claude Code works.
 *
 * THE RAIL
 * The checkpoint rail (buildmap + CP0..CP3) is generated from
 * classSessionPlan.ts and is NOT overridable: CP0 Baseline · CP1 Resilient ·
 * CP2 Idempotent · CP3 Gated. The guided-build slides here match it one for
 * one, so checkpointsEnabled stays true. One generated slide still carries
 * text from classSessionPlan.ts that predates the from-scratch rule — the
 * readiness opener ("Your Intensive 1–3 system in the repo, ready to wrap").
 * Its slideNote tells the instructor what to say instead; the PR that ships
 * this file also corrects the source text.
 *
 * SHAPE
 *   8 teach slides (authored: 15) · 6 prompts, each with a ⏱ estimate ·
 *   7 questions · 3 story beats. Target finish 8:10.
 *
 * Run inside the container:  node /app/session19-week9-thursday.js [--dry]
 * Local, no DB:              node session19-week9-thursday.js --check
 * Rollback: the BEFORE line printed at the top of the run, or
 *           UPDATE live_sessions SET kit_config_json = NULL WHERE id = SID.
 */

const SID = 'b433293a-6f92-44a1-8033-4a0665cd4c15';
const WEEK = 9;
const L = (...lines) => lines.join('\n');

/* ------------------------------------------------------------- opening ---- */
const RESULT_PREVIEW = {
  title: 'What you are producing tonight',
  body: 'The order desk from Monday, finished. The vendor goes down and the fourth call never leaves your process. The same order arrives twice and exactly one confirmation goes out. The vendor sends nonsense and the gate refuses it. Every order that could not be sent is parked with a reason and a correlation id, and replayed when the vendor is back. Then you run the same chaos against a copy with all of it switched off, and count what it costs.',
};

/* ---------------------------------------------------------------- teach ---- */
const TEACH = [
  /* ============================ build map ============================= */
  {
    segment: 'build-map', eyebrow: '🗺️ Tonight',
    title: 'Four checkpoints on the desk you built Monday — and one prompt gets anyone to the start line',
    body: 'Tonight finishes the wrap. CP0 gets everyone to the same baseline: the desk, the vendor, the timeout and the capped retry. If you built it Monday, one prompt verifies it in about a minute; if you did not, the same prompt builds it in about four. CP1 adds the breaker, the fallback and the dead-letter. CP2 makes the send idempotent and proves it with a test. CP3 adds the quality gate, a correlation id and a receipt. Each checkpoint runs for a few minutes; you paste it, then we talk through the next one while it works.',
    bullets: [
      'CP0 Baseline — verify or rebuild Monday’s desk · ⏱ 1 min built Monday / 4 min new',
      'CP1 Resilient — breaker + fallback + dead-letter + replay · ⏱ 4–6 min',
      'CP2 Idempotent — same order twice, one send, proven by a test · ⏱ 2–4 min',
      'CP3 Gated — quality gate + correlation id + receipt · ⏱ 3–5 min',
      'Then: the same chaos against an unprotected copy, a price on it, and RELIABILITY.md',
    ],
    diagram: `flowchart LR
  CP0["0️⃣ Baseline<br/>desk · vendor<br/>timeout · retry"] --> CP1["1️⃣ Resilient<br/>breaker · fallback<br/>dead-letter"]
  CP1 --> CP2["2️⃣ Idempotent<br/>same order twice<br/>one send"]
  CP2 --> CP3["3️⃣ Gated<br/>score · refuse<br/>receipt"]
  CP3 --> BR["💥 break it"]
  BR --> H["🛡️ harden it"]`,
    script: L(
      'SITUATION: The roadmap. Four checkpoints in a fixed order, and the order IS the lesson: the wrap goes on inside to outside.',
      'ROOM: You are remote. Deck on the shared screen, phone in hand. Say the shape of the night out loud, including that we finish early.',
      'MOOD: Decisive. This is a contract for the night, said like one.',
      'OPEN: "By 8:10 your desk survives a vendor that is down, refuses to send the same order twice, and refuses to send nonsense — and you will have watched an unprotected copy fail at all three."',
      'DO: Say the rule once: nobody who missed Monday is behind. CP0 builds everything in four minutes. Then say the rhythm: paste, then look up — the next checkpoint is explained while this one runs.',
      'NOTE: The rail counts CP0 Baseline · CP1 Resilient · CP2 Idempotent · CP3 Gated. Use those numbers all night; the slides match them.',
    ),
  },

  /* =========================== guided build =========================== */
  {
    segment: 'guided-build', eyebrow: '0️⃣ CP0 · Baseline · ⏱ 1 min (built Monday) / 4 min (new)',
    title: 'Get to the start line: verify Monday’s desk, or build it now',
    body: 'One prompt, two outcomes. If reliability-lab exists with the vendor, the desk, the timeout and the capped retry, Claude Code verifies all four vendor modes and reports a table. If it does not exist, Claude Code builds it from scratch, in the same isolated folder, under the same rules. Paste it and look up: CP1 is explained while this runs.',
    bullets: [
      'Exists → verify: four modes, one table, nothing rebuilt',
      'Missing → build: vendor, desk, timeout, retry, in reliability-lab/ only',
      'Same rules as Monday: nothing outside the folder changes, zero dependencies',
      'Paste it. Then advance — CP1 is taught while it runs.',
    ],
    diagram: `flowchart LR
  P["📋 paste"] --> Q{"reliability-lab/<br/>exists?"}
  Q -->|yes| V["verify 4 modes<br/>~1 min"]
  Q -->|no| B["build from scratch<br/>~4 min"]
  V --> T["📊 table"]
  B --> T`,
    code: {
      kind: 'paste', pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — CP0: verify the desk if it exists, build it if it does not (⏱ 1 / 4 min)',
      code: L(
        'We are working ONLY inside ./reliability-lab/ in this repository. Nothing outside that folder is created, edited or deleted tonight. Zero dependencies. Run every step yourself; do not print commands for me to copy.',
        '',
        'First, look: does ./reliability-lab/ already exist with a vendor module, a desk with a confirm <orderId> command, and a reliability module with withTimeout and retry?',
        '',
        'IF IT EXISTS — verify it, do not rebuild it. Run confirm 2001 once in each VENDOR_MODE (ok, slow, down, garbage) and report a four-row table: mode, attempts, error name, whether a line was appended to data/sent.log. Expected: ok → 1 attempt, one line; slow → 3 attempts, TimeoutError, no line; down → 3 attempts, UpstreamUnavailable, no line; garbage → 1 attempt, BadResponse, no line. If anything differs, fix it and re-run. Then stop.',
        '',
        'IF IT DOES NOT EXIST — build it now, from scratch:',
        '  1. Create ./reliability-lab/ with its OWN package file (or the equivalent for the language) so nothing about this project\'s configuration leaks in. Use Node.js if installed, otherwise Python 3. Check whether this project\'s lint, test, typecheck or build would pick the folder up; if so, tell me and ask before touching anything outside it.',
        '  2. vendor — a stand-in for an outside AI service, mode from the environment variable VENDOR_MODE (default ok): ok → ~50 ms, returns "Your order <id> is confirmed and will ship within 2 days."; slow → hangs 10 s then returns it; down → fails with a 500-style error; garbage → returns fast with a confidently wrong message (wrong order number, or starting "As an AI I cannot").',
        '     # WHY: you cannot make a real vendor fail on command. Tonight you own one that can.',
        '  3. desk — confirm <orderId>: ask the vendor, then "send" by appending one JSON line {orderId, message, sentAt} to data/sent.log.',
        '  4. reliability — withTimeout(fn, ms) that fails with an error named TimeoutError; retry(fn, {attempts: 3, baseDelayMs: 500}) that doubles the gap with jitter and ONLY retries TimeoutError and UpstreamUnavailable (the 500-style error), never BadResponse (garbage). Deadline per attempt 2 s, INSIDE the retry. One log line per attempt with the error name.',
        '     # WHY: the cap is the difference between a bad night and a bill; naming the failure is how you know which response is correct.',
        '  5. A six-line README.md, and a .gitignore inside the folder that ignores data/.',
        '  Then run the same four-mode verification above and show me the table.',
      ),
      expectedResult: 'A four-row table: ok 1 attempt + one sent line; slow 3 attempts TimeoutError; down 3 attempts UpstreamUnavailable; garbage 1 attempt BadResponse. Nothing outside reliability-lab/ touched.',
      stopCondition: 'The table matches and you have tapped the checkpoint.',
      rescue: 'If it started rebuilding over an existing folder, stop it and say "verify only — it exists". If slow took 30 seconds, the timeout is missing or outside the retry. If garbage retried, the retry catches too much.',
    },
    script: L(
      'SITUATION: CP0. Two minutes here saves the night — everything after this assumes the four modes behave.',
      'ROOM: Prompt block on the shared screen. Pulse rail on your phone. You do not run this yourself; the room does.',
      'MOOD: Brisk. Paste, then eyes up.',
      'OPEN: "One prompt. If you were here Monday it checks your work in a minute. If you were not, it builds all of it in four. Paste it, then look up here."',
      'DO: Give it thirty seconds, then ADVANCE to CP1 and teach it while this runs. Come back to the pulse when CP1’s slide is done.',
      'DO: When you come back, ask one person who built Monday and one who did not to read their tables aloud. Same four rows. That is the point of CP0.',
      'NOTE: Anyone whose table does not match stays on CP0 with the rescue lines while the room moves. They catch up during the break.',
    ),
  },
  {
    segment: 'guided-build', eyebrow: '1️⃣ CP1 · Resilient · ⏱ 4–6 min',
    title: 'The breaker, the plan B, and the place failed work goes',
    body: 'Three additions, one prompt. A breaker that counts consecutive failures and, after three, refuses to call the vendor at all until a cooldown passes and one probe call gets through. A fallback: when the vendor is unavailable, send a plain template message the business can stand behind. And a dead-letter file for anything that could not be sent, with the reason, plus a replay command. The proof: run the vendor down five times and show that the fourth and fifth calls never leave your process.',
    bullets: [
      'Breaker AROUND the retry — 3 failures in a row → open → fail instantly → one probe after 10 s',
      'Fallback for UpstreamUnavailable and BreakerOpen — a true message, just less of it',
      'Never fall back on BadResponse — a wrong message is never sent under any name',
      'Dead-letter file + replay — the work is parked with a reason, never lost',
      'Proof: 5 down runs → runs 4 and 5 show zero vendor attempts',
    ],
    diagram: `flowchart LR
  D["desk"] --> CB{"🔌 breaker"}
  CB -->|closed| R["🔁 retry ×3"] --> T["⏱️ timeout"] --> V["🏭 vendor"]
  CB -->|open| FB["🪂 fallback template"]
  V -->|garbage| DL["📥 dead-letter.jsonl"]
  DL -->|vendor back| RP["🔁 replay"]`,
    code: {
      kind: 'paste', pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — CP1: breaker + fallback + dead-letter + replay, then prove it (⏱ 4–6 min)',
      code: L(
        'Stay inside ./reliability-lab/. Zero dependencies. Run everything yourself; do not print commands for me to copy.',
        '',
        'Add three things to the reliability module and wire them into the desk, in this order:',
        '',
        '  1. A circuit breaker AROUND the retry (not inside it).',
        '     # WHY: outside, the whole operation counts as one failure and the breaker can trip. Inside, every retry resets it and it never trips.',
        '     It opens after 3 consecutive failed operations. While open, calls fail INSTANTLY with an error named BreakerOpen — the vendor is not called at all. After a 10-second cooldown, allow ONE probe call through; success closes the breaker, failure re-opens it.',
        '     Persist the breaker state in data/breaker.json so it survives between separate runs of the command.',
        '  2. A fallback: when the operation fails with UpstreamUnavailable or BreakerOpen, send a plain template message instead — "Your order <id> is confirmed. Full details will follow shortly." — and mark that line in sent.log with "fallback": true.',
        '     # WHY: a degraded answer you can stand behind beats no answer. The customer is told the truth, just less of it.',
        '     Do NOT fall back on BadResponse. A wrong message must never be sent under any name.',
        '  3. A dead-letter: any order that could not be sent (BadResponse, or a fallback that itself failed) is appended to data/dead-letter.jsonl with the orderId, the error name and the time. Add a command: replay — re-runs every dead-lettered order through the normal path and removes the ones that succeed.',
        '     # WHY: losing the work is the one outcome that is never acceptable. Parking it with a reason is how it gets fixed on purpose.',
        '',
        'Then PROVE it, in this order, and show me the output of every run:',
        '  a. VENDOR_MODE=down: run confirm 3001, 3002, 3003, 3004, 3005 — five separate runs. Runs 1–3 each show 3 attempts and then a fallback send. Runs 4 and 5 must show BreakerOpen with ZERO attempts and a fallback send — the vendor was never called. Show me the attempt counts for all five.',
        '  b. VENDOR_MODE=garbage: run confirm 3006. It must NOT be sent and must NOT fall back — it goes to dead-letter.jsonl with BadResponse. Show me the file.',
        '  c. Wait out the cooldown, set VENDOR_MODE=ok, run replay. 3006 should send normally and leave dead-letter.jsonl empty. Show me the last line of sent.log and the breaker state.',
        '',
        'Finish with one sentence: which of tonight\'s three additions would be the hardest to explain to a customer if it were missing?',
      ),
      expectedResult: 'Five down runs where runs 4 and 5 show BreakerOpen with zero attempts; a garbage run that lands in dead-letter.jsonl and is never sent; a replay that sends it once the vendor is back and empties the file.',
      stopCondition: 'You have seen a call that never left your process, and a dead-letter file go from one row to zero.',
      rescue: 'Runs 4 and 5 still show 3 attempts? The breaker is inside the retry or its state is not persisted — say "breaker around the retry, state in data/breaker.json". Garbage got a fallback? Tell it BadResponse never falls back.',
    },
    script: L(
      'SITUATION: CP1 — taught while CP0 runs, then pasted once the room’s tables match. The longest prompt of the night, and the one with the most moving parts.',
      'ROOM: Prompt block on screen. The five-run proof is the thing to watch for: the attempt count dropping to zero on run four.',
      'MOOD: Methodical. Three additions, one at a time, then the proof.',
      'OPEN: "Three additions. A breaker that stops calling, a plan B you can stand behind, and a place failed work goes so it is never lost."',
      'DO: Explain the WHY lines, not the code — breaker outside the retry, fallback only for the vendor being away, never for nonsense. Then have them paste and ADVANCE to CP2 while it runs.',
      'DO: When you come back, ask one person to read their five attempt counts aloud: three, three, three, zero, zero. That drop to zero is the sound of a breaker.',
      'SAY: The fourth call never left your process. The vendor was down, and you did not make it worse.',
      'NOTE: If runs four and five still show three attempts, the breaker is inside the retry — the design decision from Monday’s challenge poll, gotten wrong. Say so; it is the most common miss.',
    ),
  },
  {
    segment: 'guided-build', eyebrow: '2️⃣ CP2 · Idempotent · ⏱ 2–4 min',
    title: 'The same order twice, one send — and a test that proves it',
    body: 'The last hole is the one a customer feels. Right now, if order 4001 arrives twice, it is confirmed twice. The fix is a key derived from the order, claimed before the send and stored with the result; the second arrival finds the key and returns the stored result without sending. The proof is a test that runs the same order twice and asserts one line in sent.log. That test lives in the folder, because a protection nobody can re-check is a protection that will quietly stop working.',
    bullets: [
      'runOnce(key, fn) — claim BEFORE, run once, store, return stored on repeat',
      'Key = order:<orderId>. Never a fresh ID per attempt.',
      'A test in the folder: same order twice → exactly one sent line',
      'Break it on purpose: random key → test FAILS → put the order key back → passes',
    ],
    diagram: `flowchart LR
  E["📨 confirm 4001<br/>twice"] --> K["key = order:4001"]
  K --> Q{"in keys.json?"}
  Q -->|no| S["claim → send → store"]
  Q -->|yes| R["stored result<br/>duplicate: true"]
  T["✅ check-idempotency<br/>asserts 1 line"] -.-> S`,
    code: {
      kind: 'paste', pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — CP2: make the send idempotent and prove it with a test in the folder (⏱ 2–4 min)',
      code: L(
        'Stay inside ./reliability-lab/. Zero dependencies. Run everything yourself; do not print commands for me to copy.',
        '',
        'Make the desk\'s send idempotent, then prove it with a test that lives in the folder.',
        '',
        '  1. Add runOnce(key, fn) to the reliability module, backed by data/keys.json. It claims the key BEFORE running fn, runs fn once, stores the result under the key, and on any later call with the same key returns the stored result WITHOUT running fn.',
        '     # WHY: the claim goes before the side effect. "Check after" leaves a gap where two arrivals both see "not sent" and both send.',
        '  2. The key comes from the ORDER — "order:<orderId>" — never from the attempt. Tell me in one line why a fresh random ID generated at the top of each run would make this protection worthless.',
        '  3. Wrap the desk\'s send in runOnce. Add "duplicate": true to the desk\'s output when a stored result was returned, so I can see it happen.',
        '  4. Write ONE test inside reliability-lab/ as a plain script that exits non-zero on failure — no test framework. Name the file check-idempotency (with the language\'s extension), NOT test-anything or anything_test, so this project\'s own test runner can never mistake it for its own.',
        '     With VENDOR_MODE=ok it runs confirm 4001 twice and asserts that data/sent.log gained exactly ONE line for 4001 and that the second run reported duplicate: true. Add a "test" entry to the folder\'s package file (or a documented way to run it) so anyone can re-run it.',
        '     # WHY: a protection nobody can re-check will quietly stop working the first time someone refactors the desk.',
        '',
        'Then run the test and show me it passing.',
        'Then break it deliberately: change the key to a fresh random ID, run the test, show me it FAILING with two lines in sent.log for that order, and put the order-based key back. Show me the test passing again.',
      ),
      expectedResult: 'A passing test that proves one send for two identical orders, a deliberate break that shows the random-key version sending twice, and the fix restored with the test green again.',
      stopCondition: 'You watched the test fail with the wrong key and pass with the right one.',
      rescue: 'Test passed even with the random key? It is asserting the wrong thing — tell it to count the lines in sent.log for that order. Two lines even with the order key? The claim is after the send; say "claim BEFORE fn runs".',
    },
    script: L(
      'SITUATION: CP2, and the one a customer feels. Monday’s "the key comes from the event, not the attempt" becomes a test that can fail.',
      'ROOM: Prompt block on screen. Ask people to watch for the word duplicate in their second run.',
      'MOOD: Quiet focus. This is the sentence of the week, made mechanical.',
      'OPEN: "Same order, twice. Right now your desk confirms it twice. In three minutes it cannot."',
      'DO: The break-it-on-purpose step is the lesson: have one person read what happened with the random key. Two lines. Then the order key. One line. Same test, opposite result — that is what "the key comes from the event" means.',
      'SAY: A test that passes with the wrong key would be worse than no test. That is why we broke it before we trusted it.',
      'NOTE: Paste, then ADVANCE to CP3 and teach it while this runs. The key question comes back as a theater poll after CP3, so do not resolve the whole room here.',
    ),
  },
  {
    segment: 'guided-build', eyebrow: '3️⃣ CP3 · Gated · ⏱ 3–5 min',
    title: 'Score the message, refuse it below the line, and hand back a receipt',
    body: 'A perfectly reliable pipeline will happily send a confidently wrong message. The gate scores what the vendor returns before it is allowed near the send: does it name the right order, does it avoid phrases no customer should read, is it a sensible length. Below a threshold it is refused, parked with the reason, and never sent under any name. Then one correlation id per run on every line the desk logs, and a receipt at the end: attempts, breaker state, gate score, outcome.',
    bullets: [
      'score(message, orderId) → 0–100: right order +40 · no banned phrases +30 · sane length +30',
      'Below 70 → QualityGateRejected → dead-letter with the score. Never sent.',
      'The fallback template goes through the same gate — and passes',
      'One correlation id per run, on every log line, sent line and dead-letter row',
      'Receipt: orderId · correlationId · attempts · breakerState · gateScore · outcome',
    ],
    diagram: `flowchart LR
  V["🏭 vendor message"] --> G{"🚦 score ≥ 70?"}
  G -->|yes| S["send · receipt"]
  G -->|no| DL["📥 dead-letter<br/>QualityGateRejected · score"]
  C["🔗 correlation id"] -.on every line.-> S
  C -.-> DL`,
    code: {
      kind: 'paste', pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — CP3: quality gate + correlation id + receipt, then prove it (⏱ 3–5 min)',
      code: L(
        'Stay inside ./reliability-lab/. Zero dependencies. Run everything yourself; do not print commands for me to copy.',
        '',
        'Add the quality layer and a receipt.',
        '',
        '  1. A quality gate in the reliability module: score(message, orderId) → 0 to 100.',
        '       +40 if the message contains the exact order id (whole token, not a substring of a longer number)',
        '       +30 if it contains none of these phrases, case-insensitive: "as an ai", "i cannot", "i\'m sorry", "as a language model"',
        '       +30 if it is between 20 and 300 characters',
        '     Threshold 70. Below it, the send is refused with an error named QualityGateRejected and the order goes to data/dead-letter.jsonl with the score and the reason it lost points.',
        '     # WHY: reliability gets the answer back. Quality decides whether it is worth using. They are different layers, and both are cheap.',
        '     The gate runs on the vendor\'s message AND on the fallback template. The fallback should pass; tell me its score.',
        '     Duplicates (runOnce returning a stored result) must be returned BEFORE the gate runs — a stored result was already gated once.',
        '  2. A correlation id: one per confirm run. Any random id is fine here — it identifies the RUN, not the order, so it is not the idempotency key. Put it on every log line the desk prints, on the sent.log line, and on any dead-letter row.',
        '     # WHY: when something goes wrong at 2 AM, one id should let you follow one order through every line it touched.',
        '  3. A receipt: at the end of every confirm, print one JSON object: orderId, correlationId, attempts, breakerState, gateScore, outcome (sent | fallback | duplicate | dead-lettered), and the error name if any.',
        '',
        'Then PROVE it:',
        '  a. VENDOR_MODE=garbage, confirm 5001 → refused by the gate, dead-lettered with the score, receipt shows outcome dead-lettered. Show me the dead-letter row.',
        '  b. VENDOR_MODE=ok, confirm 5002 → sent, receipt shows the gate score and outcome sent.',
        '  c. Run the check-idempotency test again — it must still pass with the gate in place.',
        '',
        'Finish with the receipt from run b, printed in full.',
      ),
      expectedResult: 'A garbage message refused with QualityGateRejected and a scored dead-letter row; a good message sent with its score on the receipt; the idempotency test still green.',
      stopCondition: 'You are looking at one receipt with a correlation id, an attempt count, a breaker state and a gate score on it.',
      rescue: 'Garbage passed the gate? The order-id check is matching a substring — tell it to match the whole token. Test broke? The gate is running before the duplicate check; duplicates return the stored result first.',
    },
    script: L(
      'SITUATION: CP3, the last checkpoint. Reliability got the answer back; quality decides whether to use it. Then the receipt that makes 2 AM debuggable.',
      'ROOM: Prompt block on screen. The receipt is what you want read aloud at the end — one JSON object with six fields.',
      'MOOD: Closing energy. This is the last build before the break.',
      'OPEN: "Everything so far gets an answer back. This decides whether the answer is worth sending — and hands you a receipt either way."',
      'DO: Paste, then ADVANCE — two quick polls run while this builds, then the break, which is the catch-up window. After the break, have one person read their receipt from the good run, field by field.',
      'SAY: One id follows one order through every line it touched. When something goes wrong at 2 AM, that id is the difference between an hour and a week.',
      'NOTE: The scoring rubric is deliberately simple. If someone says "a real gate would use a model", agree — and say that the threshold, the refusal and the dead-letter row are the same design either way.',
    ),
  },

  /* ============================== failure ============================= */
  {
    segment: 'failure', eyebrow: '💥 BREAK it on purpose · ⏱ 2–4 min',
    title: 'Turn the protections off, run the chaos, and count what it cost',
    body: 'Now see what tonight was for. Claude Code makes a copy of the desk inside the folder with the breaker, the idempotency key and the gate disabled, and runs the same chaos against it: the vendor down, the same order twice, a garbage reply. Count the vendor calls. Count the lines in sent.log. Then put a price on the calls, because the bill is the part nobody sees until the end of the month.',
    bullets: [
      'A throwaway copy at reliability-lab/naive/ — no breaker, no runOnce, no gate, retry cap raised to 20',
      'down → count the vendor calls · ok twice → count the sent lines · garbage → see what went out',
      'Price the down run: ~2,000 tokens per attempt, six hours, once a minute',
      'The real desk and the real sent.log are untouched',
    ],
    diagram: `flowchart LR
  N["🚫 naive copy<br/>no breaker · no key · no gate"] --> A["💥 down<br/>20 calls"]
  N --> B["👯 ok twice<br/>2 sends"]
  N --> C["🗑️ garbage<br/>sent as real"]
  A --> $["💸 × 6 hours"]`,
    code: {
      kind: 'paste', pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — BREAK: an unprotected copy, the same chaos, and a price (⏱ 2–4 min)',
      code: L(
        'Stay inside ./reliability-lab/. Do not change the working desk. Run everything yourself; do not print commands for me to copy.',
        '',
        'Make a copy of the desk at reliability-lab/naive/ with three protections turned OFF: no breaker, no runOnce, no quality gate. Keep the timeout and the retry, but raise the retry cap to 20 so I can see what an uncapped-feeling retry does. Point the copy at naive/data/ so the real sent.log, keys.json and breaker.json are untouched.',
        '  # WHY: this is what most systems look like on the night they first meet a bad vendor. Nothing here is malicious. It is just missing.',
        '',
        'Run the same chaos against the naive copy:',
        '  a. VENDOR_MODE=down, confirm 6001. Count the vendor calls.',
        '  b. VENDOR_MODE=ok, confirm 6002 twice. Count the lines in naive/data/sent.log for 6002.',
        '  c. VENDOR_MODE=garbage, confirm 6003. Show me exactly what was "sent".',
        '',
        'Then put a price on (a): if each attempt had been a real model call of roughly 2,000 input tokens at $3 per million input tokens, what did that one order cost — and what would it cost if the vendor stayed down for six hours with the desk retrying on a schedule once a minute? Show the arithmetic in two lines.',
        '',
        'Finish with three lines, one per run: what a customer would have experienced in each case.',
      ),
      expectedResult: 'Twenty vendor calls for one order, two confirmations for one customer, a nonsense message sent as if it were real — and a dollar figure for the six-hour version.',
      stopCondition: 'You have a number on screen for what the down run would cost over six hours.',
      rescue: 'If it refused to make the naive copy, say it is a throwaway inside the lab folder — no push, nothing outside. If the counts are not obviously worse than the protected desk, the copy still has a protection on; check it is not sharing data/breaker.json or keys.json with the real desk.',
    },
    script: L(
      'SITUATION: The break. Everything they built tonight, switched off in a copy, and the same chaos run against it. This is the highest-retention segment of the night — do not hide anything.',
      'ROOM: Prompt block on screen. After it runs, you want three numbers read aloud: vendor calls, sent lines, and the six-hour dollar figure.',
      'MOOD: Slightly theatrical. This is the fire drill with the extinguishers removed.',
      'OPEN: "Now we find out what tonight was for. Same vendor, same chaos, none of the protections."',
      'DO: Have one person read their vendor-call count for the down run — twenty. Then their sent lines for the duplicate — two. Then what went out for garbage. Let each number sit.',
      'DO: Ask for the six-hour figure. Whatever it is, ask the room whether anyone would have noticed before the invoice. Nobody would. That is the point.',
      'NOTE: Twenty is a cap you set so the demo ends. Say out loud that the real version has no cap, and that the arithmetic scales with the vendor’s bad night, not with anything you control.',
    ),
  },
  {
    segment: 'failure', eyebrow: '🛡️ HARDEN · ⏱ 2–4 min',
    title: 'Same chaos, protected desk, one end state — then write the four answers down',
    body: 'Run the identical chaos against the real desk. One fallback send for the down order, and the breaker holding the vendor at arm’s length. One line for the duplicate. Nothing sent for the garbage, one dead-letter row with a score. Then write the four answers every production system owes in writing: what happens if it fails, will it retry and how, what is the recovery path when retries are exhausted, and which failures it handles and which it does not. Then commit the folder — and only the folder.',
    bullets: [
      'Same three runs on the real desk → a side-by-side table where the protected desk wins every row',
      'RELIABILITY.md: four questions, four honest paragraphs, real names from the code',
      'Question 4 must name what is NOT handled — that is the one that makes it defensible',
      'Delete naive/. Commit ONLY reliability-lab/. Nothing else in the repo is in it.',
    ],
    diagram: `flowchart LR
  R["🛡️ real desk"] --> A["💥 down<br/>fallback · breaker"]
  R --> B["👯 ok twice<br/>1 send"]
  R --> C["🗑️ garbage<br/>dead-letter · score"]
  A --> M["📄 RELIABILITY.md<br/>4 answers"]
  B --> M
  C --> M
  M --> G["✅ commit<br/>the folder only"]`,
    code: {
      kind: 'paste', pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — HARDEN: the protected desk under the same chaos, RELIABILITY.md, one clean commit (⏱ 2–4 min)',
      code: L(
        'Stay inside ./reliability-lab/. Run everything yourself; do not print commands for me to copy.',
        '',
        'Run the identical chaos against the REAL desk and show me every receipt:',
        '  a. VENDOR_MODE=down, confirm 6001 → fallback sent, attempt count bounded, breaker state on the receipt.',
        '  b. VENDOR_MODE=ok, confirm 6002 twice → exactly one line in data/sent.log for 6002, second receipt says duplicate.',
        '  c. VENDOR_MODE=garbage, confirm 6003 → nothing sent, one dead-letter row with the gate score.',
        'Put the naive and protected results side by side in one table: vendor calls, lines sent, nonsense sent.',
        '',
        'Then write reliability-lab/RELIABILITY.md answering four questions in plain language, one short paragraph each, using the real names from this code:',
        '  1. What happens when the vendor fails?',
        '  2. Does it retry? With what strategy — attempts, gap, what is and is not retried?',
        '  3. What is the recovery path when the retries are exhausted?',
        '  4. Which failures does this code handle, and which does it NOT handle? Be honest: two processes running at once, a corrupted keys.json, a vendor that is slow but under the deadline — say what is not covered.',
        '  # WHY: the fourth answer is the one that separates a system you can defend from one you can only demo.',
        '',
        'Delete the naive/ copy. Then commit ONLY the reliability-lab folder — stage nothing outside it — with a message that says what the desk now survives. Show me the commit and confirm that nothing outside the folder is in it. Do not push.',
      ),
      expectedResult: 'A side-by-side table where the protected desk wins every row, a RELIABILITY.md with four honest answers, and one commit containing only the lab folder.',
      stopCondition: 'RELIABILITY.md exists, question 4 names something it does not handle, and the commit touches nothing outside the folder.',
      rescue: 'If the commit picked up other files, tell it to unstage everything outside reliability-lab and commit again. If question 4 says it handles everything, push back — name two processes at once and ask it to be honest.',
    },
    script: L(
      'SITUATION: The harden, and the close of the build. Same chaos, real desk, one end state — then the four answers in writing, then one clean commit.',
      'ROOM: Prompt block on screen. Ask people to read question 4 of their RELIABILITY.md aloud when it exists — that is the one you want to hear.',
      'MOOD: Calm and a little triumphant. Everything tonight has been building to this table.',
      'OPEN: "Same chaos. Your desk. Watch the numbers."',
      'DO: Have one person read the side-by-side table. Twenty versus three. Two versus one. Sent versus refused. Do not narrate it; let the numbers do it.',
      'DO: Then ask two people to read their question 4 aloud. If either says "handles everything", stop and ask about two processes at once. Honest is the grade.',
      'SAY: A system you can defend is one where you can say what it does not handle. That paragraph is worth more than the code.',
      'NOTE: The commit must contain only the folder — check one person’s commit on screen. That is the folder rule kept all the way to the end.',
    ),
  },
  {
    segment: 'failure', eyebrow: '🏁 Done means',
    title: 'What you can say now that you could not say on Monday',
    body: 'Monday you had a folder and a vendor that could be told to misbehave. Now you can say four things about a real system, with evidence in the folder: it waits a bounded time and tries a bounded number of times; it stops calling a vendor that is down and tells the customer something true anyway; the same order can never go out twice; and a wrong answer is refused before it is sent. Your proof is a recording of the chaos run and the RELIABILITY.md that answers the four questions.',
    bullets: [
      'Bounded wait, bounded attempts — proven with slow and down',
      'Breaker + fallback + dead-letter + replay — proven with five down runs',
      'Same order twice, one send — proven by a test in the folder',
      'Wrong answers refused, scored, parked — proven with garbage',
      'Proof: the chaos run recorded + RELIABILITY.md, committed in reliability-lab/ only',
    ],
    diagram: `flowchart LR
  M["Monday<br/>a folder · a vendor"] --> T["Thursday<br/>4 things you can say"]
  T --> P1["⏱️ bounded"]
  T --> P2["🔌 stops calling"]
  T --> P3["♻️ never twice"]
  T --> P4["🚦 refuses nonsense"]`,
    script: L(
      'SITUATION: The definition of done, said out loud before demos. No code; this is the sentence they take home.',
      'ROOM: Slide up. Nothing to run. This is the last teach slide of the week.',
      'MOOD: Settled. Let the list land.',
      'OPEN: "Monday you had a folder. Here is what you can say now."',
      'SAY: Bounded. Stops calling. Never twice. Refuses nonsense. Four sentences, each with a proof in your folder.',
      'DO: Point at the last bullet: the recording of the chaos run is the Build Proof. Then straight into demos — two people, the side-by-side table on screen.',
      'NOTE: If the clock is past 8:05, skip the demos poll and go to the broadcast. The recording matters more than the vote.',
    ),
  },
];

/* ---------------------------------------------------------- story beats ---- */
const STORY_BEATS = [
  {
    segment: 'result-preview',
    icon: '🧗', tone: 'violet', eyebrow: 'Before you build — where you actually are',
    title: 'The climber does not test the rope on the wall',
    body: 'Nobody finds out whether the rope holds by falling from two hundred feet. They load it, deliberately, at head height, on the ground, where a failure is embarrassing rather than fatal. Tonight is head height. The desk is small, nothing depends on it, it lives in a folder that touches nothing else, and someone is here to help — which makes this the cheapest chance you will ever get to watch your own work fail.',
    punch: 'You are not testing whether it works. You already know it works. You are testing what happens when it does not.',
  },
  {
    segment: 'build-map',
    icon: '🏥', tone: 'amber', eyebrow: 'Change of pace — why the boring layers win',
    title: 'The checklist that made surgery safer was not clever. That was the point.',
    body: 'When hospitals adopted a nineteen-item surgical safety checklist, complications and deaths fell measurably, and not one item on it was a medical breakthrough. Confirm the patient’s name. Confirm the site. Confirm everyone in the room has introduced themselves. The items were so obvious they felt insulting to experienced surgeons — which is precisely why they had been skipped, quietly, for years.',
    punch: 'Every checkpoint tonight is boring. Boring is what survives 2 AM.',
  },
  {
    segment: 'failure',
    icon: '🎰', tone: 'cherry', eyebrow: 'The moment it lands',
    title: 'The test says two, and two is a person’s bank statement',
    body: 'In a moment you will run a copy whose output is that your side effect fired twice. It will finish cleanly. It will look like success. And in the business your desk stands in for, that number two is two charges on somebody’s card, or two identical emails to a customer who already told you once, or two tickets a support rep now has to reconcile. The run is clean and the system is wrong.',
    punch: 'The scariest failures are the ones your system is perfectly happy about.',
  },
];

/* --------------------------------------------------------- interactions ---- */
const INTERACTIONS = [
  {
    segment: 'result-preview', kind: 'poll',
    q: 'You just heard what the finished desk does — vendor down, same order twice, nonsense refused, one clean send. Could your Monday desk do that right now?',
    options: ['Not a chance', 'Partly — I have the timeout and retry', 'Mostly, but the duplicate would go through', 'I was not here Monday'],
    eyebrow: '🔮 Honest read', title: 'Before we start — where does yours stand?',
    presenterTip: L(
      'SITUATION: The opening poll. No right answer; it tells you how many people need the CP0 rebuild path.',
      'ROOM: Poll up on the phone.',
      'MOOD: Light.',
      'OPEN: "Honest read. Nobody is behind tonight either way."',
      'DO: Read the spread. The last option is your CP0 rebuild count — say out loud that one prompt gets them to the same place in four minutes.',
    ),
  },
  {
    segment: 'readiness', kind: 'poll',
    q: 'What is in front of you right now?',
    options: ['My repo with reliability-lab/ from Monday', 'My repo, no reliability-lab/ yet', 'Claude Code is not open in my repo yet', 'I am not sure which repo'],
    eyebrow: '✅ Readiness', title: 'Three things you need. Which do you have?',
    presenterTip: L(
      'SITUATION: The readiness roll call, run from the phone. The slide before this one carries old text — ignore it and say the real list here.',
      'ROOM: Poll up. Pulse rail visible.',
      'MOOD: Brisk and a little strict. Nobody starts CP0 in the wrong folder.',
      'OPEN: "Tonight you need a laptop, Claude Code signed in and open inside your project repository, and either Monday’s folder or nothing. That is the whole list."',
      'DO: Anyone on options three or four gets sorted before CP0 — ask them to open Claude Code in their repo now, and say the folder rule once more: reliability-lab, inside the repo, nothing outside it changes.',
    ),
  },
  {
    segment: 'build-map', kind: 'trivia',
    q: 'Which nesting is correct?',
    options: ['timeout( retry( breaker( call ) ) )', 'breaker( retry( timeout( call ) ) )', 'retry( breaker( timeout( call ) ) )', 'Any order works'],
    answer: 1,
    reveal: 'breaker( retry( timeout( call ) ) ). The timeout bounds ONE attempt, so it is innermost. The retry wraps it so every attempt gets a fresh deadline. The breaker counts whole operations, so it is outermost — inside the retry, every attempt would reset it and it would never trip.',
    eyebrow: '🎯 Knowledge check', title: 'Order matters — which one?',
    presenterTip: L(
      'SITUATION: The one trivia question before the build. It is the CP1 design decision, so it is worth a full minute.',
      'ROOM: Poll up.',
      'MOOD: Quick, then one clear sentence.',
      'OPEN: "One question before you paste anything. Which order?"',
      'DO: Reveal, then say it: timeout around one attempt, retry around the timeout, breaker around the whole thing. Point at CP1 — you are about to build exactly that.',
    ),
  },
  {
    segment: 'guided-build', kind: 'poll',
    q: 'The breaker is open and a new order arrives. What should the customer get?',
    options: ['Nothing — try again later', 'The fallback template: true, just less of it', 'The last message the vendor sent for some other order', 'An error message'],
    answer: 1,
    reveal: 'The fallback template. It is true — the order IS confirmed — it just says less. Nothing is worse than something true. A recycled message is a lie. An error is your problem shown to a customer.',
    eyebrow: '🪂 Design check', title: 'When the vendor is away',
    presenterTip: L(
      'SITUATION: The first of two quick polls after the CP3 prompt is pasted, while it runs. Cheap, and it makes the fallback rule stick.',
      'ROOM: Poll up. CP3 is still running on most screens — that is the point of asking now.',
      'MOOD: Quick.',
      'OPEN: "While that runs: the vendor is away, somebody just ordered. What do they get?"',
      'DO: Reveal, then ask why option three — the recycled message — is the worst one. Somebody will say "it is a lie". Correct.',
    ),
  },
  {
    segment: 'guided-build', kind: 'poll', theater: true,
    q: 'Where does the idempotency key come from?',
    options: ['A fresh random ID at the top of each run', 'The order id — the event itself', 'The current timestamp', 'The correlation id'],
    answer: 1,
    reveal: 'The order — the event itself. A fresh ID or a timestamp is different every run, so every retry looks new and the protection is worthless. The correlation id identifies the RUN, which is exactly the thing the key must NOT be tied to.',
    eyebrow: '🎭 Decision theater', title: 'The sentence of the week, one more time',
    presenterTip: L(
      'SITUATION: The second poll while CP3 runs, right before the break. Most of the room gets it now; the point is to see the spread move from Monday and to separate the correlation id CP3 just added from the key.',
      'ROOM: Theater up. Read all four.',
      'MOOD: Satisfying.',
      'OPEN: "Lock it in. Where does the key come from?"',
      'DO: Reveal. Then point at option four: the correlation id CP3 is adding right now is a per-RUN id — the one thing the key must never be. Then the break.',
    ),
  },
  {
    segment: 'failure', kind: 'trivia',
    q: 'The naive copy runs cleanly and sent.log shows two lines for one order. That means…',
    options: ['The system works', 'The vendor is broken', 'The system is wrong and nothing noticed', 'The test is flaky'],
    answer: 2,
    reveal: 'The system is wrong and nothing noticed. No error, no alert, a clean exit — and a customer confirmed twice. The failures that never announce themselves are the ones this whole week is about.',
    eyebrow: '🎯 Knowledge check', title: 'It finished cleanly',
    presenterTip: L(
      'SITUATION: The last question of the build, after the story card. The room watched the naive copy send twice twenty minutes ago; this makes them name what that was.',
      'ROOM: Poll up.',
      'MOOD: Quick.',
      'OPEN: "The naive copy finished cleanly. Two lines. What does that mean?"',
      'NOTE: Reveal, one line, then demos.',
    ),
  },
  {
    segment: 'demos', kind: 'poll',
    q: 'Which protection did you find most convincing when you watched the naive copy fail without it?',
    options: ['The breaker — the fourth call never left', 'The key — one send for two orders', 'The gate — nonsense refused', 'The dead-letter — nothing lost'],
    eyebrow: '🎤 Your pick', title: 'Which one convinced you?',
    presenterTip: L(
      'SITUATION: The demos-segment poll. Opinion only; it picks the demo you ask for.',
      'ROOM: Poll up.',
      'MOOD: Loose.',
      'OPEN: "Which one convinced you? No wrong answer."',
      'DO: Ask the top-voted protection’s biggest fan to share their screen and show that proof. One demo if the clock is tight, two if not.',
    ),
  },
];

/* ---------------------------------------------------------- slide notes ---- */
const SLIDE_NOTES = {
  'cover:result-preview-0': L(
    'SITUATION: The cover. Class clock not started. You are remote, so this is also your audio and screen check.',
    'ROOM: Cover on the shared screen. Ask one person to confirm they can see the deck and hear you before you say anything else.',
    'MOOD: Settled.',
    'OPEN: "Can somebody confirm you see the cover and hear me? Then we start."',
    'DO: Press Start class the moment you begin.',
  ),
  'rules:result-preview-1': L(
    'SITUATION: House rules. Tonight the two that matter: every block is a prompt, and nothing outside reliability-lab changes.',
    'ROOM: Rules on screen. Phones out.',
    'MOOD: Brisk.',
    'OPEN: "Same two rules as Monday: every block is a prompt, and everything stays in the one folder."',
    'NOTE: Fifteen seconds.',
  ),
  'segment:result-preview-0': L(
    'SITUATION: The result preview. Say what exists by 8:10 before any checkpoint.',
    'ROOM: The four failures on screen and the one outcome. Nothing to run.',
    'MOOD: Concrete.',
    'OPEN: "By the end of tonight your desk does four things it cannot do right now — and you will have watched a copy without them fail at all four."',
    'DO: Read the four failures as a list, then the one outcome. Then the shape of the night: four checkpoints, paste-then-look-up, break it, harden it, finish early.',
  ),
  'storybeat:result-preview-900': L(
    'SITUATION: Change of pace before readiness. The rope at head height.',
    'ROOM: Story card full screen.',
    'MOOD: Steadying. This is permission to break things in a safe place.',
    'OPEN: "The climber does not test the rope on the wall."',
    'SAY: Tonight is head height. Small, isolated, and someone is here to help.',
    'NOTE: Twenty seconds, then the readiness poll.',
  ),
  'segment:readiness-0': L(
    'SITUATION: The readiness opener. The text on this slide predates tonight’s from-scratch design and mentions an earlier system — IGNORE it and say the real list.',
    'ROOM: Slide up. Do not read it aloud.',
    'MOOD: Brisk.',
    'OPEN: "Ignore the line on the slide. Tonight you need a laptop, Claude Code open inside your project repository, and either Monday’s reliability-lab folder or nothing at all."',
    'DO: Go straight to the readiness poll and run the roll call from there.',
  ),
  'buildmap:build-map-0': L(
    'SITUATION: The generated checkpoint map. The rail: CP0 Baseline · CP1 Resilient · CP2 Idempotent · CP3 Gated.',
    'ROOM: Map on screen with the rescue branch.',
    'MOOD: Decisive.',
    'OPEN: "Four checkpoints. We move together. Nobody goes past one until the room is through it — and the rescue branch is one prompt, so nobody gets stranded."',
    'DO: Walk the boxes left to right, then point at the rescue branch. Then the roadmap slide, which has the timings.',
  ),
  'checkpoint:build-map-1': L(
    'SITUATION: CP0 on the rail. Everyone starts here; the prompt verifies or builds.',
    'ROOM: Checkpoint slide. Pulse rail ready.',
    'MOOD: Brisk.',
    'OPEN: "Checkpoint zero: the desk, the vendor, the timeout, the retry — verified or built by one prompt."',
    'NOTE: Do not linger on the rail slides. The guided-build slides carry the prompts.',
  ),
  'checkpoint:build-map-2': L(
    'SITUATION: CP1 on the rail — resilient.',
    'ROOM: Checkpoint slide.',
    'MOOD: Brisk.',
    'OPEN: "Checkpoint one: breaker, fallback, dead-letter. The fourth call never leaves your process."',
    'NOTE: Ten seconds. The proof is the five-run attempt count in the CP1 prompt.',
  ),
  'checkpoint:build-map-3': L(
    'SITUATION: CP2 on the rail — idempotent.',
    'ROOM: Checkpoint slide.',
    'MOOD: Brisk.',
    'OPEN: "Checkpoint two: the same order twice, one send — and a test that fails if that ever stops being true."',
    'NOTE: Ten seconds.',
  ),
  'checkpoint:build-map-4': L(
    'SITUATION: CP3 on the rail — gated.',
    'ROOM: Checkpoint slide.',
    'MOOD: Brisk.',
    'OPEN: "Checkpoint three: score the message, refuse nonsense, hand back a receipt with one id on every line."',
    'NOTE: Ten seconds, then the roadmap slide with the timings.',
  ),
  'storybeat:build-map-900': L(
    'SITUATION: Change of pace before the first prompt. The surgical checklist.',
    'ROOM: Story card full screen.',
    'MOOD: Storyteller. Slow down for thirty seconds.',
    'OPEN: "The checklist that made surgery safer was not clever. That was the point."',
    'SAY: Every checkpoint tonight is boring. Boring is what survives 2 AM.',
    'NOTE: Then CP0.',
  ),
  'break:reset-0': L(
    'SITUATION: Ten minutes, and the catch-up window. CP3 is still running for some of the room.',
    'ROOM: Break slide up. Clear the stuck queue on the phone — anyone still on CP0 or CP1 gets the rescue lines now.',
    'MOOD: Loose.',
    'OPEN: "Ten minutes. If you are behind a checkpoint, this is where you catch up — the rescue lines are under each prompt."',
    'DO: Use the break to check one person’s receipt from CP3 on their screen, so you know the room is ready for the BREAK prompt.',
  ),
  'storybeat:failure-900': L(
    'SITUATION: The closing story of the build, after the definition of done. The number two — what the naive copy did earlier, and what it would have meant.',
    'ROOM: Story card full screen.',
    'MOOD: Quiet.',
    'OPEN: "Twenty minutes ago a copy of your desk sent the same order twice, cleanly, and called it success."',
    'SAY: The scariest failures are the ones your system is perfectly happy about.',
    'NOTE: Then the last trivia question, then demos.',
  ),
  'demos:demos-0': L(
    'SITUATION: Demos. One or two students share their screen; the side-by-side table from HARDEN is the thing to show.',
    'ROOM: Ask the top-voted pick from the demos poll to share. You are remote, so name the person and wait for their screen.',
    'MOOD: Celebratory.',
    'OPEN: "Show me the table. Twenty versus three, two versus one."',
    'DO: One demo if the clock is past 8:00, two if not. Ask each presenter to read question 4 of their RELIABILITY.md as their closing line.',
  ),
  'broadcast:broadcast-0': L(
    'SITUATION: The 30-second Build Proof. Tonight’s proof is the chaos run — the naive copy failing, the real desk holding.',
    'ROOM: Broadcast slide up with the five prompts.',
    'MOOD: Warm and quick.',
    'OPEN: "Thirty seconds on your phone: what you built, what broke, what held. That recording is your proof for the week."',
    'DO: Say where it goes: inside reliability-lab, next to RELIABILITY.md, committed with the folder. Nothing outside it.',
  ),
  'beforeafter:cta--1': L(
    'SITUATION: The before/after payoff. Left column is Monday at 6:30; right column is now.',
    'ROOM: Two columns on screen.',
    'MOOD: Let it sit.',
    'OPEN: "Left column, Monday. Right column, now."',
    'DO: Pause. Do not read the rows aloud — the room reads faster than you talk.',
  ),
  'assignment:cta-0': L(
    'SITUATION: The assignment slide. The proof is the recording of a forced failure being handled to one clean end state — exactly the HARDEN run.',
    'ROOM: Brief on screen.',
    'MOOD: Clear.',
    'OPEN: "Here is what you owe by Friday, and what counts as proof: the recording of the chaos run, and RELIABILITY.md, both committed inside reliability-lab."',
    'DO: Read the proof line off the slide. Then stop the class clock. We finished early on purpose.',
  ),
};

/* --------------------------------------------------------------- config ---- */
function buildConfig(before) {
  const b = before && typeof before === 'object' ? before : {};
  return {
    ...b,
    theaterEnabled: true,
    buildBayDetail: true,
    // The rail matches the four guided-build checkpoints one for one.
    checkpointsEnabled: true,
    evidenceOverrides: null,
    teach: { enabled: true, max: null, overrides: TEACH },
    storyBeats: { enabled: true, max: null, overrides: STORY_BEATS },
    interactions: { enabled: true, max: null, overrides: INTERACTIONS },
    // Guided-build has teach slides, so the `prompts` fallback never renders.
    prompts: { enabled: true, max: null, overrides: null },
    opening: {
      coldOpen: { enabled: true, override: null },
      hook: { enabled: true, override: null },
      resultPreview: { enabled: true, override: RESULT_PREVIEW },
    },
    slideNotes: SLIDE_NOTES,
  };
}

/* ----------------------------------------------------------------- lint ---- */
const TAGS = /^(SAY|DO|NOTE|SITUATION|ROOM|MOOD|OPEN):/;
const ARRIVAL = ['SITUATION', 'ROOM', 'MOOD', 'OPEN'];
const SHELL_LINE = /(^|\n)\s*(npm |npx |mkdir |cd |sudo |curl |chmod |git |ls -la|touch |pwd\b|node )/;
const PRIOR_REFS = [
  /\bweeks?\s*[1-8]\b/i, /\bW[1-8]\b/, /\bW[1-8][–-][1-8]\b/, /\borientation\b/i, /\bdragon\b/i,
  /\bintensive\s*[1-3]\b/i, /\blast (week|time|session|class)\b/i, /\bcapstone\b/i,
  /\byou (already )?built (in|on|last|earlier)\b/i, /\bearlier (in|this) (the )?(program|cohort|course)\b/i,
];
const BUILD_SEGMENTS = ['result-preview', 'readiness', 'build-map', 'guided-build', 'reset', 'failure', 'demos', 'broadcast', 'cta'];
// The non-overridable rail from classSessionPlan.ts week 9. Guided-build
// eyebrows must count the same way or the deck disagrees with itself.
const RAIL = ['CP0', 'CP1', 'CP2', 'CP3'];

function lintTagged(label, text, requireArrival) {
  const bad = [];
  const lines = String(text || '').split('\n').filter(Boolean);
  if (!lines.length) bad.push(label + ': empty');
  const cats = new Set(lines.map((l) => (TAGS.exec(l.trim()) || [])[1]).filter(Boolean));
  if (lines.some((l) => !TAGS.test(l.trim()))) bad.push(label + ': untagged line');
  if (requireArrival) ARRIVAL.forEach((c) => { if (!cats.has(c)) bad.push(label + ': missing ' + c); });
  return bad;
}

function lint() {
  const bad = [];
  const everything = [];

  TEACH.forEach((s, i) => {
    const label = `teach[${i}] "${s.title.slice(0, 40)}"`;
    if (!BUILD_SEGMENTS.includes(s.segment)) bad.push(label + ': segment not in the Build Day run-of-show');
    if (!s.eyebrow || !s.title || !s.body) bad.push(label + ': missing eyebrow/title/body');
    if (!s.diagram) bad.push(label + ': no diagram');
    bad.push(...lintTagged(label + ' script', s.script, true));
    if (s.code) {
      if (s.code.kind !== 'paste') bad.push(label + ': code block is not a paste prompt');
      if (!/Claude Code/i.test(s.code.pasteWhere || '')) bad.push(label + ': pasteWhere is not Claude Code');
      if (/TERMINAL/i.test(s.code.pasteWhere || '') || SHELL_LINE.test(s.code.code || '')) bad.push(label + ': terminal-shaped code block');
      ['expectedResult', 'stopCondition', 'rescue', 'label'].forEach((k) => { if (!s.code[k]) bad.push(label + ': code missing ' + k); });
      if (!/reliability-lab/.test(s.code.code)) bad.push(label + ': prompt does not name the lab folder');
      if (!/⏱/.test(s.eyebrow) || !/⏱/.test(s.code.label)) bad.push(label + ': build slide without a ⏱ estimate');
      everything.push(s.code.code, s.code.expectedResult, s.code.stopCondition, s.code.rescue, s.code.label);
    }
    everything.push(s.title, s.body, s.script, ...(s.bullets || []));
  });

  // Guided-build eyebrows must follow the rail in order.
  const cps = TEACH.filter((s) => s.segment === 'guided-build').map((s) => (/(CP\d)/.exec(s.eyebrow) || [])[1]);
  if (cps.join(',') !== RAIL.join(',')) bad.push(`guided-build eyebrows ${JSON.stringify(cps)} do not match the rail ${JSON.stringify(RAIL)}`);

  STORY_BEATS.forEach((b, i) => {
    const label = `storyBeat[${i}]`;
    if (!BUILD_SEGMENTS.includes(b.segment)) bad.push(label + ': bad segment');
    ['icon', 'eyebrow', 'title', 'body', 'punch', 'tone'].forEach((k) => { if (!b[k]) bad.push(label + ': missing ' + k); });
    everything.push(b.title, b.body, b.punch);
  });

  INTERACTIONS.forEach((q, i) => {
    const label = `interaction[${i}] "${q.q.slice(0, 40)}"`;
    if (!BUILD_SEGMENTS.includes(q.segment)) bad.push(label + ': bad segment');
    if (!Array.isArray(q.options) || q.options.length !== 4) bad.push(label + ': needs exactly 4 options');
    if (q.kind === 'trivia' && typeof q.answer !== 'number') bad.push(label + ': trivia needs an answer');
    if (typeof q.answer === 'number' && !q.reveal) bad.push(label + ': answer without a reveal');
    bad.push(...lintTagged(label + ' presenterTip', q.presenterTip, true));
    everything.push(q.q, q.reveal, q.presenterTip, ...q.options);
  });

  Object.entries(SLIDE_NOTES).forEach(([k, v]) => {
    if (!/^[a-z]+:[a-z-]+-?-?\d+$/.test(k)) bad.push('slideNote key malformed: ' + k);
    bad.push(...lintTagged('slideNote ' + k, v, true));
    everything.push(v);
  });
  // The readiness opener is the one generated slide whose projected text
  // predates the from-scratch rule; its note must tell the instructor so.
  if (!/ignore/i.test(SLIDE_NOTES['segment:readiness-0'] || '')) bad.push('segment:readiness-0 note must tell the instructor to ignore the slide text');

  everything.push(RESULT_PREVIEW.title, RESULT_PREVIEW.body);
  everything.filter(Boolean).forEach((text) => {
    PRIOR_REFS.forEach((re) => {
      const m = re.exec(text);
      if (m) bad.push(`prior-week reference "${m[0]}" in: ${String(text).slice(0, 60)}…`);
    });
  });

  if (TEACH.length > 10) bad.push(`${TEACH.length} teach slides — over the budget of 10`);
  const prompts = TEACH.filter((s) => s.code).length;
  if (prompts > 6) bad.push(`${prompts} prompts — over the budget of 6`);
  return bad;
}

function summary() {
  const prose = TEACH.reduce((n, s) => n + (s.body || '').length, 0);
  return `teach=${TEACH.length} prompts=${TEACH.filter((s) => s.code).length} bodyProse=${prose} `
    + `storyBeats=${STORY_BEATS.length} interactions=${INTERACTIONS.length} slideNotes=${Object.keys(SLIDE_NOTES).length}`;
}

module.exports = { SID, WEEK, RESULT_PREVIEW, TEACH, STORY_BEATS, INTERACTIONS, SLIDE_NOTES, buildConfig, lint, summary };

/* ---------------------------------------------------------------- main ---- */
if (require.main === module) {
  const dry = process.argv.includes('--dry');
  const check = process.argv.includes('--check');
  const problems = lint();
  if (problems.length) {
    console.error('LINT FAIL\n  ' + problems.join('\n  '));
    process.exit(1);
  }
  console.error('LINT OK  ' + summary());
  if (check) {
    const cfg = buildConfig(null);
    const json = JSON.stringify(cfg);
    console.error(`CHECK OK  ${json.length} bytes; teach.overrides=${cfg.teach.overrides.length} `
      + `storyBeats.overrides=${cfg.storyBeats.overrides.length} interactions.overrides=${cfg.interactions.overrides.length} `
      + `resultPreview=${!!cfg.opening.resultPreview.override} checkpointsEnabled=${cfg.checkpointsEnabled}`);
    process.exit(0);
  }

  const { getKitConfig, saveKitConfig } = require('/app/dist/services/sessionKitConfigService');
  const { splitScript } = require('/app/dist/services/classKit/kitHtml');

  (async () => {
    const before = await getKitConfig(SID);
    console.log('BEFORE ' + JSON.stringify(before));
    const config = buildConfig(before);
    if (dry) {
      console.error('DRY RUN — not saving. ' + summary());
      process.exit(0);
    }
    await saveKitConfig(SID, config);

    const after = await getKitConfig(SID);
    const saved = (after.teach && after.teach.overrides) || [];
    const untagged = saved.filter((s) => !TAGS.test(String(s.script || '').split('\n')[0] || ''));
    const shared = saved.filter((s) => {
      const sp = splitScript(s.script, s.body);
      return sp.setup && sp.say && sp.setup.includes(sp.say);
    });
    const nonPrompt = saved.filter((s) => s.code && s.code.kind !== 'paste');
    const beats = (after.storyBeats && after.storyBeats.overrides) || [];
    const qs = (after.interactions && after.interactions.overrides) || [];
    console.error(`SAVED teach=${saved.length} untagged=${untagged.length} screensShareText=${shared.length} `
      + `codeBlocks=${saved.filter((s) => s.code).length} nonPrompt=${nonPrompt.length} `
      + `storyBeats=${beats.length} interactions=${qs.length} slideNotes=${Object.keys(after.slideNotes || {}).length} `
      + `checkpointsEnabled=${after.checkpointsEnabled}`);
    if (saved.length !== TEACH.length || untagged.length || shared.length || nonPrompt.length
      || beats.length !== STORY_BEATS.length || qs.length !== INTERACTIONS.length || !after.checkpointsEnabled) {
      console.error('VERIFY FAIL');
      process.exit(1);
    }
    process.exit(0);
  })().catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
}
