/**
 * session18-week9-monday.js — Session 18, Monday 2026-09-21, "Week 9 ·
 * Architecture Day" (Reliability Engineering + Quality Layer), rebuilt FROM
 * SCRATCH as a full KitConfig replacement.
 *
 * WHY THIS EXISTS
 * Ali, 2026-09-21: "I would like to have the lessons start from scratch.
 * Whatever we build needs to be built from scratch … Built from scratch means
 * we aren't referencing anything we built prior. Every part of the lesson
 * should be built in this lesson. Mon should not have anything prior to
 * today." And: "build all of this in a temp folder because it will be in
 * their same project repo but we don't want it to affect their normal
 * project."
 *
 * The authored week9.ts pack is the opposite of that — 23 Monday slides built
 * on call-backs (the W1–8 ladder, the Week 3 drill, the Orientation dragon,
 * "your Week 8 scheduled job"). So this file does not overlay the pack the way
 * session16-week8-monday.js did; it REPLACES every category: teach, story
 * beats, interactions, opening and slideNotes. The generated slides that pull
 * fixed text from classSessionPlan.ts (tension, architecture beats, the
 * example, the micro-build lead, the trailer) are week-neutral and stay.
 *
 * THE SPINE — "the vendor who has a bad night"
 * Every business depends on somebody else's server. Tonight each student
 * builds, from an empty folder, a tiny order desk that depends on one vendor,
 * and builds the vendor too — with a switch (ok · slow · down · garbage) so it
 * misbehaves on command. Then the five decisions you make about a vendor who
 * has a bad night. Thursday finishes the wrap and breaks it on purpose.
 *
 * THE FOLDER RULE
 * Everything lives in ./reliability-lab/ inside the student's own repository,
 * with its own package file, zero dependencies and its own .gitignore. Every
 * build prompt says so, and says: nothing outside the folder is created,
 * edited or deleted; if the parent's tooling would pick the folder up, report
 * and ask before touching anything.
 *
 * SHAPE (Ali: "I'd rather finish early than not be able to make it through")
 *   12 teach slides (authored: 23) · 2 live builds (~4 min each, paste then
 *   ADVANCE while it runs) · 7 questions · 3 story beats. Target finish 8:10.
 *
 * Run inside the container:  node /app/session18-week9-monday.js [--dry]
 * Local, no DB:              node session18-week9-monday.js --check
 * Rollback: the BEFORE line printed at the top of the run, or
 *           UPDATE live_sessions SET kit_config_json = NULL WHERE id = SID.
 */

const SID = 'eafa22ed-874b-4afb-a1d3-d9829da257c7';
const WEEK = 9;
const L = (...lines) => lines.join('\n');

/* ------------------------------------------------------------- opening ---- */
const HOOK = {
  headline: 'A system you have never watched fail is a system you cannot trust.',
  caption: 'Tonight you build a small business, give it a vendor with a bad temper, and watch what happens.',
};

const COLD_OPEN = {
  title: 'By Thursday, this will exist',
  body: 'A tiny order desk that depends on one outside vendor. The vendor hangs, the vendor goes down, the vendor sends back nonsense, the same order arrives twice — and the desk sends exactly one correct confirmation, parks what it could not do, and hands you a receipt for all of it. Built from an empty folder, inside your own repository, without touching your project.',
};

