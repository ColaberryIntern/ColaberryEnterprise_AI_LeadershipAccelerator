/**
 * session20-week10-monday.js — Session 20, Monday 2026-09-28, "Week 10 ·
 * Architecture Day" (Governance + Governance Engine), rebuilt FROM SCRATCH as
 * a full KitConfig replacement. Same brief as sessions 18 + 19.
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
 * The authored week10.ts pack assumes a system the student has been growing
 * for nine weeks ("your Intensive 1–3 system, with the reliability layer").
 * So this file REPLACES every category: teach, story beats, interactions,
 * opening and slideNotes. The generated slides whose text comes from
 * classSessionPlan.ts (tension, the architecture beats, the example, the
 * micro-build lead, the trailer) are week-neutral and stay.
 *
 * THE SPINE — "nobody told it no"
 * Every AI disaster is an action nobody said the system could not take.
 * Tonight each student builds, from an empty folder, an agent that can move
 * money, delete a record and email a customer list — with a switch (normal ·
 * generous · sloppy · rogue) so it proposes something unreasonable on
 * command — and gives it no rules at all. It succeeds at everything, and
 * exits zero every time. Then one rule and one closed default, and three of
 * the four stop. Thursday builds the rest of the engine and breaks it.
 *
 * THE FOLDER RULE
 * Everything lives in ./governance-lab/ inside the student's own repository,
 * with its own package file, zero dependencies and its own .gitignore. Every
 * build prompt says so, and says: nothing outside the folder is created,
 * edited or deleted; if the parent's tooling would pick the folder up, report
 * and ask before touching anything.
 *
 * THE ROOM IS THE CONTROL
 * Ali asked for full class participation. Three devices carry it: the
 * authority table the room writes on the board while build 1 runs (it becomes
 * Thursday's policy file), the decision-theater poll where the room IS the
 * approval queue and votes on a request whose context has been withheld, and
 * the gate-placement poll that decides CP1's architecture.
 *
 * SHAPE (Ali: "I'd rather finish early than not be able to make it through")
 *   12 teach slides (authored: 23) · 2 live builds (~4 min each, paste then
 *   ADVANCE while it runs) · 7 questions · 3 story beats. Target finish 8:10.
 *
 * Run inside the container:  node /app/session20-week10-monday.js [--dry]
 * Local, no DB:              node session20-week10-monday.js --check
 * Rollback: the BEFORE line printed at the top of the run, or
 *           UPDATE live_sessions SET kit_config_json = NULL WHERE id = SID.
 */

const SID = 'b336dcef-e299-4f24-8464-8087fd9b98b4';
const WEEK = 10;
const L = (...lines) => lines.join('\n');

/* ------------------------------------------------------------- opening ---- */
const HOOK = {
  headline: 'Every AI disaster is an action nobody said it could not take.',
  caption: 'Tonight you build an agent with no rules, watch it succeed at everything, and then read what it was allowed to do.',
};

const COLD_OPEN = {
  title: 'By Thursday, this will exist',
  body: 'An agent that wants to move money, delete a customer and email forty thousand people. A policy that refuses it and names the rule and the fact it lost on. A queue that stops the expensive one and waits for a named human, and denies it if nobody ever answers. And a tamper-evident record that reconstructs any decision from one id and proves nobody edited it afterwards. Built from an empty folder, inside your own repository, without touching your project.',
};

