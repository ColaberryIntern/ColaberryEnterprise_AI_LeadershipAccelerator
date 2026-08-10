/**
 * weeks/week7.ts — the complete authored content pack for WEEK 7,
 * "Subagents + Multi-Agent Team" (Intensive 3 · Connect AI To The Real World).
 *
 * Arc position: Week 7 OPENS ACT III (Scale). The student arrives with one
 * capable assistant that reaches real systems, and leaves with a coordinated
 * team — plus the judgment to know when a team is the wrong answer.
 *
 * The two teaching beats this week has to land, in order of importance:
 *
 *   1. WHEN NOT TO DELEGATE. Spawning a subagent to do something you could
 *      finish in two tool calls multiplies cost and latency for nothing: it
 *      re-establishes context, re-explores what you already knew, reports back,
 *      and then you pay to read the report on every turn after. This builds
 *      directly on the token/cost literacy from Week 3 and is the slide the
 *      room should still be quoting in Week 12.
 *   2. WHY a subagent works at all — its own context window. Not "more brains".
 *      Everything else (least-privilege tools, structured summaries instead of
 *      raw dumps, parallel fan-out for genuinely independent tracks) follows
 *      from that one architectural fact.
 *
 * Recurring devices touched: "the person who isn't there" (a team of one is a
 * single point of failure), the trust ladder (weeks 7-8: it coordinates other
 * agents), and the apprentice → journeyman-with-a-crew maturation of the
 * Orientation dragon promise.
 *
 * Authoring rules honoured here: every teach slide carries its own mermaid
 * diagram (≤7 short-labelled nodes, `<br/>` for breaks) because diagrams get
 * click-zoomed to full screen; every code block is a Claude Code PROMPT the
 * student directs with, or a `kind: 'review'` block the room reads together —
 * never code to type; shell commands are labelled for the terminal explicitly;
 * and both days point at the student's OWN capstone rather than a demo repo.
 *
 * This file is long because it is one week's ENTIRE authored contribution
 * (both days, teach + narrative) in a single reviewable unit — that is the
 * whole point of the WeekPack shape. It is pure data with a type-only import,
 * so it stays dependency-free and type-checks in isolation.
 */
import type { WeekPack } from '../weekPack';