/* ---------------------------------------------------------------- teach ---- */
const TEACH = [
  /* ============================ check-in ============================== */
  {
    segment: 'checkin', eyebrow: '🧭 The shape of tonight',
    title: 'One empty folder, one vendor, and nothing you built before',
    body: 'Tonight starts from nothing on purpose. You will create a folder called reliability-lab inside your project repository, and everything you build lives there; nothing outside it changes. Inside it you build a tiny order desk and the vendor it depends on, and you build the vendor with a switch so it can misbehave on command. Every block on screen tonight is a prompt for Claude Code. You never type into a terminal.',
    bullets: [
      'A new folder in your repo: reliability-lab/. Your project is not touched.',
      'Two things get built: a desk that confirms orders, and the vendor it calls',
      'The vendor has a switch: ok · slow · down · garbage',
      'Every block is a Claude Code prompt. Claude Code drives the terminal.',
      'Two builds tonight, about ten minutes of running time. We finish early.',
    ],
    diagram: `flowchart LR
  Repo["📁 your repo"] --> Lab["📁 reliability-lab/<br/>new · isolated"]
  Lab --> Desk["🧾 desk<br/>confirms an order"]
  Desk --> Vendor["🏭 vendor<br/>ok · slow · down · garbage"]
  Desk --> Log["📄 sent.log"]`,
    script: L(
      'SITUATION: First teach slide. The room needs one thing settled before anything else: nothing from before tonight is needed, and nothing of theirs gets touched.',
      'ROOM: Diagram up. Your own repo open in a second window with NO reliability-lab folder in it yet — you build alongside them tonight.',
      'MOOD: Calm and a little brisk. This is a contract, not a lecture.',
      'OPEN: "Everything you need tonight is a laptop, Claude Code signed in, and an empty folder that does not exist yet."',
      'DO: Say the folder rule out loud, once, plainly: reliability-lab, inside your repo, nothing outside it changes. Then say the pace: two builds, about ten minutes of running time, and we finish early.',
      'NOTE: Somebody will ask whether this connects to their project. The answer is: it lives in your repo and it does not touch your project. Same answer every time it comes up.',
    ),
  },

  /* ======================== business problem ========================== */
  {
    segment: 'business-problem', eyebrow: '🎭 The uncomfortable truth',
    title: 'A perfect demo record means nobody has tried to break it',
    body: 'A demo is a specific set of conditions: the happy path, every dependency awake, one request at a time, and you watching. Production is the inverse. The vendor times out, the vendor returns an error, the same event arrives twice, two requests land in the same second. A green demo proves a happy path exists. It proves nothing else, and the industry has spent decades confusing the two.',
    bullets: [
      'Demo = happy path · dependencies up · one at a time · you watching',
      'Production = timeouts · errors · duplicates · concurrency',
      'A perfect record means nobody has tried to break it',
      'Reliability is built on purpose. It is never inherited.',
    ],
    diagram: `flowchart LR
  D["🎬 The demo<br/>happy path only"] --> G["✅ It worked"]
  P["🏭 Production"] --> T["⏱️ Timeouts"]
  P --> F["💥 Errors"]
  P --> DUP["👯 Duplicates"]
  P --> C["🔀 Concurrency"]`,
    script: L(
      'SITUATION: First business slide. Turn "it worked in the demo" into "nobody has tested it".',
      'ROOM: Diagram up. Nothing to run. Keep your hands off the keyboard for the whole segment.',
      'MOOD: Level and a little uncomfortable. This is the clip that gets shared; keep syntax out of it.',
      'OPEN: "How many of you have ever run something you built against a dependency that was failing on purpose?"',
      'DO: Wait for hands. There will be almost none. Hold the silence for three full seconds before you speak.',
      'NOTE: That silence is the thesis of the whole week. Do not rescue the room from it — name it: a perfect record means nobody has tried.',
    ),
  },
  {
    segment: 'business-problem', eyebrow: '💳 The consequence',
    title: 'One network blip. Two charges on one customer’s card.',
    body: 'Here is the failure an executive feels. A payment succeeds, the receipt write hits a dropped connection, the code throws, the retry does its job, and the charge runs again. Every line executed exactly as written. Somewhere a person sees two identical amounts on a statement, and no explanation about a network blip makes that feel like anything other than being taken from.',
    bullets: [
      'Charge succeeds → receipt write fails → throw → retry → charge again',
      'Every line was correct. The system was wrong.',
      'It is not an outage. It is a betrayal.',
      'Tonight’s desk has the same shape: ask a vendor, then do something a customer notices',
    ],
    diagram: `flowchart LR
  A["💳 charge OK"] --> B["📝 write receipt"]
  B -- "connection drops" --> C["💥 throw"]
  C --> R["🔁 retry from the top"]
  R --> A2["💳 charge AGAIN"]`,
    script: L(
      'SITUATION: The story the whole week hangs on. It comes back in the deconstruct segment line by line, and on Thursday as a test that passes with the wrong number.',
      'ROOM: Diagram up. Tell it, do not read it — five steps, said slowly.',
      'MOOD: Quiet. No villain. That is what makes it frightening.',
      'OPEN: "Nobody wrote a bad line of code here. Watch."',
      'SAY: The charge worked. The receipt did not. The code did what it was told and tried again. The charge worked a second time.',
      'DO: Ask the room where the bug is. Let two people argue. The answer — there is no bug, the handler was never safe to run twice — is the sentence you want somebody else to say.',
      'NOTE: Point at the desk on the last bullet: tonight’s build has exactly this shape. Ask a vendor, then do a thing a customer notices.',
    ),
  },

  /* =========================== architecture =========================== */
  {
    segment: 'architecture', eyebrow: '🧅 The wrap',
    title: 'Five decisions, wrapped around one call, in a fixed order',
    body: 'Every outside call your system makes gets wrapped in the same five decisions, and the order is not optional. Inside: how long you will wait. Around that: how many times you will try. Around that: when you stop calling altogether, and what you do instead. Above all of it: a rule that the same event can never cause the same side effect twice. And on the way out: a check that what came back is worth using.',
    bullets: [
      '1 · Timeout — how long you wait for one attempt',
      '2 · Capped retry — how many attempts, with a growing gap',
      '3 · Breaker + fallback — when you stop calling, and the plan B',
      '4 · Idempotency — the same event, never the same side effect twice',
      '5 · Quality gate — is what came back worth using?',
    ],
    diagram: `flowchart LR
  K["♻️ 4 · idempotency key"] -.-> B
  B["🔌 3 · breaker"] --> R["🔁 2 · retry"]
  R --> T["⏱️ 1 · timeout"]
  T --> V["🏭 vendor"]
  V --> G["🚦 5 · gate"]
  G --> Out["✅ trusted output"]`,
    script: L(
      'SITUATION: The map for the biggest teaching block. Everything after this is one of these five numbers.',
      'ROOM: Diagram full screen. Put the five words on the board — timeout, retry, breaker, key, gate — and leave them up all night.',
      'MOOD: Confident and unhurried. This is the slide they should still be able to draw in a month.',
      'OPEN: "Five decisions. Two of them you build tonight, three on Thursday, and the order they nest in is a design decision, not a habit."',
      'DO: Trace the nesting with your finger, inside to outside: the timeout is around ONE attempt, the retry is around the timeout, the breaker is around the whole retry. Then the key above, the gate on the way out.',
      'NOTE: Do not explain any of the five here. Name them, show the nesting, move. The next three slides do the explaining.',
    ),
  },
  {
    segment: 'architecture', eyebrow: '⏱️ Decisions 1 + 2',
    title: 'How long do you wait, and how many times?',
    body: 'A call with no timeout is an outage that has not finished happening yet: the process waits forever, the queue behind it grows, and nothing reports a problem. So every attempt gets a deadline. When it fails, you try again, but with a ceiling on attempts, a gap that grows each time, and a little randomness so a thousand clients do not all retry in the same second. And you only retry what might succeed next time: a timeout or a server error, yes; a rejected request, never.',
    bullets: [
      'No timeout = the wait never ends and nothing reports it',
      'Cap the attempts. Three is a number; forever is not.',
      'Grow the gap (1s, 2s, 4s) and add jitter so you do not become the storm',
      'Retry a timeout or a 5xx. Never retry a 4xx: your request was wrong.',
    ],
    diagram: `flowchart LR
  A1["attempt 1<br/>⏱️ 2s deadline"] -- fail --> W1["wait 1s ± jitter"]
  W1 --> A2["attempt 2<br/>⏱️ 2s deadline"]
  A2 -- fail --> W2["wait 2s ± jitter"]
  W2 --> A3["attempt 3<br/>⏱️ 2s deadline"]
  A3 -- fail --> X["❌ give up, clearly"]`,
    script: L(
      'SITUATION: Decisions 1 and 2 — the two the room builds tonight in build 2. Keep it concrete; they will see every word of this on their own screen in forty minutes.',
      'ROOM: Diagram up. Have the numbers ready: two-second deadline, three attempts, gaps of one, two, four.',
      'MOOD: Practical. This is arithmetic, not philosophy.',
      'OPEN: "What is the longest your system would wait for a vendor right now? If you do not know, the answer is forever."',
      'DO: Ask the room what happens if a thousand clients all retry a struggling vendor at exactly the same second. Somebody will say "they kill it". That is jitter, explained.',
      'SAY: You retry what might work next time. A timeout might. A server error might. A rejected request will be rejected again, slower and at your expense.',
      'NOTE: The 4xx-versus-5xx line is the trivia question later; plant it here without answering it.',
    ),
  },
  {
    segment: 'architecture', eyebrow: '🔌 Decision 3',
    title: 'When do you stop calling, and where does the work go?',
    body: 'If the vendor has failed three times in a row, the fourth call is not optimism; it is load on a system that is already down. A circuit breaker counts consecutive failures and, past a threshold, opens: calls fail instantly without leaving your process, until a cooldown passes and one probe call is allowed through. While it is open you need a plan. Degrade if you can: a plain template message instead of the vendor’s. Park it if you cannot: a dead-letter file with the reason, so the work is not lost and can be replayed. Losing it is never an option.',
    bullets: [
      'Breaker: N failures in a row → open → fail fast → one probe after a cooldown',
      'Fallback: a degraded answer you can stand behind',
      'Dead-letter: park the work with the reason, replay it later',
      'Silent loss is the only outcome that is never acceptable',
    ],
    diagram: `flowchart LR
  C["call"] --> CB{"breaker"}
  CB -->|closed| V["🏭 vendor"]
  CB -->|open| FB["🪂 fallback"]
  V -- fails --> N["count += 1"]
  N -->|"≥ 3 in a row"| O["open 🔴"]
  FB -. cannot .-> DL["📥 dead-letter"]`,
    script: L(
      'SITUATION: Decision 3, built on Thursday. Tonight the room only needs the picture and the reason.',
      'ROOM: Diagram up. Point at the diamond — that is the only decision on the slide.',
      'MOOD: Reasonable. You are describing what a sensible person does with a vendor who is not picking up.',
      'OPEN: "If somebody has not answered the phone three times in a row, what does the fourth call achieve?"',
      'DO: Take one answer. Then land the two exits: degrade if you can, park it if you cannot. Ask the room which one their business could live with for an hour.',
      'SAY: Lose it never. Everything else on this slide is negotiable; that line is not.',
      'NOTE: Do not go into cooldowns and half-open states beyond one sentence. Thursday’s CP1 prompt carries all of that inside it.',
    ),
  },
  {
    segment: 'architecture', eyebrow: '♻️ Decision 4 — the one to remember',
    title: 'The key comes from the event, not from the attempt',
    body: 'Idempotency means the same operation, run twice, leaves the world the way one run would have. The mechanism is a key, claimed before the side effect fires, and stored. The trap is where the key comes from. A fresh ID generated at the top of each attempt is unique every time, so every retry looks new and the protection is worthless. The key has to come from the thing that happened: the order number, the payment event, the message ID. Same event, same key, one send.',
    bullets: [
      'Claim the key BEFORE the side effect, not after',
      'Key = the event (order id), never the attempt (a new UUID)',
      'Second run finds the key → returns the stored result → sends nothing',
      'This is the difference between an outage and a double charge',
    ],
    diagram: `flowchart LR
  E["📨 order 1001<br/>arrives twice"] --> K["key = order:1001"]
  K --> Q{"seen?"}
  Q -->|no| S["claim → send → store"]
  Q -->|yes| R["return stored<br/>send nothing"]`,
    script: L(
      'SITUATION: Decision 4, and the one sentence to remember from tonight. The theater poll fires from this slide.',
      'ROOM: Diagram up. Have the four poll options ready to read aloud.',
      'MOOD: Slow. This is the slide people get wrong in production, confidently.',
      'OPEN: "Where does the key come from?"',
      'DO: Run the theater poll BEFORE you explain the trap. The room will split between "check right before sending" and "a fresh ID each attempt". Let them.',
      'SAY: The key comes from the event, not from the attempt. Same order, same key, one send.',
      'NOTE: Then reveal, and close the double-charge story from the business segment: a key claimed before the charge would have made it impossible.',
    ),
  },

  /* ============================ deconstruct =========================== */
  {
    segment: 'deconstruct', eyebrow: '🔬 Line by line',
    title: 'The double charge, in six steps',
    body: 'Read the naive handler as a story, not as code. Step one, charge the card; it succeeds. Step two, write the receipt; the connection drops. Step three, the handler throws. Step four, the retry, doing exactly what it was told, runs the handler again from the top. Step five, charge the card. Step six, a customer opens their banking app. One of the five decisions would have made this impossible: a key claimed before step one, so the retry finds it and skips the charge.',
    bullets: [
      '1 charge ✅ · 2 receipt 💥 · 3 throw · 4 retry from the top · 5 charge again · 6 the statement',
      'The retry was correct. The handler was not safe to run twice.',
      'Fix: claim the key before step 1; on retry, find the key, skip the charge',
      'Every step was right. That is what makes it dangerous.',
    ],
    diagram: `flowchart LR
  S1["1 · charge ✅"] --> S2["2 · receipt 💥"]
  S2 --> S3["3 · throw"]
  S3 --> S4["4 · retry"]
  S4 --> S5["5 · charge again"]
  S5 --> S6["6 · 📱 statement"]
  K["♻️ key before step 1"] -.would skip 5.-> S4`,
    script: L(
      'SITUATION: The forensics on the business-segment story. Six steps, one X to draw.',
      'ROOM: The six boxes on screen. Step away from the keyboard — this is told, not shown.',
      'MOOD: Methodical. You are building a checklist in front of them, step by step.',
      'OPEN: "Replay it, and mark where a five-line change would have ended it."',
      'DO: Walk the six boxes with your finger. At step four, stop and ask: what does the retry know at this moment? Nothing. It cannot tell whether the charge happened.',
      'SAY: A key claimed before step one is the only thing that could have told it.',
      'NOTE: Do not blame the retry. The retry is correct; the handler was never safe to run twice. That distinction is the whole lesson.',
    ),
  },
  {
    segment: 'deconstruct', eyebrow: '🚫 Not style nits',
    title: 'Three patterns that are production defects, not opinions',
    body: 'Three things you will see in real code that look like preferences and are not. An empty catch block swallows the failure, so nothing retries, nothing parks the work and nothing tells anyone. A retry with no cap is a machine for turning a bad night into a bill. And catching everything as a generic error throws away the one fact you needed: was this a timeout, a rejection or an outage? Each has a different correct response, and a generic error cannot tell you which.',
    bullets: [
      'try { … } catch (e) {} — the failure vanishes',
      'retry forever — the bill grows and the vendor drowns',
      'catch (Error) — you no longer know WHICH failure, so you cannot respond correctly',
      'Name the failure: TimeoutError · UpstreamUnavailable · BadResponse',
    ],
    diagram: `flowchart TD
  P["💥 a failure"] --> A["catch {}<br/>vanishes"]
  P --> B["retry forever<br/>the bill"]
  P --> C["generic Error<br/>which one was it?"]
  P --> D["✅ classify → named class → correct response"]`,
    script: L(
      'SITUATION: The last teaching slide before the break. It turns three "style" arguments into defects, and it names the three error classes the room will type in forty minutes.',
      'ROOM: Diagram up. Have the three names ready: TimeoutError, UpstreamUnavailable, BadResponse.',
      'MOOD: Firm. These are not opinions, and you should not present them as debatable.',
      'OPEN: "Three things that look like taste and are actually bugs."',
      'DO: Ask who has written an empty catch block. Everyone has. Then ask what the failure did next. Nothing — it vanished. That is the point.',
      'SAY: Name the failure. A timeout, an outage and a rejection each want a different response, and a generic error cannot tell you which one you have.',
      'NOTE: Point at the fourth box and say those three names out loud — they are what build 2 will print on screen. Then break.',
    ),
  },

  /* ============================ micro-build =========================== */
  {
    segment: 'micro-build', eyebrow: '1️⃣ Build 1 · ⏱ 3–5 min to run',
    title: 'Build the order desk and the vendor it depends on',
    body: 'From nothing. Claude Code creates the reliability-lab folder inside your repository, gives it its own package file so your project is untouched, and builds two things: a vendor with a mode switch, and a desk that asks the vendor for a confirmation message and then sends it. Paste it, watch the folder appear, and then look up: the next slide is taught while this runs.',
    bullets: [
      'A new isolated folder: reliability-lab/ with its own package file, zero dependencies',
      'vendor — modes ok · slow · down · garbage, switched by an environment variable',
      'desk — confirm <orderId>: ask the vendor, append one line to data/sent.log',
      'Paste it. Then advance — the failure table is taught while it builds.',
    ],
    diagram: `flowchart LR
  P["📋 paste"] --> CC["🤖 Claude Code builds"]
  CC --> F["📁 reliability-lab/"]
  F --> V["vendor"]
  F --> D["desk"]
  D --> S["data/sent.log"]`,
    code: {
      kind: 'paste', pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — build the desk and its vendor in an isolated folder (⏱ 3–5 min)',
      code: L(
        'Build a small "order desk" for me, from scratch, in a NEW folder inside this repository: ./reliability-lab/',
        '',
        'RULES FOR EVERYTHING TONIGHT — read them before you write a file:',
        '  - Do not create, edit or delete anything outside ./reliability-lab/. Not the root package file, not any config, not any ignore file. Nothing.',
        '  - Give reliability-lab/ its OWN package file (or the equivalent for the language) so nothing about this project\'s configuration leaks in, and use ZERO dependencies. Nothing gets installed.',
        '  - Use Node.js if it is installed on this machine, otherwise Python 3. Tell me which you chose and why.',
        '  - Before you finish, check whether this project\'s lint, test, typecheck or build would pick the new folder up. If it would, tell me which tool and STOP — do not change anything outside the folder without asking me.',
        '  - Run every step yourself. Do not print commands for me to copy.',
        '',
        'What to build (two small modules, plus a data/ folder for run output):',
        '  1. vendor — a stand-in for an outside AI service that writes confirmation messages. It has a MODE read from the environment variable VENDOR_MODE, default "ok":',
        '       ok      → after ~50 ms, return a good message: "Your order <id> is confirmed and will ship within 2 days."',
        '       slow    → hang for 10 seconds, then return the good message',
        '       down    → fail with a 500-style error',
        '       garbage → return quickly, but with a message that is confidently wrong (a different order number, or beginning "As an AI I cannot")',
        '     # WHY: in real life this is somebody else\'s server. You cannot make a real vendor fail on command, so tonight you own one that can.',
        '  2. desk — a command: confirm <orderId>. It asks the vendor for the message, then "sends" it by appending one JSON line {orderId, message, sentAt} to reliability-lab/data/sent.log.',
        '     # WHY: the append is the side effect a customer would notice. Everything this week is about protecting that one line.',
        '  3. A README.md in the folder: what this is, how to run it, how to set the vendor mode. Six lines is enough.',
        '  4. A .gitignore INSIDE reliability-lab/ that ignores data/ — run output is not source.',
        '',
        'Then run it once on the happy path for order 1001 and show me: the command you ran, the vendor\'s message, and the new line in data/sent.log.',
        '',
        'Finish with two sentences: what would happen right now if the vendor were in "slow" mode, and what would happen in "down" mode. Do not fix either yet.',
      ),
      expectedResult: 'A new reliability-lab/ folder with its own package file, a vendor with four modes, a desk that confirms an order and appends one line to data/sent.log, one happy-path run on screen — and nothing outside the folder changed.',
      stopCondition: 'You can see one line in reliability-lab/data/sent.log, and Claude Code confirmed it touched nothing outside the folder.',
      rescue: 'If it touched anything outside reliability-lab/, tell it to revert that and re-read the rules. If it tried to install a package, say "zero dependencies" and re-paste. If it asked which language, answer and let it continue.',
    },
    script: L(
      'SITUATION: Build 1. The folder does not exist yet; in four minutes it does. The only job on this slide is getting everyone to paste and then look up.',
      'ROOM: Prompt block on screen. Paste it into your own Claude Code at the same moment they do, so you can show a real folder appearing if theirs drifts.',
      'MOOD: Brisk. Paste, confirm the language question if it asks, then eyes up.',
      'OPEN: "Paste this, and while it builds, look up here — the next slide is the specification for everything else this week."',
      'DO: Watch the pulse for thirty seconds — long enough to catch anyone whose Claude Code is not open in their repo. Then ADVANCE to the failure table. Do not wait for the build to finish.',
      'NOTE: Three people in every room do this in a throwaway folder outside their repo. Catch them now: it must be inside the repository, or Thursday’s commit has nowhere to go.',
    ),
  },
  {
    segment: 'micro-build', eyebrow: '📋 While it builds',
    title: 'The failure table: four ways the vendor lets you down, and a named response for each',
    body: 'While Claude Code is building, write the table on the board. One row per way the vendor can fail; one named response per row. Slow: a timeout, then a retry. Down: a capped retry, then the breaker, then the fallback and the dead-letter. Garbage: no retry at all, because a wrong answer will be wrong again; a quality gate instead. The same order twice: an idempotency key. This table is the specification for the rest of the week. Every prompt from here implements one row of it.',
    bullets: [
      'slow → timeout → retry',
      'down → retry (capped) → breaker → fallback + dead-letter',
      'garbage → never retry → quality gate → dead-letter with the reason',
      'same order twice → idempotency key → one send',
      'Tonight: the first half of rows 1 and 2. Thursday: everything else.',
    ],
    diagram: `flowchart LR
  S["🐢 slow"] --> T["⏱️ timeout → 🔁 retry"]
  D["💥 down"] --> R["🔁 retry → 🔌 breaker → 🪂 fallback / 📥 dead-letter"]
  G["🗑️ garbage"] --> Q["🚦 gate · no retry"]
  W["👯 same order twice"] --> K["♻️ key"]`,
    script: L(
      'SITUATION: Taught while build 1 runs. This is the specification for the rest of the week, written as a table on the board.',
      'ROOM: Marker in hand. Four rows on the board: slow, down, garbage, twice. The screen has the answers; the board is where you write them with the room.',
      'MOOD: Collaborative. Ask for each response before you write it.',
      'OPEN: "Four ways the vendor can let you down. Give me the response to each one, and I will write it down."',
      'DO: Row by row. For garbage, wait for somebody to say "retry" and then ask whether a wrong answer gets less wrong the second time. That is the row people get wrong.',
      'DO: Check the pulse. When most of the room has a folder and a sent.log line, move to build 2. Anyone still building keeps going — build 2 waits for build 1, not for the slide.',
      'NOTE: Leave the table on the board. Thursday’s roadmap is this table with checkpoint numbers next to it.',
    ),
  },
  {
    segment: 'micro-build', eyebrow: '2️⃣ Build 2 · ⏱ 3–5 min to run',
    title: 'Bound the wait, cap the retries, and prove both with the vendor',
    body: 'Now the first two decisions go around the vendor call: a deadline on every attempt, and a retry with a ceiling, a growing gap, and a rule about what is worth retrying. Then you prove it four ways using the vendor’s switch: slow produces your own timeout error; down produces exactly three attempts and then a clear, named failure; garbage produces no retry at all; ok sends one line. If any of the four does not happen, the wrapper is wrong.',
    bullets: [
      'withTimeout — a 2-second deadline on each attempt, fails with TimeoutError',
      'retry — 3 attempts, doubling gap with jitter, only for failures that might succeed next time',
      'Named failures: TimeoutError · UpstreamUnavailable · BadResponse',
      'Proof: slow → 3 attempts · down → 3 attempts · garbage → 1 attempt · ok → 1 send',
    ],
    diagram: `flowchart LR
  D["desk"] --> R["🔁 retry ×3"]
  R --> T["⏱️ timeout 2s"]
  T --> V["🏭 vendor"]
  V -->|slow| TO["TimeoutError · retried"]
  V -->|down| UU["UpstreamUnavailable · retried"]
  V -->|garbage| BR["BadResponse · NOT retried"]`,
    code: {
      kind: 'paste', pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — add the timeout and the capped retry, then prove all four modes (⏱ 3–5 min)',
      code: L(
        'Stay inside ./reliability-lab/ — nothing outside it changes. Zero dependencies. Run everything yourself; do not print commands for me to copy.',
        '',
        'Add two protections around the desk\'s call to the vendor, in one new module called reliability, and use them from the desk:',
        '',
        '  1. withTimeout(fn, ms) — run one attempt with a deadline. If it is not back in time, fail with an error whose name is TimeoutError.',
        '     # WHY: a call with no deadline is an outage that has not finished happening yet.',
        '  2. retry(fn, { attempts: 3, baseDelayMs: 500 }) — try up to 3 times, doubling the gap each time, with a little random jitter added to each gap.',
        '     # WHY: the cap is the difference between a bad night and a bill. The growing gap and the jitter stop a thousand clients from retrying in the same second.',
        '     It must ONLY retry failures that might succeed next time: TimeoutError, and the vendor\'s 500-style error. A garbage response is NOT retried — a wrong answer will be wrong again.',
        '     Give the vendor\'s failures names: UpstreamUnavailable for the 500-style error, BadResponse for a garbage message. Use those names on every error the desk logs.',
        '     # WHY: a generic error throws away the one fact you need — WHICH failure — and each one has a different correct response.',
        '  3. Make the desk use them: withTimeout INSIDE, retry AROUND it. Deadline per attempt: 2 seconds. Log one line per attempt: attempt number, outcome, error name if any.',
        '',
        'Then PROVE it. Run confirm 1002 four times, once per VENDOR_MODE, and show me each run\'s output:',
        '  - slow    → TimeoutError on each attempt, 3 attempts, then a clear final failure. About 6 seconds plus the gaps in total, not 30.',
        '  - down    → 3 attempts, UpstreamUnavailable, a clear final failure.',
        '  - garbage → exactly ONE attempt, BadResponse, no retry.',
        '  - ok      → one attempt, one new line in data/sent.log.',
        '',
        'If any of the four does not match, the wrapper is wrong — fix it and re-run before you tell me you are done. Finish with the attempt counts for all four runs in one small table.',
      ),
      expectedResult: 'Four runs: slow shows TimeoutError and three attempts; down shows UpstreamUnavailable and three attempts; garbage shows BadResponse and ONE attempt; ok sends one line. A small attempts table at the end.',
      stopCondition: 'You have seen your own TimeoutError on screen, and garbage was not retried.',
      rescue: 'If slow took 30 seconds, the timeout is outside the retry or missing — tell it "deadline per attempt, inside the retry". If garbage retried, the retry catches everything — tell it to retry only TimeoutError and UpstreamUnavailable.',
    },
    script: L(
      'SITUATION: Build 2, and the close of the night. Decisions 1 and 2 go around a real call, and the vendor’s switch proves all four rows of the table.',
      'ROOM: Prompt block on screen. Clock visible: this is the block that can run long, and the challenge poll still follows.',
      'MOOD: Build energy, then one full stop when the first TimeoutError appears on somebody’s screen.',
      'OPEN: "Two decisions go around the call. Then we flip the switch four times and see if the wrapper is telling the truth."',
      'DO: When the first person gets TimeoutError, have them read the attempt log out loud. Three attempts, then a named failure — that is the sound of a bounded system.',
      'DO: Ask one person to read their garbage run. One attempt, BadResponse. Ask the room why it did not retry. Somebody will say it: a wrong answer would be wrong again.',
      'SAY: Nothing you built tonight makes the vendor better. Everything you built decides how your system behaves when it is not.',
      'NOTE: Point at Thursday: the breaker, the plan B, the key, the gate — then we run the same chaos against a copy with all of it switched off and count what it costs.',
    ),
  },
];

