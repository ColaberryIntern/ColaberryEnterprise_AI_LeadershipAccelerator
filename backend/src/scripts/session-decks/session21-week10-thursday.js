/**
 * session21-week10-thursday.js — Session 21, Thursday 2026-10-01, "Week 10 ·
 * Build Day" (Governance + Governance Engine), rebuilt FROM SCRATCH as a full
 * KitConfig replacement. Companion to session20-week10-monday.js.
 *
 * WHY THIS EXISTS
 * Same brief as Monday (Ali, 2026-09-21): built from scratch, nothing from
 * earlier weeks, everything inside ./governance-lab/ in the student's own
 * repo, short enough to finish early. Thursday MAY link to Monday — and does —
 * but it is self-sufficient: CP0 is one prompt that VERIFIES Monday's folder
 * if it exists and BUILDS it in ~4 minutes if it does not, so somebody who
 * missed Monday is at the start line with everyone else.
 *
 * THE RAIL
 * The checkpoint rail (buildmap + CP0..CP3) is generated from
 * classSessionPlan.ts and is NOT overridable: CP0 Baseline · CP1 Policy
 * blocks · CP2 Human gate · CP3 Auditable. The guided-build slides here match
 * it one for one, so checkpointsEnabled stays true. One generated slide still
 * carries text from classSessionPlan.ts that predates the from-scratch rule —
 * the readiness opener ("Your Intensive 1–3 system, with the reliability
 * layer"). Its slideNote tells the instructor what to say instead; the PR that
 * ships this file also corrects the source text, but the deck must be right
 * whether or not that deploy has landed.
 *
 * THE BEST MOMENT
 * CP3 ends with every student editing one number inside their own audit log
 * and running the verifier, which names the exact row where the chain breaks.
 * It is the moment the week stops being a lecture about trust and becomes a
 * demonstration of it. Do not cut CP3 for time; cut demos instead.
 *
 * SHAPE
 *   8 teach slides (authored: 15) · 6 prompts, each with a ⏱ estimate ·
 *   7 questions · 3 story beats. Target finish 8:10.
 *
 * Run inside the container:  node /app/session21-week10-thursday.js [--dry]
 * Local, no DB:              node session21-week10-thursday.js --check
 * Rollback: the BEFORE line printed at the top of the run, or
 *           UPDATE live_sessions SET kit_config_json = NULL WHERE id = SID.
 */

const SID = '7112c569-0d2c-4921-8ec8-ff3efb20ab7a';
const WEEK = 10;
const L = (...lines) => lines.join('\n');

/* ------------------------------------------------------------- opening ---- */
const RESULT_PREVIEW = {
  title: 'What you are producing tonight',
  body: 'The agent from Monday, governed. It asks to refund two thousand four hundred dollars and is refused with the rule and the fact it lost on. It asks to delete a customer and is refused by a default you never had to write. It asks for something genuinely borderline and is parked for a named human, who approves it once — and a second attempt to spend that same approval does nothing. Anything nobody answers expires as a denial. And every one of those decisions can be replayed from a single id, out of a record that tells you if anybody edited it.',
};