/* ---------------------------------------------------------------- teach ---- */
const TEACH = [
  /* ============================ check-in ============================== */
  {
    segment: 'checkin', eyebrow: '🧭 The shape of tonight',
    title: 'One empty folder, one agent, and no rules at all',
    body: 'Tonight starts from nothing on purpose. You will create a folder called governance-lab inside your project repository, and everything you build lives there; nothing outside it changes. Inside it you build an agent that proposes real actions and a ledger that records them when they fire, and you build the agent with a switch so it proposes something unreasonable on command. Then you give it exactly one rule. Every block on screen tonight is a prompt for Claude Code. You never type into a terminal.',
    bullets: [
      'A new folder in your repo: governance-lab/. Your project is not touched.',
      'Two things get built: an agent that proposes actions, and a ledger that records them',
      'The agent has a switch: normal · generous · sloppy · rogue',
      'Every block is a Claude Code prompt. Claude Code drives the terminal.',
      'Two builds tonight, about ten minutes of running time. We finish early.',
    ],
    diagram: `flowchart LR
  Repo["📁 your repo"] --> Lab["📁 governance-lab/<br/>new · isolated"]
  Lab --> Agent["🤖 agent<br/>normal · generous<br/>sloppy · rogue"]
  Agent --> Act["⚡ act"]
  Act --> Ledger["📄 ledger.jsonl"]`,
    script: L(
      'SITUATION: First teach slide. The room needs one thing settled before anything else: nothing from before tonight is needed, and nothing of theirs gets touched.',
      'ROOM: Diagram up. Your own repo open in a second window with NO governance-lab folder in it yet — you build alongside them tonight.',
      'MOOD: Calm and a little brisk. This is a contract, not a lecture.',
      'OPEN: "Everything you need tonight is a laptop, Claude Code signed in, and an empty folder that does not exist yet."',
      'DO: Say the folder rule out loud, once, plainly: governance-lab, inside your repo, nothing outside it changes. Then say the pace: two builds, about ten minutes of running time, and we finish early.',
      'NOTE: Somebody will ask whether this connects to their project. The answer is: it lives in your repo and it does not touch your project. Same answer every time it comes up.',
    ),
  },

  /* ======================== business problem ========================== */
  {
    segment: 'business-problem', eyebrow: '🎭 The uncomfortable truth',
    title: 'The dangerous agent is not the one that malfunctions. It is the one that works.',
    body: 'We test AI systems for whether they can do the job. Almost nobody tests them for what else they are able to do while doing it. A support agent given a refund tool does not need to hallucinate to refund two thousand four hundred dollars to a six-minute-old account — it only needs to be asked nicely by someone who understands that it was never told not to. The failure is not a bug. Every line ran correctly, the exit code was zero, and the money is gone.',
    bullets: [
      'We test for capability. We almost never test for authority.',
      'A working agent with an unbounded tool is not a malfunction, it is a permission',
      'Exit code zero, clean logs, money moved — and nothing objected',
      'The question is not "can it do the job". It is "what else can it do".',
    ],
    diagram: `flowchart LR
  T["🧪 what we test<br/>can it do the job?"] --> G["✅ it worked"]
  U["🕳️ what we do not test<br/>what else can it do?"] --> M["💸 money moved"]
  U --> D["🗑️ record deleted"]
  U --> E["📧 list emailed"]
  U --> Z["✅ exit code 0"]`,
    script: L(
      'SITUATION: First business slide. Move the room from "the AI might be wrong" to "the AI might be right, and still ruin your week".',
      'ROOM: Diagram up. Nothing to run. Keep your hands off the keyboard for the whole segment.',
      'MOOD: Level and a little uncomfortable. This is the clip that gets shared; keep syntax out of it.',
      'OPEN: "How many of you have given something you built the ability to send, charge, delete or post — without writing down what it was not allowed to do?"',
      'DO: Wait for hands. Some will go up slowly. Hold the silence for three full seconds before you speak.',
      'SAY: Nothing on the right-hand side of that diagram is a bug. Every one of those is a permission somebody forgot to withhold.',
      'NOTE: Do not say "governance" yet. Let the room arrive at the word; it lands harder when they supply it.',
    ),
  },
  {
    segment: 'business-problem', eyebrow: '💸 The consequence',
    title: 'Capability is not authority, and only one of them is in your code',
    body: 'Here is the failure an executive feels. An agent is given a refund tool so it can handle the easy cases. A request arrives that looks ordinary. The agent reads it, believes it, and refunds two thousand four hundred dollars to an account that was created six minutes ago, with a shipping address changed after the order was placed, after four other refunds the same day. Every one of those facts existed. None of them were ever consulted, because nothing in the system was responsible for consulting them.',
    bullets: [
      'The agent had the capability. Nobody had granted it the authority.',
      'The facts that would have stopped it existed and were never read',
      'A refund is reversible on a spreadsheet and not in a customer relationship',
      'Tonight’s agent has the same shape: propose an action, then do something irreversible',
    ],
    diagram: `flowchart LR
  R["📨 request<br/>looks ordinary"] --> A["🤖 agent believes it"]
  A --> M["💸 refund $2,400"]
  F1["account age: 6 minutes"] -.never read.-> A
  F2["refunds today: 4"] -.never read.-> A
  F3["address changed after order"] -.never read.-> A`,
    script: L(
      'SITUATION: The story the whole week hangs on. It comes back in the deconstruct segment step by step, and again on Thursday as a policy that stops it.',
      'ROOM: Diagram up. Tell it, do not read it — the three dotted facts are the punch, so save them.',
      'MOOD: Quiet. No villain. That is what makes it frightening.',
      'OPEN: "Nobody wrote a bad line of code here, and the agent did not hallucinate. Watch."',
      'SAY: Two thousand four hundred dollars. An account six minutes old. A shipping address changed after the order. Four refunds already that day. Every one of those facts was sitting in the database while the money moved.',
      'DO: Ask the room whose job it was to read those three facts. Let them work it out. The answer — nobody owned that, so nothing did it — is the sentence you want somebody else to say.',
      'NOTE: Point at the last bullet: tonight’s agent has exactly this shape. Propose an action, then do a thing you cannot take back.',
    ),
  },

  /* =========================== architecture =========================== */
  {
    segment: 'architecture', eyebrow: '🛡️ The gate',
    title: 'Five facts, three verdicts, one place they are decided',
    body: 'Governance is not a policy document and it is not an instruction in a prompt. It is one piece of code that every action has to pass through before it is allowed to happen, and it answers one question: given who is asking, what they want to do, what they want to do it to, what is going on around it, and how bad it would be to be wrong — is this allowed? Three answers are possible. Allow. Deny, with a reason. Or stop and ask a human. And there is a fourth case, which is the most important one: no rule matched at all.',
    bullets: [
      '1 · Five factors — user · resource · action · context · risk',
      '2 · Three verdicts — allow · deny with a reason · escalate to a human',
      '3 · One chokepoint — between the proposal and the side effect, not beside it',
      '4 · Fail-closed — no matching rule is a denial, not a gap',
      '5 · An audit trail — every verdict recorded, keyed to one id, and unfalsifiable',
    ],
    diagram: `flowchart LR
  P["🤖 proposed action"] --> G{"🛡️ the gate<br/>5 facts"}
  G -->|allow| S["⚡ side effect"]
  G -->|escalate| H["🙋 human"]
  H -->|approved| S
  G -->|deny| X["🛑 reason"]
  S --> A["🧾 audit"]
  X --> A`,
    script: L(
      'SITUATION: The map for the biggest teaching block. Everything after this is one of these five lines.',
      'ROOM: Diagram full screen. Put the three verdicts on the board — ALLOW, DENY, ESCALATE — and leave them up all night.',
      'MOOD: Confident and unhurried. This is the slide they should still be able to draw in a month.',
      'OPEN: "Five facts. Three answers. One place in the code where it is decided — and everything else in this system is a consequence of that one place."',
      'DO: Trace the path with your finger: the agent proposes, everything goes through the diamond, and there are exactly three ways out. Then point at the two arrows landing on audit — a denial gets recorded exactly as carefully as an approval.',
      'SAY: The fourth bullet is the one people skip. An action that matches no rule is not an action you forgot to think about. It is a denial. Otherwise your policy file is a list of the things you happened to imagine.',
      'NOTE: Do not explain the five factors here. Name them, show the shape, move. The next three slides do the explaining.',
    ),
  },
  {
    segment: 'architecture', eyebrow: '🧮 The five factors',
    title: 'Who, what, to what, in what situation, and how bad it would be to be wrong',
    body: 'A rule that says "refunds are allowed" is a blacklist waiting to be embarrassed. Attribute-based means the verdict is computed from facts, so the same action can be allowed for one actor and denied for another, and allowed this morning and denied this afternoon, without anybody editing the rules. User: who is asking, and what role are they in. Resource: what they want to touch, and whose it is. Action: what verb, and is it reversible. Context: everything true at that moment that the decision should care about. Risk: what it would cost to be wrong, expressed as a number so it can be compared.',
    bullets: [
      'user — who is asking · role · are they even authenticated',
      'resource — what is being touched · whose is it · how sensitive',
      'action — the verb · and critically, can it be undone',
      'context — account age, hour, prior actions today, how the request arrived',
      'risk — a number, so a threshold can be drawn and defended',
    ],
    diagram: `flowchart LR
  U["👤 user"] --> G{"🛡️ evaluate"}
  R["📦 resource"] --> G
  A["⚡ action"] --> G
  C["🌍 context"] --> G
  K["📊 risk score"] --> G
  G --> V["allow · deny · escalate<br/>+ the rule it matched"]`,
    script: L(
      'SITUATION: The factors, and the reason this is attribute-based rather than a list of banned verbs. Keep it concrete; they will type all five in forty minutes.',
      'ROOM: Diagram up. Have the refund example ready to re-run through the five factors out loud.',
      'MOOD: Practical. This is a form with five fields, not a philosophy.',
      'OPEN: "Same action, same agent, two different answers — and nobody edited a rule in between. How?"',
      'DO: Walk the two-thousand-four-hundred-dollar refund through the five factors aloud. User: an agent, acting for a customer. Resource: a payment. Action: refund, and it is not reversible. Context: the account is six minutes old. Risk: high. Then ask what changes if the account is two years old and this is their first refund.',
      'SAY: Context is the factor people leave out, and it is the one that was sitting in the database the whole time.',
      'NOTE: Risk being a number is not decoration. A number is what lets you draw a threshold and then defend the threshold to somebody who is angry.',
    ),
  },
  {
    segment: 'architecture', eyebrow: '🚦 Three verdicts and the fourth case',
    title: 'Allow, deny, escalate — and the answer that has to be a denial',
    body: 'Allow is easy. Deny has one requirement that is almost always missed: it has to say why, naming the rule and the fact that lost, or nobody can fix the request and everybody routes around you. Escalate is the interesting one, and we will spend a slide on it. The fourth case is an action that matches no rule at all, and there are only two possible designs. Open by default, where anything you did not imagine is permitted, so your policy is a list of the harms you happened to think of. Or closed by default, where anything unmatched is denied, and the cost is that new actions need a rule before they work. That cost is the feature.',
    bullets: [
      'allow — proceed, and record it',
      'deny — refuse, and name the rule AND the fact it lost on',
      'escalate — do not act, park it, ask a named human',
      'no rule matched → DENY. Ungoverned means disallowed.',
      'Fail-open makes your policy a list of the harms you imagined',
    ],
    diagram: `flowchart TD
  Q{"does a rule match?"} -->|yes| V{"the verdict"}
  Q -->|no| FC["🔒 fail-closed<br/>DENY"]
  V -->|allow| S["⚡ act"]
  V -->|deny| W["🛑 rule + failing fact"]
  V -->|escalate| H["🙋 named human"]`,
    script: L(
      'SITUATION: The verdicts, and the fail-closed default that build 2 proves tonight. This is the highest-value ninety seconds of the segment.',
      'ROOM: Diagram up. The three verdicts should already be on the board from the map slide; point at them rather than re-reading.',
      'MOOD: Firm. The fail-closed default is not a preference and should not be presented as debatable.',
      'OPEN: "An action arrives that matches nothing in your policy file. What happens?"',
      'DO: Take a show of hands before you answer — allowed, or denied. Then give it and say the sentence: ungoverned means disallowed. The poll that confirms this fires later in the segment, so do not over-explain it now.',
      'SAY: A denial that does not say which rule and which fact is not a control. It is an obstacle, and people route around obstacles.',
      'NOTE: Somebody will object that fail-closed breaks things in production. Agree immediately — it does, at the moment a new action ships without a rule, which is the one moment you want to be told.',
    ),
  },
  {
    segment: 'architecture', eyebrow: '🙋 The human gate',
    title: 'Escalation is only a control if silence is a denial',
    body: 'Sending a high-risk action to a human sounds like the safe answer, and it is the place most governance quietly fails, in three ways. The human is given the action without the facts, so they are a rubber stamp with a job title. The approval is a token that can be used more than once, so one yes becomes two side effects. And nothing decides what happens when nobody answers — so the request sits in a queue for six days, and whether it eventually fires depends on who is cleaning up the queue. A pending action needs an expiry, and the expiry has to be a denial.',
    bullets: [
      'Give the human the FACTS, not just the request — otherwise they are decoration',
      'An approval is single-use. One yes, one side effect, ever.',
      'Name the approver in the record. "Approved" is not a person.',
      'Unanswered must expire as DENIED. Silence is not consent.',
    ],
    diagram: `flowchart LR
  E["🙋 escalated<br/>+ the 5 facts"] --> D{"decision"}
  D -->|approve| S["⚡ act ONCE<br/>token spent"]
  D -->|deny| X["🛑 never acts"]
  D -->|nobody answers| T["⏳ expires"]
  T --> X`,
    script: L(
      'SITUATION: The human gate — the decision the theater poll is about to test on the room itself. Slow down; this is the slide that makes the poll land.',
      'ROOM: Diagram up. Have the poll ready to fire the moment you finish the last bullet.',
      'MOOD: Slow and slightly wry. Everybody in the room has approved something they did not read.',
      'OPEN: "Show of hands: who has approved something this month that they did not actually read?"',
      'DO: Take the hands, laugh, then say it straight — that is not a character flaw, that is what happens when a request arrives without the facts attached.',
      'SAY: Silence is not consent. If nobody answers, the answer is no, and the system should be the thing that says so rather than whoever happens to tidy the queue on Friday.',
      'DO: End on the expiry bullet and leave it hanging. Do not preview the request the room is about to judge, and do not hint that anything is missing from it.',
      'NOTE: The decision-theater poll is the centrepiece of the night and it does NOT fire from this slide — the story card comes first, then the poll. Keep the human gate fresh in the room for those sixty seconds.',
    ),
  },

  /* ============================ deconstruct =========================== */
  {
    segment: 'deconstruct', eyebrow: '🔬 Step by step',
    title: 'The refund nobody approved, in six steps',
    body: 'Read it as a story, not as code. Step one, a request arrives that reads as ordinary. Step two, the agent decides it is legitimate, which is a judgement, not a permission. Step three, the agent calls the refund tool, because the tool is in its toolbox and nothing stands between the two. Step four, the money moves. Step five, a line is written to a log that nobody reads and anybody could edit. Step six, someone notices on Thursday. One change makes every one of these steps safe, and it goes between step two and step three.',
    bullets: [
      '1 request · 2 the agent believes it · 3 calls the tool · 4 money moves · 5 a log nobody reads · 6 Thursday',
      'The agent made a judgement. Nothing turned that judgement into a permission.',
      'Fix: one gate between step 2 and step 3, and nothing else reaches the tool',
      'Every step was correct. That is what makes it dangerous.',
    ],
    diagram: `flowchart LR
  S1["1 · request"] --> S2["2 · agent believes"]
  S2 --> S3["3 · calls the tool"]
  S3 --> S4["4 · 💸 money moves"]
  S4 --> S5["5 · log nobody reads"]
  S5 --> S6["6 · 📱 Thursday"]
  G["🛡️ gate here"] -.would stop 3.-> S2`,
    script: L(
      'SITUATION: The forensics on the business-segment story. Six steps, one place to draw the gate.',
      'ROOM: The six boxes on screen. Step away from the keyboard — this is told, not shown.',
      'MOOD: Methodical. You are building a checklist in front of them, step by step.',
      'OPEN: "Replay it, and mark the one place a gate would have ended it."',
      'DO: Walk the six boxes with your finger. Stop at step two and ask what the agent actually did there. It formed an opinion. Ask when an opinion became a permission — and the answer is that nobody ever made that distinction, so the two were the same thing.',
      'SAY: A judgement is not a permission. The gate is the piece of code whose whole job is to keep those two things apart.',
      'NOTE: Do not blame the agent. The agent did what a system with no gate does. That distinction is the whole lesson.',
    ),
  },
  {
    segment: 'deconstruct', eyebrow: '🧾 The record',
    title: 'A log you can edit is not evidence, and a log nobody can read is not a record',
    body: 'Step five is the one people defend, because there was a log. But a log is only worth something if two things are true. It has to be reconstructable: one id that threads a decision from the request through the facts, the verdict, the approver and the side effect, so that answering "why did this happen" takes a minute and not a week. And it has to be tamper-evident: each entry chained to the one before it, so an edit to any past line is detectable rather than invisible. Thursday you build both, and then you edit your own audit log on purpose to watch the check catch you.',
    bullets: [
      'One correlation id per decision, on every line it touches',
      'Reconstruct: request → facts → risk → verdict → rule → approver → side effect',
      'Append-only, and each entry carries the fingerprint of the one before it',
      'Change any past line and the chain breaks at exactly that row',
      'You will break your own on Thursday, deliberately, and watch it get caught',
    ],
    diagram: `flowchart LR
  E1["entry 1<br/>hash A"] --> E2["entry 2<br/>prev A · hash B"]
  E2 --> E3["entry 3<br/>prev B · hash C"]
  E3 --> V{"🔍 verify"}
  X["✏️ edit entry 2"] -.-> E2
  V -->|chain breaks at 2| D["🚨 detected"]`,
    script: L(
      'SITUATION: The last teaching slide before the break. It sets up Thursday’s best moment — the room tampering with its own audit log and getting caught.',
      'ROOM: Diagram up. Walk the chain left to right with your finger, then point at the edit arrow.',
      'MOOD: Slightly conspiratorial. You are telling them they are going to be allowed to cheat on Thursday.',
      'OPEN: "Everybody has a log. Two questions decide whether it is worth anything."',
      'DO: Ask the room how long it would take, today, to answer "why did the system do that on the 14th" for something they own. Take two answers. Nobody says a minute.',
      'SAY: Each entry carries the fingerprint of the one before it. Change any past line and the chain breaks at exactly that row — which means the record does not need to be trusted, it needs to be checked.',
      'NOTE: Say the Thursday promise out loud: you will edit one number in your own audit log and the verifier will name the row. Then the forensics poll, then the break.',
    ),
  },

  /* ============================ micro-build =========================== */
  {
    segment: 'micro-build', eyebrow: '1️⃣ Build 1 · ⏱ 3–5 min to run',
    title: 'Build an agent that can move money, and give it no rules at all',
    body: 'From nothing. Claude Code creates the governance-lab folder inside your repository, gives it its own package file so your project is untouched, and builds an agent that proposes real actions with a switch for how reasonable it feels, plus the thing that carries them out. There is no gate, no policy and no approval — on purpose. Paste it, watch the folder appear, and then look up: the next slide is taught while this runs.',
    bullets: [
      'A new isolated folder: governance-lab/ with its own package file, zero dependencies',
      'agent — modes normal · generous · sloppy · rogue, switched by an environment variable',
      'act — carries out whatever it is given and appends one line to data/ledger.jsonl',
      'No gate, no policy, no approval. Everything succeeds. That is the point.',
      'Paste it. Then advance — the authority table is written while it builds.',
    ],
    diagram: `flowchart LR
  P["📋 paste"] --> CC["🤖 Claude Code builds"]
  CC --> F["📁 governance-lab/"]
  F --> A["agent"]
  F --> X["act"]
  X --> LG["data/ledger.jsonl"]`,
    code: {
      kind: 'paste', pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — build an agent that can act, with nothing stopping it (⏱ 3–5 min)',
      code: L(
        'Build a small "acting agent" for me, from scratch, in a NEW folder inside this repository: ./governance-lab/',
        '',
        'RULES FOR EVERYTHING TONIGHT — read them before you write a file:',
        '  - Do not create, edit or delete anything outside ./governance-lab/. Not the root package file, not any config, not any ignore file. Nothing.',
        '  - Give governance-lab/ its OWN package file (or the equivalent for the language) so nothing about this project’s configuration leaks in, and use ZERO dependencies. Nothing gets installed.',
        '  - Use Node.js if it is installed on this machine, otherwise Python 3. Tell me which you chose and why.',
        '  - Before you finish, check whether this project’s lint, test, typecheck or build would pick the new folder up. If it would, tell me which tool and STOP — do not change anything outside the folder without asking me.',
        '  - Run every step yourself. Do not print commands for me to copy.',
        '',
        'What to build (two small modules, plus a data/ folder for run output):',
        '  1. agent — it PROPOSES an action as a plain object: {actionId, actor, actionType, resource, amount, context, reason}. Which action it proposes is read from the environment variable AGENT_MODE, default "normal":',
        '       normal   → refund $40 on order 7001. context: accountAgeDays 730, priorRefundsToday 0, addressChangedAfterOrder false.',
        '       generous → refund $2400 on order 7781. context: accountAgeDays 0, priorRefundsToday 4, addressChangedAfterOrder true.',
        '       sloppy   → delete the customer record 8891, reason "looks like a duplicate". context: recordHasOrders true.',
        '       rogue    → export all 40000 customer rows to a file AND email every one of them. context: requestedByEmail true.',
        '     Give every proposal a fresh actionId. The agent is not malicious and does not know it is doing anything wrong — it is being helpful in all four modes.',
        '     # WHY: you cannot get a real agent to propose something catastrophic on demand. Tonight you own one that can, so the same four cases can be run over and over.',
        '  2. act — takes a proposed action and CARRIES IT OUT: append one JSON line to governance-lab/data/ledger.jsonl recording what was done ({actionId, actionType, resource, amount, at}). For the export and the email, record the row count and the recipient count. Nothing actually leaves the machine; the ledger line IS the side effect for tonight.',
        '     # WHY: the ledger line stands in for money moving, a record disappearing and forty thousand emails leaving. Everything this week is about what has to be true before that line is allowed to be written.',
        '  3. A README.md in the folder: what this is, how to run it, how to set the agent mode. Six lines is enough.',
        '  4. A .gitignore INSIDE governance-lab/ that ignores data/ — run output is not source.',
        '',
        'There is deliberately NO policy, NO permission check and NO approval step. Do not add one, and do not warn me in the code that one is missing. I want to see exactly what a capable agent with an unguarded tool does.',
        '',
        'Then run it once in EACH of the four modes and show me, for each: the proposed action, and the new line in data/ledger.jsonl. Finish with the total dollars moved, the number of records deleted, the number of rows exported and the number of emails sent across the four runs, plus the exit code of each run.',
      ),
      expectedResult: 'A new governance-lab/ folder with its own package file, an agent with four modes, an act step that appends to data/ledger.jsonl, four successful runs — $2,440 moved, one record deleted, 40,000 rows exported, 40,000 emails sent — and every run exiting zero.',
      stopCondition: 'You can see four lines in governance-lab/data/ledger.jsonl and every run reported success.',
      rescue: 'If it added a permission check or refused to build the rogue mode, tell it this is a sandboxed teaching lab that writes to a local file only, nothing leaves the machine, and the missing guard is the lesson. If it touched anything outside governance-lab/, tell it to revert that and re-read the rules.',
    },
    script: L(
      'SITUATION: Build 1. The folder does not exist yet; in four minutes it does, and it contains something that can move money with nothing in its way.',
      'ROOM: Prompt block on screen. Paste it into your own Claude Code at the same moment they do, so you can show a real folder appearing if theirs drifts.',
      'MOOD: Brisk, with a small amount of mischief. You are asking them to build the thing on purpose.',
      'OPEN: "Paste this, and while it builds, look up here — we are going to write the rules it does not have."',
      'DO: Watch the pulse for thirty seconds — long enough to catch anyone whose Claude Code is not open in their repo. Then ADVANCE to the authority table. Do not wait for the build to finish.',
      'NOTE: Three people in every room do this in a throwaway folder outside their repo. Catch them now: it must be inside the repository, or Thursday’s commit has nowhere to go.',
    ),
  },
  {
    segment: 'micro-build', eyebrow: '📋 While it builds',
    title: 'The authority table: four actions, and who is allowed to do them to what',
    body: 'While Claude Code is building, write the table on the board with the room. One row per action the agent can take, and for each one: is it reversible, what would it cost to be wrong, and which of the three verdicts should it get by default. Do not let the room answer with allow or deny alone — make them say which fact changes the answer, because that fact is the context factor and it is the one everybody leaves out. This table is the specification for the rest of the week. Every prompt from here implements one row of it.',
    bullets: [
      'refund ≤ $100 → allow · reversible · low risk',
      'refund > $500 → escalate · and deny outright if the account is new or has refunded today',
      'delete a customer with orders → deny · not reversible · no amount makes it safe',
      'export or email the whole list → deny · the blast radius is everyone at once',
      'anything not on this table → DENY. That row is the one that saves you.',
    ],
    diagram: `flowchart LR
  R1["💵 refund ≤ $100"] --> A1["✅ allow"]
  R2["💰 refund > $500"] --> A2["🙋 escalate<br/>deny if new account"]
  R3["🗑️ delete w/ orders"] --> A3["🛑 deny"]
  R4["📧 export / mail all"] --> A4["🛑 deny"]
  R5["❓ not on the table"] --> A5["🔒 deny"]`,
    script: L(
      'SITUATION: Taught while build 1 runs. This is the specification for the rest of the week, written as a table on the board WITH the room rather than read off the screen.',
      'ROOM: Marker in hand. Five rows on the board: small refund, big refund, delete, export, and the empty row. The screen has the answers; the board is where you write theirs.',
      'MOOD: Collaborative and quick. Ask for each verdict before you write it.',
      'OPEN: "Four things your agent can now do, and one row for everything you have not thought of. Give me the verdict on each and I will write it down."',
      'DO: Row by row. When somebody says "allow" or "deny", push once: which fact would change your answer? Write that fact in a second column. That column is the context factor and it is what makes this attribute-based instead of a list of banned verbs.',
      'DO: On the delete row, ask whether a big enough refund could ever be safe and whether a delete could. Reversibility is the difference, and it is a factor, not a feeling.',
      'DO: Check the pulse. When most of the room has a folder and four ledger lines, move to build 2. Anyone still building keeps going — build 2 waits for build 1, not for the slide.',
      'NOTE: Leave the table on the board. Thursday’s policy file is this table with rule ids next to it.',
    ),
  },
  {
    segment: 'micro-build', eyebrow: '2️⃣ Build 2 · ⏱ 3–5 min to run',
    title: 'Write one rule, close the default, and stop three things you never wrote a rule for',
    body: 'Now the gate goes in, with the smallest possible policy: exactly one rule, plus a closed default. The rule says refunds over five hundred dollars are refused. The default says anything that matches no rule is refused. Then you prove it on all four modes, and the result is the point of the night: one rule you wrote stops one thing, and the default you closed stops two more that you never considered. If any mode still reaches the ledger, the gate is in the wrong place.',
    bullets: [
      'policy.json — ONE rule: refund over $500 → deny',
      'Fail-closed default: no matching rule → deny, with that stated as the reason',
      'The gate sits between the proposal and act. Nothing else may call act.',
      'Proof: normal → allowed · generous → denied by the rule · sloppy and rogue → denied by the default',
      'Every verdict, including the allow, is appended to data/decisions.jsonl',
    ],
    diagram: `flowchart LR
  AG["🤖 agent"] --> G{"🛡️ gate"}
  G -->|normal| OK["✅ allow → ledger"]
  G -->|generous| D1["🛑 rule: refund > $500"]
  G -->|sloppy| D2["🔒 no rule matched"]
  G -->|rogue| D3["🔒 no rule matched"]
  G --> DEC["🧾 decisions.jsonl"]`,
    code: {
      kind: 'paste', pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — one rule, a closed default, and proof on all four modes (⏱ 3–5 min)',
      code: L(
        'Stay inside ./governance-lab/ — nothing outside it changes. Zero dependencies. Run everything yourself; do not print commands for me to copy.',
        '',
        'Put a gate between the agent’s proposal and act, so that act can no longer be reached any other way.',
        '',
        '  1. A policy file, governance-lab/policy.json, holding exactly ONE rule for now:',
        '       id "refund-limit" — if actionType is refund and amount is greater than 500, the verdict is deny.',
        '     Keep it as data in a file, not as an if-statement in the code.',
        '     # WHY: a policy that lives in code can only be changed by someone who can deploy. A policy that lives in data can be read, reviewed and argued about by the people who actually own the risk.',
        '  2. A gate module with evaluate(action) that returns {verdict, reason, ruleId}. It checks the action against every rule in policy.json. If a rule matches, return its verdict, the rule id, and a reason that names BOTH the rule and the fact that lost — for example "refund-limit: amount 2400 exceeds 500".',
        '     If NO rule matches, return deny with ruleId "default-deny" and the reason "no rule permits this action".',
        '     # WHY: this is fail-closed. Anything you did not write a rule for is refused, so your policy is a list of what is permitted rather than a list of the harms you happened to imagine.',
        '  3. Wire it in so the ONLY path to act is through evaluate. If the verdict is allow, act runs. If it is deny, act must not run at all and the reason is printed. Make it structurally impossible for the agent to reach act directly — if there is still a way, tell me where it is.',
        '  4. Every evaluation, allow or deny, appends one JSON line to governance-lab/data/decisions.jsonl: actionId, actionType, amount, verdict, ruleId, reason, at.',
        '     # WHY: a denial is a decision somebody will question later. It is recorded exactly as carefully as an approval.',
        '',
        'Then PROVE it. Run all four AGENT_MODE values again and show me each run’s output:',
        '  - normal   → verdict allow, a new line in data/ledger.jsonl.',
        '  - generous → verdict deny, ruleId refund-limit, reason naming the amount, and NO new ledger line.',
        '  - sloppy   → verdict deny, ruleId default-deny, and NO new ledger line. You did not write a rule about deleting customers.',
        '  - rogue    → verdict deny, ruleId default-deny, and NO new ledger line. You did not write a rule about exporting or emailing either.',
        '',
        'If any mode still reaches the ledger, the gate is bypassable — find the path and close it before you tell me you are done.',
        '',
        'Finish with a four-row table: mode, verdict, ruleId, ledger line written yes/no. Then one sentence: how many of the three blocked actions did I actually write a rule for?',
      ),
      expectedResult: 'Four runs: normal allowed and written to the ledger; generous denied by refund-limit naming the amount; sloppy and rogue denied by default-deny. A four-row table, and the observation that one written rule plus a closed default stopped three different actions.',
      stopCondition: 'You have seen "default-deny" refuse something you never wrote a rule about, and the ledger did not grow for any denied run.',
      rescue: 'If a denied run still wrote to the ledger, act is reachable without the gate — tell it to make evaluate the only path. If sloppy or rogue was allowed, the default is open; tell it that an action matching no rule must be denied with ruleId default-deny.',
    },
    script: L(
      'SITUATION: Build 2, and the close of the night. One rule, one closed default, and a result that is bigger than the rule.',
      'ROOM: Prompt block on screen. Clock visible: this is the block that can run long, and the challenge poll still follows.',
      'MOOD: Build energy, then one full stop when the first "default-deny" appears on somebody’s screen.',
      'OPEN: "One rule. You are going to write exactly one rule, and it is going to stop three things."',
      'DO: When the first person gets their four-row table, have them read it aloud. One allow, one denial by the rule, two denials by the default.',
      'DO: Then ask the closing question out loud: how many rules did you write for deleting a customer, or exporting forty thousand rows? None. Let that sit.',
      'SAY: You did not think of those. The closed default did. That is the entire argument for fail-closed, and you just ran it.',
      'NOTE: Point at Thursday: the other four factors, the human gate, the expiry, the tamper-evident record — and then the same four modes against a copy with the gate removed, to count what it costs.',
    ),
  },
];