/* ---------------------------------------------------------- story beats ---- */
/* World stories only — no program call-backs. One per segment, three total. */
const STORY_BEATS = [
  {
    segment: 'business-problem',
    icon: '🚢', tone: 'berry', eyebrow: 'Change of pace — a story from the docks',
    title: 'The ship that could not sink had lifeboats for half the people aboard',
    body: 'The Titanic carried lifeboats for about half its passengers, and that was not an oversight or a cost cut. It was compliant, it was conventional, and it followed from a belief the whole industry shared: the ship was its own lifeboat. The design was not wrong about the bulkheads. It was wrong about the premise that the failure path did not need to be built, because the failure would not happen.',
    punch: 'Nobody skips the failure path because they are lazy. They skip it because the demo keeps working.',
  },
  {
    segment: 'architecture',
    icon: '💸', tone: 'amber', eyebrow: 'The night nothing went wrong',
    title: 'It did not crash. It did not alert. It just spent all night asking the same question.',
    body: 'A team shipped a scheduled job on a Friday. On Saturday at 1 AM the vendor started returning errors, and the retry logic did exactly what it was written to do, which was retry. There was no cap, because nothing in testing had ever failed twice in a row. By Monday there was no exception in the logs, no failed job, no alert — just an unfamiliar number on the usage dashboard and a vendor asking why one customer had sent four hundred thousand requests over a weekend.',
    punch: 'A system that fails loudly is a nuisance. A system that fails silently is an invoice.',
  },
  {
    segment: 'micro-build',
    icon: '🧯', tone: 'leaf', eyebrow: 'Before you build — why we do this on purpose',
    title: 'Nobody schedules a fire drill because they expect a fire that Tuesday',
    body: 'You do the drill so that the first time you find the exit is not the first time you need it. Tonight you build the extinguishers on something too small to hurt anyone, in a folder that touches nothing else. Thursday you set fire to it on purpose, while someone is there to help.',
    punch: 'The first time your system fails should never be the first time you have seen it fail.',
  },
];