/* ---------------------------------------------------------------- teach ---- */
const TEACH = [
  /* ============================ build map ============================= */
  {
    segment: 'build-map', eyebrow: '🗺️ Tonight',
    title: 'Four checkpoints on the agent you built Monday — and one prompt gets anyone to the start line',
    body: 'Tonight finishes the engine. CP0 gets everyone to the same baseline: the agent, the thing that carries out its actions, one rule and a closed default. If you built it Monday, one prompt verifies it in about a minute; if you did not, the same prompt builds it in about four. CP1 turns one rule into a five-factor evaluator that can say why. CP2 adds the human gate, with a single-use approval and an expiry. CP3 adds the record that can be replayed and cannot be edited quietly. Each checkpoint runs for a few minutes; you paste it, then we talk through the next one while it works.',
    bullets: [
      'CP0 Baseline — verify or rebuild Monday’s agent · ⏱ 1 min built Monday / 4 min new',
      'CP1 Policy blocks — five factors, a risk score, a reason that names the rule · ⏱ 4–6 min',
      'CP2 Human gate — escalate, approve once, deny, and expire unanswered · ⏱ 4–6 min',
      'CP3 Auditable — one id, a chained record, replay a decision, catch a tamper · ⏱ 4–6 min',
      'Then: the same four actions against a copy with no gate, and GOVERNANCE.md',
    ],
    diagram: `flowchart LR
  CP0["0️⃣ Baseline<br/>agent · act<br/>1 rule · closed default"] --> CP1["1️⃣ Policy blocks<br/>5 factors · risk<br/>a reason"]
  CP1 --> CP2["2️⃣ Human gate<br/>escalate · approve once<br/>expire"]
  CP2 --> CP3["3️⃣ Auditable<br/>one id · chained<br/>replay · tamper"]
  CP3 --> BR["💥 break it"]
  BR --> H["🛡️ harden it"]`,
    script: L(
      'SITUATION: The roadmap. Four checkpoints in a fixed order, and the order IS the lesson: a policy is worth nothing until it can say why, a human gate is worth nothing until silence is a denial, and both are worth nothing if the record can be edited.',
      'ROOM: Deck up, phone in hand. Say the shape of the night out loud, including that we finish early.',
      'MOOD: Decisive. This is a contract for the night, said like one.',
      'OPEN: "By 8:10 your agent will ask to move two thousand four hundred dollars and be told no, by name, with a reason — and you will have watched a copy without the gate do it anyway."',
      'DO: Say the rule once: nobody who missed Monday is behind. CP0 builds everything in four minutes. Then say the rhythm: paste, then look up — the next checkpoint is explained while this one runs.',
      'NOTE: The rail counts CP0 Baseline · CP1 Policy blocks · CP2 Human gate · CP3 Auditable. Use those numbers all night; the slides match them.',
    ),
  },

  /* =========================== guided build =========================== */
  {
    segment: 'guided-build', eyebrow: '0️⃣ CP0 · Baseline · ⏱ 1 min (built Monday) / 4 min (new)',
    title: 'Get to the start line: verify Monday’s agent, or build it now',
    body: 'One prompt, two outcomes. If governance-lab exists with the agent, the act step, one rule and a closed default, Claude Code verifies all four agent modes and reports a table. If it does not exist, Claude Code builds it from scratch, in the same isolated folder, under the same rules. Paste it and look up: CP1 is explained while this runs.',
    bullets: [
      'Exists → verify: four modes, one table, nothing rebuilt',
      'Missing → build: agent, act, ledger, one rule, closed default — in governance-lab/ only',
      'Same rules as Monday: nothing outside the folder changes, zero dependencies',
      'Paste it. Then advance — CP1 is taught while it runs.',
    ],
    diagram: `flowchart LR
  P["📋 paste"] --> Q{"governance-lab/<br/>exists?"}
  Q -->|yes| V["verify 4 modes<br/>~1 min"]
  Q -->|no| B["build from scratch<br/>~4 min"]
  V --> T["📊 table"]
  B --> T`,
    code: {
      kind: 'paste', pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — CP0: verify the agent if it exists, build it if it does not (⏱ 1 / 4 min)',
      code: L(
        'We are working ONLY inside ./governance-lab/ in this repository. Nothing outside that folder is created, edited or deleted tonight. Zero dependencies. Run every step yourself; do not print commands for me to copy.',
        '',
        'First, look: does ./governance-lab/ already exist with an agent that proposes actions in four modes, an act step that appends to data/ledger.jsonl, a policy.json holding a refund limit rule, and a gate that denies anything matching no rule?',
        '',
        'IF IT EXISTS — verify it, do not rebuild it. Run it once in each AGENT_MODE (normal, generous, sloppy, rogue) and report a four-row table: mode, verdict, ruleId, and whether a line was appended to data/ledger.jsonl. Expected: normal → allow, a ledger line; generous → deny, refund-limit, no ledger line; sloppy → deny, default-deny, no ledger line; rogue → deny, default-deny, no ledger line. If anything differs, fix it and re-run. Then stop.',
        '',
        'IF IT DOES NOT EXIST — build it now, from scratch:',
        '  1. Create ./governance-lab/ with its OWN package file (or the equivalent for the language) so nothing about this project’s configuration leaks in. Use Node.js if installed, otherwise Python 3. Check whether this project’s lint, test, typecheck or build would pick the folder up; if so, tell me and ask before touching anything outside it.',
        '  2. agent — PROPOSES an action as a plain object {actionId, actor, actionType, resource, amount, context, reason}, chosen by the environment variable AGENT_MODE (default normal):',
        '       normal   → refund $40 on order 7001. context: accountAgeDays 730, priorRefundsToday 0, addressChangedAfterOrder false.',
        '       generous → refund $2400 on order 7781. context: accountAgeDays 0, priorRefundsToday 4, addressChangedAfterOrder true.',
        '       sloppy   → delete customer record 8891. context: recordHasOrders true.',
        '       rogue    → export all 40000 customer rows AND email every one of them. context: requestedByEmail true.',
        '     The agent is helpful and not malicious in all four modes.',
        '  3. act — carries the action out by appending one JSON line to data/ledger.jsonl. That line IS the side effect; nothing leaves the machine.',
        '  4. policy.json with ONE rule, id "refund-limit": actionType refund and amount over 500 → deny. Keep the policy as data in a file, not as an if-statement.',
        '  5. gate with evaluate(action) → {verdict, reason, ruleId}. A matching rule returns its verdict plus a reason naming the rule AND the failing fact. NO matching rule returns deny with ruleId "default-deny". The gate is the ONLY path to act.',
        '     # WHY: fail-closed. Anything you did not write a rule for is refused, so the policy is a list of what is permitted rather than a list of the harms you happened to imagine.',
        '  6. Every evaluation appends one line to data/decisions.jsonl. A six-line README.md, and a .gitignore inside the folder that ignores data/.',
        '  Then run the same four-mode verification above and show me the table.',
      ),
      expectedResult: 'A four-row table: normal allowed with a ledger line; generous denied by refund-limit; sloppy and rogue denied by default-deny with no ledger line. Nothing outside governance-lab/ touched.',
      stopCondition: 'The table matches and you have tapped the checkpoint.',
      rescue: 'If it started rebuilding over an existing folder, stop it and say "verify only — it exists". If sloppy or rogue was allowed, the default is open; say an action matching no rule must be denied with ruleId default-deny. If a denied run still wrote to the ledger, act is reachable without the gate.',
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
    segment: 'guided-build', eyebrow: '1️⃣ CP1 · Policy blocks · ⏱ 4–6 min',
    title: 'Five factors, a risk score, and a refusal that tells you what to change',
    body: 'One rule is a limit. A policy is a decision made from facts. CP1 turns the gate into a five-factor evaluator: who is asking, what they want to touch, what verb, everything true around the request, and a risk number computed from those. Rules now match on any of the factors, so the same action gets different verdicts for different actors and different contexts without anybody editing a rule. And every refusal names the rule and the fact it lost on, because a denial that cannot be acted on is an obstacle, not a control.',
    bullets: [
      'evaluate(action) reads all five: user · resource · action · context · risk',
      'risk is computed — amount, reversibility, blast radius — and it is a number',
      'Rules match on factors, not just on a verb, so verdicts differ without edits',
      'Every deny names the ruleId AND the failing fact. Always.',
      'Proof: one action, two contexts, two different verdicts, same policy file',
    ],
    diagram: `flowchart LR
  A["⚡ action"] --> E{"🛡️ evaluate"}
  U["👤 user"] --> E
  C["🌍 context"] --> E
  R["📊 risk"] --> E
  E -->|allow| OK["ledger"]
  E -->|deny| W["🛑 rule + failing fact"]
  E -->|escalate| H["🙋 CP2"]`,
    code: {
      kind: 'paste', pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — CP1: the five-factor evaluator, a risk score, and reasons that name the fact (⏱ 4–6 min)',
      code: L(
        'Stay inside ./governance-lab/. Zero dependencies. Run everything yourself; do not print commands for me to copy.',
        '',
        'Turn the gate into a five-factor attribute-based evaluator.',
        '',
        '  1. Compute a risk score from 0 to 100 for every proposed action, before any rule is consulted:',
        '       amount — scale it, so a $2400 refund scores far above a $40 one',
        '       reversibility — an irreversible action (delete, export, email) adds a large fixed amount',
        '       blast radius — how many people or records it touches; 40000 rows is not the same as one order',
        '       context penalties — accountAgeDays under 7, priorRefundsToday above 2, addressChangedAfterOrder true',
        '     Show me the scoring rules you chose in the README. They must be simple enough that I could argue with them.',
        '     # WHY: risk has to be a number, because a number is what lets you draw a threshold and then defend the threshold to somebody who is angry about it.',
        '  2. Extend policy.json so a rule can match on ANY of the five factors — user/role, resource type, actionType, named context fields, and a risk range — and can return allow, deny or escalate. Write these rules:',
        '       refund-small     → actionType refund, amount ≤ 100, risk under 40 → allow',
        '       refund-suspect   → actionType refund where accountAgeDays < 7 OR priorRefundsToday > 2 OR addressChangedAfterOrder is true → deny',
        '       refund-large     → actionType refund, amount > 500 → escalate',
        '       delete-with-orders → actionType delete where recordHasOrders is true → deny',
        '       bulk-export      → actionType export or email affecting more than 100 records → deny',
        '     Rules are evaluated in a defined order and the FIRST match wins; say in the README what that order is and why deny-style rules sit above escalate-style ones.',
        '     # WHY: order is a policy decision. If the large-refund escalation matched before the suspicious-account denial, a stolen card would reach a human instead of a wall.',
        '  3. Anything matching no rule is still denied with ruleId "default-deny". Do not remove that.',
        '  4. Every verdict is recorded in data/decisions.jsonl with all five factors, the risk score, the ruleId and a human-readable reason that names the rule AND the fact that decided it — for example "refund-suspect: accountAgeDays 0 is under 7".',
        '',
        'Then PROVE it, and show me every run:',
        '  a. AGENT_MODE=normal   → allow, refund-small.',
        '  b. AGENT_MODE=generous → deny, refund-suspect (NOT refund-large — the account is 0 days old, and that is the point of rule order). Show me the reason string.',
        '  c. AGENT_MODE=sloppy   → deny, delete-with-orders.',
        '  d. AGENT_MODE=rogue    → deny, bulk-export.',
        '  e. Now the one that matters: run the SAME $2400 refund but with context accountAgeDays 730, priorRefundsToday 0, addressChangedAfterOrder false. It must come back ESCALATE via refund-large, not deny — same action, same amount, same policy file, different verdict. Show me both reason strings side by side.',
        '',
        'Finish with a table of all five runs: mode, risk score, verdict, ruleId, reason.',
      ),
      expectedResult: 'Five runs where the same $2,400 refund is denied in one context and escalated in another, from the same policy file, each with a reason naming the rule and the deciding fact.',
      stopCondition: 'You are looking at two runs of the identical action with two different verdicts, and you can read why.',
      rescue: 'If the generous run came back escalate instead of deny, the rule order is wrong — the suspicious-account rule must be evaluated before the large-refund rule. If a reason says only "denied by policy", push back: it must name the rule and the fact.',
    },
    script: L(
      'SITUATION: CP1 — taught while CP0 runs, then pasted once the room’s tables match. This is where one rule becomes a policy.',
      'ROOM: Prompt block on screen. The thing to watch for is run (e): the same action, twice, two verdicts.',
      'MOOD: Methodical. Five factors, a number, and an order that matters.',
      'OPEN: "One rule is a limit. Five factors and an order is a policy — and the order is a design decision, not an accident of how you typed it."',
      'DO: Explain rule order specifically, because it is the part that bites. If the large-refund escalation matched first, a stolen card would go to a human instead of a wall. Then have them paste and ADVANCE to CP2 while it runs.',
      'DO: When you come back, ask one person to read both reason strings from run (e). Same money, same policy, different answer, and the difference is a fact that was in the database the whole time.',
      'SAY: A refusal that does not tell you what to change is not a control. It is an obstacle, and people route around obstacles.',
      'NOTE: If somebody says the scoring weights are arbitrary, agree immediately — they are, and they are written down where you can argue about them, which is the entire improvement over a number in somebody’s head.',
    ),
  },
  {
    segment: 'guided-build', eyebrow: '2️⃣ CP2 · Human gate · ⏱ 4–6 min',
    title: 'Escalate to a named human, spend the approval once, and let silence mean no',
    body: 'Escalation is where governance usually stops being real. CP2 makes it a control. A high-risk action does not run; it is parked with all five factors attached, so whoever opens it can actually decide. An approval names the approver and can be spent exactly once — a second attempt to use it does nothing. A denial means it never runs. And anything nobody answers expires, as a denial, because a queue item that eventually fires because somebody was tidying up on Friday is not a control either.',
    bullets: [
      'Escalated actions are parked in data/pending/ with all five factors and the risk score',
      'approve <actionId> --by <name> → runs ONCE, records who, spends the token',
      'A second approve on the same action does nothing and says so',
      'deny <actionId> --by <name> → never runs, and the reason is recorded',
      'Unanswered past its expiry → denied automatically. Silence is not consent.',
    ],
    diagram: `flowchart LR
  E["🙋 escalated<br/>+5 factors +risk"] --> P["📥 data/pending/"]
  P --> A["approve --by name"]
  P --> D["deny --by name"]
  P --> T["⏳ expiry"]
  A --> S["⚡ acts ONCE<br/>token spent"]
  D --> X["🛑 never acts"]
  T --> X`,
    code: {
      kind: 'paste', pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — CP2: the human gate, a single-use approval, and an expiry that denies (⏱ 4–6 min)',
      code: L(
        'Stay inside ./governance-lab/. Zero dependencies. Run everything yourself; do not print commands for me to copy.',
        '',
        'Make escalation real.',
        '',
        '  1. When the verdict is escalate, the action must NOT run. Write it to data/pending/<actionId>.json with the full proposed action, all five factors, the risk score, the ruleId that escalated it, the time it was parked and an expiry time.',
        '     # WHY: whoever opens this has to be able to decide. A request without its facts turns an approver into a signature.',
        '  2. Add two commands: approve <actionId> --by <name> and deny <actionId> --by <name>. Both require a name; refuse to proceed without one.',
        '     approve → the original action runs exactly once, and the pending item is marked resolved with the approver’s name and the time. Running approve on the same actionId AGAIN must do nothing at all, change nothing, and say clearly that the approval was already spent.',
        '     # WHY: one human said yes once. If that yes can be spent twice, the second side effect has no approver, and the record will happily show an approval against it.',
        '     deny → the action never runs; the pending item is marked denied with the name and the reason.',
        '  3. Expiry: a pending item past its expiry time is treated as DENIED, automatically, wherever it is read — and approve must refuse to act on an expired item. Default the expiry to one hour, and let it be overridden with an environment variable so we can prove this in class in a few seconds instead of waiting.',
        '     # WHY: silence is not consent. Without this, whether the action eventually fires depends on who happens to be tidying the queue on a Friday afternoon.',
        '  4. Add a command: pending — lists what is waiting, with the risk score, the deciding rule, who it is waiting on and how long is left.',
        '',
        'Then PROVE all four paths, and show me the output of every run:',
        '  a. Run the $2400 refund in the SAFE context (accountAgeDays 730, priorRefundsToday 0, addressChangedAfterOrder false) so it escalates. Confirm NOTHING was written to data/ledger.jsonl. Show me the pending file.',
        '  b. Approve it with your own name. Show me the new ledger line and the resolved pending item.',
        '  c. Approve the SAME actionId a second time. It must do nothing, write nothing, and say the approval was already spent. Show me that the ledger did not grow.',
        '  d. Escalate another one, deny it, and show that no ledger line was ever written.',
        '  e. Escalate a third one with the expiry set to a few seconds, wait for it to pass, then try to approve it. It must refuse because the item expired, and the item must read as denied.',
        '',
        'Finish with one line per path: a, b, c, d, e — what happened and whether the ledger grew.',
      ),
      expectedResult: 'An escalated action that does not run until a named human approves it, an approval that cannot be spent twice, a denial that never runs, and an expired item that is refused and reads as denied.',
      stopCondition: 'You have watched the second approve do nothing, and an unanswered request turn into a denial on its own.',
      rescue: 'If the second approve wrote a second ledger line, the token is not being spent — tell it the pending item must be marked resolved before the action runs and approve must refuse a resolved item. If the expired item was still approvable, the expiry is only checked when it is written, not when it is read.',
    },
    script: L(
      'SITUATION: CP2, and the checkpoint that separates governance from paperwork. Three of the five proofs are things most production systems get wrong.',
      'ROOM: Prompt block on screen. Ask the room to watch specifically for run (c) — the second approval that does nothing.',
      'MOOD: Focused. This is the most sophisticated thing they will build all week and it is worth saying so.',
      'OPEN: "Escalation is where governance normally stops being real. Three things make it a control instead of a form."',
      'DO: Name the three before they paste: the facts travel with the request, the approval is spent once, and silence is a denial. Then have them paste and ADVANCE to CP3 while it runs.',
      'DO: When you come back, ask one person to read run (c) aloud — the second approve — and then run (e), the expiry. Those two are the ones that will be missing from whatever they go back to work on tomorrow.',
      'SAY: One yes, one action, ever. And if nobody answers, the answer is no — said by the system, not by whoever happens to be tidying the queue on Friday.',
      'NOTE: Somebody will point out that a real approver would be notified by email or chat. Agree, and say the notification is the easy half; the hard half is the single-use token and the expiry, which is what they just built.',
    ),
  },
  {
    segment: 'guided-build', eyebrow: '3️⃣ CP3 · Auditable · ⏱ 4–6 min',
    title: 'Replay any decision from one id — then edit your own record and get caught',
    body: 'A record is worth something only if two things are true. It has to be replayable: one id that threads a decision from the proposal through the five factors, the risk score, the verdict, the rule, the approver and the side effect, so that answering "why did this happen" takes a minute. And it has to be tamper-evident: each entry carrying the fingerprint of the one before it, so an edit to any past line is detectable instead of invisible. You will build both, and then you will change one number in your own audit log on purpose and watch the verifier name the row.',
    bullets: [
      'One correlation id per decision, on every line it touches',
      'audit.jsonl is append-only, and each entry carries the hash of the previous one',
      'why <correlationId> — replays proposal → factors → risk → verdict → rule → approver → effect',
      'verify-audit — walks the chain and names the first row that does not match',
      'Then tamper with your own log deliberately, watch it get caught, and put it back',
    ],
    diagram: `flowchart LR
  D["decision"] --> E1["entry n-1<br/>hash A"]
  E1 --> E2["entry n<br/>prev A · hash B"]
  E2 --> W["🔎 why &lt;id&gt;"]
  E2 --> V{"verify-audit"}
  X["✏️ edit a past row"] -.-> E1
  V -->|chain breaks| R["🚨 names the row"]`,
    code: {
      kind: 'paste', pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — CP3: one id, a chained record, replay, and a deliberate tamper (⏱ 4–6 min)',
      code: L(
        'Stay inside ./governance-lab/. Zero dependencies — use the language’s built-in hashing, nothing installed. Run everything yourself; do not print commands for me to copy.',
        '',
        'Make the record replayable and tamper-evident.',
        '',
        '  1. A correlation id generated once per decision, at the moment the agent proposes, and carried on every line that decision touches: the decision record, the pending file, the approval, the ledger line and every log line printed.',
        '     # WHY: at 2 AM, one id should let you follow one action through every place it went. Without it you are grepping timestamps and hoping.',
        '  2. An append-only data/audit.jsonl. Every entry is one JSON object with: correlationId, at, event (proposed | evaluated | escalated | approved | denied | expired | executed), the relevant detail, prevHash and hash.',
        '     hash = a SHA-256 of the previous entry’s hash concatenated with a stable serialisation of this entry’s own fields (everything except hash itself). The first entry’s prevHash is a fixed genesis value.',
        '     # WHY: each entry carries the fingerprint of the one before it, so the record does not have to be trusted — it can be checked.',
        '  3. A command: why <correlationId> — prints that decision as a readable story in order: what was proposed, the five factors, the risk score, the verdict and the rule with its reason, who approved or denied it and when, and whether a side effect fired. This is what you would paste into an incident review.',
        '  4. A command: verify-audit — walks data/audit.jsonl from the start, recomputes each hash, and reports either that the chain is intact with a count of entries, or the exact line number and correlationId of the FIRST entry that does not match.',
        '',
        'Then PROVE it:',
        '  a. Run the four agent modes and one escalate-then-approve cycle, so the audit log has a mix of allowed, denied, escalated and approved decisions.',
        '  b. Pick the correlation id of the approved one and run why on it. Show me the full replay. It should read like a story with no gaps.',
        '  c. Run verify-audit. It must report the chain intact.',
        '  d. NOW TAMPER, on purpose: edit ONE past entry in data/audit.jsonl directly — change a refund amount, or change a denied verdict to approved — leaving everything else alone. Do not update any hashes.',
        '  e. Run verify-audit again. It must fail and name the exact line and correlationId where the chain first breaks. Show me that output.',
        '  f. Put the original value back, run verify-audit once more, and show me the chain intact again.',
        '',
        'Finish with one sentence: what would somebody have to do to change a past decision without being detected, and why that is much harder than editing a log file.',
      ),
      expectedResult: 'A replay of one decision that reads as a complete story, a verify that passes, a deliberate one-character edit that makes verify fail and name the exact row, and a restore that makes it pass again.',
      stopCondition: 'You have watched your own verify-audit catch your own edit and name the row.',
      rescue: 'If verify-audit still passes after the tamper, it is recomputing the whole chain from the current file instead of checking each stored hash — tell it to compare the STORED hash against the recomputed one, entry by entry. If why has gaps, the correlation id is being regenerated somewhere instead of carried through.',
    },
    script: L(
      'SITUATION: CP3, the last checkpoint and the best moment of the week. Everything before this decided what happens. This decides whether anybody can ever prove it.',
      'ROOM: Prompt block on screen. Step (e) is what you want the room looking at — the verifier naming a row.',
      'MOOD: Closing energy, then a genuine pause at the tamper. Let the room enjoy it.',
      'OPEN: "You are about to be told to cheat. Edit your own audit log, change a number, and see whether your system notices."',
      'DO: Paste, then ADVANCE — two quick polls run while this builds, then the break, which is the catch-up window. After the break, ask somebody to read their verify-audit failure out loud: a line number and an id.',
      'SAY: The record does not have to be trusted. It has to be checkable. That is a different and much cheaper thing to build.',
      'DO: Ask the room what it would take to tamper without being caught — you would have to rewrite every entry after the one you changed. Somebody will say it. That is the answer to the closing question in the prompt.',
      'NOTE: If a student asks whether a determined insider could still rewrite the whole chain, say yes, and that the next step in a real system is publishing the head hash somewhere they do not control. Do not build it tonight.',
    ),
  },

  /* ============================== failure ============================= */
  {
    segment: 'failure', eyebrow: '💥 BREAK it on purpose · ⏱ 2–4 min',
    title: 'Take the gate out, run the same four actions, and count what went out the door',
    body: 'Now see what tonight was for. Claude Code makes a copy of the agent inside the folder with the gate removed entirely — no policy, no escalation, no audit chain — and runs the same four actions against it. Count the money. Count the deleted records. Count the rows exported and the people emailed. Then count how many humans would have to be told. Every run will exit cleanly, and that is the part worth sitting with.',
    bullets: [
      'A throwaway copy at governance-lab/ungoverned/ — no gate, no policy, no approval, no chain',
      'The same four modes, pointed at ungoverned/data/ so the real ledger is untouched',
      'Count: dollars moved · records deleted · rows exported · people emailed',
      'Then: how many individuals would have to be notified, and by when',
      'Every run exits zero. Nothing errors. Nothing alerts.',
    ],
    diagram: `flowchart LR
  N["🚫 ungoverned copy<br/>no gate · no queue · no chain"] --> A["💸 $2,440 moved"]
  N --> B["🗑️ 1 record deleted"]
  N --> C["📧 40,000 emailed"]
  N --> D["✅ exit code 0"]
  D --> Q["🤷 nothing noticed"]`,
    code: {
      kind: 'paste', pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — BREAK: an ungoverned copy, the same four actions, and a count (⏱ 2–4 min)',
      code: L(
        'Stay inside ./governance-lab/. Do not change the working agent. Run everything yourself; do not print commands for me to copy.',
        '',
        'Make a copy of the agent at governance-lab/ungoverned/ with the gate removed entirely: no policy evaluation, no escalation, no approval, no audit chain. The agent proposes and the action is carried out. Point the copy at ungoverned/data/ so the real ledger, decisions log, pending folder and audit chain are untouched.',
        '  # WHY: this is what most systems with a capable agent look like today. Nothing here is malicious. It is just missing.',
        '',
        'Run all four modes against the ungoverned copy and report, for each: what was proposed, what was carried out, and the exit code.',
        '',
        'Then give me the totals across the four runs:',
        '  a. Total dollars moved.',
        '  b. Customer records deleted, and whether any of them had orders attached.',
        '  c. Rows exported, and how many individual people would therefore have to be notified.',
        '  d. Emails sent.',
        '  e. How many of the four runs produced an error, a warning, or any signal at all that something had gone wrong.',
        '',
        'Then look at ungoverned/data/ and tell me, in one line each: could you reconstruct WHY any of those four actions happened, and could you prove that the record of them had not been altered?',
        '',
        'Finish with four lines, one per run: what a customer, or a regulator, would experience in each case.',
      ),
      expectedResult: '$2,440 moved, one customer record with orders deleted, 40,000 rows exported and 40,000 people emailed, four clean exits, no signal of any kind — and no way to reconstruct or verify any of it.',
      stopCondition: 'You have a count of people who would have to be notified, and the answer to (e) is zero.',
      rescue: 'If it refused to build the ungoverned copy, say it is a throwaway inside the lab folder that writes to a local file only, nothing leaves the machine, and the missing gate is the lesson. If the counts are not obviously worse than the governed agent, the copy still has the gate wired in somewhere, or it is sharing data/ with the real one.',
    },
    script: L(
      'SITUATION: The break. Everything they built tonight, removed from a copy, and the same four actions run against it. This is the highest-retention segment of the night — do not hide anything.',
      'ROOM: Prompt block on screen. After it runs you want four numbers read aloud: dollars, records, people notified, and the count of warnings.',
      'MOOD: Slightly theatrical. This is the fire drill with the extinguishers taken off the wall.',
      'OPEN: "Now we find out what tonight was for. Same agent, same four requests, no gate."',
      'DO: Have one person read their totals. Two thousand four hundred and forty dollars. One customer with orders, gone. Forty thousand people to notify. Let each number sit.',
      'DO: Then ask for the answer to (e) — how many of the four produced any signal at all. Zero. Ask the room how they would have found out. Somebody says "the customer tells us". That is the whole point.',
      'SAY: Nothing crashed. Nothing alerted. Four green runs, and every one of them was a decision nobody made.',
      'NOTE: If somebody objects that a real system would have logging, agree — and ask what the log would let them do about an action that already fired. Logging is a record of the loss. The gate is the thing that prevents it.',
    ),
  },
  {
    segment: 'failure', eyebrow: '🛡️ HARDEN · ⏱ 2–4 min',
    title: 'Same four actions, governed, one clean end state — then write the four answers down',
    body: 'Run the identical four actions against the real agent. One allowed and recorded. Two refused by name, with the rule and the fact. One parked for a human who is actually able to decide. Then write the four answers every governed system owes in writing: what it is allowed to do and who decided, what happens to an action nobody wrote a rule for, which actions need a human and what happens if that human never answers, and — the honest one — what is still not governed here. Then commit the folder, and only the folder.',
    bullets: [
      'The same four modes on the real agent → a side-by-side table the governed side wins on every row',
      'GOVERNANCE.md: four questions, four honest paragraphs, real rule ids from your policy',
      'Question 4 must name what can still reach a side effect without passing the gate',
      'Delete ungoverned/. Commit ONLY governance-lab/. Nothing else in the repo is in it.',
    ],
    diagram: `flowchart LR
  R["🛡️ governed agent"] --> A["✅ $40 allowed"]
  R --> B["🛑 $2,400 refused<br/>by name"]
  R --> C["🛑 delete + export<br/>refused"]
  R --> D["🙋 borderline<br/>parked for a human"]
  A --> M["📄 GOVERNANCE.md<br/>4 answers"]
  B --> M
  C --> M
  D --> M
  M --> G["✅ commit<br/>the folder only"]`,
    code: {
      kind: 'paste', pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — HARDEN: the governed agent under the same four actions, GOVERNANCE.md, one clean commit (⏱ 2–4 min)',
      code: L(
        'Stay inside ./governance-lab/. Run everything yourself; do not print commands for me to copy.',
        '',
        'Run the identical four actions against the REAL governed agent and show me every decision:',
        '  a. normal   → allowed, one ledger line, and a correlation id you can replay.',
        '  b. generous → refused, with the rule id and the failing fact in the reason.',
        '  c. sloppy   → refused, with the rule id.',
        '  d. rogue    → refused, with the rule id, and nothing exported or emailed.',
        'Then put the ungoverned and governed results side by side in one table: dollars moved, records deleted, people emailed, decisions you can reconstruct, and whether the record can be proven unaltered.',
        '',
        'Then write governance-lab/GOVERNANCE.md answering four questions in plain language, one short paragraph each, using the real rule ids from your policy file:',
        '  1. What is this system allowed to do, and where is that written down?',
        '  2. What happens to an action that matches no rule, and why is that the default?',
        '  3. Which actions require a human, who is that human, and what happens if they never answer?',
        '  4. What is NOT governed here? Be honest and specific: anything that can reach a side effect without passing the gate, anything a person with file access could still do, what happens if two approvals race, and what your risk scoring gets wrong.',
        '  # WHY: the fourth answer is the one that separates a system you can defend from one you can only demo.',
        '',
        'Delete the ungoverned/ copy. Then commit ONLY the governance-lab folder — stage nothing outside it — with a message that says what the agent is now prevented from doing. Show me the commit and confirm that nothing outside the folder is in it. Do not push.',
      ),
      expectedResult: 'A side-by-side table where the governed agent wins every row, a GOVERNANCE.md with four honest answers including a specific list of what is not covered, and one commit containing only the lab folder.',
      stopCondition: 'GOVERNANCE.md exists, question 4 names something real that is not governed, and the commit touches nothing outside the folder.',
      rescue: 'If the commit picked up other files, tell it to unstage everything outside governance-lab and commit again. If question 4 says everything is handled, push back — ask what a person with write access to policy.json could do, and what happens if two approvals arrive at once.',
    },
    script: L(
      'SITUATION: The harden, and the close of the build. Same four actions, real agent, one clean end state — then the four answers in writing, then one clean commit.',
      'ROOM: Prompt block on screen. Ask people to read question 4 of their GOVERNANCE.md aloud when it exists — that is the one you want to hear.',
      'MOOD: Calm and a little triumphant. Everything tonight has been building to this table.',
      'OPEN: "Same four requests. Your agent. Watch the table."',
      'DO: Have one person read the side-by-side table. Two thousand four hundred and forty dollars versus forty. Forty thousand people versus nobody. Do not narrate it; let the numbers do it.',
      'DO: Then ask two people to read their question 4 aloud. If either says it handles everything, stop and ask who can edit policy.json. Honest is the grade.',
      'SAY: A system you can defend is one where you can say what it does not cover. That paragraph is worth more than the code above it.',
      'NOTE: The commit must contain only the folder — check one person’s commit on screen. That is the folder rule kept all the way to the end.',
    ),
  },
  {
    segment: 'failure', eyebrow: '🏁 Done means',
    title: 'What you can say now that you could not say on Monday',
    body: 'Monday you had an agent that could move money and nothing in its way. Now you can say four things about a real system, with evidence in the folder: it cannot take an action nobody permitted, and the refusal says which rule and which fact; the expensive decisions go to a named human who has the facts, whose yes works once, and whose silence is a no; every decision can be replayed from one id; and the record of all of it can be proven unedited. Your proof is a recording of the four actions being refused and the audit chain catching your own tamper.',
    bullets: [
      'Nothing ungoverned reaches a side effect — proven by default-deny',
      'Refusals name the rule and the deciding fact — proven by two verdicts on one action',
      'Humans decide the expensive ones, once, and silence denies — proven by four paths',
      'Any decision replayable, and the record provably unedited — proven by your own tamper',
      'Proof: the recording + GOVERNANCE.md, committed in governance-lab/ only',
    ],
    diagram: `flowchart LR
  M["Monday<br/>an agent · no rules"] --> T["Thursday<br/>4 things you can say"]
  T --> P1["🔒 nothing ungoverned acts"]
  T --> P2["🛑 refusals explain"]
  T --> P3["🙋 humans decide, once"]
  T --> P4["🧾 replayable · unedited"]`,
    script: L(
      'SITUATION: The definition of done, said out loud before demos. No code; this is the sentence they take home.',
      'ROOM: Slide up. Nothing to run. This is the last teach slide of the week.',
      'MOOD: Settled. Let the list land.',
      'OPEN: "Monday you had an agent and nothing in its way. Here is what you can say now."',
      'SAY: Nothing ungoverned acts. Refusals explain themselves. Humans decide the expensive ones, once. And the record can be checked rather than trusted. Four sentences, each with a proof in your folder.',
      'DO: Point at the last bullet: the recording of the four refusals and the tamper being caught is the Build Proof.',
      'NOTE: One story card and one last question follow this slide before demos — so do not close the night here. If the clock is past 8:05, run them fast and skip the demos poll; the recording matters more than the vote.',
    ),
  },
];

/* ---------------------------------------------------------- story beats ---- */
const STORY_BEATS = [
  {
    segment: 'result-preview',
    icon: '🛩️', tone: 'violet', eyebrow: 'Before you build — why the boring box matters',
    title: 'For years, aircraft investigations were reconstructed from wreckage and guesswork',
    body: 'When a series of jet airliners came apart in the 1950s, investigators had almost nothing to work with: some metal, some witnesses, and a theory. The change that turned aviation into the safest way to travel was not a better engine. It was a requirement that the aircraft record what it was doing and what the crew were saying, in a box built to survive the thing that destroyed everything else. Suddenly a crash stopped being a mystery to argue about and became a recording to play back.',
    punch: 'You cannot investigate what nobody wrote down, and you cannot trust what anybody could rewrite.',
  },
  {
    segment: 'build-map',
    icon: '📓', tone: 'amber', eyebrow: 'Change of pace — a rule older than computers',
    title: 'The ship’s log was kept in ink, and a mistake was struck through, never erased',
    body: 'Long before anyone wrote an audit requirement, ships and counting houses settled on the same convention. The log is written in ink. Entries go in order. An error is struck through with a single line so the original stays readable, and the correction is written beside it, signed and dated. Erasing was not merely discouraged; a page with an erasure was worth nothing in a dispute, because the whole value of the record was that it could not be quietly improved after the fact.',
    punch: 'A record you can silently change is not a record. It is a draft of whatever you need it to have been.',
  },
  {
    segment: 'failure',
    icon: '🏦', tone: 'cherry', eyebrow: 'The moment it lands',
    title: 'Forty-five minutes, about four hundred and forty million dollars, and every single order was valid',
    body: 'On the first of August 2012, a trading firm called Knight Capital deployed an update and something old woke up with it. For roughly forty-five minutes its systems sent millions of orders into the market. Nothing malfunctioned in the sense anyone would recognise: every order was well-formed, correctly routed and accepted. By the time it was stopped the firm had lost around four hundred and forty million dollars, roughly four times its annual profit, and it did not survive the year as an independent company.',
    punch: 'The scariest systems are not the ones that break. They are the ones that work, very fast, at something nobody authorised.',
  },
];

/* --------------------------------------------------------- interactions ---- */
const INTERACTIONS = [
  {
    segment: 'result-preview', kind: 'poll',
    q: 'You just heard what the finished engine does — refuses with a reason, parks the expensive one for a human, expires what nobody answers, replays any decision. Could your Monday agent do any of that right now?',
    options: ['Not a chance', 'Partly — it refuses, but cannot say much about why', 'Mostly, but there is no human step', 'I was not here Monday'],
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
    options: ['My repo with governance-lab/ from Monday', 'My repo, no governance-lab/ yet', 'Claude Code is not open in my repo yet', 'I am not sure which repo'],
    eyebrow: '✅ Readiness', title: 'Three things you need. Which do you have?',
    presenterTip: L(
      'SITUATION: The readiness roll call, run from the phone. The slide before this one carries old text — ignore it and say the real list here.',
      'ROOM: Poll up. Pulse rail visible.',
      'MOOD: Brisk and a little strict. Nobody starts CP0 in the wrong folder.',
      'OPEN: "Tonight you need a laptop, Claude Code signed in and open inside your project repository, and either Monday’s folder or nothing. That is the whole list."',
      'DO: Anyone on options three or four gets sorted before CP0 — ask them to open Claude Code in their repo now, and say the folder rule once more: governance-lab, inside the repo, nothing outside it changes.',
    ),
  },
  {
    segment: 'build-map', kind: 'trivia',
    q: 'The same $2,400 refund is refused for one customer and sent to a human for another, from the same policy file, with nobody editing a rule. What did the work?',
    options: ['The amount', 'The context attached to the request', 'The approver', 'The order the rules were written in'],
    answer: 1,
    reveal: 'The context. Account age, how many refunds already today, whether the address changed after the order — facts about the situation, not about the action. That is what attribute-based means: the verdict is computed from facts, so it can differ without anybody touching the rules. Rule order matters too, and you will get that wrong at least once tonight, but it is not what changed the answer here.',
    eyebrow: '🎯 Knowledge check', title: 'Same action, two verdicts. What changed?',
    presenterTip: L(
      'SITUATION: The one trivia question before the build. It is exactly what CP1 proves in its last run, so it is worth a full minute.',
      'ROOM: Poll up.',
      'MOOD: Quick, then one clear sentence.',
      'OPEN: "One question before you paste anything. Same money, same policy, two different answers. What did it?"',
      'DO: Reveal, then point at CP1 — its final proof is literally this, run twice, with both reason strings printed side by side. If several picked the fourth option, spend ten seconds agreeing that rule order is real and saying it is the next slide’s trap, not this one’s answer.',
    ),
  },
  {
    segment: 'guided-build', kind: 'poll',
    q: 'An approval for the same escalated action arrives twice — the approver clicked, the page hung, they clicked again. What should happen?',
    options: [
      'The action runs twice — they approved twice',
      'The action runs once and the second approval does nothing',
      'The action runs once and the second one errors loudly',
      'It depends how far apart the clicks were',
    ],
    answer: 1,
    reveal: 'Once, and the second does nothing. One human formed one intention. The approval is a token that is spent when it is used, so a duplicate is not a second decision, it is the same decision arriving twice. Erroring loudly is defensible but it punishes the approver for your network, and "it depends on the timing" means you have a race rather than a rule.',
    eyebrow: '🙋 Design check', title: 'They clicked approve twice',
    presenterTip: L(
      'SITUATION: The first of two quick polls after the CP3 prompt is pasted, while it runs. Cheap, and it makes the single-use rule stick.',
      'ROOM: Poll up. CP3 is still running on most screens — that is the point of asking now.',
      'MOOD: Quick.',
      'OPEN: "While that runs: they clicked approve, the page hung, they clicked again. What happens?"',
      'DO: Reveal, then remind them they already proved this in CP2 run (c) — the second approve that wrote nothing. Ask whether anybody got two ledger lines. If somebody did, that is a real bug and worth thirty seconds.',
    ),
  },
  {
    segment: 'guided-build', kind: 'poll', theater: true,
    q: 'An escalated action has been sitting in the approval queue, unanswered, for six days. What is it?',
    options: [
      'Still pending — somebody will get to it',
      'Approved — nobody objected in six days',
      'Denied — it expired',
      'It should be reassigned to a different approver',
    ],
    answer: 2,
    reveal: 'Denied. Silence is not consent. If an unanswered request stays pending forever, whether it eventually fires depends on who happens to be tidying the queue, and that person is not a control. Reassigning is a good operational idea and it does not answer the question — the item still needs a deadline, and the deadline still has to resolve to no.',
    eyebrow: '🎭 Decision theater', title: 'Nobody answered. For six days.',
    presenterTip: L(
      'SITUATION: The second poll while CP3 runs, right before the break. This is the most contested idea of the week and the room will genuinely split.',
      'ROOM: Theater up. Read all four aloud. Expect the first option to lead at first.',
      'MOOD: Argumentative, in a good way.',
      'OPEN: "Six days. Nobody has touched it. Lock a vote."',
      'DO: Reveal, then take somebody who chose the first option and ask who is responsible for that item right now. There is no answer, which is the point. Then the break.',
    ),
  },
  {
    segment: 'failure', kind: 'trivia',
    q: 'The ungoverned copy moved $2,440, deleted a customer, emailed 40,000 people, and every run exited zero. That means…',
    options: ['The system works', 'The agent is broken', 'The system is doing exactly what it was permitted to do', 'The logging is inadequate'],
    answer: 2,
    reveal: 'It did exactly what it was permitted to do, because it was permitted to do everything. No error, no alert, four clean exits. The agent was not broken and the logging would not have helped — a log tells you what already happened. The failures that never announce themselves are the ones this whole week is about.',
    eyebrow: '🎯 Knowledge check', title: 'Four green runs',
    presenterTip: L(
      'SITUATION: The last question of the build, after the story card. The room watched the ungoverned copy do all of that twenty minutes ago; this makes them name what it was.',
      'ROOM: Poll up.',
      'MOOD: Quick.',
      'OPEN: "Four green runs. Forty thousand people. What does that mean?"',
      'NOTE: Reveal, one line, then demos. If anyone picks the last option, one sentence: a log is a record of the loss, not a control.',
    ),
  },
  {
    segment: 'demos', kind: 'poll',
    q: 'Which control convinced you most when you watched the ungoverned copy run without it?',
    options: [
      'The closed default — it stopped things I never wrote a rule for',
      'The reason string — it told me what to change',
      'The human gate — one yes, and silence means no',
      'The chain — it caught me editing my own record',
    ],
    eyebrow: '🎤 Your pick', title: 'Which one convinced you?',
    presenterTip: L(
      'SITUATION: The demos-segment poll. Opinion only; it picks the demo you ask for.',
      'ROOM: Poll up.',
      'MOOD: Loose.',
      'OPEN: "Which one convinced you? No wrong answer."',
      'DO: Ask the top-voted control’s biggest fan to share their screen and show that proof. One demo if the clock is tight, two if not. If the chain wins, make sure the demo is the verify-audit failure — it is the best thing anyone built this week.',
    ),
  },
];

/* ---------------------------------------------------------- slide notes ---- */
const SLIDE_NOTES = {
  'cover:result-preview-0': L(
    'SITUATION: The cover. Class clock not started.',
    'ROOM: Cover on the shared screen. Confirm the room can see the deck and hear you before you say anything else.',
    'MOOD: Settled.',
    'OPEN: "Tonight you finish the engine, and then you get to cheat on your own audit log and find out whether it notices."',
    'DO: Press Start class the moment you begin.',
  ),
  'rules:result-preview-1': L(
    'SITUATION: House rules. Tonight the two that matter: every block is a prompt, and nothing outside governance-lab changes.',
    'ROOM: Rules on screen. Phones out.',
    'MOOD: Brisk.',
    'OPEN: "Same two rules as Monday: every block is a prompt, and everything stays in the one folder."',
    'NOTE: Fifteen seconds.',
  ),
  'segment:result-preview-0': L(
    'SITUATION: The result preview. Say what exists by 8:10 before any checkpoint.',
    'ROOM: The four outcomes on screen — refused with a reason, parked for a human, expired when nobody answers, replayable and provably unedited.',
    'MOOD: Concrete.',
    'OPEN: "By the end of tonight your agent does four things it cannot do right now — and you will have watched a copy without them do all the damage instead."',
    'DO: Read the four outcomes as a list, then the shape of the night: four checkpoints, paste-then-look-up, break it, harden it, finish early.',
  ),
  'storybeat:result-preview-900': L(
    'SITUATION: Change of pace before readiness. The flight recorder — why the boring box is the thing that changed everything.',
    'ROOM: Story card full screen.',
    'MOOD: Steadying.',
    'OPEN: "For years, investigators had wreckage, witnesses and a theory."',
    'SAY: A crash stopped being a mystery to argue about and became a recording to play back.',
    'NOTE: Twenty seconds, then the opening poll and the readiness roll call. Do not connect it to the audit chain yet — CP3 does that, and it lands harder unannounced.',
  ),
  'segment:readiness-0': L(
    'SITUATION: The readiness opener. The text on this slide predates tonight’s from-scratch design and refers to a system built over earlier weeks — IGNORE it and say the real list.',
    'ROOM: Slide up. Do not read it aloud.',
    'MOOD: Brisk.',
    'OPEN: "Ignore the line on the slide. Tonight you need a laptop, Claude Code open inside your project repository, and either Monday’s governance-lab folder or nothing at all."',
    'DO: Go straight to the readiness poll and run the roll call from there.',
  ),
  'buildmap:build-map-0': L(
    'SITUATION: The generated checkpoint map. The rail: CP0 Baseline · CP1 Policy blocks · CP2 Human gate · CP3 Auditable.',
    'ROOM: Map on screen with the rescue branch.',
    'MOOD: Decisive.',
    'OPEN: "Four checkpoints. We move together. Nobody goes past one until the room is through it — and the rescue branch is one prompt, so nobody gets stranded."',
    'DO: Walk the boxes left to right, then point at the rescue branch. Then the roadmap slide, which has the timings.',
  ),
  'checkpoint:build-map-1': L(
    'SITUATION: CP0 on the rail. Everyone starts here; the prompt verifies or builds.',
    'ROOM: Checkpoint slide. Pulse rail ready.',
    'MOOD: Brisk.',
    'OPEN: "Checkpoint zero: the agent, the action it carries out, one rule and a default that refuses everything else — verified or built by one prompt."',
    'NOTE: Do not linger on the rail slides. The guided-build slides carry the prompts.',
  ),
  'checkpoint:build-map-2': L(
    'SITUATION: CP1 on the rail — policy blocks.',
    'ROOM: Checkpoint slide.',
    'MOOD: Brisk.',
    'OPEN: "Checkpoint one: five factors, a risk score, and a refusal that tells you which rule and which fact."',
    'NOTE: Ten seconds. The proof is the same refund getting two different verdicts.',
  ),
  'checkpoint:build-map-3': L(
    'SITUATION: CP2 on the rail — the human gate.',
    'ROOM: Checkpoint slide.',
    'MOOD: Brisk.',
    'OPEN: "Checkpoint two: the expensive one waits for a named human, whose yes works exactly once, and whose silence is a no."',
    'NOTE: Ten seconds.',
  ),
  'checkpoint:build-map-4': L(
    'SITUATION: CP3 on the rail — auditable. The best checkpoint of the week.',
    'ROOM: Checkpoint slide.',
    'MOOD: Brisk, with a hint of what is coming.',
    'OPEN: "Checkpoint three: replay any decision from one id, and then edit your own record on purpose and see whether it catches you."',
    'NOTE: Ten seconds. This is the last rail slide — the story card and one trivia question come next, then CP0 and the first prompt.',
  ),
  'storybeat:build-map-900': L(
    'SITUATION: Change of pace before the first prompt. The ship’s log kept in ink.',
    'ROOM: Story card full screen.',
    'MOOD: Storyteller. Slow down for thirty seconds.',
    'OPEN: "Long before anybody wrote an audit requirement, ships and counting houses settled on the same convention."',
    'SAY: A page with an erasure was worth nothing in a dispute, because the whole value of the record was that it could not be quietly improved afterwards.',
    'NOTE: Then one trivia question, and then CP0. Do not tell them CP3 builds exactly this — let it arrive.',
  ),
  'break:reset-0': L(
    'SITUATION: Ten minutes, and the catch-up window. CP3 is still running for some of the room.',
    'ROOM: Break slide up. Clear the stuck queue on the phone — anyone still on CP0 or CP1 gets the rescue lines now.',
    'MOOD: Loose.',
    'OPEN: "Ten minutes. If you are behind a checkpoint, this is where you catch up — the rescue lines are under each prompt."',
    'DO: Use the break to check one person’s verify-audit output on their screen, so you know the room is ready for the BREAK prompt.',
  ),
  'storybeat:failure-900': L(
    'SITUATION: The closing story of the build, after the definition of done. Knight Capital — the machine that worked perfectly at something nobody authorised.',
    'ROOM: Story card full screen.',
    'MOOD: Quiet.',
    'OPEN: "On the first of August 2012, a trading firm deployed an update, and something old woke up with it."',
    'SAY: Every order was well-formed, correctly routed and accepted. Nothing malfunctioned in any sense a monitoring dashboard would recognise.',
    'NOTE: Tie it back to the four green runs they watched twenty minutes ago, then the last trivia question, then demos.',
  ),
  'demos:demos-0': L(
    'SITUATION: Demos. One or two students share their screen; the side-by-side table from HARDEN, or the verify-audit failure, is the thing to show.',
    'ROOM: Ask the top-voted pick from the demos poll to share. Name the person and wait for their screen.',
    'MOOD: Celebratory.',
    'OPEN: "Show me the table. Two thousand four hundred and forty versus forty. Forty thousand people versus nobody."',
    'DO: One demo if the clock is past 8:00, two if not. Ask each presenter to read question 4 of their GOVERNANCE.md as their closing line.',
  ),
  'broadcast:broadcast-0': L(
    'SITUATION: The 30-second Build Proof. Tonight’s proof is the refusal and the tamper — the ungoverned copy doing all of it, the governed agent refusing by name, and verify-audit catching an edit.',
    'ROOM: Broadcast slide up with the prompts.',
    'MOOD: Warm and quick.',
    'OPEN: "Thirty seconds on your phone: what your agent wanted to do, what stopped it, and what happened when you tried to edit the evidence."',
    'DO: Say where it goes: inside governance-lab, next to GOVERNANCE.md, committed with the folder. Nothing outside it.',
  ),
  'beforeafter:cta--1': L(
    'SITUATION: The before/after payoff. Left column is Monday at 6:30; right column is now.',
    'ROOM: Two columns on screen.',
    'MOOD: Let it sit.',
    'OPEN: "Left column, Monday. Right column, now."',
    'DO: Pause. Do not read the rows aloud — the room reads faster than you talk.',
  ),
  'assignment:cta-0': L(
    'SITUATION: The assignment slide. The proof is the recording of one blocked action, one escalated and approved action, and one audit replay — exactly the HARDEN run plus the CP3 tamper.',
    'ROOM: Brief on screen.',
    'MOOD: Clear.',
    'OPEN: "Here is what you owe by Friday, and what counts as proof: one blocked action, one escalated action, one replay from a single id, and GOVERNANCE.md — all committed inside governance-lab."',
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
// The from-scratch rule, made mechanical. Week 10, so the window is weeks 1-9.
const PRIOR_REFS = [
  /\bweeks?\s*[1-9]\b/i, /\bW[1-9]\b/, /\bW[1-9][–-][1-9]\b/, /\borientation\b/i, /\bdragon\b/i,
  /\bintensive\s*[1-4]\b/i, /\blast (week|time|session|class)\b/i, /\bcapstone\b/i,
  /\breliability-lab\b/i, /\border desk\b/i,
  /\byou (already )?built (in|on|last|earlier)\b/i, /\bearlier (in|this) (the )?(program|cohort|course)\b/i,
];
const BUILD_SEGMENTS = ['result-preview', 'readiness', 'build-map', 'guided-build', 'reset', 'failure', 'demos', 'broadcast', 'cta'];
// The non-overridable rail from classSessionPlan.ts week 10. Guided-build
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
      if (!/governance-lab/.test(s.code.code)) bad.push(label + ': prompt does not name the lab folder');
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