export const WEEK7_PACK: WeekPack = {
  week: 7,
  arcBeat: 'One assistant becomes a team — and you learn when NOT to delegate.',

  /* ======================================================================== */
  /*  MONDAY — Architecture Day                                               */
  /* ======================================================================== */
  monday: {
    hook: {
      headline: 'One assistant is a team of one. And a team of one is a single point of failure.',
      caption: 'Tonight you hire three more — and learn which work you must never hand to any of them.',
    },

    teach: [
      /* ========================= check-in ================================= */
      {
        segment: 'checkin', eyebrow: '🎬 Act III begins', title: 'Six weeks in you have exactly one worker — and it is now the bottleneck',
        body: 'Look at what you actually have. Week 3 gave you something that runs when you are not in the room. Weeks 5 and 6 gave it hands into a system your business depends on. Every bit of that capability lives inside one assistant, in one conversation, with one context window. Tonight is the night that stops being enough — because a single window cannot read forty files to understand your system and then make a careful, surgical edit in the same breath.',
        bullets: [
          'Act I: it works · Act II: it reaches real systems',
          'Act III asks a different question: does it hold up?',
          'One window means exploration noise and careful editing share a room',
          'One worker means independent work stands in a line',
        ],
        diagram: `flowchart LR
  Y["👤 You"] --> A["🤖 One assistant<br/>one context window"]
  A --> E["🔎 Explore"]
  A --> R["🧐 Review"]
  A --> W["✏️ Edit"]
  E --> Q["🚦 All three share<br/>the same window"]
  R --> Q
  W --> Q`,
        script: 'Name the act out loud — "this is the first night of Act III, and Act III is about scale." Then ask the question that gets hands up every time: how many of you have watched Claude read thirty files to answer one question, and then felt like it got duller for the rest of the session? That is not your imagination. It has a name, and the next segment is about it.',
      },
      {
        segment: 'checkin', eyebrow: '🗺️ Tonight', title: 'Three things — and the third is what separates an architect from an enthusiast',
        body: 'First, what a subagent actually is, which is far more specific and far less magical than "another Claude". Second, how to design one whose answer you can act on without quietly re-doing its work yourself. Third — and this is the one people skip straight past — when NOT to delegate. Every room that learns subagents on a Monday over-uses them by the following Thursday, and it costs them real money. We are going to inoculate you tonight.',
        bullets: [
          '1️⃣ What a subagent is: its own context window, its own leash',
          '2️⃣ How to make one you can trust: schema, obstacles, scoped tools',
          '3️⃣ When NOT to delegate — the expensive lesson',
          'All of it pointed at YOUR capstone, not a demo repo',
        ],
        diagram: `flowchart TD
  T["📚 Tonight"] --> A["1️⃣ What a subagent<br/>actually is"]
  T --> B["2️⃣ How to make one<br/>you can trust"]
  T --> C["3️⃣ When NOT<br/>to delegate"]`,
        script: 'Hold up three fingers and say all three. Promise the third one explicitly: "by the end of tonight you will be able to look at a task and tell me, with a reason, whether it deserves an agent." That promise is what keeps the room honest through the architecture segment.',
      },

      /* ====================== business problem ============================ */
      {
        segment: 'business-problem', eyebrow: '🧱 The ceiling', title: 'The window fills up with the wrong things, and everything after it gets worse',
        body: 'Here is the ceiling, concretely. You ask one small question — where does the enrollment webhook write to the database — and your assistant reads twenty files to be sure. The answer is two lines. But those twenty files are now permanently in the conversation, and every step you take after this one has to work around them. The signal you care about is buried under reading you already finished with. That is context pollution, and it is the reason a long session feels progressively dumber.',
        bullets: [
          'A small question can require a large amount of reading',
          'The reading stays in the window; the answer was two lines',
          'Every later step now competes with the noise',
          'This is not a model problem. It is a workspace problem.',
        ],
        diagram: `flowchart LR
  Q["❓ One small question"] --> C["🤖 Assistant reads<br/>20 files"]
  C --> A["✅ A two-line answer"]
  C --> N["🌫️ 20 files now live<br/>in your window"]
  N --> L["📉 Every later step<br/>works around the noise"]`,
        script: 'Do this live if you can: open a long session from earlier in the program and scroll up to show how much reading is sitting in it. Say the line plainly — "the answer was two lines and you are still carrying twenty files." That image does more work than any definition.',
      },
      {
        segment: 'business-problem', eyebrow: '🎯 Two problems', title: 'A team solves exactly two problems. Write down the two it does NOT.',
        body: 'This is the sentence to keep for the rest of the week, because it is the whole anti-pattern lesson compressed. Subagents solve context pollution — heavy read-only work that would otherwise foul your main window. And they solve serialization — independent work that could run at the same time but is stuck in a queue. That is the list. They do not make Claude smarter, and they do not make one small edit faster. If your problem is not one of the two, a subagent is the wrong tool and you are about to pay for the privilege.',
        bullets: [
          '✅ Problem 1: exploration noise burning your main window',
          '✅ Problem 2: genuinely independent work stuck in a sequence',
          '🚫 NOT solved: making Claude smarter — same models, same intelligence',
          '🚫 NOT solved: a small edit you could make in two tool calls',
        ],
        diagram: `flowchart TD
  T["👥 A team SOLVES"] --> P1["🧼 Context pollution"]
  T --> P2["⚡ Work stuck<br/>in a sequence"]
  X["🚫 A team does NOT"] --> N1["🧠 Make Claude smarter"]
  X --> N2["✏️ Speed up one small edit"]`,
        script: 'Write the two problems on the board and leave them there all night. From this point on, every time a student proposes a subagent, make them point at which of the two it solves. If they cannot, that is the lesson landing in real time rather than on a slide.',
      },
      {
        segment: 'business-problem', eyebrow: '💸 What a dirty window costs', title: 'You are billed for that noise again on every single turn',
        body: 'Week 3 taught you what an input token is: the system prompt, plus the tool definitions, plus the whole conversation so far, plus your question. Read that list again and notice the trap. The conversation so far includes the twenty files. So the reading you did at minute ten is re-sent, and re-billed, at minute eleven, minute twelve, and every turn until you close the session. Prompt caching softens the bill on repeated prefixes — it does not clean the signal. A window full of files nobody needs still makes the model worse at the job you actually care about.',
        bullets: [
          'Input tokens = system + tools + the ENTIRE history + your question',
          'Noise read once is re-sent on every subsequent turn',
          'Caching can soften the bill; it cannot unclutter the thinking',
          'So context hygiene is a cost decision AND a quality decision',
        ],
        diagram: `flowchart LR
  H["📚 History, including<br/>the noise"] --> T1["🔁 Turn 11"]
  H --> T2["🔁 Turn 12"]
  H --> T3["🔁 Turn 13"]
  T1 --> B["💵 Billed again<br/>every turn"]
  T2 --> B
  T3 --> B`,
        script: 'This is the bridge from Week 3 to Week 7, so take your time. Say it as a question: "if history is re-sent every turn, what does it cost you to have read twenty irrelevant files at minute ten?" Let someone in the room answer it. They will get there, and it lands far harder than you telling them.',
      },
      {
        segment: 'business-problem', eyebrow: '🏁 The payoff', title: 'By Thursday: three agents working on YOUR build plan',
        body: 'Here is where we land, so the architecture has a destination. By the end of Thursday your own repository holds a .claude/agents/ folder with three specialists: an explorer that maps code and cannot touch it, a reviewer that scores risk and cannot fix it, and an editor that is the only one allowed to write. You will run them on a real change from your own build plan, with you in the middle routing every handoff. Tonight is understanding the machine. Thursday is building it.',
        bullets: [
          'explorer — read-only, maps a subsystem, returns a structured report',
          'reviewer — read-only, scores risk, returns a verdict you can gate on',
          'editor — the only agent with write access, and it runs last',
          'You are the orchestrator, and that is not a small job',
        ],
        diagram: `flowchart LR
  P["📋 YOUR build plan"] --> O["🧑‍✈️ You, orchestrating"]
  O --> E["🔎 explorer<br/>read-only"]
  O --> R["🧐 reviewer<br/>read-only"]
  O --> D["✏️ editor<br/>the only writer"]`,
        script: 'Show the end state before you explain any of the parts. Then set the frame for the next hour: "everything I teach from here is a component of that picture — keep asking yourself which part of the team it belongs to."',
      },

      /* ========================= architecture ============================= */
      {
        segment: 'architecture', eyebrow: '🪟 The core idea', title: 'A subagent is a separate Claude with its own context window. That is the entire definition.',
        body: 'It is not a persona, not a mode, not a prompt trick, and it is emphatically not extra intelligence. When the main session delegates, a genuinely separate instance starts up: its own context window, its own system prompt, its own list of allowed tools. It cannot see your conversation. It does the work in its own space and hands back one message. Think of hiring a contractor: you give them a brief, they go work in their own office, and they hand you a report — not the contents of their desk.',
        bullets: [
          'Own context window — isolated from yours',
          'Own system prompt — the body of its Markdown file',
          'Own tool allowlist — least privilege, enforced not requested',
          'Clean slate — it has never met you',
        ],
        diagram: `flowchart LR
  MA["🧑‍✈️ Main session<br/>your conversation"] -.->|"a hard wall"| SA["🤖 Subagent<br/>own window"]
  SA --> P["📜 Own system prompt"]
  SA --> T["🧰 Own tool allowlist"]
  SA --> C["🆕 Clean slate"]`,
        script: 'Draw two boxes on the whiteboard with a hard wall between them. Say the wall is the product, not a limitation: what happens on the right stays on the right, and exactly one thin channel comes back. Kill the "more brains" misconception here, out loud, before anyone forms it.',
      },
      {
        segment: 'architecture', eyebrow: '🔁 The channel', title: 'One brief goes in. One report comes back. Everything in between is thrown away.',
        body: 'The channel is deliberately narrow, and understanding it is most of the skill. You send in one thing: a task brief. The subagent may then read forty files, run a dozen searches, and reason across thousands of tokens — and you will never see any of it. When it finishes, one message comes back. Everything else evaporates with the window. That is why the report has to be complete and self-contained: whatever it leaves out is gone permanently, because you cannot reach back into a window that no longer exists.',
        bullets: [
          'IN: one brief — it must contain everything the agent needs',
          'MIDDLE: unlimited private work you never see and never pay to carry',
          'OUT: one report — everything else is discarded',
          'The report IS the deliverable. Nothing else survives.',
        ],
        diagram: `flowchart LR
  B["📝 One brief in"] --> W["🔒 Private work<br/>reads · greps · reasons"]
  W --> X["🗑️ Discarded with<br/>the window"]
  W --> R["📄 One report out"]
  R --> M["🧑‍✈️ The coordinator"]`,
        script: 'Trace the arrows with your finger and stop on the discard node. Ask: "the subagent read forty files. How many landed in your window?" One report. Then say the consequence out loud — if the report is vague, you have lost the work, not just the summary.',
      },
      {
        segment: 'architecture', eyebrow: '🧼 The actual reason', title: 'You are not buying more brains. You are buying a window you can throw away.',
        body: 'This is the slide to remember. People adopt subagents because they imagine a committee of experts, and that is the wrong model — it is the same Claude on both sides of the wall. The real value is that exploration is expensive in tokens and cheap in signal, so you quarantine it somewhere disposable. The explorer pays for the forty files once, inside a window that ceases to exist, and your main session receives only the distilled answer. Your context stays clean, which means your main agent stays sharp for longer. The strongest use of subagents often has nothing to do with speed at all.',
        bullets: [
          'Same models on both sides of the wall — no intelligence is added',
          'Exploration: high token cost, low signal — quarantine it',
          'The throwaway window absorbs the noise and takes it with it',
          'Clean main context = a sharper main agent for the rest of the session',
        ],
        diagram: `flowchart LR
  M["🧠 Main window<br/>stays clean"] --> S["🗑️ Throwaway window"]
  S --> F["📚 40 files read<br/>in here"]
  F --> R["📄 One report"]
  R --> M`,
        script: 'Call back to the opening question directly: "remember the assistant that got duller after reading thirty files? This is the cure, and the cure is not intelligence — it is hygiene." If the room only remembers one architecture slide tonight, make it this one.',
      },
      {
        segment: 'architecture', eyebrow: '🏗️ Three pillars', title: 'A subagent you can act on has a schema, an obstacles section, and a short leash',
        body: 'An agent you cannot trust is worse than no agent, because you will act on its report without re-checking. Three design properties make a report trustworthy. A structured output, so the coordinator reads named sections instead of interpreting prose. An obstacles section, so the agent is explicitly permitted — required, actually — to say what it could not determine, because a confident wrong answer is the most expensive thing an agent produces. And scoped tools, so it physically cannot wander off the job. Miss any one and the whole team quietly becomes untrustworthy.',
        bullets: [
          '📦 Structured report — a contract the coordinator can act on mechanically',
          '🚧 Obstacles — "I could not trace X" beats a confident invention',
          '🧰 Scoped tools — least privilege, enforced by configuration',
          'One responsibility per agent. Two jobs means neither is reliable.',
        ],
        code: {
          kind: 'review',
          label: 'The output contract, written into the agent body — read it, do not paste it',
          code: 'Return EXACTLY this structure and nothing else:\n\n## Entry points\n- <file:line> - what starts here\n## Key modules\n- <file> - responsibility\n## Data flow\n1. <step> -> <step>\n## Obstacles\n- anything you could NOT determine, and why\n## Confidence\n<high | medium | low> - one sentence why',
          expectedResult: 'Five named sections. Notice that two of them — Obstacles and Confidence — exist purely to stop the agent from bluffing.',
        },
        diagram: `flowchart TD
  A["🤖 A subagent<br/>you can act on"] --> P1["📦 Structured report"]
  A --> P2["🚧 Obstacles section"]
  A --> P3["🧰 Scoped tools"]`,
        script: 'Read the Obstacles line out loud twice. Say the design intent plainly: you are ordering the agent to admit ignorance, because the alternative is a fluent paragraph you cannot distinguish from the truth. An empty Obstacles section on a hard question is a red flag, never a gold star.',
      },
      {
        segment: 'architecture', eyebrow: '🔒 Least privilege', title: 'One line in the frontmatter decides whether an agent can hurt you',
        body: 'Every subagent is a Markdown file with YAML frontmatter, and the most consequential line in it is the tools line. List the tools and the agent gets exactly those. Omit it and the agent inherits everything you have — including Edit, Write, and Bash. That means a file whose body says "you are read-only, you never modify anything" can still edit your repository, because the body is an instruction and the frontmatter is the enforcement. Instructions are persuasion. Configuration is a boundary.',
        bullets: [
          'tools present → exactly those tools, nothing else',
          'tools omitted → inherits everything, including Edit / Write / Bash',
          'The body says what it should do. The frontmatter says what it CAN do.',
          'Write the boundary you would be comfortable with on a bad day',
        ],
        code: {
          kind: 'review',
          label: 'The one line that makes an agent safe to point at any code',
          code: '---\nname: explorer\ndescription: Read-only cartographer. Maps subsystems and traces data flow. Never edits.\ntools: Read, Grep, Glob\nmodel: sonnet\n---',
          expectedResult: 'Put your finger on the tools line. That is the only line in this file that is enforced rather than requested.',
        },
        diagram: `flowchart LR
  N["📄 No tools line"] --> ALL["🧨 Inherits everything<br/>Edit · Write · Bash"]
  L["📄 tools: Read, Grep, Glob"] --> RO["🛡️ Physically cannot<br/>change your code"]`,
        script: 'Ask the room which single line makes this agent safe to point at production code. Take a couple of wrong answers first — people reach for the description or the prompt. Then land it: the tools line, because it is the only one the runtime enforces.',
      },
      {
        segment: 'architecture', eyebrow: '🕸️ Hub, not chain', title: 'Subagents never talk to each other. You are the only wire between them.',
        body: 'Students picture a relay race — the explorer hands to the reviewer, the reviewer hands to the editor. That is not what happens. Every report comes back to the main session, and the main session decides what happens next. There is no agent-to-agent messaging, and an agent cannot spawn its own agents. This sounds like a limitation and is actually the safety design: every handoff passes through a point where a human is watching, and every decision about what to do next is made somewhere you can see it.',
        bullets: [
          'Hub and spoke, not a chain — every report returns to you',
          'No agent-to-agent chatter; no recursion into more agents',
          'You decide what of the explorer report the reviewer even sees',
          'Every handoff is a checkpoint you could stop at',
        ],
        diagram: `flowchart TD
  O["🧑‍✈️ You — orchestrator"] --> E["🔎 explorer"]
  O --> R["🧐 reviewer"]
  O --> D["✏️ editor"]
  E -.->|"report"| O
  R -.->|"verdict"| O
  D -.->|"diff"| O`,
        script: 'Draw the hub and correct the relay-race picture explicitly, because half the room is holding it. Say it as a management image: this is a manager delegating, collecting reports, and deciding the next move each time — not a bucket brigade.',
      },
      {
        segment: 'architecture', eyebrow: '⚡ Fan-out', title: 'Two questions that do not need each other can be asked at the same time',
        body: 'The second legitimate reason for a team is wall-clock time on independent work. Map the billing module and map the auth module: neither answer depends on the other, so launch both in a single turn and they run concurrently in separate windows. The test is independence, and it is a hard test — if the second task needs the first task result, they must run in sequence, because the report is the only thing that crosses between windows. And be honest about the trade: parallel agents buy you time, not tokens. Each one still burns its own full context.',
        bullets: [
          'Independent tracks → launch together, they run concurrently',
          'Dependent work (B needs A) → sequence it; there is no shortcut',
          'Buys wall-clock time. Does NOT save tokens — it spends more.',
          'You do the synthesis afterwards, because synthesis needs both answers',
        ],
        diagram: `flowchart LR
  A["🔎 Map billing"] --> S["🧑‍✈️ You synthesize<br/>both reports"]
  B["🔎 Map auth"] --> S
  T["⏱️ One turn,<br/>two windows"] -.-> S
  W["⚠️ Faster, not cheaper"] -.-> S`,
        script: 'Give the real example from this program own repository: three research agents launched in one message for the Coca-Cola use-case work, returning in about two minutes instead of roughly six sequentially, with the main session doing the synthesis. Then say the honest part — that run cost more tokens than doing it one at a time, and it was still the right call.',
      },

      /* ========================== deconstruct ============================= */
      {
        segment: 'deconstruct', eyebrow: '🧾 The delegation tax', title: 'A subagent you did not need is the most expensive way to avoid two tool calls',
        body: 'This is the most important slide of the week, so slow down. Delegation is not free and the cost is not one charge, it is five. You write the brief. A fresh window boots with its own system prompt and tool definitions. It re-explores ground you already knew, because it has never seen your conversation. It writes a report. And then you read that report — and carry it in your own window, re-billed, for every turn afterwards. For a question you could have answered with one grep and one read, you just paid five times to avoid paying once.',
        bullets: [
          'Charge 1: writing the brief · Charge 2: the fresh window boot',
          'Charge 3: re-exploring what you already knew',
          'Charge 4: the report · Charge 5: carrying that report in YOUR window',
          'Illustrative arithmetic: 2 tool calls ≈ a few thousand tokens; the same answer delegated is routinely an order of magnitude more, plus a round trip of latency',
          'Do not take my numbers — run /cost in Claude Code before and after and read your own',
        ],
        evidence: [
          {
            claim: 'Per-million-token rates: Opus 5 $5 in / $25 out, Sonnet 5 $3 in / $15 out, Haiku 4.5 $1 in / $5 out',
            publisher: 'Anthropic', sourceTitle: 'Claude API pricing (platform.claude.com/docs/en/pricing)',
            publicationDate: '2026', sourceType: 'official-doc',
            note: 'Used here only to price the delegation tax in class. Rates change — open the live pricing page rather than trusting this slide, and measure the actual token counts with /cost.',
          },
        ],
        diagram: `flowchart LR
  T["🧾 One question"] --> D["📤 Write the brief"]
  D --> B["🚀 Fresh window boots<br/>system + tools"]
  B --> E["🔎 Re-explores what<br/>you already knew"]
  E --> R["📥 Writes a report"]
  R --> Y["👀 You read it — and<br/>carry it every turn after"]`,
        script: 'Walk the five charges one node at a time and count them on your fingers. Then do it live: run /cost, delegate something trivial to a subagent, run /cost again, and read the difference out loud. A measured number from your own session is worth more than any slide. Land the sentence they should quote back to you in Week 12: "the expensive mistakes in multi-agent systems do not throw errors — they just bill you."',
      },
      {
        segment: 'deconstruct', eyebrow: '🧭 The rule', title: 'Delegate a track. Never delegate an errand — and never delegate the verification.',
        body: 'Here is the rule in a form you can apply without thinking. Delegate when the work is a genuinely independent, sizeable track: a wide multi-file investigation, an unrelated module, a second opinion from a fresh pair of eyes. Do not delegate work you could finish in two tool calls, because the brief costs more than the task. And do not delegate the moment you find out whether it worked — verification is the one job that belongs to you, because a report describes what an agent believes it did, and belief is not evidence. A second opinion from an independent reviewer is fine. Outsourcing your own confirmation is not.',
        bullets: [
          '✅ DELEGATE: wide investigations, unrelated modules, independent tracks',
          '✅ DELEGATE: an independent second opinion — the maker is never its own checker',
          '🙅 DO NOT: anything you could finish in two tool calls',
          '🙅 DO NOT: your own verification. Run it yourself, in your own session.',
          'Smell test: is the task smaller than the brief describing it?',
        ],
        diagram: `flowchart TD
  Q{"🤔 Should this be<br/>a subagent?"} -->|"wide · independent<br/>· many files"| D["✅ Delegate the track"]
  Q -->|"two tool calls"| I["🙅 Do it inline"]
  Q -->|"did it actually work?"| V["🔎 Verify it yourself"]`,
        script: 'Make the room say the smell test back to you: is the task smaller than its own brief? Then push on the third branch, because it is the subtle one — a reviewer subagent giving a second opinion is good engineering; asking an agent to confirm that another agent succeeded is a rumour with extra steps.',
      },
      {
        segment: 'deconstruct', eyebrow: '🧨 Both faults at once', title: 'An explorer with every tool and no schema is not an explorer',
        body: 'This is the failure we will inject on Thursday, shown now so you recognise it when it bites. Take an agent file, omit the tools line, and give it a vague job like "look into the payments code". Two things go wrong simultaneously. With no tool boundary, your read-only mapper can edit files you never mentioned — and sometimes will, helpfully. With no output contract, it returns a wall of prose you cannot parse, cannot gate on, and cannot trust. The agent did work. None of it is safe to act on. The fix is both pillars together; either one alone leaves you exposed.',
        bullets: [
          'Missing tools line → inherits Edit, Write, Bash',
          'Missing schema → prose you must re-read to trust',
          'The body claiming "read-only" changes nothing — it is not enforcement',
          'Fix = scope the tools AND mandate the schema. Both, not one.',
        ],
        code: {
          kind: 'review',
          label: 'Broken vs fixed — the dangerous line is the one that is missing',
          code: '# BROKEN — inherits every tool, returns whatever it feels like\n---\nname: explorer\ndescription: looks into code\n---\nLook into the code and tell me what you find.\n\n# FIXED — least privilege, and a report shape you can act on\n---\nname: explorer\ndescription: Read-only cartographer. Use when a question needs reading more than 5 files. Never edits.\ntools: Read, Grep, Glob\nmodel: sonnet\n---\nYou are a read-only exploration agent... (five-section contract follows)',
          expectedResult: 'Two files. The difference that matters is one line of frontmatter and one paragraph of contract.',
        },
        diagram: `flowchart TD
  B["📄 Broken: no tools,<br/>no schema"] --> E1["✏️ Edits files<br/>you never named"]
  B --> E2["🌫️ Returns prose<br/>you cannot parse"]
  F["📄 Fixed: tools +<br/>required schema"] --> G["✅ Read-only and<br/>machine-actionable"]`,
        script: 'Hold up the broken version and say: "the dangerous line here is the one that is missing." Let that sit for a second before you reveal the fix. Tell them they will break it themselves on Thursday and feel exactly why the guardrail is not bureaucracy.',
      },
      {
        segment: 'deconstruct', eyebrow: '🧠 The amnesia', title: 'It did not hear a single word of the conversation you have been having',
        body: 'Everyone trips on this once. You spend forty minutes with your main session agreeing on an approach, then delegate "now add the field", and the subagent has no idea what "the field" is, what "the service" is, or what you decided. It sees only the words in its brief. This is the exact opposite of talking to your main session, where context accumulates for free. So write every delegation like onboarding a contractor who has read none of your emails: name the files, state the goal, list the constraints, and define what done means.',
        bullets: [
          'No access to your conversation, your decisions, or your reasoning',
          'It knows ONLY what is in the brief you send',
          'Name: the files, the goal, the constraints, the definition of done',
          'A vague brief does not fail loudly — it comes back confidently wrong',
        ],
        code: {
          kind: 'review',
          label: 'Two briefs for the same task — read both out loud',
          code: '# VAGUE — the subagent has no idea what any of this means\nNow add the field we discussed to the service.\n\n# SELF-CONTAINED — everything it needs, in the brief\nIn backend/src/services/enrollmentService.ts, trace how an enrollment\nrecord is created from the webhook payload. I need to know every place\nthe record is written or mutated before it is persisted.\nDo not edit anything. Return your five-section report. If a write path\nleaves this file, say so in Obstacles rather than guessing.',
          expectedResult: 'Same intent, two completely different outcomes. The second one names files, scope, and what to do when it hits a wall.',
        },
        diagram: `flowchart LR
  C["💬 Your 40-minute<br/>conversation"] -.->|"never crosses"| S["🤖 Subagent"]
  T["📝 The brief"] --> S
  S --> O["📄 Report"]
  N["📌 Files · goal ·<br/>constraints · done"] --> T`,
        script: 'Quick misconception check before you move: "I told the main agent our plan five minutes ago. Does the subagent know it?" Let the room answer. The confident "no" from someone who was not sure two minutes ago is the lesson landing.',
      },

      /* ========================== micro-build ============================= */
      {
        segment: 'micro-build', eyebrow: '🛠️ /agents', title: 'Make one, right now, inside your own project',
        body: 'Time to build. In Claude Code, type /agents to open the manager. It walks you through it: choose project-level so the agent lives in .claude/agents/ and gets committed with your repository, name it, write the description that tells the main agent WHEN to reach for it, and pick the tools from a list. What lands on disk is one plain Markdown file. No hidden state, no database, nothing you cannot read in thirty seconds — which means your agent is reviewable in a pull request like any other code.',
        bullets: [
          'Type /agents in Claude Code to open the manager',
          'Project-level (.claude/agents/, committed) beats user-level tonight',
          'The description is written for the ORCHESTRATOR, not for humans',
          'Pick tools deliberately — this is the least-privilege decision',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code — open the subagent manager',
          code: '/agents',
          expectedResult: 'The interactive manager opens and shows a Project agents scope pointing at .claude/agents/ in your own repository.',
          stopCondition: 'The manager opened for you and you can see the project scope. Do not create anything yet — the next two slides decide what goes in it.',
          rescue: 'Nothing happens? Confirm Claude Code is open in your capstone project folder, not in your home directory or Downloads.',
        },
        diagram: `flowchart LR
  A["⌨️ /agents"] --> S["📁 Project or<br/>user scope"]
  S --> N["🏷️ name + description"]
  N --> T["🧰 Pick the tools"]
  T --> F["📄 .claude/agents/<br/>explorer.md"]`,
        script: 'Do this live, screen shared, and narrate every choice — especially why you pick project-level: this team is a repository asset your teammates inherit on clone, not a personal preference hidden in your home directory. Let the room see the file appear on disk.',
      },
      {
        segment: 'micro-build', eyebrow: '🧬 Anatomy', title: 'The whole agent is one Markdown file you can read in thirty seconds',
        body: 'Once you can read this shape you can write one from scratch. Four fields in the frontmatter. Name is the handle you invoke. Description is when the main agent should reach for it — written for the orchestrator, which is why phrasing like "use when a question needs reading more than five files" works far better than a job title. Tools is the allowlist, and omitting it inherits everything. Model is optional. Everything below the frontmatter is the system prompt: the agent role, its process, and its output contract.',
        bullets: [
          'name — the handle',
          'description — WHEN to delegate, phrased for the orchestrator',
          'tools — the allowlist; omitting it inherits everything',
          'body — role fence + process + the required report shape',
        ],
        code: {
          kind: 'review',
          label: '.claude/agents/explorer.md — annotated. Read it, do not paste it.',
          code: '---\nname: explorer\ndescription: Read-only cartographer. Use PROACTIVELY when a question needs reading more than 5 files. Maps subsystems, traces data flow, locates code. Never edits.\ntools: Read, Grep, Glob      # least privilege — the enforced line\nmodel: sonnet                # wide, cheap reading\n---\n\nYou are a read-only exploration agent...   <- the system prompt starts here',
          expectedResult: 'Four frontmatter fields and a body. Point at the description and the tools line — those two do most of the work.',
        },
        diagram: `flowchart TD
  F["📄 explorer.md"] --> N["🏷️ name"]
  F --> D["🧲 description<br/>= WHEN to delegate"]
  F --> T["🧰 tools<br/>= what it may touch"]
  F --> B["📜 body<br/>= process + contract"]`,
        script: 'Label each line by hand on screen. Then ask the room the same question as the least-privilege slide, and see whether they get it faster this time: which single line makes this agent safe to point at any code? By now they should answer in unison.',
      },
      {
        segment: 'micro-build', eyebrow: '✍️ The contract', title: 'Write the body so the report comes back in a shape you can act on',
        body: 'The body is where reliability actually lives, and it does three jobs. It fences the role, so the agent knows it never modifies anything. It prescribes a process — search wide before reading deep, so it does not burn its window on the first file it finds. And it mandates a fixed report shape with a required obstacles section, which is how you convert a fluent guesser into a witness who will tell you what it could not see. Have Claude Code write this file for your project, then read it before you use it.',
        bullets: [
          'Fence the role: read-only, one responsibility, no scope expansion',
          'Prescribe the process: search wide, then read narrow',
          'Mandate the schema — including Obstacles and Confidence',
          'Then READ what it wrote. Reviewing is the skill, same as every week.',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          ccMode: 'Plan Mode',
          label: 'Claude Code prompt — write my explorer for MY project',
          code: 'Create .claude/agents/explorer.md in this project.\n\nFrontmatter:\n- name: explorer\n- description: written for the orchestrator, naming the trigger condition explicitly — that it should be used when a question requires reading more than about five files, and that it maps subsystems and never edits\n- tools: Read, Grep, Glob and nothing else\n- model: sonnet\n\nBody (the system prompt):\n1. Fence the role: it is read-only, it maps and reports, it never modifies files, and it never expands beyond the subsystem named in its task.\n2. Prescribe the process: search broadly with Glob and Grep first, then read only what matters, then trace the specific flow named in the task.\n3. Forbid speculation, and require it to report anything it could not determine.\n4. Mandate EXACTLY this report shape and nothing else: Entry points, Key modules, Data flow, Obstacles, Confidence.\n\nBefore you write the file, show me the description line on its own so I can read it. Then write the file and show me the finished body.',
          expectedResult: 'One Markdown file in .claude/agents/, whose description names a trigger condition and whose body ends in a five-section contract.',
          stopCondition: 'You have read your own description line out loud and it says WHEN to use this agent, not just what it is.',
          rescue: 'If the description reads like a job title ("explores code"), it is too weak — the orchestrator cannot tell when it applies. Tell Claude Code to rewrite it naming the trigger.',
        },
        diagram: `flowchart LR
  R["🎭 Role fence<br/>read-only"] --> B["📜 The body"]
  P["🧭 Process<br/>wide, then narrow"] --> B
  S["📦 Required schema<br/>+ Obstacles"] --> B
  B --> A["🤖 A report you<br/>can act on"]`,
        script: 'Stop on the description and compare a vague one to a precise one on screen — the same lesson as Skill descriptions in Week 2 and tool descriptions in Week 3, which is worth naming out loud because the pattern is now three weeks deep. Make everyone read their own description aloud before moving on.',
      },
      {
        segment: 'micro-build', eyebrow: '🚀 Prove it on your own repo', title: 'Delegate one wide question — then check what it actually cost',
        body: 'Close Monday by using what you built, on your own capstone, not a demo. Pick the widest genuinely-unknown question in your project — something that would take you twenty minutes of reading — and hand it to the explorer. Because it is read-only you can run it fearlessly on the most load-bearing part of your system. Then do the part nobody does: run /cost before and after, and look at the number. Tonight is the only night you will have a clean baseline to measure the delegation tax against.',
        bullets: [
          'Run /cost first — write the number down',
          'Delegate ONE wide question about YOUR project',
          'Read what comes back: five sections, not a file dump',
          'Run /cost again. That difference is what delegation costs you.',
          'Tap "I finished" so we know who to call on Thursday',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code — delegate one real question, then price it',
          code: '/cost\n\nUse the explorer subagent to map [THE WIDEST UNKNOWN IN YOUR OWN PROJECT — e.g. how a request travels from the entry point to the place it is persisted].\n\nIt should return only its structured report. Anything it cannot trace goes in Obstacles rather than being guessed. Do not read the whole codebase, and do not edit anything.\n\n/cost',
          expectedResult: 'A five-section report about YOUR project — and two cost readings, before and after, that you can subtract.',
          stopCondition: 'You have a report you could act on, and a real number for what that delegation cost.',
          rescue: 'Report came back as prose with no headers? The contract in the body is too soft — tighten it to "Return EXACTLY this structure and nothing else" and re-run.',
        },
        diagram: `flowchart LR
  Y["📁 YOUR capstone repo"] --> E["🔎 explorer"]
  E --> R["📄 Five-section report"]
  R --> M["🧠 Your main window<br/>stays clean"]
  C["💵 /cost before + after"] -.-> M`,
        script: 'Let the room actually read their own reports — do not narrate over it. Then call on two people for their /cost delta and write both numbers on the board; those are the baselines you will compare against on Thursday when you deliberately over-delegate. Close with the open loop: "Thursday you get three of these, coordinated on a real change in your own project — and then we deliberately waste money with them so you never do it by accident."',
      },
    ],

    storyBeats: {
      checkin: [
        {
          icon: '🧗', tone: 'violet', eyebrow: 'Act III opens',
          title: 'The apprentice is now the one who has to hire',
          body: 'In Orientation we promised that every builder starts as an apprentice and faces the dragon in Week 12. Six weeks ago you could not direct a single engineer. Tonight you can, and the job quietly changes shape underneath you. An apprentice does the work. A journeyman with a crew decides who does which piece, and lives with the consequences of choosing wrong. That is the whole of Act III, and it opens on the least romantic sentence in this program: you cannot do everything in one window.',
          punch: 'Week 1 you learned to direct one worker. Tonight you learn who not to hire.',
        },
      ],
      'business-problem': [
        {
          icon: '🏝️', tone: 'amber', eyebrow: 'The person who is not there — again',
          title: 'The integration works. One engineer understands it. She is on a plane.',
          body: 'In Week 6 you met the engineer who is the only person who understands the integration. Two weeks later it starts throwing errors at four on a Friday afternoon, and she is somewhere over the Atlantic with the wifi off. Nobody else can find where the retry lives, let alone decide whether it is safe to change. Nothing in that story is a knowledge problem. It is a capacity problem — everything routed through one worker, and that worker unavailable.',
          punch: 'A team of one is not a small team. It is an outage waiting for a calendar conflict.',
        },
      ],
      architecture: [
        {
          icon: '🧰', tone: 'berry', eyebrow: 'Change of pace — what you are actually hiring',
          title: 'A good surveyor hands you six pages, not four hundred photographs',
          body: 'When you hire someone to survey a building, they spend three days in the crawlspace, open every panel, and take four hundred photographs. What arrives at your office is six pages. You do not want the photographs — you would drown in them, and you would still end up doing the survey yourself. The value was never that they saw more than you could. It is that they made the mess somewhere that was not your desk, and handed you the conclusion.',
          punch: 'You are not buying more brains. You are buying somebody else workspace to make a mess in.',
        },
      ],
      deconstruct: [
        {
          icon: '🧾', tone: 'cherry', eyebrow: 'A true story, and a very common one',
          title: 'Eleven minutes and three agents to change one word',
          body: 'A student in an earlier cohort learned subagents on the Monday and by Thursday was delegating everything. To rename a single variable they had an explorer find it, a reviewer approve the rename, and an editor make the change. It worked flawlessly. It took eleven minutes and burned more tokens than the entire rest of the session, and the same edit in the main window would have taken four seconds. Nothing errored. Nobody noticed until they opened the usage page.',
          punch: 'The expensive mistakes in multi-agent systems never throw errors. They just quietly bill you.',
        },
      ],
      'micro-build': [
        {
          icon: '🗝️', tone: 'leaf', eyebrow: 'Before you build one',
          title: 'The colleague you can hand anything to, because they physically cannot break it',
          body: 'There is a specific kind of confidence that comes from delegating to someone who is incapable of doing damage. A read-only explorer is that colleague. You can point it at the messiest, most load-bearing corner of your system on a Friday afternoon and walk away for coffee, because the worst outcome available to it is coming back wrong. Every guardrail we are putting on it — the tools line, the schema, the obstacles section — exists to buy you exactly that feeling.',
          punch: 'Least privilege is not paranoia. It is what lets you delegate without holding your breath.',
        },
      ],
    },

    extraInteractions: [
      {
        segment: 'checkin', kind: 'poll',
        q: 'Where are you right now, honestly?',
        options: [
          '✅ My capstone repo is open in Claude Code',
          '🧩 Open, but I have not touched it since Week 6',
          '🔌 My Week 6 integration still runs',
          '😵 I need help before we start',
        ],
        eyebrow: '🚦 Roll call', title: 'Before Act III — who is actually set up?',
        presenterTip: 'Operational, not pedagogical. Read the "need help" count out loud and send mentors to those students immediately. Everything tonight lands in their own repo, so anyone without one open falls behind by the micro-build.',
      },
      {
        segment: 'business-problem', kind: 'poll',
        q: 'Has this happened to you? Claude reads thirty files to answer one question, and then feels duller for the rest of the session.',
        options: ['Constantly', 'Once or twice', 'Never noticed it', 'I start a fresh session when it happens'],
        eyebrow: '🌡️ Self-check', title: 'Name the thing you have already felt',
        presenterTip: 'No right answer. Call out the fourth option specifically — anyone picking it has already invented subagents by hand, and saying that out loud is a great way to make the rest of the segment feel like a confirmation rather than a lecture.',
      },
      {
        segment: 'architecture', kind: 'trivia',
        q: 'You spent forty minutes agreeing on a plan with your main session, then delegate "now add the field". What does the subagent know about that plan?',
        options: [
          'All of it — same project, same session',
          'The last few messages',
          'Nothing but the words in its task brief',
          'Only the file names you mentioned earlier',
        ],
        answer: 2,
        reveal: 'A fresh window means a fresh mind. Everything it needs — the files, the goal, the constraints, the definition of done — has to be inside the brief you send. This is the single most common subagent bug, and it does not fail loudly; it comes back confidently wrong.',
        eyebrow: '🧠 Misconception check', title: 'How much does it remember?',
        presenterTip: 'Take a show of hands on each option before revealing. A meaningful number will pick option 0 or 1, and watching that correction happen is worth more than the slide that precedes it.',
      },
      {
        segment: 'architecture', kind: 'poll',
        theater: true,
        q: 'Four jobs. Which one actually deserves a subagent?',
        options: [
          'Rename a variable in a file you already have open',
          'Map how billing flows through eleven files nobody has read',
          'Check whether the change you just made compiles',
          'Add one import whose path you already know',
        ],
        answer: 1,
        reveal: 'Only the wide read. The other three are two tool calls or your own verification, and delegating any of them costs money and latency while buying you nothing. Delegate a track, never an errand — and never delegate the moment you find out whether it worked.',
        eyebrow: '⚖️ The decision of the week', title: 'You are paying for this. Which one gets an agent?',
        presenterTip: 'Full-screen theater moment. Lock the votes, show the spread, then reveal. Do not rush it and do not soften option 2 — people delegate their own verification constantly, and this is where you name it. This is the slide they should quote back to you in Week 12.',
      },
      {
        segment: 'deconstruct', kind: 'poll',
        q: 'Your read-only explorer just edited a file. What do you check FIRST?',
        options: [
          'The wording of its system prompt',
          'The tools line in its frontmatter',
          'Which model it is running',
          'Your git status',
        ],
        answer: 1,
        reveal: 'A missing tools line means it inherited every tool you have, including Edit and Write. The body saying "you are read-only" is an instruction; the frontmatter is the enforcement. Check the enforcement first.',
        eyebrow: '🔎 Diagnose it', title: 'The read-only agent wrote to a file',
        presenterTip: 'Take answers before revealing — "check git status" is a popular and reasonable-sounding wrong answer, and it is a good moment to distinguish cleaning up a symptom from finding the cause.',
      },
      {
        segment: 'deconstruct', kind: 'poll',
        q: 'You delegate a question you could have answered with one grep and one read. What did that actually cost you?',
        options: [
          'Nothing — same tokens either way',
          'A little latency, no real cost',
          'Several times the tokens, plus a round trip of latency',
          'Less — the subagent runs a smaller model',
        ],
        answer: 2,
        reveal: 'Five charges, not one: the brief, the fresh boot, the re-exploration, the report, and then carrying that report in your own window for every turn afterwards. A cheaper model makes it cheaper. It does not make it free, and it never makes it worth it.',
        eyebrow: '💸 Cost check', title: 'Price the delegation you did not need',
        presenterTip: 'After the reveal, run /cost live around a deliberately trivial delegation so the room sees a real number rather than an assertion. That measured delta is the single most persuasive thirty seconds of the night.',
      },
      {
        segment: 'micro-build', kind: 'poll',
        q: 'Did your explorer come back with the five sections?',
        options: [
          '✅ All five, on my own repo',
          '🟡 It came back, but drifted from the schema',
          '🔴 It has not returned yet',
          '😵 Still stuck creating the agent',
        ],
        eyebrow: '🚦 Build check', title: 'Everyone gets a report before we finish',
        presenterTip: 'Operational. Read the counts out loud ("17 of 22 — five more"). For anyone on amber, the fix is almost always the same one line in the body: "Return EXACTLY this structure and nothing else."',
      },
      {
        segment: 'trailer', kind: 'poll',
        q: 'Which track in YOUR capstone are you handing to an explorer on Thursday?',
        options: [
          'A subsystem nobody has mapped yet',
          'Two unrelated modules, in parallel',
          'The Week 6 integration',
          'Still deciding',
        ],
        eyebrow: '📋 Commit to one', title: 'Name it now, build it Thursday',
        presenterTip: 'Have three students say theirs out loud in one sentence each. Anyone on "still deciding" gets a mentor before they leave — Thursday is built entirely on this choice, and a vague answer here produces a vague team.',
      },
    ],
  },

  /* ======================================================================== */
  /*  THURSDAY — Build Day                                                    */
  /* ======================================================================== */
  thursday: {
    teach: [
      /* =========================== build map ============================== */
      {
        segment: 'build-map', eyebrow: '🗺️ Tonight', title: 'Your project gets a team — three agents, one orchestrator, one real change',
        body: 'Tonight you ship the machine you saw on Monday, and it works on your repository rather than a sample one. Four checkpoints: scaffold the folder, build the explorer with a real output contract, grow it into a team of three with deliberately unequal power, and then drive a genuine change through all three with you routing every handoff. Then we break it on purpose three ways, because a team you have never seen misbehave is a team you do not actually understand.',
        bullets: [
          'CP0 — .claude/agents/ scaffolded in YOUR repo',
          'CP1 — explorer, with a contract you verified',
          'CP2 — reviewer + editor, with least-privilege tools',
          'CP3 — a coordinated run on a real change from your build plan',
          'Then: break it three ways, harden, and commit the team',
        ],
        diagram: `flowchart LR
  C0["0️⃣ Scaffold<br/>.claude/agents/"] --> C1["1️⃣ explorer<br/>+ contract"]
  C1 --> C2["2️⃣ reviewer<br/>+ editor"]
  C2 --> C3["3️⃣ Coordinated run<br/>on YOUR repo"]
  C3 --> BK["💥 Break it<br/>three ways"]`,
        script: 'Show a finished coordinated run on screen first — the cold open — so the room knows what they are walking toward. Then say the part that matters: this is not a tutorial you follow, it is your own project getting a team. Have two students name the change they intend to drive through it.',
      },
      {
        segment: 'build-map', eyebrow: '👥 The roster', title: 'Three roles, deliberately unequal — and only one of them can write',
        body: 'The team is small on purpose and lopsided on purpose. The explorer is read-only and maps. The reviewer is read-only and judges. The editor is the only agent with write and shell access, and it runs last, after the other two have done their jobs. That asymmetry is the safety design: mapping and reviewing can never accidentally change your code, and the one agent that can change your code has the narrowest brief and the most supervision. Watch the tools line get more powerful only where the role genuinely earns it.',
        bullets: [
          'explorer — Read, Grep, Glob · maps · cannot write',
          'reviewer — Read, Grep, Glob · judges · cannot fix what it finds',
          'editor — Read, Edit, Write, Bash · changes code · runs last',
          'If the explorer is confused or wrong, the worst it can do is be wrong',
        ],
        diagram: `flowchart TD
  O["🧑‍✈️ You"] --> E["🔎 explorer<br/>Read · Grep · Glob"]
  O --> R["🧐 reviewer<br/>Read · Grep · Glob"]
  O --> D["✏️ editor<br/>Read · Edit · Write · Bash"]
  D --> W["⚠️ The only agent that<br/>can change your code"]`,
        script: 'Walk the three rows and then ask the question that makes least privilege click: "if the explorer goes completely off the rails, what is the worst thing that happens?" Nothing — it cannot write. Then ask the same about the editor, and let the difference in the room answer why it runs last and reviewed.',
      },
      {
        segment: 'build-map', eyebrow: '🧾 Your delegation budget', title: 'Before you build a team, decide what you will never give it',
        body: 'Monday you learned the rule; tonight you apply it to your own work before you have a hammer in your hand. Open your build plan and sort it: which items are wide, independent, many-file tracks worth a subagent, and which are two-tool-call errands you should simply do. Write the list down. When the team exists in twenty minutes, the temptation to route everything through it is genuinely strong, and a decision you made in a calm moment is the only thing that reliably beats it.',
        bullets: [
          'Sort your own plan: DELEGATE track vs INLINE errand',
          'Most plans produce far fewer delegate-worthy items than people expect',
          'Write it down NOW, before you have a team to over-use',
          'Anything that is "check whether it worked" stays with you. Always.',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — sort MY build plan into delegate vs inline',
          code: 'Read my project build plan and my open tasks.\n\nFor each item, tag it DELEGATE or INLINE and give me one sentence of reasoning, using these rules:\n- DELEGATE when the work is a wide, genuinely independent track: an investigation spanning many files, an unrelated module, or a second opinion from a fresh perspective.\n- INLINE when the work could be finished in about two tool calls, when it is a small scoped edit, or when it is verification that something actually worked.\n\nThen show me the two lists side by side, with the DELEGATE list ordered by how many files each item would touch.\n\nDo not create or modify any agents yet. I want to read the sort first.',
          expectedResult: 'Two lists from YOUR plan. In most projects the INLINE list is much longer than students expect, and that surprise is the point.',
          stopCondition: 'You have a written delegate list you can defend item by item.',
          rescue: 'If almost everything came back DELEGATE, the rules were applied too loosely — tell Claude Code to re-sort and justify every DELEGATE by naming how many files it would need to read.',
        },
        diagram: `flowchart TD
  P["📋 Your build plan"] --> Q{"🤔 Wide, independent,<br/>many files?"}
  Q -->|"yes"| D["✅ DELEGATE<br/>a track"]
  Q -->|"no"| I["🙅 INLINE<br/>do it yourself"]
  D --> B["📝 Your written<br/>delegation budget"]
  I --> B`,
        script: 'This slide exists because Monday theory evaporates the moment a team is available. Ask two students to read their DELEGATE list out loud and challenge one item each — most will collapse into INLINE under a single question, and that is exactly the muscle you are building.',
      },

      /* ========================== guided build ============================ */
      {
        segment: 'guided-build', eyebrow: '0️⃣ CP0', title: 'Scaffold the folder — and make it a repository asset, not a personal preference',
        body: 'Project-level agents live in .claude/agents/ at the root of your repository, which means they get committed and every teammate who clones the repo inherits the whole team automatically. That is why we choose project scope over user scope: a team that lives in your home directory helps exactly one person and disappears when you change machines. Create the folder in your terminal, then confirm Claude Code sees it.',
        bullets: [
          'Project scope = .claude/agents/ = committed and shared',
          'User scope = ~/.claude/agents/ = personal, invisible to your team',
          'When both define the same name, project scope wins',
          'This folder IS your deliverable for the week',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'your TERMINAL (not Claude Code)',
          label: 'Terminal — create the home for your team',
          code: '# from the root of YOUR capstone project\nmkdir -p .claude/agents\nls -la .claude/agents',
          expectedResult: 'An empty .claude/agents directory listed back to you, inside your own project.',
          stopCondition: 'The folder exists and you are in the right repository — check the path, not just the output.',
          rescue: 'Created it in the wrong place? Run pwd first. This must be your capstone project root, the same folder Claude Code is open in.',
        },
        diagram: `flowchart LR
  M["⌨️ mkdir -p<br/>.claude/agents"] --> A["💻 /agents in<br/>Claude Code"]
  A --> S["📁 Project scope<br/>confirmed"]
  S --> G["🔁 Committed — your<br/>team inherits it"]`,
        script: 'Everyone runs the mkdir, then opens /agents and confirms the project scope points at their own repository. Thumbs-up check before anyone advances; a broken scaffold here silently wastes the next forty minutes.',
      },
      {
        segment: 'guided-build', eyebrow: '1️⃣ CP1', title: 'Build the explorer against the subsystem YOU could not explain last night',
        body: 'You wrote a version of this on Monday. Tonight it gets built properly and pointed at the track you named in your delegation budget. Keep the tools at Read, Grep and Glob, keep the description written for the orchestrator, and keep the five-section contract with its obstacles requirement. The one thing to change from Monday: make the description name a trigger that fits your project, in the words you would actually use about your own system.',
        bullets: [
          'tools: Read, Grep, Glob — nothing else, ever',
          'description names the trigger in YOUR project vocabulary',
          'Body: role fence → process → mandated report shape',
          'Save it, then confirm it registered in /agents',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — write .claude/agents/explorer.md for MY project',
          code: 'Create .claude/agents/explorer.md in this project.\n\nFrontmatter: name explorer; tools Read, Grep, Glob and nothing else; model sonnet; and a description written for the orchestrator that names the trigger condition explicitly — use it when a question needs reading more than about five files, it maps subsystems and traces data flow, and it never edits.\n\nBody, in this order:\n1. Role fence — read-only, maps and reports, never modifies files, never expands past the subsystem named in the task.\n2. Process — search broadly with Glob and Grep before reading, read only what matters, then trace the specific flow named in the task.\n3. No speculation — anything it cannot determine goes in Obstacles.\n4. The mandated report: Entry points, Key modules, Data flow, Obstacles, Confidence. Instruct it to return EXACTLY that structure and nothing else.\n\nUse the vocabulary of THIS project in the description, not generic wording. Show me the finished file.',
          expectedResult: 'One committed-ready Markdown file whose tools line is read-only and whose body ends in the five-section contract.',
          stopCondition: '/agents lists explorer under Project agents, and you have read the file top to bottom.',
          rescue: 'Not showing up in /agents? Check the file is in .claude/agents/ at the repo root and that the frontmatter fences (---) are on their own lines.',
        },
        diagram: `flowchart LR
  Y["📁 YOUR repo"] --> P["⌨️ Prompt: write<br/>explorer.md"]
  P --> F["📄 .claude/agents/<br/>explorer.md"]
  F --> C["📦 Schema + Obstacles<br/>+ read-only tools"]`,
        script: 'Paste it and let Claude Code work while you narrate the four body requirements. Do not run the agent yet — the next slide is the read-together, and reading before running is the habit this whole program is built on.',
      },
      {
        segment: 'guided-build', eyebrow: '👀 Review it together', title: 'Read the file before you trust it — four things to point at',
        body: 'This is roughly what should be sitting in your repository now. Read it as a room and put your finger on four things: the description names a trigger, the tools line is read-only, the process says search wide before reading deep, and the report ends in Obstacles and Confidence. Yours will not match this word for word and that is fine — what matters is that all four properties are present and you can point at each one.',
        bullets: [
          'The description names WHEN, not just what',
          'tools: Read, Grep, Glob — the enforced boundary',
          'Process before reading, so it does not burn its window on file one',
          'Obstacles + Confidence — the anti-bluffing clauses',
        ],
        code: {
          kind: 'review',
          label: '.claude/agents/explorer.md — read it, do not paste it',
          code: '---\nname: explorer\ndescription: Read-only cartographer. Use PROACTIVELY when a question needs reading more than 5 files. Maps subsystems, traces data flow, locates code. Returns a structured report and never edits.\ntools: Read, Grep, Glob\nmodel: sonnet\n---\n\nYou are a read-only exploration agent. Your ONLY job is to map code and\nreport findings. You never modify files.\n\nProcess:\n1. Search broadly with Glob and Grep before reading. Read only what matters.\n2. Trace the specific subsystem or data flow named in the task.\n3. Do not speculate. If a path is unclear or a file is missing, say so.\n\nReturn EXACTLY this structure and nothing else:\n\n## Entry points\n- <file:line> - what starts here\n## Key modules\n- <file> - responsibility\n## Data flow\n1. <step> -> <step>\n## Obstacles\n- anything you could NOT determine, and why\n## Confidence\n<high | medium | low> - one sentence why',
          expectedResult: 'Four fingers on four things: description trigger, tools line, process, and the contract ending in Obstacles and Confidence.',
        },
        diagram: `flowchart TD
  F["📄 explorer.md"] --> A["🧲 description<br/>names the trigger"]
  F --> B["🧰 tools:<br/>Read · Grep · Glob"]
  F --> C["🧭 Process:<br/>wide, then narrow"]
  F --> D["📦 Five-section<br/>contract"]`,
        script: 'Open the REAL file Claude Code just wrote on your screen, not this slide — the slide is your safety net if the generated file drifted. Four points, four fingers, then move. Do not line-by-line the whole file or you will lose the segment.',
      },
      {
        segment: 'guided-build', eyebrow: '🧪 CP1 check', title: 'Prove the contract holds while there is only one agent to debug',
        body: 'Before you add anyone else to the team, stress the one you have. Delegate a question you already know the answer to in your own project, and check three things: did it return exactly the five sections, did it fill Obstacles honestly instead of leaving it empty, and did its Confidence match how hard the question actually was. If it drifted from the schema, the fix is in the body. Verify the contract now — debugging a contract with three agents in flight is a completely different evening.',
        bullets: [
          'Ask something you can personally check',
          'Verify: five sections, honest Obstacles, calibrated Confidence',
          'Drift? Tighten "return EXACTLY this structure and nothing else"',
          'An empty Obstacles section on a hard question is a red flag',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code — verify the contract on a question you already know',
          code: 'Use the explorer subagent on this question about my project: [ASK SOMETHING YOU ALREADY KNOW THE ANSWER TO — a flow you personally wrote or debugged].\n\nReturn only the structured report. In Obstacles, list anything you could not resolve — do not leave that section empty just to look confident.',
          expectedResult: 'Five sections, and an Obstacles list that names at least one honest limitation on a non-trivial question.',
          stopCondition: 'You checked the report against what you already knew and it did not invent anything.',
          rescue: 'If it fabricated a detail you know is wrong, that is the most valuable failure of the night — tighten the no-speculation clause in the body and re-run.',
        },
        diagram: `flowchart LR
  K["❓ A question you<br/>already know"] --> E["🔎 explorer"]
  E --> R["📄 Report"]
  R --> C1["✅ Five sections?"]
  R --> C2["✅ Honest Obstacles?"]
  R --> C3["✅ Calibrated Confidence?"]`,
        script: 'Have two students put their report on screen and compare the Obstacles sections. The honest one is doing its job. Say the line clearly: an empty Obstacles section on a hard question is not a gold star, it is an agent that has learned to sound sure.',
      },
      {
        segment: 'guided-build', eyebrow: '2️⃣ CP2a', title: 'Add the reviewer — the second opinion, from someone with no stake in the answer',
        body: 'The reviewer is also read-only, but its job is judgment rather than mapping. Given a plan or a diff it checks the work against the standards you care about — is it safe to run twice, are the inputs validated, is there a failure path, are secrets handled — and returns a verdict you can gate on. Keep it read-only on purpose: a reviewer that can fix what it finds has a conflict of interest, and the maker is never its own checker. This is the legitimate delegation of a second opinion, which is a different thing from delegating your own verification.',
        bullets: [
          'Read-only by design — it never fixes what it reviews',
          'Fresh context is the point: it has no attachment to the plan',
          'Returns a verdict enum you can gate the editor on',
          'This is a second opinion, NOT your verification. You still run it yourself.',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — write .claude/agents/reviewer.md',
          code: 'Create .claude/agents/reviewer.md in this project.\n\nFrontmatter: name reviewer; tools Read, Grep, Glob only; model opus; description saying it is a risk and correctness reviewer, to be used before any non-trivial edit, that it reviews a plan or a diff and returns a scored verdict, and that it is read-only and never edits.\n\nBody:\n- State that it finds what is wrong and reports it; it never fixes anything.\n- Tell it to review only what the task names and never expand scope.\n- Require it to check four things every time: is the operation safe to run twice, are inputs and outputs validated, is there a failure path with a timeout and a retry cap, and is anything sensitive being logged or exposed.\n- Mandate EXACTLY this output: a Verdict section containing one of PASS, CHANGES_REQUESTED or BLOCK; a Findings section with severity, location, the problem and the required fix; and a Not reviewed section listing anything out of scope or inaccessible.\n\nShow me the finished file.',
          expectedResult: 'A read-only reviewer whose output ends in a verdict the orchestrator can branch on mechanically.',
          stopCondition: '/agents lists both explorer and reviewer, and the reviewer has no write tools.',
        },
        diagram: `flowchart LR
  PL["📄 A plan or a diff"] --> RV["🧐 reviewer<br/>read-only"]
  RV --> V["⚖️ PASS ·<br/>CHANGES_REQUESTED · BLOCK"]
  V --> O["🧑‍✈️ You gate the<br/>editor on it"]
  X["🚫 Never fixes what<br/>it reviews"] -.-> RV`,
        script: 'Name the conflict of interest explicitly — an agent that both writes the fix and grades the fix will grade generously. Then draw the distinction the room needs: a reviewer is a second opinion and that is a good delegation; asking an agent whether another agent succeeded is not verification, it is a rumour with extra steps.',
      },
      {
        segment: 'guided-build', eyebrow: '3️⃣ CP2b', title: 'Add the editor — the only agent with power, and therefore the tightest leash',
        body: 'The editor is the only agent that can write, so it gets the narrowest brief in the team. It takes an already-explored, already-reviewed change and makes the minimal diff: no redesign, no scope expansion, no improvements nobody asked for. It runs the project verification itself and refuses to claim success until it passes. And critically, it is instructed to STOP and report an obstacle when the approved plan does not fit the actual code, rather than improvising. That single instruction is what keeps your most powerful agent from freelancing when reality disagrees with the plan.',
        bullets: [
          'tools: Read, Edit, Write, Bash — and it runs last',
          'Minimal diff only. No redesign, no scope creep.',
          'It runs the typecheck itself and gates its own report on it',
          'Plan does not fit reality? STOP and report — never guess',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — write .claude/agents/editor.md',
          code: 'Create .claude/agents/editor.md in this project.\n\nFrontmatter: name editor; tools Read, Edit, Write, Bash; model sonnet; description saying it implements one scoped, already-reviewed change, that it should be used ONLY after the explorer has mapped the code and the reviewer has cleared the plan, and that it makes the minimal edit, runs the verification, and reports what changed.\n\nBody:\n- It implements one specific, already-approved change. It does not redesign, expand scope, or explore beyond the files named in its task.\n- It makes the minimal diff that satisfies the task.\n- After editing, it runs this project typecheck command and does not report success until it passes.\n- If the task is ambiguous, or the approved plan does not fit the real code, it STOPS and reports the obstacle instead of guessing.\n- Mandate EXACTLY this output: a Changed section listing each file and what changed; a Verification section showing the typecheck result and the first error if it failed; and an Obstacles section that says none when there were none.\n\nUse the actual typecheck command for THIS project. Show me the finished file.',
          expectedResult: 'A writer with a narrow brief that verifies its own work and is required to stop rather than improvise.',
          stopCondition: '/agents lists all three, and only the editor has write access.',
          rescue: 'If it invented a typecheck command, correct it — a verification step that does not actually run is worse than none, because it reports success either way.',
        },
        diagram: `flowchart LR
  T["📋 Scoped, reviewed task"] --> ED["✏️ editor"]
  ED --> MIN["🩹 Minimal diff"]
  MIN --> TC["🧪 Runs the<br/>typecheck itself"]
  ED --> ST["🛑 Plan does not fit?<br/>STOP and report"]`,
        script: 'Save it, run /agents, and show all three registered. Then say the line that makes the week feel real: "your repository now has a team, and the team is three Markdown files." Commit them live so the room sees that an AI team is a reviewable artifact like any other.',
      },
      {
        segment: 'guided-build', eyebrow: '🔗 CP3', title: 'Drive one real change from your build plan through all three',
        body: 'This is the payoff run, on your own project. Pick a genuinely small but real change from your plan and orchestrate it yourself: the explorer maps the affected code and returns its report, you pass the relevant part to the reviewer, and only when the verdict is clear does the scoped plan go to the editor. Notice what you are doing — you are the hub. Each report comes back to you, and you decide what the next agent even sees. That routing decision is the architect job, and it is not automatable.',
        bullets: [
          'explorer maps → you route → reviewer scores → you gate → editor implements',
          'You decide what of each report the next agent sees',
          'The verdict is a gate, not a suggestion',
          'Every handoff is a place you could stop — that is the design',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code — the coordinated run on YOUR change',
          code: 'We are making this change in my project: [ONE REAL, SMALL CHANGE FROM YOUR BUILD PLAN].\n\n1. Use the explorer subagent to map every place this change would touch, and how errors are currently handled there. Return only its structured report.\n2. Then use the reviewer subagent on the resulting plan, checking it against safety to re-run, input validation, failure path, and anything sensitive being exposed. Return only its verdict and findings.\n3. Only if the verdict is PASS — or its findings have been addressed and it re-reviews to PASS — use the editor subagent to make the minimal change and run the typecheck.\n\nShow me each agent structured report at every handoff, and stop after each one so I can read it before you continue.',
          expectedResult: 'Three structured reports, in order, with a visible stop between each. The editor only runs behind a clean verdict.',
          stopCondition: 'The editor reports a passing typecheck AND you have read all three reports yourself.',
          rescue: 'If the editor ran despite CHANGES_REQUESTED, your orchestration prompt made the gate optional — restate it as a hard condition and re-run.',
        },
        diagram: `flowchart LR
  O["🧑‍✈️ You"] --> E["🔎 explorer maps"]
  E --> O2["🧑‍✈️ You route"]
  O2 --> R["🧐 reviewer scores"]
  R --> O3["🧑‍✈️ You gate"]
  O3 --> D["✏️ editor implements"]`,
        script: 'Run this end to end on the projector, pausing at every handoff to read the returning report out loud. When the editor typecheck passes you have demonstrated the entire week in one run. Then hold the room for one more beat and ask: "do we believe it?" That question is the setup for the third failure injection.',
      },
      {
        segment: 'guided-build', eyebrow: '⚡ CP3 bonus', title: 'Two independent tracks, one turn — the other superpower',
        body: 'When two questions genuinely do not need each other answers, launch both in a single message and they run concurrently in separate windows. The constraint is independence and it is strict: this works because mapping your billing code does not depend on mapping your auth code. If the second question needs the first answer, no amount of cleverness parallelises it. And remember the honest trade from Monday — you are buying wall-clock time, not tokens. Both agents run their full context, and you pay for both.',
        bullets: [
          'Two independent tracks → one message → concurrent windows',
          'Only valid when neither needs the other output',
          'Buys wall-clock time. Costs MORE tokens, not fewer.',
          'You do the synthesis afterwards — that part needs both answers',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code — parallel fan-out across two independent tracks',
          code: 'These two are independent — run them in parallel in one turn:\n- Use the explorer subagent to map [SUBSYSTEM A IN YOUR PROJECT].\n- Use the explorer subagent to map [AN UNRELATED SUBSYSTEM B IN YOUR PROJECT].\n\nWhen both reports come back, synthesize a single list of anything the two share: shared modules, shared data, or shared failure modes. Do the synthesis yourself in this session — do not delegate it.',
          expectedResult: 'Two reports arriving together, then one synthesis that no single agent could have produced.',
          stopCondition: 'You can name one shared dependency neither explorer could have seen alone.',
          rescue: 'If they ran one after the other, your two tracks were not actually independent — check whether the second brief referenced the first.',
        },
        diagram: `flowchart LR
  A["🔎 explorer · track A"] --> S["🧑‍✈️ You synthesize"]
  B["🔎 explorer · track B"] --> S
  T["⏱️ One turn,<br/>two windows"] -.-> S
  W["⚠️ Faster, not cheaper"] -.-> S`,
        script: 'Kick both off in one message and let students watch them run at once, then contrast with CP3, which was strictly sequential because every step needed the last. Say the deciding word twice: independence. And point at the final instruction — the synthesis stays in the main session, because synthesis needs both answers in one window.',
      },

      /* ============================ failure =============================== */
      {
        segment: 'failure', eyebrow: '💥 Break #1', title: 'Take away the leash and the contract, and watch your read-only agent write to a file',
        body: 'Now break it deliberately, while it is small and someone is standing next to you. Delete the tools line from the explorer and strip the schema out of its body, leaving a vague job. Then delegate something and watch two things go wrong at once: the read-only mapper now has Edit and Write and may use them, and the report comes back as prose you cannot gate on. Nothing errors. The agent worked. None of it is safe to act on — which is exactly the failure mode you will not spot in the wild unless you have caused it once yourself.',
        bullets: [
          'Delete tools → it inherits Edit, Write, Bash',
          'Delete the schema → unparseable prose comes back',
          'The body still SAYS read-only. It changes nothing.',
          'No error is raised. That is what makes this expensive.',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code — break it on a copy, deliberately',
          code: 'We are doing a deliberate failure exercise. Do NOT touch my working agents.\n\nCopy .claude/agents/explorer.md to .claude/agents/explorer_broken.md and introduce two faults there:\n1. Delete the tools line entirely, so it inherits every tool.\n2. Replace the mandated five-section report with a vague instruction to look into the code and say what it finds.\n\nThen delegate to explorer_broken: ask it to look into [A MODULE IN MY PROJECT] and suggest improvements.\n\nAfterwards show me git status, and show me its output next to a report from the working explorer.\n\nDo not fix anything yet.',
          expectedResult: 'Prose instead of sections — and a git status that may show a file the read-only agent touched.',
          stopCondition: 'You have seen the unparseable output and checked git status with your own eyes.',
          rescue: 'If it happened to behave, run it again with a task that invites a fix. The point is that nothing PREVENTS it, not that it always misbehaves.',
        },
        diagram: `flowchart TD
  BR["📄 tools line deleted,<br/>schema deleted"] --> E1["✏️ Edits a file you<br/>never named"]
  BR --> E2["🌫️ Returns prose<br/>you cannot parse"]
  E1 --> N["😐 No error raised"]
  E2 --> N`,
        script: 'Make them actually run it and actually look at git status. The room needs to feel the wrongness of a read-only agent that touched a file. Discomfort here is the whole point — it is what makes the frontmatter line feel like a boundary rather than boilerplate.',
      },
      {
        segment: 'failure', eyebrow: '💸 Break #2', title: 'Force a one-line change through all three agents, and put a number on the waste',
        body: 'The second failure is quieter and far more common, and it is the reason Monday spent so long on the delegation tax. Take something genuinely trivial from your own project — rename a variable, add one import — and force it through the full team. It will work. It will take minutes instead of seconds, and cost several times the tokens, and nothing will error, which is precisely why over-delegation survives in teams for months. Measure it. A number you produced yourself is the only version of this lesson that sticks.',
        bullets: [
          'Run /cost, delegate a trivial change through all three, run /cost again',
          'Then do the same edit inline and compare both time and tokens',
          'It succeeded — which is exactly why the waste is invisible',
          'Smell test, one more time: was the task smaller than its own brief?',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code — price the over-delegation, deliberately',
          code: '/cost\n\nDeliberately over-delegate this trivial change, so we can measure the waste:\nUse the explorer subagent to find where [ONE SMALL SYMBOL IN MY PROJECT] is defined, then the reviewer subagent to check the rename, then the editor subagent to rename it.\n\n/cost\n\nNow tell me plainly: how many tokens did that cost, and how many tool calls would it have taken to do the same edit directly in this session?',
          expectedResult: 'Two cost readings with a visible gap, and an honest comparison against doing it inline.',
          stopCondition: 'You have a real number for what the coordination tax cost you tonight.',
          rescue: 'If /cost is not available in your setup, use the Console usage page instead — the point is a measured number, not a specific command.',
        },
        diagram: `flowchart LR
  T["🔤 Rename one symbol"] --> A["🔎 explorer"]
  A --> B["🧐 reviewer"]
  B --> C["✏️ editor"]
  C --> R["✅ It worked —<br/>and cost many times more"]
  I["⌨️ Inline: seconds"] -.-> R`,
        script: 'Run the delegated version and the inline version and put the two timers and the two cost readings side by side on screen. The gap IS the lesson. Then tie it back to Monday in one sentence: subagents solve context pollution and serialization, and this task was neither.',
      },
      {
        segment: 'failure', eyebrow: '🕳️ Break #3', title: 'The most expensive failure of the night: believing the report',
        body: 'Here is the failure nobody warns you about. Your editor reports "Changed 2 files. Typecheck passes." It reads like a fact. It is a claim — a fluent description of what an agent believes it did, produced by the same process that produces everything else it says. If you relay that upward without checking, you have just become a link in a chain where nobody actually ran anything. Test it right now: ask the editor to report success on something, then run the verification yourself in your main session and compare. Sometimes it matches. The problem is that you cannot tell which time it is.',
        bullets: [
          'A report describes intent as fluently as it describes fact',
          'Delegating the work is fine. Delegating the confirmation is not.',
          'Ten seconds in your own session converts a claim into evidence',
          'This is the one item on your delegation budget that is never negotiable',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code — check the claim yourself',
          code: 'The editor subagent just reported that its change is complete and the typecheck passes.\n\nDo not ask any subagent to confirm that. In THIS session:\n1. Show me the actual diff of every file it says it changed.\n2. Run the project typecheck here and show me the raw output.\n3. Tell me any place where the editor report and the real state of the repository disagree.',
          expectedResult: 'A real diff and real command output — evidence, rather than a summary of evidence.',
          stopCondition: 'You have seen the verification run in your own session, with your own eyes.',
          rescue: 'If the diff is larger than the editor described, that is the lesson landing perfectly. Note it, then harden with the next slide.',
        },
        diagram: `flowchart LR
  S["🤖 Subagent says<br/>it is done"] --> Y["🧑‍✈️ You believe it"]
  Y --> P["🚀 It ships"]
  V["🔎 Or: you run it<br/>yourself, 10 seconds"] --> T["✅ Evidence"]`,
        script: 'Do this live even when the editor was honest — especially then, because the point is not catching a liar, it is establishing that you never find out without looking. Say the sentence slowly: delegate the work, never delegate the moment you find out whether it worked.',
      },
      {
        segment: 'failure', eyebrow: '🔧 Harden', title: 'Restore the leash, restore the contract, write the rule down, then commit the team',
        body: 'Now repair everything and notice how unglamorous each fix is. The tools line goes back so the explorer physically cannot write. The five-section contract goes back so its output is parseable and honest. Delete the broken copy. And then do the thing that outlives tonight: write your delegation rule into your project CLAUDE.md, so the next person — including you in three weeks — inherits the judgment and not just the agents. Then commit .claude/agents/. That folder is your deliverable and your portfolio artifact.',
        bullets: [
          'tools: Read, Grep, Glob restored — enforcement, not persuasion',
          'The five-section contract restored, Obstacles required',
          'Delete explorer_broken.md — do not leave a loaded gun in the repo',
          'Write the delegate/inline rule into CLAUDE.md so it survives you',
          'git commit .claude/agents/ — the team is now a repository asset',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code — harden, document the rule, and commit',
          code: 'Fix everything we broke, and show me each diff:\n\n1. Delete .claude/agents/explorer_broken.md entirely.\n2. Confirm .claude/agents/explorer.md still has its read-only tools line and its full five-section contract, and restore anything missing.\n3. Add a short "Subagent delegation policy" section to this project CLAUDE.md that states: delegate genuinely independent, sizeable, multi-file tracks and independent second opinions; do NOT delegate work that would take about two tool calls, and never delegate verification that something actually worked — the coordinator confirms that itself.\n4. Re-run the task from the break exercise against the hardened explorer and show me that the structured report is back.\n\nThen stage and commit .claude/agents/ and CLAUDE.md with a clear message describing the team.',
          expectedResult: 'A clean structured report from the hardened explorer, a written delegation policy, and a commit containing your three agents.',
          stopCondition: 'git log shows your team committed, and CLAUDE.md contains the rule in your own project vocabulary.',
          rescue: 'Commit blocked by unrelated changes? Stage explicitly: git add .claude/agents CLAUDE.md — never git add -A on a shared tree.',
        },
        diagram: `flowchart LR
  F1["🧰 tools line back"] --> H["🛡️ A team you<br/>can trust"]
  F2["📦 Contract back"] --> H
  F3["📜 Delegation rule<br/>in CLAUDE.md"] --> H
  H --> G["🔁 git commit<br/>.claude/agents/"]`,
        script: 'Re-run the broken task against the hardened agent so the room watches trust get restored in real time. Then have everyone commit while you recap the week in three sentences: a subagent is a window you can throw away, a report you can act on needs a schema and an obstacles section, and the most valuable thing you learned tonight is which work you will never hand to it. Next week the work starts running itself — and everything you just built has to survive nobody watching.',
      },
    ],

    beforeAfter: {
      label: 'Monday → Thursday',
      before: [
        'One assistant, one window, everything crammed into it',
        'Exploration noise buried the work that mattered',
        'Independent questions answered one at a time',
        '"It says it is done" — so it must be done',
        'Delegate whenever it feels clever',
      ],
      after: [
        'Three agents, three windows, one orchestrator — you',
        'Wide reading quarantined; you receive the report, not the file dump',
        'Independent tracks launched in the same turn',
        'Verified in your own session before you believe a word of it',
        'A written rule in CLAUDE.md for what you never delegate',
      ],
    },

    storyBeats: {
      'result-preview': [
        {
          icon: '🌅', tone: 'violet', eyebrow: 'Before you build — what actually changes tonight',
          title: 'On Monday you had a worker. Tonight you get a bench — and a decision to make about every task.',
          body: 'There is a moment in any growing team where the constraint stops being how much work one person can do and becomes how well the work is divided. That moment is tonight. In two hours you will have three specialists in your repository and, for the first time in this program, a genuine choice on every task: do this myself, or hand it over. Getting that choice wrong is now something you can do quickly and repeatedly, which is exactly why we spent an hour on Monday learning to say no.',
          punch: 'Having a team is easy. Knowing which work never should have reached it is the actual skill.',
        },
      ],
      'build-map': [
        {
          icon: '🔑', tone: 'berry', eyebrow: 'Why only one agent gets to write',
          title: 'The surveyor does not carry the master key, and nobody thinks that is an insult',
          body: 'A building surveyor walks through every room in the property with a clipboard. She does not carry the master key to the plant room, and nobody considers that a comment on her competence — it is simply that her job never requires opening that door. The locksmith carries it, arrives last, and only after somebody has decided what needs changing. That is the whole of least privilege, and it is a hundred years older than software.',
          punch: 'Nobody gets a key to a door their job never opens. Least privilege is just professional courtesy, enforced.',
        },
      ],
      failure: [
        {
          icon: '🧨', tone: 'leaf', eyebrow: 'Why we hand it the wrong keys on purpose',
          title: 'The safest possible time for your read-only agent to edit a file is right now, with us watching',
          body: 'In about ten minutes you are going to delete one line from a configuration file and turn a harmless mapping agent into something that can rewrite your repository. That is not recklessness; it is the cheapest possible version of a lesson that otherwise arrives on a Tuesday afternoon in production. You will watch it happen once, in a copy, with an instructor next to you and nothing depending on the outcome.',
          punch: 'The first time your guardrail is missing should never be the first time you needed it.',
        },
        {
          icon: '📞', tone: 'cherry', eyebrow: 'The three words that cost the most',
          title: '"It said it was done"',
          body: 'Somebody tells their manager the fix shipped, because the engineer told them, because the contractor told them. Nobody in that chain ever ran the thing. This is precisely how an agent summary becomes an outage: the report said the typecheck passed, the coordinator relayed it, the coordinator relayed it upward, and it was never true. Agents describe what they intended to do with exactly the same fluency they describe what they actually did.',
          punch: 'Delegate the work. Never delegate the moment you find out whether it worked.',
        },
      ],
    },

    extraInteractions: [
      {
        segment: 'readiness', kind: 'poll',
        q: 'Four-point check — where are you?',
        options: [
          '✅ All four green',
          '📁 Claude Code is not open in my capstone repo',
          '🧭 No track chosen from my build plan',
          '🔴 My Monday explorer never worked',
        ],
        eyebrow: '🚦 Roll call', title: 'Before anyone creates an agent',
        presenterTip: 'Operational. Read the counts out loud and send mentors to every non-green student immediately. Tonight builds directly on Monday explorer — anyone red on the last option needs it fixed in the next three minutes, not at the break.',
      },
      {
        segment: 'build-map', kind: 'poll',
        q: 'Your delegation budget: how many items on your own build plan genuinely deserve a subagent?',
        options: ['None of them', '1 to 2', '3 to 5', 'More than 5'],
        eyebrow: '🧾 Be honest', title: 'How much of your plan is actually delegate-worthy?',
        presenterTip: 'No right answer, but there is a right conversation. If anyone picks "more than 5", ask them to defend two items out loud — most collapse to INLINE under a single question, and the room watching that happen is worth more than the slide before it.',
      },
      {
        segment: 'guided-build', kind: 'trivia',
        q: 'Your explorer returned a wall of prose with no headers. Where is the bug?',
        options: [
          'The tools line',
          'The description',
          'The body — the schema instruction is too soft',
          'The model is too small for the job',
        ],
        answer: 2,
        reveal: 'The contract lives in the body, and a soft version of it gets soft compliance. "Return EXACTLY this structure and nothing else" is doing real work — vaguer wording produces exactly what you asked for, which was nothing in particular.',
        eyebrow: '🔎 Diagnose it', title: 'The report came back as mush',
        presenterTip: 'Fires right after CP1. Take answers, reveal, then have everyone re-read their own contract line against it — several students will tighten theirs on the spot without being told to.',
      },
      {
        segment: 'guided-build', kind: 'poll',
        q: 'Your explorer just ran on your own repo. How honest was its Obstacles section?',
        options: [
          'It admitted things it genuinely could not trace',
          'Empty — on a question that was definitely hard',
          'It guessed and presented the guess as a finding',
          'Have not read it yet',
        ],
        eyebrow: '🚧 Read the obstacles', title: 'Did it tell you what it could not see?',
        presenterTip: 'Call on someone with an empty Obstacles section and someone with an honest one, and put both on screen. Say it plainly: an empty Obstacles section on a hard question means the agent has learned to sound sure, which is the failure mode we are designing against.',
      },
      {
        segment: 'guided-build', kind: 'poll',
        theater: true,
        q: 'The reviewer returns CHANGES_REQUESTED on your plan. Do you let the editor run?',
        options: [
          'Yes — the editor will deal with it',
          'No — address the findings, then re-run the reviewer',
          'Yes, but paste the findings into the editor brief',
          'Skip the reviewer next time, it slows me down',
        ],
        answer: 1,
        reveal: 'The verdict is a gate, not a suggestion. Handing the one agent that can write your files a plan you already know is flawed is how a multi-agent team produces damage faster than a single agent ever could. Option 2 is the seductive wrong answer — it feels efficient and it quietly makes the review advisory.',
        eyebrow: '⚖️ The gate', title: 'The reviewer said no. Now what?',
        presenterTip: 'Full-screen theater. Expect a real split between options 1 and 2, and let the room argue for a minute before revealing — the argument is where the lesson lives. This is the only theater moment tonight, so give it the time.',
      },
      {
        segment: 'failure', kind: 'poll',
        q: 'You just ran a one-line rename through all three agents. What did /cost say?',
        options: ['Barely moved', 'Noticeably more than inline', 'A lot more than inline', 'I did not check'],
        eyebrow: '💸 Read your own meter', title: 'Put a number on the coordination tax',
        presenterTip: 'Read three real numbers out loud from the room and write them on the board next to Monday baseline. This is the moment the delegation tax stops being a slide and becomes something they measured in their own session.',
      },
      {
        segment: 'failure', kind: 'trivia',
        q: 'The editor reports: "Changed 2 files. Typecheck passes." What do you do before you believe it?',
        options: [
          'Nothing — it ran the typecheck itself',
          'Ask the reviewer subagent to confirm',
          'Run the typecheck yourself in your main session',
          'Check the git diff and stop there',
        ],
        answer: 2,
        reveal: 'Verification is the one job you never delegate. A report describes what an agent believes it did; ten seconds of real command output in your own session is what turns that belief into a fact. Asking a second agent to confirm the first is a rumour with extra steps.',
        eyebrow: '🕳️ The quiet failure', title: 'It says it is done. Is it?',
        presenterTip: 'Expect option 1 to get real votes, because it sounds like good delegation hygiene. Name why it is wrong: both agents are the same process producing fluent text, and neither of them ran anything you saw.',
      },
      {
        segment: 'broadcast', kind: 'poll',
        q: 'In your 30-second Builder Broadcast, which line are you actually saying?',
        options: [
          'My team mapped a subsystem I had never read',
          'My reviewer caught a risk before anything got edited',
          'I found the work I will never delegate again',
          'All three',
        ],
        eyebrow: '📣 Name your artifact', title: 'What are you showing the cohort?',
        presenterTip: 'Push students toward the third option if their evening produced it — "here is what I learned not to delegate" is a more sophisticated broadcast than "I built three agents", and it is the one that proves they understood the week.',
      },
    ],
  },
};