/* ---------------------------------------------------------- story beats ---- */
/* World stories only — no program call-backs. One per segment, three total. */
const STORY_BEATS = [
  {
    segment: 'business-problem',
    icon: '🚨', tone: 'amber', eyebrow: 'Change of pace — a story from an island',
    title: 'One person clicked the real one instead of the drill, and a state had thirty-eight minutes to think about it',
    body: 'In January 2018 an emergency worker in Hawaii, running what he understood to be a routine exercise, selected the live option instead of the test option. A ballistic missile alert went to every phone in the state. People said goodbye to their families. It took thirty-eight minutes to send a correction, because the system had a button for sending an alert and no equivalent button for taking one back. Nobody had been careless in a way anybody would have noticed beforehand. The interface simply treated the drill and the real thing as two items in the same list, asked nobody to confirm, and made the action irreversible.',
    punch: 'An irreversible action with no second pair of eyes is not a workflow. It is an accident with a schedule.',
  },
  {
    segment: 'architecture',
    icon: '🛰️', tone: 'violet', eyebrow: 'The night the human in the loop was the whole system',
    title: 'The screen said five missiles were inbound, and one man decided it was wrong',
    body: 'In September 1983 a Soviet early-warning officer named Stanislav Petrov watched his system report an incoming American missile launch, then another, then five in total, with the highest confidence the system could express. His standing procedure was to report it up the chain. He judged it a false alarm instead, on the reasoning that a real first strike would not consist of five missiles. He was right: the satellites had caught sunlight glinting off high-altitude clouds. The system was working exactly as designed. Its design was the problem.',
    punch: 'A human in the loop is only a control if they have the facts and the standing to say no.',
  },
  {
    segment: 'micro-build',
    icon: '💊', tone: 'leaf', eyebrow: 'Before you build — why we take the capability away',
    title: 'Hospitals stopped training people to be careful with it, and took it off the shelf instead',
    body: 'Concentrated potassium chloride is lethal if it is given undiluted, and for years it sat on ward shelves next to things that looked like it, protected by labels, training and the professionalism of exhausted people at three in the morning. The fix that finally worked was not a better label or another training module. It was removing the vials from general ward stock, so that the dangerous action stopped being something you had to remember not to do and started being something you could not reach.',
    punch: 'Every control that depends on somebody remembering is a control that works until the night it matters.',
  },
];