/* --------------------------------------------------------- interactions ---- */
const INTERACTIONS = [
  {
    segment: 'checkin', kind: 'poll',
    q: 'Be honest — has anything you have built ever been run against a dependency that was failing on purpose?',
    options: ['Never tried it', 'It failed and I fixed it', 'It failed and I have not fixed it', 'Yes, and it held up'],
    eyebrow: '🌡️ Honest check', title: 'Has anything of yours ever actually failed?',
    presenterTip: L(
      'SITUATION: The first poll, before any teaching. No right answer; the spread is the point.',
      'ROOM: Poll up on the phone. Nothing else on screen.',
      'MOOD: Light. This is a show of hands with numbers.',
      'OPEN: "No wrong answer here. Be honest."',
      'DO: Read the spread aloud. The first option usually dominates, and that number is the thesis of the week. If a couple pick the last one, ask what broke first — their answer sets up the architecture segment for you.',
    ),
  },
  {
    segment: 'business-problem', kind: 'poll',
    q: 'A job hits a failing vendor at 2 AM and retries with no cap for six hours. What is the FIRST thing you notice?',
    options: [
      'The bill for hundreds of wasted calls',
      'The vendor stayed down longer because you hammered it',
      'The work that never got done while it looped',
      'Nothing — that is exactly the problem',
    ],
    answer: 3,
    reveal: 'Nothing. The other three are all real costs, and none of them announce themselves. No exception, no alert, no failed job — the first signal is a bill or an angry vendor, days later. That silence is why the cap goes in before the incident, not after.',
    eyebrow: '🌙 The 2 AM question', title: 'It retried all night. What do you notice first?',
    presenterTip: L(
      'SITUATION: The poll that turns "things fail" into "things fail silently". Take votes before revealing.',
      'ROOM: Poll up. Let the first two options get argued — they are genuinely defensible.',
      'MOOD: Patient. The reveal lands harder if the room has committed.',
      'OPEN: "Vote first. Then argue."',
      'DO: Reveal the fourth option and let it sit. Then say the sentence: the first signal is a bill, days later.',
    ),
  },
  {
    segment: 'architecture', kind: 'poll', theater: true,
    q: 'The same order arrives twice. Your desk sends a confirmation. What actually keeps you correct?',
    options: [
      'Check whether we already sent it, right before sending',
      'A key derived from the order, claimed before the send',
      'A fresh ID generated at the top of each attempt',
      'Wrap it in try/catch and retry on failure',
    ],
    answer: 1,
    reveal: 'A key derived from the ORDER, claimed BEFORE the send. "Check right before" leaves a gap where two arrivals both see "not sent" and both send. A fresh ID per attempt is unique every time, so every retry looks new and protects nothing. Retrying makes it worse.',
    eyebrow: '🎭 Decision theater', title: 'Where does the key come from?',
    presenterTip: L(
      'SITUATION: The theater poll of the night. Fires from the idempotency slide, before the trap is explained.',
      'ROOM: Full-screen theater. Read all four options aloud, slowly.',
      'MOOD: Argumentative, in a good way. Expect the room to split hard between the first and third options.',
      'OPEN: "Lock a vote before I say another word."',
      'DO: Reveal. Then take one person who chose "check right before" and ask what happens if two arrivals check in the same instant. Let them find the gap themselves.',
    ),
  },
  {
    segment: 'architecture', kind: 'trivia',
    q: 'Which of these should NEVER be retried?',
    options: ['A 429 rate limit', 'A 503 from the vendor', 'A 400 bad request', 'A connection timeout'],
    answer: 2,
    reveal: 'A 400 means your request was wrong. The vendor will reject it identically every time, so retrying is being wrong three times, slower and at your expense. Retry the transient; fail fast on your own mistakes.',
    eyebrow: '🎯 Knowledge check', title: 'Which one should never be retried?',
    presenterTip: L(
      'SITUATION: Fast check right after decisions 1 and 2. Thirty seconds.',
      'ROOM: Poll up.',
      'MOOD: Quick.',
      'OPEN: "Fast one. Which of these gets retried by nobody sensible?"',
      'DO: Reveal, one line of why, move. If several picked the 429, ten extra seconds: a 429 IS retryable, but with a growing gap and respecting the vendor’s Retry-After.',
    ),
  },
  {
    segment: 'deconstruct', kind: 'poll',
    q: 'In the six-step double charge, which single change makes it impossible?',
    options: ['Retry less often', 'Claim a key from the order before step 1', 'Catch the error and log it', 'Write the receipt before the charge'],
    answer: 1,
    reveal: 'The key, claimed before step one. The retry then finds it and skips the charge. Retrying less just makes the double charge rarer. Logging changes nothing. Writing the receipt first only moves the problem — now the receipt duplicates.',
    eyebrow: '🔬 Forensics', title: 'What would have stopped it?',
    presenterTip: L(
      'SITUATION: The poll that closes the forensics. Most of the room gets it now, which is the point — they could not have an hour ago.',
      'ROOM: Poll up.',
      'MOOD: Satisfying.',
      'OPEN: "You have seen the six steps. One change. Which?"',
      'DO: Reveal, then pick on option four — writing the receipt first — and ask what duplicates instead. That answer proves they understand the shape, not just the slide.',
    ),
  },
  {
    segment: 'challenge', kind: 'poll', theater: true,
    q: 'Where does the circuit breaker go?',
    options: [
      'Inside the retry, so each attempt checks it',
      'Outside the retry, so the whole operation counts as one failure',
      'Inside the timeout',
      'It does not matter',
    ],
    answer: 1,
    reveal: 'Outside the retry. The breaker counts whole operations. Put it inside and every retry resets the count, so it never trips — a breaker that never trips is a comment, not a protection.',
    eyebrow: '🧭 Architecture challenge', title: 'A design decision for Thursday',
    presenterTip: L(
      'SITUATION: The design-choice poll, and the tail of the night. Expendable if the clock is gone — but it is the CP1 decision for Thursday, so it is worth two minutes.',
      'ROOM: Theater up. Point back at the nesting diagram on the board.',
      'MOOD: Quick and confident.',
      'OPEN: "One design decision before you go, and you build it Thursday."',
      'DO: Reveal, then say the sentence: a breaker that never trips is a comment, not a protection.',
    ),
  },
  {
    segment: 'trivia', kind: 'trivia',
    q: 'try { … } catch (e) {} — an empty catch block — is…',
    options: ['Clean', 'A silent-failure production defect', 'Required', 'Faster'],
    answer: 1,
    reveal: 'A production defect. The failure vanishes: nothing retries, nothing parks the work, nothing tells anyone. Name it, log it, respond to it.',
    eyebrow: '🎯 Knowledge check', title: 'Last one',
    presenterTip: L(
      'SITUATION: Quick check at the tail. Skip it if you are past 8:15 — the trailer matters more.',
      'ROOM: Poll up.',
      'MOOD: Fast.',
      'OPEN: "Last one, then the trailer."',
      'NOTE: Reveal, one line, move.',
    ),
  },
];

/* ---------------------------------------------------------- slide notes ---- */
/* Commentary for every GENERATED slide (openers, story beats, break,
 * trailer). Teach slides carry their own `script`; interactions carry their
 * own `presenterTip`. Keys are `kind:id` — ids are not unique on their own. */
const SLIDE_NOTES = {
  'cover:cold-open-0': L(
    'SITUATION: The cover. Class clock not started yet.',
    'ROOM: Cover full screen. Your own repo open in a second window with no reliability-lab folder in it.',
    'MOOD: Settled. People are still arriving.',
    'OPEN: "Welcome. Tonight starts from an empty folder — nothing from before is needed."',
    'DO: Press Start class the moment you begin. The pace bar runs from here.',
  ),
  'rules:cold-open-1': L(
    'SITUATION: The house rules slide. Same shape every week; tonight the one that matters is the folder rule.',
    'ROOM: Rules on screen. Phones out for check-in.',
    'MOOD: Brisk.',
    'OPEN: "Two rules tonight: every block is a prompt, and everything you build lives in one folder inside your repo."',
    'NOTE: Do not linger. Fifteen seconds.',
  ),
  'hook:cold-open--1': L(
    'SITUATION: The single-sentence hook. First real thing you say tonight.',
    'ROOM: One sentence, full screen. Nothing else on the display.',
    'MOOD: Flat and certain. It is a claim, and it should land as one.',
    'OPEN: "A system you have never watched fail is a system you cannot trust."',
    'NOTE: Say it, then three seconds of silence. Half the room is thinking about something they shipped.',
  ),
  'segment:cold-open-0': L(
    'SITUATION: The promise. Show what exists by Thursday before any theory.',
    'ROOM: The four failures on screen — hangs, goes down, sends nonsense, same order twice — and the one correct confirmation.',
    'MOOD: Concrete. This is a thing, not a concept.',
    'OPEN: "By Thursday, this exists — and you build it from an empty folder, inside your own repo, without touching your project."',
    'DO: Read the four failures as a list. Then the one outcome: one confirmation, the rest parked with a receipt.',
    'NOTE: Sell the survival, not the primitives. The architecture segment names them.',
  ),
  'bullets:business-problem-0': L(
    'SITUATION: Segment opener. Turn from "the vendor fails" to why a business pays for this.',
    'ROOM: Bullets on screen. Nothing to run.',
    'MOOD: Commercial. Stakes, not syntax.',
    'OPEN: "A successful demo still fails in production. Tonight is about designing the other path first."',
    'DO: Read the list of primitives ONCE, fast, as vocabulary — not as a lesson. The next two slides carry the story.',
  ),
  'storybeat:business-problem-900': L(
    'SITUATION: Change of pace after two heavy slides. A story from the docks.',
    'ROOM: Story card full screen. Away from the keyboard.',
    'MOOD: Storyteller. Slow down.',
    'OPEN: "The ship that could not sink had lifeboats for half the people on it — and that was the rule at the time."',
    'SAY: The design was not wrong about the bulkheads. It was wrong about the premise that the failure path did not need to be built.',
    'NOTE: Land the punch line and move. Do not connect it to code; the room will.',
  ),
  'architecture:architecture-0': L(
    'SITUATION: Segment opener for the biggest teaching block. The whole week drawn as one system — this diagram has no body, so what you SAY is the read screen.',
    'ROOM: Diagram full screen. Walk it LEFT TO RIGHT with your hand: the call, the timeout, the retry, the diamond, the two exits. Then the two loose pieces — the key above, the gate on the way out.',
    'MOOD: Settle in. This is the map for the next twenty minutes.',
    'OPEN: "One outside call. Everything on this slide is a decision you make about what happens when it does not come back."',
    'SAY: Start on the left. The external call — tonight that is the vendor. Every outside call your system makes looks like this box, and every one of them can fail in the same four ways.',
    'SAY: First wrap, the timeout. How long will you wait for ONE attempt. Without it, the wait never ends and nothing reports a problem. That is key point one: bound the wait.',
    'SAY: Second wrap, the capped retry with backoff. How many times, with a growing gap and a little randomness. The cap is the difference between a bad night and a bill. Key point two.',
    'SAY: Now the diamond — the circuit breaker. It counts failures in a row and, past a threshold, it opens. Follow the two arrows. Closed: the call goes through and succeeds. Open: the call never leaves your process, and you take the bottom exit — fallback or dead-letter. Degrade if you can, park it if you cannot, lose it never. Key point three.',
    'SAY: Now the dotted line coming in from below — the idempotency key. It does not touch the transport at all. It governs the side effect: the same event can never cause the same send twice. Key point four, and the one to remember.',
    'SAY: Last, on the right, the quality gate. Everything before it gets an answer back. The gate decides whether the answer is worth using. Reliability and quality are different layers, and both are cheap. Key point five.',
    'SAY: Read it once more as a whole. Inside to outside: timeout, retry, breaker. Above: the key. On the way out: the gate. Two of these you build tonight. Three on Thursday.',
    'DO: Ask the room which of the five is the one a customer would feel if it were missing. Take one answer before you move — the key is the one you want said.',
  ),
  'storybeat:architecture-900': L(
    'SITUATION: Change of pace after the four decision slides, before the theater poll. The invoice story — the night the cap and the breaker were for.',
    'ROOM: Story card full screen. Step away from the keyboard.',
    'MOOD: Slow, and without a villain.',
    'OPEN: "Here is a real shape of failure, and it looks perfectly healthy the whole way through."',
    'SAY: No exception, no failed job, no alert. Just a number on a dashboard and a vendor asking why.',
    'NOTE: Point back at decisions 2 and 3 on the board: a cap and a breaker would have ended this by 1:05 AM. Then the poll.',
  ),
  'example:deconstruct-0': L(
    'SITUATION: Segment opener for the forensics. The example is the double charge from the business segment, now line by line.',
    'ROOM: One line on screen. Have the six steps in your head.',
    'MOOD: Methodical.',
    'OPEN: "We are going back to the double charge, and this time we replay it one step at a time."',
    'DO: Set the rule for the segment: we are not looking for who was careless. We are looking for the place a five-line change would have ended it.',
  ),
  'break:reset-0': L(
    'SITUATION: Five minutes. Then the build.',
    'ROOM: Break slide up. Clear the stuck queue on the phone.',
    'MOOD: Loose.',
    'OPEN: "Five minutes. When we come back, every one of you opens Claude Code inside your project repository."',
    'DO: Use the break to walk the room — anyone without Claude Code open in their repo gets sorted now, not at build 1.',
  ),
  'microbuild:micro-build-0': L(
    'SITUATION: Segment opener for the build. Nothing is taught here; the only job is Claude Code open, in their repo, ready to paste.',
    'ROOM: Walk the room. Screens, not the deck.',
    'MOOD: Brisk and practical. Two minutes, then move.',
    'OPEN: "Claude Code open, inside your project repository, nothing else. Two builds, ten minutes of running time."',
    'DO: Physically check that people are in their own repository. The folder rule means it must be inside a repo, or Thursday’s commit has nowhere to go.',
    'NOTE: Remind the room: every block is a prompt. Claude Code drives the terminal; they never do.',
  ),
  'storybeat:micro-build-900': L(
    'SITUATION: The closer of the build, after build 2 and before the challenge poll. Why we did this on purpose, and what Thursday does with it.',
    'ROOM: Story card full screen. Builds are still finishing on some screens — that is fine.',
    'MOOD: Warm. This is permission to break things in a safe place.',
    'OPEN: "Nobody schedules a fire drill because they expect a fire that Tuesday."',
    'SAY: Tonight you built the extinguishers on something too small to hurt anyone. Thursday you set fire to it on purpose.',
    'NOTE: Twenty seconds, then the challenge poll — the breaker placement they build Thursday.',
  ),
  'cta:trailer-0': L(
    'SITUATION: The close. Open loop into Thursday, and the one instruction for the week.',
    'ROOM: Trailer slide up. Last thing on the display.',
    'MOOD: Momentum. They leave with a folder that did not exist two hours ago.',
    'OPEN: "Thursday: the breaker, the plan B, the key, the gate — and then we switch all of it off in a copy and count what it costs."',
    'SAY: Bring the same repo. If you were not here tonight, one prompt on Thursday builds everything you missed in four minutes — you are not behind.',
    'NOTE: One sentence, then stop the class clock.',
  ),
};