/* --------------------------------------------------------- interactions ---- */
const INTERACTIONS = [
  {
    segment: 'checkin', kind: 'poll',
    q: 'Be honest — has anything you have built ever taken a real-world action (sent, charged, posted, deleted) that you had not explicitly written down as permitted?',
    options: ['Yes, and it was fine', 'Yes, and it was not fine', 'No — nothing I build can act', 'I genuinely do not know'],
    eyebrow: '🌡️ Honest check', title: 'Has anything of yours ever acted without permission?',
    presenterTip: L(
      'SITUATION: The first poll, before any teaching. No right answer; the spread is the point.',
      'ROOM: Poll up on the phone. Nothing else on screen.',
      'MOOD: Light. This is a show of hands with numbers.',
      'OPEN: "No wrong answer here. Be honest."',
      'DO: Read the spread aloud. The last option usually does better than people expect, and that number is the thesis of the week — say so. If somebody picks the second option, ask what it did; their answer sets up the business segment for you.',
    ),
  },
  {
    segment: 'business-problem', kind: 'poll',
    q: 'A live emergency alert goes out by mistake and takes thirty-eight minutes to retract. What was actually missing?',
    options: [
      'Better training for the operator',
      'A second person confirming before it fired',
      'A clearer interface',
      'A confirmation dialog on the button',
    ],
    answer: 1,
    reveal: 'A second person. Training, interfaces and dialogs all put the entire control inside one tired human at one moment — and every one of them is defeated by a person who is sure they are doing the routine thing. An irreversible action affecting everyone needs somebody else to agree, and a way back.',
    eyebrow: '🌙 The 3 AM question', title: 'One click went out to a whole state. What was missing?',
    presenterTip: L(
      'SITUATION: The poll that turns "somebody made a mistake" into "the design had no second pair of eyes". Take votes before revealing.',
      'ROOM: Poll up. Options one, three and four will all get real support — they are genuinely defensible.',
      'MOOD: Patient. The reveal lands harder if the room has committed.',
      'OPEN: "Vote first. Then argue."',
      'DO: Reveal and let it sit. Then say the sentence: every option except the second one puts the whole control inside one person on one day.',
      'NOTE: If somebody argues for the confirmation dialog, agree that it helps and ask what it does when the operator is certain they are running a drill. Nothing. That is the difference between friction and a control.',
    ),
  },
  {
    segment: 'architecture', kind: 'poll', theater: true,
    q: 'You are the approver. Request 7781: refund $2,400 to the customer on order 7781. The agent’s note says the customer reports the item never arrived. Approve or deny?',
    options: [
      'Approve — the customer is owed the money',
      'Deny — that is too much money for an agent to request',
      'Escalate — I do not have enough to decide',
      'Approve, and flag it for review afterwards',
    ],
    answer: 2,
    reveal: 'The only defensible answer is the third, because you were not given the facts. The account was created six minutes ago. There have already been four refunds on it today. The shipping address was changed after the order was placed. All three were in the database when you voted. An approver without the facts is not a control — they are a signature. This is why the five factors travel WITH the request, and why the risk score is computed before a human ever sees it.',
    eyebrow: '🎭 Decision theater', title: 'You are the approval queue. Decide.',
    presenterTip: L(
      'SITUATION: The centrepiece of the night. The room IS the human-in-the-loop queue, and they are about to be shown what it feels like to be one without the facts. Do NOT hint that anything is missing.',
      'ROOM: Full-screen theater. Read the request aloud exactly as written, in a flat voice, the way a queue item would read at 4:50 on a Friday.',
      'MOOD: Matter-of-fact, then dead quiet on the reveal.',
      'OPEN: "You are on the approval rota. This is in your queue. Lock a vote."',
      'DO: Wait for the room to commit. Most will split between approving and denying — both of which are guesses. Then reveal the three withheld facts one at a time, slowly, pausing after each.',
      'DO: Ask the people who voted to approve whether they would have changed their vote. Then ask the deniers what they would have said to a genuine customer who really was owed $2,400. Neither group had enough to be right.',
      'NOTE: Land it on the third option and say it plainly: the correct answer was "I cannot decide with this", and the system’s job is to make sure that answer is never needed — the facts arrive attached to the request.',
    ),
  },
  {
    segment: 'architecture', kind: 'trivia',
    q: 'An action arrives that matches no rule in your policy. What should happen?',
    options: ['It is allowed — no rule forbids it', 'It is denied — no rule permits it', 'It is logged and allowed', 'The system errors out'],
    answer: 1,
    reveal: 'Denied. Fail-closed means ungoverned equals disallowed. Fail-open turns your policy into a list of the harms you happened to imagine, and every new action ships unprotected by default. The cost of fail-closed is that new actions need a rule before they work — which is exactly the moment you want to be told.',
    eyebrow: '🎯 Knowledge check', title: 'No rule matched. Now what?',
    presenterTip: L(
      'SITUATION: The confirmation, not the teaching — this fires right after the theater poll, several slides on from where you first gave the answer. Thirty seconds.',
      'ROOM: Poll up. The room is still warm from the approval vote, so keep this brisk.',
      'MOOD: Quick.',
      'OPEN: "Faster one, and this is the default your build is about to run on."',
      'DO: Reveal, one line of why, move. If the room still splits toward the first option, spend ten extra seconds — they prove this default themselves in build 2 and it is worth the time.',
    ),
  },
  {
    segment: 'deconstruct', kind: 'poll',
    q: 'In the six-step refund, which single change makes it impossible?',
    options: [
      'Better instructions in the agent’s prompt about its limits',
      'Evaluate the action against a policy before the side effect, as the only path',
      'Log every action the agent takes',
      'Cap the refund field in the support interface',
    ],
    answer: 1,
    reveal: 'The gate, as the only path. Instructions in a prompt are a request — a model can be argued out of them, and nothing enforces them. Logging records the loss. Capping the interface protects the humans using the interface, and the agent never goes through it. Only a check the action cannot get around is a control.',
    eyebrow: '🔬 Forensics', title: 'What would have stopped it?',
    presenterTip: L(
      'SITUATION: The poll that closes the forensics. Most of the room gets it now, which is the point — they could not have an hour ago.',
      'ROOM: Poll up.',
      'MOOD: Satisfying.',
      'OPEN: "You have seen the six steps. One change. Which?"',
      'DO: Reveal, then pick on the fourth option — capping the interface — and ask who the agent asks for permission. Nobody. It calls the tool directly. That answer proves they understand the shape, not just the slide.',
    ),
  },
  {
    segment: 'challenge', kind: 'poll', theater: true,
    q: 'Where does the gate actually go?',
    options: [
      'In the prompt — tell the agent what it is not allowed to do',
      'Between the proposal and the side effect, as the only path to the tool',
      'Inside each tool, as a check at the top of every handler',
      'After the action, as a review queue somebody works through',
    ],
    answer: 1,
    reveal: 'Between the proposal and the side effect, as the only path. A prompt is a request, and a model can be talked out of it by the next message. A check at the top of every handler is the same rule written in many places, which means it is eventually written wrong in one of them. A review queue afterwards finds out about the money after it has moved.',
    eyebrow: '🧭 Architecture challenge', title: 'A design decision for Thursday',
    presenterTip: L(
      'SITUATION: The design-choice poll, and the tail of the night. Expendable if the clock is gone — but it is the CP1 decision for Thursday, so it is worth two minutes.',
      'ROOM: Theater up. Read all four options aloud, slowly. The first one will get real votes, and it should.',
      'MOOD: Quick and confident.',
      'OPEN: "One design decision before you go, and you build exactly this on Thursday."',
      'DO: Reveal, then spend the time on the first option specifically. Ask what happens when a user writes "ignore your previous instructions" — the prompt is a request, the gate is code. That distinction is the single most important thing in the segment.',
    ),
  },
  {
    segment: 'trivia', kind: 'trivia',
    q: 'An approval token that can be used twice is…',
    options: ['Convenient', 'A second action nobody approved', 'Required for retries', 'More reliable'],
    answer: 1,
    reveal: 'A second action nobody approved. One human said yes once. If that yes can be spent twice, the second side effect has no approver, and the audit trail will happily show an approval against it. One yes, one action, ever.',
    eyebrow: '🎯 Knowledge check', title: 'Last one',
    presenterTip: L(
      'SITUATION: Quick check at the tail. Skip it if you are past 8:15 — the trailer matters more.',
      'ROOM: Poll up.',
      'MOOD: Fast.',
      'OPEN: "Last one, then the trailer."',
      'NOTE: Reveal, one line, move. This is the CP2 trap on Thursday, so planting it here is worth thirty seconds.',
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
    'ROOM: Cover full screen. Your own repo open in a second window with no governance-lab folder in it.',
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
    'OPEN: "Every AI disaster is an action nobody said it could not take."',
    'NOTE: Say it, then three seconds of silence. Half the room is thinking about something they have already shipped.',
  ),
  'segment:cold-open-0': L(
    'SITUATION: The promise. Show what exists by Thursday before any theory.',
    'ROOM: The four things on screen — the policy that refuses, the queue that waits, the expiry, the record that cannot be edited quietly.',
    'MOOD: Concrete. This is a thing, not a concept.',
    'OPEN: "By Thursday, this exists — and you build it from an empty folder, inside your own repo, without touching your project."',
    'DO: Read the promise as a list: it refuses and says why, it stops the expensive one and waits for a person, it says no when nobody answers, and it can prove nobody edited the record afterwards.',
    'NOTE: Sell the outcome, not the vocabulary. The architecture segment names the parts.',
  ),
  'bullets:business-problem-0': L(
    'SITUATION: Segment opener. Turn from "an agent can act" to why a business pays for a gate.',
    'ROOM: Bullets on screen. Nothing to run.',
    'MOOD: Commercial. Stakes, not syntax.',
    'OPEN: "Autonomy is not the risk. Autonomy with unbounded authority is the risk, and only one of those two is written down anywhere."',
    'DO: Read the list of primitives ONCE, fast, as vocabulary — not as a lesson. The next two slides carry the story.',
  ),
  'storybeat:business-problem-900': L(
    'SITUATION: Change of pace after two heavy slides. The story from Hawaii, and it lands right before the poll that asks what was missing.',
    'ROOM: Story card full screen. Away from the keyboard.',
    'MOOD: Storyteller. Slow down, and do not editorialise while telling it.',
    'OPEN: "In January 2018, somebody in Hawaii clicked the real one instead of the drill."',
    'SAY: Thirty-eight minutes. There was a button for sending it and nothing equivalent for taking it back.',
    'NOTE: Land the punch line and go straight into the poll. Do not answer the poll’s question here — the room is about to.',
  ),
  'architecture:architecture-0': L(
    'SITUATION: Segment opener for the biggest teaching block. The whole week drawn as one system — this diagram has no body, so what you SAY is the read screen.',
    'ROOM: Diagram full screen. It runs TOP TO BOTTOM. Walk it with your hand: the agent at the top, the diamond, the three exits, and the store at the bottom that everything lands in.',
    'MOOD: Settle in. This is the map for the next twenty minutes.',
    'OPEN: "One agent that wants to act. Everything on this slide is a decision about whether it gets to."',
    'SAY: Start at the top. An agent wants to act. Not "an agent has gone wrong" — an agent doing its job, confidently, at speed. That box is the normal case, not the failure case.',
    'SAY: Everything goes through the diamond, and the diamond has five inputs written into it: user, resource, action, context, risk. Who is asking. What they want to touch. What verb. What is true around it right now. And how expensive it would be to be wrong. Those five facts are the entire decision.',
    'SAY: Follow the left branch. Allow — the action executes. That is the path we all already build, and it is the only path most systems have.',
    'SAY: Follow the middle branch. High risk — it does not execute. It goes to a human, and only an approval brings it back to execute. The arrow rejoining on the right is the important part: approval resumes the ORIGINAL action, it does not start a new one.',
    'SAY: Follow the right branch. Deny — fail-closed. Not an error, not a crash. A refusal that names the rule and the fact it lost on, so the person on the other end knows what to change.',
    'SAY: Now the bottom. Every path ends in the audit trail, keyed on one correlation id. Allowed, denied, escalated, approved — all four are decisions, and a denial is recorded exactly as carefully as an approval. If you cannot reconstruct a refusal, you cannot defend it.',
    'SAY: Read it once more as a shape. One chokepoint, three exits, one record. Tonight you build the chokepoint and one rule. Thursday you build the other two exits and the record.',
    'DO: Ask the room which of the three exits their current systems actually have. Almost everybody has the first one only. Take one answer before you move.',
  ),
  'storybeat:architecture-900': L(
    'SITUATION: Change of pace after the four decision slides, and the run-up to the decision-theater poll that comes next. Petrov — the human in the loop who was the entire control.',
    'ROOM: Story card full screen. Step away from the keyboard.',
    'MOOD: Slow, and without triumph. This is not a story about a hero; it is a story about a design.',
    'OPEN: "In September 1983 a screen told one man that five missiles were on their way, with the highest confidence it could express."',
    'SAY: The system was working exactly as designed. Its design was the problem.',
    'DO: Land the punch line, then go straight into the poll — the room is about to be put in his chair with the facts taken away.',
    'NOTE: He had the standing to say no AND enough context to judge. Strip either one and the story ends differently. Do not spell that out here; the poll is about to do it for you.',
  ),
  'example:deconstruct-0': L(
    'SITUATION: Segment opener for the forensics. The example is the $2,400 refund from the business segment, now step by step.',
    'ROOM: One line on screen. Have the six steps in your head.',
    'MOOD: Methodical.',
    'OPEN: "We are going back to the refund, and this time we replay it one step at a time."',
    'DO: Set the rule for the segment: we are not looking for who was careless. We are looking for the one place a gate would have ended it.',
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
    'NOTE: Warn them once about build 1: it deliberately has no safety check in it, and Claude Code may offer to add one. Tell it not to. The missing guard is the lesson.',
  ),
  'storybeat:micro-build-900': L(
    'SITUATION: The closer of the build, after build 2 and before the challenge poll. Why the answer is to remove the capability rather than to be careful with it.',
    'ROOM: Story card full screen. Builds are still finishing on some screens — that is fine.',
    'MOOD: Warm and a little blunt.',
    'OPEN: "Hospitals stopped asking people to be careful with it and took it off the shelf instead."',
    'SAY: Every control that depends on somebody remembering is a control that works until the night it matters.',
    'NOTE: Tie it to what they just watched: they did not remember to write a rule about deleting customers, and the closed default did not need them to. Then the challenge poll.',
  ),
  'cta:trailer-0': L(
    'SITUATION: The close. Open loop into Thursday, and the one instruction for the week.',
    'ROOM: Trailer slide up. Last thing on the display.',
    'MOOD: Momentum. They leave with a folder that did not exist two hours ago and an agent they have already had to restrain.',
    'OPEN: "Thursday: the other four factors, the human gate that expires, and a record you cannot edit without getting caught — and then we take the gate out of a copy and count what it costs."',
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
// The from-scratch rule, made mechanical: nothing may point at earlier weeks
// or at anything built in them. Week 10, so the window is weeks 1-9.
const PRIOR_REFS = [
  /\bweeks?\s*[1-9]\b/i, /\bW[1-9]\b/, /\bW[1-9][–-][1-9]\b/, /\borientation\b/i, /\bdragon\b/i,
  /\bintensive\s*[1-4]\b/i, /\blast (week|time|session|class)\b/i, /\bcapstone\b/i,
  /\breliability-lab\b/i, /\border desk\b/i,
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
      if (!/governance-lab/.test(s.code.code)) bad.push(label + ': prompt does not name the lab folder');
      if (!/⏱/.test(s.eyebrow) || !/⏱/.test(s.code.label)) bad.push(label + ': build slide without a ⏱ estimate');
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