/* --------------------------------------------------------------- config ---- */
function buildConfig(before) {
  const b = before && typeof before === 'object' ? before : {};
  return {
    ...b,
    theaterEnabled: true,
    buildBayDetail: true,
    checkpointsEnabled: true,
    evidenceOverrides: null,
    teach: { enabled: true, max: null, overrides: TEACH },
    storyBeats: { enabled: true, max: null, overrides: STORY_BEATS },
    interactions: { enabled: true, max: null, overrides: INTERACTIONS },
    prompts: { enabled: true, max: null, overrides: null },
    opening: {
      coldOpen: { enabled: true, override: COLD_OPEN },
      hook: { enabled: true, override: HOOK },
      resultPreview: { enabled: true, override: null },
    },
    slideNotes: SLIDE_NOTES,
  };
}

/* ----------------------------------------------------------------- lint ---- */
const TAGS = /^(SAY|DO|NOTE|SITUATION|ROOM|MOOD|OPEN):/;
const ARRIVAL = ['SITUATION', 'ROOM', 'MOOD', 'OPEN'];
// Mirrors auditClassDecks.js's SHELL plus the stricter verbs the session
// composers refuse (node, curl). A line that starts with any of these asks a
// student to type.
const SHELL_LINE = /(^|\n)\s*(npm |npx |mkdir |cd |sudo |curl |chmod |git |ls -la|touch |pwd\b|node )/;
// The from-scratch rule, made mechanical: nothing may point at earlier weeks.
const PRIOR_REFS = [
  /\bweeks?\s*[1-8]\b/i, /\bW[1-8]\b/, /\bW[1-8][–-][1-8]\b/, /\borientation\b/i, /\bdragon\b/i,
  /\bintensive\s*[1-3]\b/i, /\blast (week|time|session|class)\b/i, /\bcapstone\b/i,
  /\byou (already )?built (in|on|last|earlier)\b/i, /\bearlier (in|this) (the )?(program|cohort|course)\b/i,
];
const ARCH_SEGMENTS = ['cold-open', 'checkin', 'business-problem', 'architecture', 'deconstruct', 'reset', 'micro-build', 'challenge', 'trivia', 'trailer'];

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
    if (!ARCH_SEGMENTS.includes(s.segment)) bad.push(label + ': segment not in the Architecture Day run-of-show');
    if (!s.eyebrow || !s.title || !s.body) bad.push(label + ': missing eyebrow/title/body');
    if (!s.diagram) bad.push(label + ': no diagram');
    bad.push(...lintTagged(label + ' script', s.script, true));
    if (s.code) {
      if (s.code.kind !== 'paste') bad.push(label + ': code block is not a paste prompt');
      if (!/Claude Code/i.test(s.code.pasteWhere || '')) bad.push(label + ': pasteWhere is not Claude Code');
      if (/TERMINAL/i.test(s.code.pasteWhere || '') || SHELL_LINE.test(s.code.code || '')) bad.push(label + ': terminal-shaped code block');
      ['expectedResult', 'stopCondition', 'rescue', 'label'].forEach((k) => { if (!s.code[k]) bad.push(label + ': code missing ' + k); });
      if (!/reliability-lab/.test(s.code.code)) bad.push(label + ': prompt does not name the lab folder');
      everything.push(s.code.code, s.code.expectedResult, s.code.stopCondition, s.code.rescue, s.code.label);
    }
    everything.push(s.title, s.body, s.script, ...(s.bullets || []));
  });

  STORY_BEATS.forEach((b, i) => {
    const label = `storyBeat[${i}]`;
    if (!ARCH_SEGMENTS.includes(b.segment)) bad.push(label + ': bad segment');
    ['icon', 'eyebrow', 'title', 'body', 'punch', 'tone'].forEach((k) => { if (!b[k]) bad.push(label + ': missing ' + k); });
    everything.push(b.title, b.body, b.punch);
  });

  INTERACTIONS.forEach((q, i) => {
    const label = `interaction[${i}] "${q.q.slice(0, 40)}"`;
    if (!ARCH_SEGMENTS.includes(q.segment)) bad.push(label + ': bad segment');
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
  const arch = SLIDE_NOTES['architecture:architecture-0'] || '';
  const archSay = arch.split('\n').filter((l) => /^SAY:/.test(l));
  if (archSay.length < 5) bad.push('architecture:architecture-0 needs a node-by-node SAY walk (has ' + archSay.length + ' SAY lines)');

  everything.push(HOOK.headline, HOOK.caption, COLD_OPEN.title, COLD_OPEN.body);
  everything.filter(Boolean).forEach((text) => {
    PRIOR_REFS.forEach((re) => {
      const m = re.exec(text);
      if (m) bad.push(`prior-week reference "${m[0]}" in: ${String(text).slice(0, 60)}…`);
    });
  });

  const builds = TEACH.filter((s) => s.code).length;
  if (builds > 2) bad.push(`${builds} live builds — the micro-build window holds at most 2`);
  if (TEACH.length > 14) bad.push(`${TEACH.length} teach slides — over the budget of 14`);
  return bad;
}

function summary() {
  const prose = TEACH.reduce((n, s) => n + (s.body || '').length, 0);
  return `teach=${TEACH.length} builds=${TEACH.filter((s) => s.code).length} bodyProse=${prose} `
    + `storyBeats=${STORY_BEATS.length} interactions=${INTERACTIONS.length} slideNotes=${Object.keys(SLIDE_NOTES).length}`;
}

module.exports = { SID, WEEK, HOOK, COLD_OPEN, TEACH, STORY_BEATS, INTERACTIONS, SLIDE_NOTES, buildConfig, lint, summary };

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
    // Local mode: prove the config serialises and every override category is
    // a full replacement, without a database.
    const cfg = buildConfig(null);
    const json = JSON.stringify(cfg);
    console.error(`CHECK OK  ${json.length} bytes; teach.overrides=${cfg.teach.overrides.length} `
      + `storyBeats.overrides=${cfg.storyBeats.overrides.length} interactions.overrides=${cfg.interactions.overrides.length} `
      + `hook=${!!cfg.opening.hook.override} coldOpen=${!!cfg.opening.coldOpen.override}`);
    process.exit(0);
  }

  const { getKitConfig, saveKitConfig } = require('/app/dist/services/sessionKitConfigService');
  const { splitScript } = require('/app/dist/services/classKit/kitHtml');

  (async () => {
    const before = await getKitConfig(SID);
    // Print the previous config so a rollback never depends on memory.
    console.log('BEFORE ' + JSON.stringify(before));
    const config = buildConfig(before);
    if (dry) {
      console.error('DRY RUN — not saving. ' + summary());
      process.exit(0);
    }
    await saveKitConfig(SID, config);

    // Verify from the database, not from the object in memory.
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
      + `hook=${!!(after.opening && after.opening.hook && after.opening.hook.override)}`);
    if (saved.length !== TEACH.length || untagged.length || shared.length || nonPrompt.length
      || beats.length !== STORY_BEATS.length || qs.length !== INTERACTIONS.length) {
      console.error('VERIFY FAIL');
      process.exit(1);
    }
    process.exit(0);
  })().catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
}
