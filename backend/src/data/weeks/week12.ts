/**
 * week12.ts — the complete authored content pack for WEEK 12,
 * "Capstone + Architect Expo" (Intensive 4 · Design AI That Scales).
 *
 * This is the last week of the program, so this file has two jobs that no other
 * week has. The first is ordinary: teach the four things Week 12 actually needs
 * — what a FROZEN capstone is, how to demo a live system without it going
 * wrong, how to defend an architecture decision under questioning without
 * getting defensive, and how to close the last CCA-F gaps. The second is the
 * one that matters: CLOSE THE STORY. Orientation made specific promises —
 * the apprentice who faces the dragon in Week 12, the climber whose day 3
 * nobody notices, and "a working system, a credential, and public proof."
 * Every one of those threads is picked back up here by name and paid off.
 *
 * Arc beat (TWELVE_WEEK_STORY_ARC.md): "You stand behind it in public. The
 * dragon, as promised." The 2 AM question reaches its final form this week —
 * it is 2 AM, it worked, and nobody noticed; that is the goal — and the trust
 * ladder lands on its top rung: it acts under policy, with a human gate for
 * high risk, fully audited.
 *
 * Authoring rules honoured here, per the arc doc:
 *   • EVERY teach slide carries its own mermaid diagram, ≤7 nodes, short quoted
 *     labels, <br/> for line breaks — it gets click-zoomed and read from the
 *     back of a room.
 *   • Code blocks are Claude Code PROMPTS (kind 'paste' with an explicit paste
 *     target) or artefacts read together (kind 'review'), never code to type.
 *   • Current API facts only: claude-opus-5 / claude-sonnet-5 / claude-haiku-4-5,
 *     and output_config + json_schema (top-level output_format is deprecated).
 *     Nothing about pricing or exam content is invented — where a number could
 *     be stale, the script tells the instructor to open the live page.
 *   • Everything is the student's OWN capstone. There is no generic exercise in
 *     Week 12; there is nothing left to practise on.
 *
 * Pure data, type-only import — same shape as every other week pack.
 */
import type { WeekPack } from '../weekPack';

export const WEEK12_PACK: WeekPack = {
  week: 12,
  arcBeat: 'You stand behind it in public. The dragon, as promised.',

  /* ======================================================================== */
  /*  MONDAY — Architecture Day: freeze it, rehearse it, defend it            */
  /* ======================================================================== */
  monday: {
    hook: {
      headline: 'Tonight you stop building. That is not a compromise — it is the last architecture decision of the program.',
      caption: 'Thursday you stand behind it in public. Everything between now and then is rehearsal, evidence, and nerve.',
    },

    teach: [
      /* ===================== check-in · where we actually are ============== */
      {
        segment: 'checkin', eyebrow: '🏁 Week 12', title: 'Twelve weeks ago you could ask an AI for help. Tonight you freeze a system you are accountable for.',
        body: 'On Orientation night the promise was specific: a working system, a credential, and public proof. Not a certificate of attendance — a thing that runs, a thing you passed, and a recording of you standing behind both. That was eighty-four days ago. Tonight is the night you stop adding to it, and Thursday is the night you defend it. Everything in this room from here is about making Thursday true rather than hopeful.',
        bullets: [
          'Orientation promised three things — you leave this week with all three',
          'Tonight: freeze the system and rehearse the defence',
          'Thursday: the Architect Expo, on camera, plus the CCA-F exam',
          'Nothing new gets built after tonight. That is the point of tonight.',
        ],
        diagram: `flowchart LR
  A["🚪 Orientation<br/>you could ask for help"] --> B["🛠️ Weeks 1-11<br/>you learned to build"]
  B --> C["🧊 Tonight<br/>you freeze it"]
  C --> D["🎤 Thursday<br/>you defend it"]`,
        script: 'Do not open with logistics. Open by naming the room: say how many people started, how many are sitting here, and that you know what most of them are building. Then read the Orientation promise back to them word for word — a working system, a credential, and public proof — and say plainly that this is the week it either becomes true or it does not. Then move; the sentiment is earned later, not now.',
      },
      {
        segment: 'checkin', eyebrow: '▶️ Do this right now', title: 'Start the integration audit before we talk about anything',
        body: 'Same move as Week 3, when you launched your build and let it run while we explained it. Paste this into Claude Code now and let it work through your repo while we talk. It is not going to fix anything — it is going to tell you the truth about what is actually wired to what. Almost everyone in this room has at least one component that only ever met the rest of the system in a slide. Better to find that at 6:35 on Monday than at 7:10 on Thursday.',
        bullets: [
          'Paste it now, let it run in the background',
          'It maps every component you built in weeks 1-11 to a layer',
          'It lists the SEAMS — the joins between components',
          'It flags anything not actually wired to anything else',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          ccMode: 'Plan Mode',
          label: 'Claude Code prompt — the honest integration audit',
          code: 'Audit this repository as my Week 12 capstone. Do not change anything.\n\n1. List every component I built across the program — the workflow assistant, any Skills, the prompt library, the MCP server, subagents, scheduled jobs, the reliability wrappers, the policy layer, and the observability/logging.\n2. For each one, say which of the seven architecture layers it belongs to (Storage, Data Fabric, Semantic, Intelligence, Governance, Observability, Orchestration).\n3. List every SEAM — every place where one component hands work or data to another — and say whether that seam is exercised by a real code path or only described in docs.\n4. Flag every component that is NOT actually called by anything else at runtime.\n5. Tell me whether a single command exists that runs the whole thing end to end. If not, say exactly what is missing.\n\nEnd with a short, blunt list titled NOT WIRED. Do not fix anything, and do not be encouraging about it.',
          expectedResult: 'A component-to-layer table, a list of seams marked real or documentation-only, and a NOT WIRED list that is probably longer than you expected.',
          stopCondition: 'You have a NOT WIRED list on screen. Length is not the point — honesty is.',
          rescue: 'If it comes back cheerful and empty, it did not look hard enough. Tell it: "You did not find a single unwired component. Look again, and check whether each module is actually imported and called at runtime, not just present in the repo."',
        },
        diagram: `flowchart LR
  R[("📁 Your capstone repo")] --> AUD["🔎 Integration audit<br/>running now"]
  AUD --> CMP["🧩 Every component<br/>mapped to a layer"]
  AUD --> SEAM["🔗 Every seam,<br/>real or documented"]
  AUD --> FLAG["🚩 NOT WIRED"]`,
        script: 'Screen-share the paste once, then stop talking and let the room work. PACING: this runs for a few minutes; do not stand and watch it. Move straight into the next slide while it works, exactly like Week 3 Monday. Anyone whose Claude Code is not open goes to a mentor now, not at the break — this audit feeds every micro-build tonight.',
      },
      {
        segment: 'checkin', eyebrow: '🗺️ The shape of the week', title: 'Three deliverables, and only one of them is code',
        body: 'Week 12 produces three artefacts and they are graded together. A frozen capstone that runs end to end with governance and observability ON. A recorded Expo presentation — the demo plus the defence, in front of a panel. And a CCA-F exam attempt. Notice that two of those three are not engineering. That is deliberate: the arc of this program was capability, then reach, then scale, then accountability, and accountability is something you demonstrate in front of people, not in a terminal.',
        bullets: [
          '1️⃣ A frozen capstone — end to end, lights on',
          '2️⃣ A recorded Expo talk — demo plus defence before a panel',
          '3️⃣ A CCA-F exam attempt — Claude Certified Architect, Foundations',
          'Tonight prepares all three. Thursday executes all three.',
        ],
        diagram: `flowchart TD
  W["🏁 Week 12"] --> D1["🧊 A frozen capstone<br/>lights on"]
  W --> D2["🎤 A recorded Expo<br/>demo + defence"]
  W --> D3["🎓 A CCA-F attempt"]`,
        script: 'Hold up three fingers and name each one. Then say the uncomfortable part out loud: two of the three are not code, and the people who struggle on Thursday are almost never the ones whose systems are weakest. They are the ones who never rehearsed. That is what tonight is for.',
      },

      /* ============ business problem · the seams, the buyer, the freeze ==== */
      {
        segment: 'business-problem', eyebrow: '🧩 The stakes', title: 'You do not have twelve weeks of lessons. You have one system with eleven seams.',
        body: 'Every week of this program handed you a part, and each part was proven on its own — the workflow assistant ran, the MCP server connected, the retries fired, the policy denied something. The capstone is not a twelfth part. It is the act of making those parts one thing, and the risk lives entirely in the joins. "It worked in pieces" is the single most common capstone failure and the panel is very good at finding it, because they only have to ask you to trace one real request all the way through.',
        bullets: [
          'The components are done. The seams are the deliverable.',
          'A seam is any place one component hands work or data to another',
          'A seam that only exists in a diagram is not a seam',
          'The panel finds them by asking you to trace ONE request end to end',
        ],
        diagram: `flowchart LR
  P["🧩 Eleven weeks<br/>of parts"] --> S["🔗 The seams<br/>between them"]
  S --> SYS["🏗️ One system"]
  S -.->|"untested"| GAP["🕳️ It worked<br/>in pieces"]`,
        script: 'Ask the room a question and let it be uncomfortable: which two of YOUR components have actually passed data to each other in a real run, and which two have only met in a diagram? Take three honest answers. Do not rescue anyone — the discomfort is the class, and every one of them has at least one pair in the second category.',
      },
      {
        segment: 'business-problem', eyebrow: '💼 Who it is for', title: 'The capstone is the asset you hand a buyer, not a grade you collect',
        body: 'Nobody outside this room cares that you completed twelve weeks. What they care about is whether the thing you built solves a problem they recognise. So the whole Expo hangs off one sentence: who has the problem, what it costs them, and what your system produces instead. The architecture is not the pitch — it is the proof that the outcome will still be true in six months, under load, when you are not watching. Lead with the outcome. Back it with the architecture. In that order, always.',
        bullets: [
          'Executives buy an outcome. The architecture is why they should believe it.',
          'Your throughline: for X, problem Y costs Z — this system does A so B follows',
          'If your throughline needs the word "and" twice, the scope is too wide',
          'This is the same idea you wrote in one paragraph in Week 3, grown up',
        ],
        diagram: `flowchart LR
  PB["🎯 The problem<br/>and who has it"] --> OUT["📈 The outcome<br/>your system produces"]
  OUT --> ARCH["🏛️ The architecture<br/>= the proof it holds"]
  ARCH --> EV["🧾 The evidence<br/>= why to believe you"]`,
        script: 'Have four students say their capstone problem in ONE breath. If it takes two breaths, it is too wide for a five-minute Expo and you should say so kindly and immediately. Then point back: this is the paragraph they were slightly embarrassed by in Week 3. Say that out loud — most of them have forgotten how vague it started.',
      },
      {
        segment: 'business-problem', eyebrow: '🧊 The hardest instruction of the week', title: 'Frozen means you stop building. Tonight, not Thursday morning.',
        body: 'A frozen capstone is one whose code has not changed since the last successful end-to-end run, at a tagged commit, with the exact versions it ran against pinned. That is the technical definition. The behavioural definition is harder: you stop adding things. Every demo that has ever died on stage died because somebody made it "a little better" an hour before. The improvement is almost always real; the risk is that it is untested, and untested code meets an audience at exactly the wrong moment.',
        bullets: [
          'Frozen = tagged commit + pinned versions + a green end-to-end run',
          'The demo runs the TAG, never your working copy',
          'New ideas after tonight go on the roadmap slide, not into the build',
          'This is a reliability decision, not a lack of ambition',
        ],
        diagram: `flowchart LR
  B["🔨 Building"] --> F["🧊 FREEZE<br/>tonight"]
  F --> R["🎬 Rehearse"]
  R --> D["🎤 Demo the tag,<br/>not your working copy"]
  N["✋ New ideas"] -.->|"roadmap,<br/>not the build"| ROAD["🗺️ Roadmap"]`,
        script: 'Expect pushback here, and take it seriously rather than waving it off. Somebody will say "but I can finish that feature by Wednesday." Answer honestly: you probably can, and the feature will probably work, and it will still be the least-tested code in the system on the one night it is watched by strangers. Then say the rule plainly: the panel grades the defence, and you cannot defend code you have not run.',
      },
      {
        segment: 'business-problem', eyebrow: '✂️ Your own plan', title: 'Everything still open in your build plan just became the roadmap',
        body: 'Open the plan you generated in Week 3. Some of those tasks are done, some are half-done, and some you never started. Here is the reframe: the unfinished ones are not failures, they are your roadmap slide — and a roadmap you can speak to specifically is one of the strongest things you can show a panel. It says you know what your system does not do yet. The only genuinely bad answer at an Expo is not knowing where the edges are.',
        bullets: [
          'Open your Week 3 build plan and mark three states: in the freeze, cut, not started',
          'Cut items become the roadmap — named, scoped, with a reason',
          'Pick the one gap you would fix first, and be able to say why that one',
          'An honest limitation named by you is stronger than one found by them',
        ],
        diagram: `flowchart TD
  PLAN["📋 Your Week 3<br/>build plan"] --> DONE["✅ In the freeze"]
  PLAN --> CUT["✂️ Cut tonight"]
  CUT --> ROAD["🗺️ Roadmap slide"]
  ROAD --> HON["🫱 Named as an<br/>honest limitation"]`,
        script: 'Make everyone actually open the plan and do the three-way mark on screen. It takes four minutes and it converts a vague anxiety ("I did not finish") into a concrete artefact ("here is my roadmap"). Ask one person to read their single most important gap out loud, and point out to the room that they just delivered the strongest thirty seconds of their Expo without trying.',
      },

      /* ================ architecture · what the frozen system is =========== */
      {
        segment: 'architecture', eyebrow: '🗺️ The integration map', title: 'Every week of this program has a home in the running system',
        body: 'Here is your capstone described as a single run. Weeks 1 to 3 gave you the workspace, the standards file, and the deterministic spine that actually executes. Weeks 4 and 7 gave you reusable judgment and a team to apply it. Weeks 5 and 6 gave the system hands into real business systems. Weeks 8 and 9 made it run on its own and survive its own failures. Weeks 10 and 11 gave it a conscience and a map. One command should fire all of that and produce one traced outcome. If it cannot, that is tonight.',
        bullets: [
          'Wk 1-3 — CLAUDE.md, the assistant, the deterministic spine',
          'Wk 4 · 7 — the prompt library and the multi-agent team',
          'Wk 5-6 — MCP: the hands into real systems',
          'Wk 8-9 — the schedule, and the reliability envelope around every call',
          'Wk 10-11 — the policy gate, the audit trail, the seven layers',
        ],
        diagram: `flowchart LR
  W13["1-3 Foundation<br/>+ the spine"] --> RUN["▶️ One command"]
  W47["4 · 7 Judgment<br/>+ the team"] --> RUN
  W56["5-6 MCP<br/>real systems"] --> RUN
  W89["8-9 Schedule<br/>+ reliability"] --> RUN
  W1011["10-11 Policy<br/>+ the layered map"] --> RUN
  RUN --> OUTC["📦 One traced outcome"]`,
        script: 'Walk the diagram right to left for once — start at "one traced outcome" and ask what has to be true upstream for that to exist. It reframes the whole map as a dependency chain instead of a list of weeks. Then have a student pull their own audit output up on the shared screen and put the two side by side.',
      },
      {
        segment: 'architecture', eyebrow: '💡 Lights on', title: 'A run with governance and observability switched off is not the system you are defending',
        body: 'This is the definition that catches people. A frozen capstone is an end-to-end run with governance ON and observability ON. Governance on means the policy layer actually evaluates and actually denies at least one action you expect it to deny — a system that has never denied anything has not proven it can. Observability on means every step in that run emits a structured log line carrying the same correlation ID, so any outcome traces back to its cause. If your run only completes with those two switched off, you never finished Week 10 or Week 11.',
        bullets: [
          'Governance ON = at least one real, expected denial in the run',
          'Observability ON = one correlation ID threading every log line',
          'If it only runs with the lights off, it was never done',
          'These two switches are what the trust ladder has been climbing toward all program',
        ],
        diagram: `flowchart LR
  RUN["▶️ End-to-end run"] --> GOV["🛡️ Governance ON<br/>one real denial"]
  RUN --> OBS["🔭 Observability ON<br/>one correlation id"]
  GOV --> FRZ["🧊 This is what<br/>frozen means"]
  OBS --> FRZ`,
        script: 'Call back to the trust ladder explicitly. In Week 1 they approved every single action by hand; tonight the system acts on its own under a policy they wrote, with a human gate on the risky moves and a full audit trail behind it. Say the distance out loud — it is the single clearest measure of what twelve weeks did, and most of them have not noticed it happening.',
      },
      {
        segment: 'architecture', eyebrow: '📌 Pin it', title: 'Freeze the code AND the things underneath it — drift is what kills live demos',
        body: 'Freezing the commit is half the job. The other half is everything your code depends on that can move without you touching a file. Pin the model ID explicitly — write claude-opus-5, claude-sonnet-5, or claude-haiku-4-5 in a single named constant rather than letting it live in three places. Lock your dependency versions. And check the API surfaces you rely on are the current ones: structured output goes through output_config with a json_schema format, and the older top-level output_format parameter is deprecated. A panelist who knows the platform will notice a deprecated parameter, and that is a bad thirty seconds to spend.',
        bullets: [
          'The model ID lives in ONE named constant — it is a cost decision and a freeze decision',
          'Lock dependency versions; a fresh install on demo night is a real failure mode',
          'Structured output = output_config + a json_schema format (top-level output_format is deprecated)',
          'Write down which model each component uses — the panel will ask why',
        ],
        diagram: `flowchart TD
  FRZ["🧊 The freeze"] --> TAG["🏷️ Tagged commit"]
  FRZ --> MOD["🎚️ Pinned model id<br/>claude-opus-5"]
  FRZ --> API["📐 output_config<br/>json_schema"]
  FRZ --> DEP["📦 Locked deps"]
  DRIFT["🌊 Drift"] -.->|"is what breaks<br/>live demos"| FRZ`,
        script: 'Tie the model constant straight back to Week 3: the same job cost wildly different amounts depending on that one word, and they proved it with an eval before choosing. That is a decision with evidence behind it, which is exactly the kind of thing a panel loves to hear defended. If anyone asks about current rates, open the live pricing page rather than quoting a slide — rates move, and checking is part of the job.',
      },
      {
        segment: 'architecture', eyebrow: '🏛️ The four-part answer', title: 'How to be questioned hard without becoming defensive',
        body: 'Defensiveness is not a personality trait, it is what happens when you are asked for something you do not have. So carry the thing you will be asked for. Every architecture answer has the same four parts: the decision you made, the alternative you rejected and why, the artefact that shows it works, and the limit you already know about. Deliver those four and a hard question stops being an attack and becomes a chance to show your work. And when you genuinely do not know: say so, then say how you would find out. That answer scores higher than a confident guess, every time.',
        bullets: [
          '1️⃣ The decision — what you chose, stated plainly',
          '2️⃣ The rejected alternative — and the specific reason',
          '3️⃣ The artefact — the eval, the log line, the config, the ADR',
          '4️⃣ The limit — the case where this choice would stop being right',
          'And: "I do not know — here is how I would find out" is a complete answer',
        ],
        diagram: `flowchart LR
  Q["❓ The question"] --> D["1️⃣ The decision"]
  D --> ALT["2️⃣ What you rejected,<br/>and why"]
  ALT --> EV["3️⃣ The artefact"]
  EV --> LIM["4️⃣ The limit you<br/>already know about"]`,
        script: 'Demonstrate this yourself. Ask a volunteer a hard question about their system, let them answer however they answer, then re-deliver the same answer in the four-part shape so the room hears the difference in tone rather than content. It is the same information; it sounds like an architect instead of a student. That contrast does more than any amount of advice about confidence.',
      },
      {
        segment: 'architecture', eyebrow: '🎓 The external gate', title: 'The CCA-F is a mirror of your own twelve weeks',
        body: 'The Claude Certified Architect — Foundations exam covers five domains, and every one of them is something you have already built rather than read about. Agentic workflows is the loop from Week 1 and the subagent team from Week 7. MCP is your server from Weeks 5 and 6. Claude Code configuration is your CLAUDE.md, your Skills, your hooks and permissions. Prompt engineering is the versioned library from Week 4. Reliability and governance is Weeks 9 and 10. Read every question as "which part of my own system is this describing" and the exam changes character.',
        bullets: [
          'Agentic workflows → the agentic loop (wk 1) + subagents (wk 7)',
          'MCP → your production-shaped server (wk 5-6)',
          'Claude Code configuration → CLAUDE.md, Skills, hooks, permissions (wk 1-2, 8)',
          'Prompt engineering → your tested, versioned library (wk 4)',
          'Reliability + governance → timeouts, retries, breakers, idempotency, policy, audit (wk 9-10)',
        ],
        diagram: `flowchart TD
  X["🎓 CCA-F"] --> A["Agentic workflows<br/>wk 1 · 7"]
  X --> B["MCP<br/>wk 5-6"]
  X --> C["Claude Code config<br/>wk 1-2 · 8"]
  X --> D["Prompt engineering<br/>wk 4"]
  X --> E["Reliability + governance<br/>wk 9-10"]`,
        script: 'Open the official exam guide live on screen rather than reading domain descriptions off this slide — exam blueprints get revised and the guide is authoritative. Then do the mapping out loud with the room: for each domain, ask someone to name the specific artefact in their own repo that covers it. Watching five hands go up for five domains is what makes the exam stop feeling like an exam.',
      },

      /* =================== deconstruct · demo vs defence =================== */
      {
        segment: 'deconstruct', eyebrow: '🔍 Two demos', title: 'Same feature, same system. Only one of them earns a credential.',
        body: 'Picture two presenters showing the identical capability. The first clicks the happy path, says "and as you can see, it works," and moves on. The second makes the same claim and then, without being asked, shows the eval score, the log line with the correlation ID, and the policy that blocked the unauthorised attempt. Nobody in the room learned a new feature between those two versions. What changed is that the second one is checkable. That is the entire difference between a demo and a defence, and the panel grades the second thing.',
        bullets: [
          'Demo A: a claim, then a transition',
          'Demo B: the same claim, then the artefact behind it — unprompted',
          'The demo is the setup. The defence is the act.',
          'Checkable beats impressive, in front of a panel and in front of a buyer',
        ],
        diagram: `flowchart LR
  CLAIM["🗣️ It works"] --> A["🅰️ Demo A<br/>and moves on"]
  CLAIM --> B["🅱️ Demo B<br/>here is the artifact"]
  A --> T1["🤔 Believed<br/>for now"]
  B --> T2["✅ Trusted"]`,
        script: 'Role-play both versions yourself, thirty seconds each, on the same feature. After A, ask the room "do you believe it works?" — most will say yes politely. After B, ask again and watch the difference in how fast they answer. The room feels this before you explain it, which is why you should not explain it much.',
      },
      {
        segment: 'deconstruct', eyebrow: '💀 Anatomy', title: 'The four ways a live demo actually dies — and none of them are your architecture',
        body: 'Live demos rarely fail because the system is badly designed. They fail for four boring reasons. The network in the room is not the network in your office. The code you touched an hour ago was never run. Something cold-started, or you hit a rate limit because you rehearsed six times in ten minutes. Or the data moved — the record you demoed on Monday is not in the state it was in on Thursday. Every one of those is preventable tonight, and none of them is preventable at 7:05 on Thursday.',
        bullets: [
          '📶 The network — assume it is worse than yours and have a plan',
          '✏️ Late edits — the freeze exists precisely for this one',
          '🐢 Cold starts and rate limits — warm it up, and do not rehearse live six times in a row',
          '🗃️ Data drift — pin or reset the demo data so the run is reproducible',
          'A recorded green run covers all four. Record it tonight.',
        ],
        diagram: `flowchart TD
  DEMO["🎤 Live demo"] --> F1["📶 The network"]
  DEMO --> F2["✏️ Code you touched<br/>an hour ago"]
  DEMO --> F3["🐢 Cold start<br/>or a rate limit"]
  DEMO --> F4["🗃️ Data that moved<br/>since you rehearsed"]`,
        script: 'Go around the four and ask which one each student is most exposed to. Most will pick data drift once they think about it, and almost nobody names it first. Then land the practical instruction: the recorded green run neutralises all four, it takes ten minutes, and it is the single highest-value thing they will do tonight.',
      },
      {
        segment: 'deconstruct', eyebrow: '🧾 The evidence standard', title: 'Every claim needs an artefact. A claim without one is a liability you carry on stage.',
        body: 'A defence is a mapping from claims to artefacts, and it is stricter than it sounds. "It is reliable" maps to your timeout and breaker configuration plus the chaos test that trips it. "It is governed" maps to the policy and one denial in the log. "It is correct" maps to your eval dataset, the grader, and the pass rate. "It is traceable" maps to one correlation ID followed from request to write. Write your claims down, put the artefact next to each one, and cut every row with a blank second column — because that blank is exactly where a panelist will push.',
        bullets: [
          'reliable → the timeout/retry/breaker config + a chaos test that trips it',
          'governed → the policy + one denial log line',
          'correct → the eval dataset + grader + pass rate',
          'traceable → one correlation ID, request through to the write',
          'No artefact → cut the claim. Every time.',
        ],
        code: {
          kind: 'review',
          label: 'evidence.md — the one-page claim-to-artefact map (read this together)',
          code: '# Expo evidence map\n\n| Claim I will make | Artefact behind it | Where it lives |\n|---|---|---|\n| "It is correct" | eval_set.json — 40 cases, 37 passing | assistant/eval_set.json + last run output |\n| "It is reliable" | 10s timeout, 3 capped retries, breaker opens after 5 | assistant/reliability.py + chaos test |\n| "It is governed" | policy denies write actions for unapproved roles | policy/rules.yaml + logs line 214 (DENY) |\n| "It is traceable" | one correlation id across 31 log lines | logs/capstone.jsonl, CID 7f3a-...  |\n| "It is cheap enough" | $0.011 per run measured on the eval | cost.py output, 2026-08-06 |\n\n## Claims I CUT because I had no artefact\n- "It scales" — no load test exists. Roadmap item 1.\n- "It is secure" — too broad; I claim only the policy gate, which I can show.',
          expectedResult: 'Two things to point at: every row has a real file path in the third column, and there is a CUT section at the bottom. A map with no cut claims usually means nobody was honest yet.',
        },
        diagram: `flowchart LR
  C["🗣️ Claim"] --> A{"🧾 Is there<br/>an artefact?"}
  A -->|"yes"| K["✅ Keep it —<br/>one click away"]
  A -->|"no"| X["✂️ Cut it"]`,
        script: 'Read the CUT section out loud first, before the table — it is the part that changes behaviour. Then make every student write three claims they plan to make and name the artefact for each, right now, on paper. Walk the room and strike through any row with a blank artefact column in front of them. It stings for four seconds and saves them on Thursday.',
      },
      {
        segment: 'deconstruct', eyebrow: '😬 The three tells', title: 'What defensiveness sounds like from the audience side',
        body: 'There are three ways people fall apart under a hard question, and all three are recoverable if you can hear yourself doing them. The first is over-explaining — answering a thirty-second question for four minutes, which reads as uncertainty no matter how correct you are. The second is blaming the tool, the model, the network, the time available. The third is the opposite: conceding everything, agreeing that yes it is all a bit weak really. The architect version is short, specific, and unbothered — because it is just the four-part answer, delivered once.',
        bullets: [
          '🌀 Over-explaining → answer, stop, breathe. Let them ask the follow-up.',
          '🫵 Blaming the tool → own the decision; you chose the tool',
          '🏳️ Conceding everything → a real limitation is one sentence, not a collapse',
          '🏛️ The architect version: decision, alternative, artefact, limit. Then silence.',
        ],
        diagram: `flowchart LR
  P["❓ Pressure"] --> T1["🌀 Over-explaining"]
  P --> T2["🫵 Blaming the tool"]
  P --> T3["🏳️ Conceding everything"]
  P --> ARCH["🏛️ Answer · alternative<br/>· artefact · limit"]`,
        script: 'Be honest that you have done all three of these in your own career, and say which one is your default under pressure. It gives the room permission to notice theirs. Then run one thirty-second drill: ask a hard question, and the answer must be under twenty seconds. The forced brevity teaches more than the advice.',
      },

      /* ============= micro-build · freeze, record, rehearse, quiz ========== */
      {
        segment: 'micro-build', eyebrow: '🔧 Build 1 · Fix the seams', title: 'Take your NOT WIRED list and close it one item at a time',
        body: 'Go back to the audit that has been running since the start of class. You have a NOT WIRED list. Work it one item at a time, re-running the end-to-end path after each fix rather than fixing five things and hoping. This is the same discipline from Week 9: change one thing, observe, then change the next. If an item is genuinely too large to close tonight, do not fake it — cut it, and move it to your roadmap with a reason you can say out loud.',
        bullets: [
          'One seam at a time, re-run after each — never a batch of five',
          'A seam is closed when a real request crosses it and appears in the log',
          'Too big to close tonight? Cut it to the roadmap; do not fake a wire',
          'Done when one command runs the whole thing with zero manual steps',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — close one seam, then prove it',
          code: 'Take the FIRST item from the NOT WIRED list you produced earlier.\n\n1. Explain in two sentences what wiring it actually requires — which module calls which, and what data crosses.\n2. Make the smallest change that puts it on the real runtime path. Do not refactor anything else, and do not add features.\n3. Add one structured log line at the crossing point that carries the correlation id, so the seam is visible in a trace.\n4. Run the full end-to-end path and show me the log lines that prove a real request crossed this seam.\n\nIf the fix would take more than about fifteen minutes, stop and tell me — I will cut it to the roadmap instead. Do not start on the second item.',
          expectedResult: 'Log lines showing a real request crossing the seam you just closed, carrying the same correlation ID as the rest of the run.',
          stopCondition: 'One seam is closed and PROVEN in a log, not just described as fixed.',
          rescue: 'If the run breaks after the change, revert the change first and re-run to confirm you are back to green. Then re-approach with a smaller edit. Never debug forward on the night you are freezing.',
        },
        diagram: `flowchart LR
  FLAG["🚩 NOT WIRED"] --> ONE["1️⃣ Fix ONE"]
  ONE --> RUN["▶️ Re-run end to end"]
  RUN --> NXT{"🔁 Any flags left?"}
  NXT -->|"yes"| ONE
  NXT -->|"no"| FRZ["🧊 Freeze candidate"]`,
        script: 'Watch the pulse rail and enforce the one-at-a-time rule out loud, because half the room will try to batch it. Also enforce the fifteen-minute cut rule — students will burn the whole segment on a single ambitious seam and end the night with nothing frozen. Cutting is a legitimate, defensible architect decision, and tonight it is often the right one.',
      },
      {
        segment: 'micro-build', eyebrow: '💡 Build 2 · Lights on', title: 'Run it with governance and observability ON, then read your own trace',
        body: 'Now run the whole thing with both switches on and go and look at what came out. You are looking for two specific things and nothing else. One: a single correlation ID that appears on every step of the run, so you could follow one request from trigger to write. Two: at least one line where the policy denied something it was supposed to deny. If you cannot find both, the lights were not actually on, and the run you were about to freeze is not the system you have been describing.',
        bullets: [
          'One correlation ID across every step of the run',
          'At least one expected denial — proof the policy actually evaluates',
          'Read the trace yourself, out loud, before you tag anything',
          'This trace becomes your evidence tab on Thursday',
        ],
        code: {
          kind: 'review',
          label: 'A real trace — this is what "lights on" looks like (read, do not paste)',
          code: '{"ts":"2026-08-06T02:11:04Z","level":"info","service":"orchestrator","event":"run_start","correlation_id":"7f3a-91c2","outcome":"success","duration_ms":12}\n{"ts":"2026-08-06T02:11:05Z","level":"info","service":"agent-team","event":"delegate","correlation_id":"7f3a-91c2","outcome":"success","context":{"subagent":"explorer","mode":"read_only"}}\n{"ts":"2026-08-06T02:11:07Z","level":"info","service":"mcp-bridge","event":"tool_call","correlation_id":"7f3a-91c2","outcome":"success","duration_ms":1841,"context":{"tool":"lookup_record"}}\n{"ts":"2026-08-06T02:11:09Z","level":"warn","service":"reliability","event":"retry","correlation_id":"7f3a-91c2","outcome":"partial","context":{"attempt":2,"error_class":"TimeoutError"}}\n{"ts":"2026-08-06T02:11:12Z","level":"warn","service":"policy","event":"action_denied","correlation_id":"7f3a-91c2","outcome":"failure","error_class":"PolicyDenied","context":{"action":"write_record","reason":"role_not_approved"}}\n{"ts":"2026-08-06T02:11:13Z","level":"info","service":"orchestrator","event":"run_end","correlation_id":"7f3a-91c2","outcome":"success","duration_ms":9104}',
          expectedResult: 'Two fingers on two things: the SAME correlation_id on all six lines, and the action_denied line. Those two facts are your entire observability and governance defence, in one screenshot.',
        },
        diagram: `flowchart LR
  CID["🧵 One correlation id"] --> LOG[("📜 Your logs")]
  LOG --> TRACE["🔎 Every step,<br/>one thread"]
  LOG --> DENY["🚫 One expected<br/>denial"]
  TRACE --> EV["🧾 Evidence tab"]
  DENY --> EV`,
        script: 'Put a real student trace on the shared screen, not this one, and have its owner read it out loud line by line. Then ask the room the Week 12 form of the 2 AM question: it is 2 AM, this ran, it worked, and nobody noticed. Say that this is the goal — the whole program was aimed at a system whose success is boring. Let that sit for a second before you move.',
      },
      {
        segment: 'micro-build', eyebrow: '🏷️ Build 3 · Freeze and record', title: 'Tag the commit, then record one clean run as your safety net',
        body: 'Two commands and ten minutes, and they remove most of the ways Thursday can go wrong. First tag the exact commit that just ran green with the lights on — that tag is what you check out and demo, so the system on stage is provably the system in the repo. Then record one clean run: screen capture, narrate it lightly, keep it under three minutes. You are probably not going to need it. The reason to have it is that knowing it exists is what lets you stay calm if the live one breaks, and calm is most of the defence.',
        bullets: [
          'Tag the exact commit that ran green — demo the tag, not the working copy',
          'Record one clean run tonight, under three minutes, lightly narrated',
          'Save it somewhere you can open in one click without hunting',
          'You are buying calm, not just a backup',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'your TERMINAL (not Claude Code)',
          label: 'Terminal — tag the freeze',
          code: '# 1. confirm you are on the exact commit that just ran green\ngit status --short          # must be EMPTY. If it is not, you are not frozen.\n\n# 2. tag it\ngit tag -a expo-freeze -m "Capstone frozen for the Architect Expo"\ngit push origin expo-freeze\n\n# 3. prove the tag is what you think it is\ngit show --stat expo-freeze | head -20',
          expectedResult: 'An empty git status, a tag pushed, and the tagged commit showing the files you expect.',
          stopCondition: 'git status is empty AND the tag is pushed. A dirty tree means the thing you demo is not the thing you tagged.',
          rescue: 'Dirty tree? Do NOT commit blindly to clear it. Look at what changed — if it is a stray edit from tonight, revert it and re-run end to end before tagging.',
        },
        diagram: `flowchart LR
  GRN["✅ Green run,<br/>lights on"] --> TAG["🏷️ git tag<br/>expo-freeze"]
  TAG --> REC["🎬 Record one<br/>clean run"]
  REC --> SAFE["🛟 Your on-camera<br/>fallback"]`,
        script: 'Do the git status check with them and be strict about it — a dirty tree here is the most common reason a Thursday demo does not match the tag. Then genuinely wait while they record. Ten minutes of quiet recording time in class is worth more than another ten minutes of you talking, and half of them will not do it at home.',
      },
      {
        segment: 'micro-build', eyebrow: '✍️ Build 4 · The script', title: 'One sentence, then five beats — and the sentence comes first',
        body: 'Write the throughline sentence before you script anything: who has the problem, what it costs them, what your system does, and what follows from that. Then the talk is five beats hanging off it. Problem, sixty seconds. Architecture, with the seven layers fast and two or three seams slow. Demo, the frozen run narrated. Evidence, the artefact behind each claim. Roadmap, closing on one honest limitation you name yourself. That is the whole shape, and it works because it answers questions in the order an executive asks them.',
        bullets: [
          'The throughline sentence first — everything else backs it up',
          '1 Problem · 2 Architecture · 3 Demo · 4 Evidence · 5 Roadmap',
          'Layers fast, seams slow — where you linger is where they look',
          'Close on a limitation YOU name. It is a strength, not a confession.',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — draft the Expo script from the real repo',
          code: 'Draft my five-minute Architect Expo script from THIS repository — read the code and the architecture package, do not invent capabilities I do not have.\n\nStructure it as five beats:\n1. Problem — who has it, what it costs, and the outcome my system produces. One paragraph, no tech.\n2. Architecture — the seven-layer picture summarised fast, then the two or three seams that actually carry risk, each framed as "I chose X over Y because Z".\n3. Demo — the exact narration for the frozen end-to-end run, with a cue for each seam as it fires.\n4. Evidence — for every claim in beats 1-3, name the specific artefact in this repo that backs it. If a claim has no artefact in the repo, mark it CUT.\n5. Roadmap — what I would build next, what I would harden, and the single most honest limitation of the current system.\n\nOpen with a one-sentence throughline. Keep the whole thing to five minutes read aloud, and flag anywhere I am claiming more than the code supports.',
          expectedResult: 'A five-beat script whose evidence section points at real files — plus a CUT list of claims your repo does not actually support.',
          stopCondition: 'You have read the CUT list and agree with it. That list is the panel asking questions early.',
          rescue: 'If the script sounds generic, it did not read your repo. Tell it: "Rewrite beat 2 naming the actual modules and the actual seams in this codebase, by file name."',
        },
        diagram: `flowchart LR
  ONE["✍️ One sentence:<br/>problem then outcome"] --> B1["1 Problem"]
  B1 --> B2["2 Architecture"]
  B2 --> B3["3 Demo"]
  B3 --> B4["4 Evidence"]
  B4 --> B5["5 Roadmap"]`,
        script: 'The CUT list is the whole value of this prompt — make them read it before anything else. It is the least emotional way anybody will ever tell them their claims are bigger than their code. Then have two students read their throughline sentence out loud and let the room vote: outcome first, or tech first? Rewrite on the spot if it leads with tech.',
      },
      {
        segment: 'micro-build', eyebrow: '🎯 Build 5 · The hostile rehearsal', title: 'Get cornered tonight by a panel that cannot hurt you',
        body: 'The point of rehearsing a defence is not to memorise answers, it is to find the question you cannot answer while there is still time to do something about it. So run a genuinely hostile rehearsal: three panelists with different priorities, each probing a different layer, each following up on your weakest answer rather than moving politely on. It will find something. That something is your homework, and finding it tonight is the entire difference between a hard question on Thursday and a bad moment on Thursday.',
        bullets: [
          'Three panelists: a security lead, a reliability engineer, and a CFO',
          'Each follows up on your weakest answer — no polite moving on',
          'Write down the question you could not answer. That is tonight’s homework.',
          'You are not memorising answers, you are finding the hole',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — three panelists, no mercy',
          code: 'Play three Architect Expo panelists reviewing the system in this repository. Read the code first so your questions are specific to what I actually built.\n\n- A SECURITY LEAD: probes trust boundaries, what data crosses them, and what happens when an unapproved actor calls it.\n- A RELIABILITY ENGINEER: probes timeouts, retries, idempotency, and what happens when the slowest external dependency hangs.\n- A CFO: probes what one run costs, what a thousand runs a day costs, and what happens to that number if usage triples.\n\nRules: ask ONE question at a time and wait for my answer. If my answer contains a claim, demand the artefact in this repo that backs it. If I hand-wave, follow up harder on the same point rather than moving on. Do not be encouraging.\n\nAfter six questions, stop and tell me: my single weakest answer, and the one thing I should fix or prepare before Thursday.',
          expectedResult: 'Six specific questions about your real code, and a named weakest answer at the end.',
          stopCondition: 'You have written down your weakest answer. Not fixed it yet — written it down.',
          rescue: 'If the questions feel generic, it is not reading your repo. Tell it: "Ask about the specific modules in this codebase by name, and quote the line you are questioning."',
        },
        diagram: `flowchart TD
  YOU["🎤 You"] --> SEC["🔐 Security lead"]
  YOU --> REL["🧰 Reliability engineer"]
  YOU --> CFO["💵 The CFO"]
  SEC --> WEAK["🎯 Your weakest answer"]
  REL --> WEAK
  CFO --> WEAK
  WEAK --> FIX["🔧 Fix it tonight,<br/>not Thursday"]`,
        script: 'Run this live on one volunteer, on the shared screen, before anyone does it alone. Let Claude corner them properly and do not rescue them — the whole room learns where their own defence is soft by watching one person get probed on theirs. Afterwards, thank the volunteer by name and say out loud that they just did the most useful thing anyone will do tonight.',
      },
      {
        segment: 'micro-build', eyebrow: '📚 Build 6 · Close the exam gap', title: 'Find your two weakest CCA-F domains tonight, not in the exam',
        body: 'Leaving CCA-F prep to Thursday morning is a named risk for this week, and it is a completely avoidable one, because the prep is gap-closing rather than learning. Quiz yourself across all five domains, find the two you are weakest in, and spend tonight on those two against the official exam guide. Walking into Thursday already knowing where you are soft is a completely different experience from discovering it under a timer. That is the last piece of homework this program will ever give you.',
        bullets: [
          'Fifteen scenario questions across the five domains, scored by domain',
          'Name your two weakest, write them down, take them home',
          'Re-read those two against the official exam guide tonight',
          'Thursday you sit it — with the gap already closed, not discovered',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — the CCA-F self-quiz',
          code: 'Quiz me with 15 scenario-based questions spread evenly across the five CCA-F domains: Agentic Workflows, MCP, Claude Code Configuration, Prompt Engineering, and Reliability and Governance.\n\nRules:\n- One question at a time, scenario-shaped ("a system does X and then Y happens — what is the correct architectural response?"), not definition recall.\n- After each answer, tell me which domain it tested, whether I was right, and the one-line reason.\n- Where it is relevant, use current API facts: model ids are claude-opus-5, claude-sonnet-5, claude-haiku-4-5, and structured output uses output_config with a json_schema format.\n\nAt the end, give me a score per domain and name my TWO weakest domains, with one specific thing to review in each.',
          expectedResult: 'A per-domain score and two named weak domains with something specific to review in each.',
          stopCondition: 'You have your two weakest domains written down somewhere you will still have on Thursday.',
          rescue: 'If the questions feel like flashcards, push back: "Make each question a scenario with a decision in it, not a definition."',
        },
        diagram: `flowchart LR
  Q["📝 15 scenario<br/>questions"] --> S["📊 Score by domain"]
  S --> W2["🎯 Your two<br/>weakest domains"]
  W2 --> G["📖 The official<br/>exam guide, tonight"]
  G --> THU["🎓 Thursday:<br/>you sit it"]`,
        script: 'Everyone runs this before they leave the room — do not let it become homework, because it is the one thing that will not get done at home on the last week. Have each student write their two weakest domains on something physical and take it with them. Then close the night on the open loop: Thursday they present, they defend, and they certify. Say it as a fact, not a hope.',
      },
    ],

    storyBeats: {
      checkin: [
        {
          icon: '🗡️', tone: 'cherry', eyebrow: 'The promise from night one',
          title: 'Orientation told you there was a dragon in Week 12. This is Week 12.',
          body: 'On the first night somebody stood where I am standing and said that every builder starts as an apprentice, that you would face the dragon in week twelve — a real system, live, defended — and that nobody slays anything alone because the first swing is supposed to miss sometimes. That was not a metaphor for effort. It was a schedule. The dragon is Thursday, it is on the calendar, and the net is still there: a frozen tag, a recorded run, a room full of people who have watched each other fail all program.',
          punch: 'You were told this was coming on the first night. It was never a surprise. It was a promise.',
        },
      ],
      'business-problem': [
        {
          icon: '🎻', tone: 'amber', eyebrow: 'Why we freeze tonight',
          title: 'Every recording engineer knows the take that got ruined by one more improvement',
          body: 'There is a version of this story in every craft. The band has the take. It is good. Somebody hears one small thing they could fix, and at two in the morning they are four hours into re-recording a part that was never the problem, and the take that was good is gone. The instinct is not laziness or perfectionism — it is that the improvement is genuinely real. It is just untested, at the exact moment nothing untested should be anywhere near the thing you are about to show people.',
          punch: 'You are not freezing because it is finished. You are freezing because it works and you would like it to keep working on Thursday.',
        },
      ],
      architecture: [
        {
          icon: '🧗', tone: 'berry', eyebrow: 'The callback — the climber from Orientation',
          title: 'Nobody noticed day 3. It is week 12 now. Look back down.',
          body: 'On Orientation night we talked about a climber who does not feel stronger after one workout — sore, unsure, checking her form against people ahead of her — and how one percent, compounded across eighty-four days, stops being small. You are standing at the top of that number tonight and you probably still cannot feel it, because compounding never feels like anything from the inside. So do not measure it by feel. Measure it by artefact: on day 3 you approved every single action by hand. Tonight your system acts on its own, under a policy you wrote, and logs every decision so anyone can check it.',
          punch: 'The summit is not visible from base camp. That was true in week one. It is also why you should turn around and look now.',
        },
      ],
      deconstruct: [
        {
          icon: '🤷', tone: 'violet', eyebrow: 'A change of pace — the best answer I have heard in a review',
          title: 'The most senior person in the room said three words and the room relaxed',
          body: 'A design review, a room full of people trying to look certain, and someone asks the architect a question about a failure mode nobody had modelled. He does not fill the air. He says: "I do not know." Then, after a beat, he says how he would find out, and roughly how long it would take. Nobody thought less of him. Everyone in that room quietly recalibrated what every other confident answer he had given was worth — upward, because now they knew he would tell them when he did not know.',
          punch: 'Certainty is cheap and everyone can hear that it is cheap. "I do not know, here is how I would find out" is the expensive one.',
        },
      ],
      'micro-build': [
        {
          icon: '🪑', tone: 'leaf', eyebrow: 'The payoff — the person who was not there',
          title: 'In Week 2 the analyst was out, so the check nobody else knew how to run did not get run',
          body: 'That analyst has been in this program the whole time. In week 4 they were the teammate who wrote the one prompt that worked and then left. In week 6 they were the only engineer who understood the integration. In week 8 they were the reviewer on vacation while the work sat. In week 10 they were the approver nobody could find at 2 AM, which is precisely why you wrote a policy instead of relying on a person. Tonight, in your capstone, the check runs whether or not anyone is at their desk.',
          punch: 'Twelve weeks ago the knowledge lived in one head. It now lives in a system that can be read, tested, and handed to someone else.',
        },
      ],
    },

    extraInteractions: [
      {
        segment: 'cold-open', kind: 'poll',
        q: 'Honestly, right now — how close is your capstone to running end to end with ONE command?',
        options: [
          'It already does — one command, no manual steps',
          'Close. One or two manual steps in the middle.',
          'The parts work, but nothing runs them together yet',
          'I genuinely do not know until I try',
        ],
        eyebrow: '🌡️ The honest read', title: 'Before anything else — where does yours actually stand?',
        presenterTip: 'This is a temperature read, not a test, and you must say so before they vote or they will answer optimistically. The distribution tells you how to pace the whole night: if most of the room picks options 3 or 4, spend longer on the seam-fixing micro-build and cut the rehearsal short. Read the counts out loud without commentary.',
      },
      {
        segment: 'checkin', kind: 'poll',
        q: 'Is your integration audit running?',
        options: ['✅ Running now', '🐢 Claude Code is still starting up', '📁 Wrong folder / cannot find my repo', '🆘 Stuck — I need someone'],
        eyebrow: '🚦 Room check', title: 'Everyone launched before we go on',
        presenterTip: 'Purely operational. Read the last two numbers out loud and send mentors to those students immediately — the audit feeds every micro-build tonight, so a student who never launches it has nothing to work on for the rest of class. Do not advance until those two counts are near zero.',
      },
      {
        segment: 'business-problem', kind: 'poll',
        q: 'It is Monday of Week 12. One feature in your capstone is half-built and you could probably finish it by Wednesday. What do you do?',
        options: [
          'Finish it — a bigger system demos better',
          'Finish it, but only if the tests still pass',
          'Cut it, freeze what works, and put it on the roadmap',
          'Leave it half-built and avoid that part of the demo',
        ],
        answer: 2,
        reveal: 'Cut it. A half-built feature you avoid in the demo is the exact thing a panelist will ask about, and a finished-on-Wednesday feature is the least-tested code in your system on the one night it is watched. Cutting it and naming it on your roadmap is the defensible architect move — and it is a stronger answer than either version of finishing it.',
        eyebrow: '🏛️ Architect check', title: 'The decision every single person in this room is about to make',
        presenterTip: 'Take a show of hands BEFORE revealing, and expect option 1 to lead — it is the honest instinct and you should say so rather than making anyone feel caught out. Then reveal and connect it straight to the four ways a live demo dies. This is the highest-leverage two minutes of the first hour.',
      },
      {
        segment: 'architecture', kind: 'trivia',
        q: 'Which of these runs actually counts as "frozen"?',
        options: [
          'It ran end to end this afternoon, before I made two small fixes',
          'It runs end to end with governance and observability turned off',
          'It ran end to end with governance and observability ON, at a tagged commit, and nothing has changed since',
          'It works when I run each component separately',
        ],
        answer: 2,
        reveal: 'Governance and observability ON, at a tagged commit, unchanged since. The other three are all things people call "frozen" the night before a demo, and all three are how demos die.',
        eyebrow: '🧊 Knowledge check', title: 'One question before we talk about freezing',
        presenterTip: 'Fast — reveal, one line of why, keep moving. If a meaningful number pick option 2, stop and re-teach the lights-on definition, because that is the misconception that produces an undefendable demo on Thursday.',
      },
      {
        segment: 'architecture', kind: 'poll',
        theater: true,
        q: 'A panelist asks: "why did you choose that model for this component?" Which answer earns the most trust?',
        options: [
          'It is the most capable model available, so it is the safe choice',
          'It was what the tutorial used and it worked, so I kept it',
          'I chose it over the cheaper one because my eval dropped 9 points on the cheaper one — here is the score, and here is where I would revisit it',
          'Honestly, I am not sure — I would have to look',
        ],
        answer: 2,
        reveal: 'The third: decision, rejected alternative, artefact, and the limit. Notice that the fourth answer is not shameful — "I am not sure, I would have to look" beats a confident guess every time, and if you follow it with HOW you would look, it is a complete answer. The one that actually loses the room is the second.',
        eyebrow: '🏛️ The real decision', title: 'This is what the panel is grading. Choose.',
        presenterTip: 'Full-screen theatre moment — lock the votes, show the spread, then reveal slowly. Spend real time on why option 4 is respectable and option 2 is not: one is honest about a limit, the other reveals there was never a decision. This is the slide people repeat back to you after the Expo.',
      },
      {
        segment: 'deconstruct', kind: 'poll',
        q: 'Which of these claims should you CUT from your talk tonight?',
        options: [
          '"It is correct" — backed by a 40-case eval at 92%',
          '"It is scalable" — no load test exists',
          '"It is governed" — backed by a policy file and a denial in the log',
          '"It is traceable" — backed by one correlation ID across the run',
        ],
        answer: 1,
        reveal: 'Cut "it is scalable." You have no load test, so it is a claim with a blank artefact column — which is precisely where a panelist pushes. Move it to the roadmap and say "I have not load-tested this; that is the first thing I would do next." That version is stronger than the claim was.',
        eyebrow: '✂️ Evidence check', title: 'One of these four is a liability',
        presenterTip: 'After the reveal, make it personal immediately: ask every student to name one claim of their own that they now realise has no artefact behind it. Take three out loud. The room will realise this is not a hypothetical exercise, which is the point.',
      },
      {
        segment: 'micro-build', kind: 'poll',
        q: 'Where are you in the build block?',
        options: ['🧊 Frozen and tagged', '🔧 Still closing seams', '🎬 Recording my fallback run', '🆘 My end-to-end run is broken'],
        eyebrow: '🚦 Build check', title: 'Nobody leaves tonight without a tag',
        presenterTip: 'Operational. Call the numbers out loud ("14 of 19 tagged — five to go"). Anyone on the last option gets a mentor immediately, and if there are several, stop the class and fix them together rather than pushing on. A student who leaves Monday without a green run has no Thursday.',
      },
      {
        segment: 'trailer', kind: 'poll',
        q: 'Thursday you present and defend on camera. What is actually on your mind right now?',
        options: [
          'The demo breaking live',
          'A question I will not be able to answer',
          'Whether what I built is impressive enough',
          'The exam',
          'Honestly? I am ready',
        ],
        eyebrow: '🫱 No right answer', title: 'Say the real thing — everyone else is thinking one of these too',
        presenterTip: 'No correct answer and you must say that clearly. Read the spread out loud and address the top one directly for ninety seconds, by name. If "whether what I built is impressive enough" scores high, address it head on: the panel grades the defence, not the ambition, and a small system defended well outscores a big one that cannot be traced. End the class on that, then name Thursday.',
      },
    ],
  },

  /* ======================================================================== */
  /*  THURSDAY — Build Day: the Architect Expo and the CCA-F                  */
  /* ======================================================================== */
  thursday: {
    teach: [
      /* ============================ build map ============================= */
      {
        segment: 'build-map', eyebrow: '🎤 Tonight', title: 'This is the Expo. You are not building tonight — you are standing behind what you built.',
        body: 'Every other Build Day in this program ended with something new existing. Tonight nothing new gets made. You confirm the frozen run, you present and defend it in front of a panel on camera, and you sit the CCA-F. That is the whole run of show, and it is four checkpoints deep. Treat it as a launch sequence rather than a class: each gate is confirmed green before the next one starts, and the calm of a rehearsed sequence is itself part of the defence.',
        bullets: [
          'CP0 — Integrated: the whole thing wired, one command',
          'CP1 — Frozen run: end to end, governance and observability ON',
          'CP2 — Presented: the recorded five-beat talk plus the live defence',
          'CP3 — Certified: a CCA-F attempt and the submitted architecture package',
        ],
        diagram: `flowchart LR
  CP0["0️⃣ Integrated"] --> CP1["1️⃣ Frozen run"]
  CP1 --> CP2["2️⃣ Recorded talk<br/>+ live defence"]
  CP2 --> CP3["3️⃣ CCA-F<br/>+ package"]`,
        script: 'Open by naming what is different about tonight, because the room will feel it before you say it: there is no new build, and that changes the energy. Put the four checkpoints on the board and physically check them off as the room clears each one together. Say the word "launch sequence" and mean it — the structure is what keeps a nervous room moving.',
      },
      {
        segment: 'build-map', eyebrow: '⏱️ The clock', title: 'Protect the exam window — the defence expands to fill whatever you give it',
        body: 'Two hours, three things, and the failure mode is always the same: presentations run long, the defence Q&A is the interesting part, and suddenly there are eleven minutes left for a certification exam. So the clock is fixed. A short confirmation that everyone has a green frozen run, then presentations with live defence, then a protected window for the CCA-F that does not move regardless of what is happening. Slide polish is the first thing to cut, every time, because the panel grades the defence and the defence lives in your evidence tab, not your deck.',
        bullets: [
          'Confirm the frozen run → present and defend → the protected exam window',
          'Every talk is recorded — the recording is a graded portfolio deliverable',
          'Keep your architecture package open in a tab; that is your evidence',
          'Cut slide polish before you cut Q&A. Always that order.',
        ],
        diagram: `flowchart LR
  A["⏱️ Confirm the<br/>frozen run"] --> B["🎤 Present + defend"]
  B --> C["🎓 Protected<br/>exam window"]
  D["🎬 Recording"] -.-> B
  E["🧾 Package tab"] -.-> B`,
        script: 'Set a visible timer and tell the room you will be rude about it, then actually be rude about it — kindly, but on time. The most common way this night goes wrong is a generous instructor letting the first three presenters run long and squeezing the exam. Announce the exam start time now, out loud, and do not move it.',
      },
      {
        segment: 'build-map', eyebrow: '🚦 Readiness', title: 'Four things green before anybody presents',
        body: 'Same discipline as every Build Day, and tonight it matters more because there is no recovery time. Your frozen tag checked out and confirmed running. Your fallback recording saved somewhere you can open in one click without hunting through folders on a shared screen. Your architecture package open in a tab. And your exam login actually working — not "I have the email somewhere," but logged in and confirmed. If any of those is red, fix it in the next five minutes; the rescue branch is here, not halfway through your own talk.',
        bullets: [
          '1️⃣ The expo-freeze tag checked out, and a green run confirmed tonight',
          '2️⃣ Your fallback recording open, one click away',
          '3️⃣ Your architecture package open in a tab',
          '4️⃣ Your CCA-F login working — verified now, not at exam time',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'your TERMINAL (not Claude Code)',
          label: 'Terminal — check out the freeze and confirm it is green TONIGHT',
          code: '# 1. go to the exact system you are about to demo\ngit checkout expo-freeze\ngit status --short          # must be EMPTY\n\n# 2. run it once, lights on, before anyone is watching\n# (substitute YOUR one command — the one from Monday)\n<your single end-to-end command, with governance and observability enabled>\n\n# 3. confirm the two things that make it a defence\n# one correlation id across the run, and at least one expected denial',
          expectedResult: 'A green end-to-end run, at the tag, tonight — plus a fresh correlation ID and a denial line you can point at during the demo.',
          stopCondition: 'It ran green AT THE TAG tonight. A run that was green on Monday is not evidence about tonight.',
          rescue: 'Broken at the tag but working on your branch? You are demoing the tag. Do not re-tag under time pressure — present from the recording and say honestly that the live run is failing and why.',
        },
        diagram: `flowchart LR
  T["🏷️ Tag checked out"] --> GO["✅ Ready"]
  R["🎬 Fallback recording"] --> GO
  P["🧾 Package tab open"] --> GO
  E["🎓 Exam login works"] --> GO`,
        script: 'Run this as a literal four-point roll call on the pulse rail and do not skip it because the room is excited. The exam login is the one people assume is fine and is not. Anyone red goes to a mentor NOW — presenting with a broken fallback is presenting without a net, and the whole point of tonight is that the net exists.',
      },

      /* ========================== guided build ============================ */
      {
        segment: 'guided-build', eyebrow: '1️⃣ Beat 1 · Problem', title: 'Sixty seconds on the problem. No stack, no tools, no apology.',
        body: 'Open with the throughline you wrote Monday: who has the problem, what it costs them, and the outcome your system produces. That is the whole first beat. Do not name a single technology, do not give a tools tour, and above all do not open by apologising for what is unfinished — the roadmap beat exists precisely so you never have to. An executive decides in the first sixty seconds whether this is worth their attention, and they decide on the problem, not the architecture.',
        bullets: [
          'Who has the problem · what it costs them · what your system produces',
          'No technology named in the first sixty seconds',
          'No apology — unfinished work belongs in beat 5, framed as roadmap',
          'Then transition: "here is how it holds up"',
        ],
        diagram: `flowchart LR
  W["👤 Who has it"] --> C["💸 What it costs"]
  C --> O["📈 The outcome"]
  O --> NEXT["➡️ Now the architecture"]
  X["🚫 No stack tour,<br/>no apology"] -.-> W`,
        script: 'Time the opening with a stopwatch on the shared screen. If a presenter names a tool before naming the outcome, stop them and have them restart — the reset is the lesson, and it only has to happen once for the whole room to learn it. Do it to the first presenter so nobody thinks they were singled out.',
      },
      {
        segment: 'guided-build', eyebrow: '2️⃣ Beat 2 · Architecture', title: 'Layers fast, seams slow — where you linger is where they look',
        body: 'Show the seven-layer picture from your package and move through it quickly; nobody needs a tour. Then slow right down on the two or three seams that actually carry risk — where the agent team meets the MCP server, where the reliability envelope wraps an external call, where the policy gate decides. Frame each of those as a decision: I chose this over that, because. Those are exactly the points the defence will probe, so you are choosing the questions you get asked. That is not a trick; it is what it means to know your own system.',
        bullets: [
          'Seven layers in about forty seconds — orientation, not a tour',
          'Two or three seams, slowly, each framed as a decision',
          '"I chose X over Y because Z" — the sentence that invites the right question',
          'Where you linger tells the panel where the real engineering is',
        ],
        diagram: `flowchart LR
  L["🗂️ Seven layers,<br/>fast"] --> S1["🔗 Seam 1<br/>team meets MCP"]
  L --> S2["🔗 Seam 2<br/>reliability wraps the call"]
  L --> S3["🔗 Seam 3<br/>policy gates the action"]
  S1 --> DEC["🏛️ Each one framed<br/>as a decision"]
  S2 --> DEC
  S3 --> DEC`,
        script: 'Coach the pace out loud before the first presenter starts: speed up on the layers, slow down at the seams. Then, during talks, watch where each presenter lingers and note it — you can tell within thirty seconds which parts of a system somebody actually built and which parts they inherited from a tutorial, and so can the panel.',
      },
      {
        segment: 'guided-build', eyebrow: '3️⃣ Beat 3 · Demo', title: 'Run the frozen tag with the lights on, and narrate every seam as it fires',
        body: 'Trigger the one command and let it run. While it runs, narrate the path: the workflow starts, the team divides the work, the MCP server touches the real system, the reliability wrapper handles a slow call, the policy gate allows or denies, and the logs stream with one correlation ID. This is the tagged freeze, not your working copy. The demo is not there to look pretty — it is there to make the architecture visible in motion, which is something no slide can do.',
        bullets: [
          'One command, running the tag — no live edits, no "let me just"',
          'Narrate each seam out loud AS it fires; a silent demo is just a screen',
          'Governance and observability visibly ON — say that out loud too',
          'If it breaks: name it, do not click away. That is the next segment.',
        ],
        diagram: `flowchart LR
  CMD["▶️ One command"] --> TEAM["🤝 The team divides<br/>the work"]
  TEAM --> MCP["🔌 MCP touches<br/>the real system"]
  MCP --> REL["🛡️ Reliability<br/>wraps the call"]
  REL --> GOV["⚖️ Policy allows<br/>or denies"]
  GOV --> LOG["🔭 One id,<br/>every line"]`,
        script: 'Make them narrate. A silent demo where the presenter watches their own screen is the most common Expo mistake and the easiest to fix — say "talk over it, tell us what is happening" before each person starts. If a presenter goes quiet mid-run, prompt them gently with "what just fired?" rather than letting the silence stretch.',
      },
      {
        segment: 'guided-build', eyebrow: '4️⃣ Beat 4 · Evidence', title: 'This is the beat that turns a demo into a defence',
        body: 'For every claim you made in the first three beats, show the artefact. Correct maps to the eval dataset and the pass rate. Reliable maps to the timeout and breaker configuration plus the chaos test that trips it. Governed maps to the policy file and one denial line in the log. Traceable maps to a single correlation ID followed from the trigger to the write. Pull each of these from your architecture package so it is one click, not a search. Evidence is what converts polite interest into trust, and trust is exactly what the credential certifies.',
        bullets: [
          'correct → the eval dataset + the pass rate',
          'reliable → the breaker config + a chaos test that trips it',
          'governed → the policy + one denial log line',
          'traceable → one correlation ID, trigger through to write',
          'One click from the package. Hunting for a file loses the room.',
        ],
        code: {
          kind: 'review',
          label: 'The evidence card — what a panelist sees when they ask "show me" (read together)',
          code: '# Evidence card — <your capstone name>, tag expo-freeze\n\n1. CORRECT\n   eval_set.json · 40 cases · 37 passed (92.5%) · run 2026-08-06\n   Failures: 2 ambiguous inputs, 1 missing-record case. All 3 listed in the roadmap.\n\n2. RELIABLE\n   Every outbound call: timeout 10s · 3 capped retries, exponential backoff · breaker opens after 5\n   Chaos test: tests/chaos_upstream_down.py — trips the breaker and lands in the dead-letter path.\n\n3. GOVERNED\n   policy/rules.yaml — write actions require an approved role; high-risk actions require a human gate.\n   Proof: logs/capstone.jsonl line 214 — {"event":"action_denied","error_class":"PolicyDenied"}\n\n4. TRACEABLE\n   Correlation id 7f3a-91c2 appears on all 31 log lines of the run shown in the demo.\n\n5. WHAT I AM NOT CLAIMING\n   Not load-tested. Not multi-tenant. Costs measured at current usage only, not at 10x.',
          expectedResult: 'Point at section 5 first. A defence with a written "what I am not claiming" section is the one that survives questioning — it removes the panel’s easiest attack before they make it.',
        },
        diagram: `flowchart LR
  C1["Correct"] --> A1["📊 Eval set<br/>+ pass rate"]
  C2["Reliable"] --> A2["🛡️ Breaker config<br/>+ a chaos test"]
  C3["Governed"] --> A3["⚖️ Policy + one<br/>denial log line"]`,
        script: 'During the talks, when a presenter makes a claim, hold up a hand and say one word: "artefact?" If they can produce it in one click from the package, the room hears what a defence sounds like. If they cannot, do not embarrass them — say "roadmap it" and move on. Both outcomes teach; only one of them costs the presenter anything.',
      },
      {
        segment: 'guided-build', eyebrow: '5️⃣ Beat 5 · Roadmap', title: 'Close on what is next — and name your own weakest point before they do',
        body: 'End with the roadmap: what you would build next, what you would harden first, and one honest limitation you already know about. Naming a limitation yourself is not a confession, it is a demonstration that you can see your own system clearly — and it takes the panel’s easiest attack off the table before they make it. The presenters who look most senior are almost always the ones who said, unprompted, "here is where this would fall over." Then stop talking and open the defence.',
        bullets: [
          'What is next · what you would harden · one honest limitation',
          'Name your weakest point yourself, in one sentence, without hedging',
          'It reads as judgment, not as weakness — every time',
          'Then stop. The silence is you handing the room to the panel.',
        ],
        diagram: `flowchart LR
  NXT["🗺️ What is next"] --> HARD["🔧 What you<br/>would harden"]
  HARD --> LIM["🫱 One honest<br/>limitation"]
  LIM --> DEF["🎯 Their easiest<br/>attack, removed"]`,
        script: 'Watch for the presenter who cannot bring themselves to name a limitation and gently insist — "give me one thing this does not do yet." Watch also for the opposite, the presenter who lists eight. One sentence, one limitation. The difference between judgment and self-sabotage is the count.',
      },
      {
        segment: 'guided-build', eyebrow: '🎬 Record it', title: 'One rehearsal out loud, then one take — and watch it back',
        body: 'Before you present live, rehearse the five beats out loud once, standing up, on a timer. Out loud is not optional; the script that reads fine in your head runs ninety seconds long and skips the transitions. Then record the take. Then — and this is the part people skip — watch it back and ask one question: if a stranger saw only this, would they believe the system works? If the answer is no, you know exactly which beat to redo, and it is almost always the evidence beat.',
        bullets: [
          'Rehearse standing up, out loud, on a timer. Once is enough.',
          'Record one take. Perfect takes are not the goal; believable ones are.',
          'Watch it back and ask: would a stranger believe this?',
          'If not, redo one beat — usually evidence — not the whole thing',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — build the one-page cue card you hold while presenting',
          code: 'Read this repository and my architecture package, then produce a SINGLE page I can keep open while I present. Nothing invented — everything must point at something that actually exists here.\n\nIt has four parts:\n1. THROUGHLINE — my one problem-then-outcome sentence, verbatim, at the top.\n2. FIVE CUES — one short line per beat (problem, architecture, demo, evidence, roadmap), just enough to get me back on track if I lose my place. Not a script.\n3. EVIDENCE INDEX — every claim I plan to make, and the exact file path or log line that backs it, so I can open it in one click.\n4. THE THREE QUESTIONS I AM MOST LIKELY TO BE ASKED — based on the weakest parts of this codebase — each with a four-part answer: the decision, the alternative I rejected, the artefact, and the limit.\n\nKeep it to one page. Terse. This is something I read under pressure, not something I read for pleasure.',
          expectedResult: 'A one-page cue card whose evidence index is real file paths, and three predicted questions with four-part answers already written.',
          stopCondition: 'You have it open in a tab or printed, and you can find any artefact on it in one click.',
          rescue: 'If the predicted questions feel generic, push back: "Base the three questions on the weakest modules in THIS repo and name them."',
        },
        diagram: `flowchart LR
  REH["🔁 Rehearse once,<br/>out loud"] --> REC["🎬 Record the take"]
  REC --> CHK{"🎧 Watch it back —<br/>would you believe it?"}
  CHK -->|"no"| REH
  CHK -->|"yes"| SUB["📤 Submit it"]`,
        script: 'Enforce the out-loud rehearsal — people will try to do it silently in their heads and it does not work. If the room is large, pair them up: one presents, one holds the timer and asks a single hard question at the end. Two minutes each, and it visibly improves every talk that follows.',
      },
      {
        segment: 'guided-build', eyebrow: '⚔️ The defence', title: 'Now the panel probes. Four parts, then stop talking.',
        body: 'The defence is the graded part. A panelist will pick your highest-stakes decision, or hunt for the weakest thing you said, and push on it. Answer in the shape you rehearsed on Monday: the decision, the alternative you rejected and why, the artefact that backs it, and the limit you already know about. Then stop. The instinct to keep talking is the single biggest thing that turns a good answer into an uncertain one. And if you genuinely do not know — say so, then say how you would find out. That is a complete answer, and it is a senior one.',
        bullets: [
          'Decision → rejected alternative → artefact → limit. Then silence.',
          'Under twenty seconds. Let them ask the follow-up.',
          '"I do not know — here is how I would find out" is a full answer',
          'Do not blame the tool, the time, or the network. You chose all three.',
        ],
        diagram: `flowchart LR
  P["❓ Panelist"] --> A["🏛️ Decision + alternative<br/>+ artefact"]
  A --> F{"🔎 Do you<br/>actually know?"}
  F -->|"no"| H["🫱 I do not know —<br/>here is how I would find out"]
  F -->|"yes"| E["🧾 Open the package"]`,
        script: 'Model the twenty-second answer yourself on the first question of the night so the room hears the length. When someone over-explains, let them finish and then say kindly: "the first eleven seconds of that answered it." They will remember. And when someone says "I do not know" well, name it out loud as the strong answer it is — that single piece of praise changes how the rest of the room defends.',
      },
      {
        segment: 'guided-build', eyebrow: '🎓 The exam', title: 'Sit the CCA-F. Every question is about something you have already built.',
        body: 'The exam window is protected and it starts now. Five domains, all of them a mirror of your own twelve weeks — agentic workflows, MCP, Claude Code configuration, prompt engineering, and reliability and governance. Read each question as "which part of my own system is this describing," slow down deliberately in the two weakest domains you identified on Monday, and remember that this is a scenario exam: it rewards the architectural judgment you have been practising since week one, not memorised definitions.',
        bullets: [
          'Read each question as: which part of MY system is this?',
          'Slow down in the two domains you named on Monday',
          'Scenario judgment, not recall — you have been doing this for twelve weeks',
          'Current facts matter: claude-opus-5 / claude-sonnet-5 / claude-haiku-4-5, output_config + json_schema',
        ],
        diagram: `flowchart TD
  EX["🎓 The exam"] --> M["🪞 A mirror of<br/>your own build"]
  M --> R["📖 Read it as: which<br/>part of mine is this?"]
  R --> W["🎯 Slow down in your<br/>two weak domains"]`,
        script: 'Before the timer starts, do one thing that visibly drops the nerves in the room: have each student name, out loud, one artefact from their own repo for each of the five domains. Five hands, five answers, thirty seconds. Once they hear the exam described in terms of things sitting in their own folder, the character of it changes. Then go quiet and let them work.',
      },
      {
        segment: 'guided-build', eyebrow: '📦 Submit', title: 'The package, the recording, the attempt — that is the graduation artefact',
        body: 'The last gate is submission, and it is three things together. The architecture package — the written form of your defence: the layered picture, the decisions with their rejected alternatives, the evidence behind each trust claim. The recorded Expo talk. And the CCA-F attempt. Together they are what you hand somebody who asks what you can do. Not "I took a course," but "here is a governed, observable AI system I built, and here is a recording of me being questioned about it."',
        bullets: [
          'Submit: the architecture package + the recording + the CCA-F attempt',
          'The package is your defence in written form — it outlives tonight',
          'This is a portfolio asset a buyer can inspect, not a certificate to frame',
          'All three point back at the one problem you named in beat 1',
        ],
        diagram: `flowchart LR
  PKG["🧾 Architecture package"] --> SUB["📤 Submitted"]
  REC["🎬 Recorded defence"] --> SUB
  EXM["🎓 CCA-F attempt"] --> SUB
  SUB --> PROOF["🏛️ Public proof,<br/>as promised"]`,
        script: 'As each student submits, say their business problem back to them by name — the one they wrote in a paragraph in Week 3 — and note that it is now solved, governed, and defended. Doing this out loud, one person at a time, is worth more than any closing speech. It is also the moment most of them realise how far the paragraph travelled.',
      },

      /* ============================= failure ============================== */
      {
        segment: 'failure', eyebrow: '💥 When it breaks', title: 'It might break in front of the panel. Here are the three seconds that decide everything.',
        body: 'This is the authentic failure mode of this specific night, so let us be honest about it rather than hoping. Something may fail during a live run: the MCP call times out, the policy denies something you expected to pass, a downstream service returns the wrong shape, or the room’s network simply gives up. Three seconds pass. In the first you will want to hide it — click away, minimise, keep talking over it. Do not. Say out loud: "there is the failure, let me trace it." That sentence changes the entire meaning of the next two minutes.',
        bullets: [
          'It fails: a timeout, an unexpected denial, a wrong-shape response, the network',
          'Second one: the instinct to hide. Recognise it and refuse it.',
          'Second two: name it out loud — "there is the failure, let me trace it"',
          'Second three: grab the correlation ID. Now you are working, not panicking.',
          'Never blame the network, even when it IS the network',
        ],
        diagram: `flowchart LR
  BRK["💥 It breaks"] --> S1["😰 Second 1:<br/>the instinct to hide"]
  S1 --> S2["🗣️ Second 2:<br/>name it out loud"]
  S2 --> S3["🔎 Second 3:<br/>grab the id"]
  S3 --> CALM["🏛️ The room settles"]`,
        script: 'Say this before the first presentation, not after the first failure — the whole room needs the sentence in their head before they need it in their mouth. If it does happen tonight, do not rescue the presenter. Let them use the procedure. And afterwards, name what the room just watched: somebody stayed calm because they had prepared for this exact moment.',
      },
      {
        segment: 'failure', eyebrow: '🔧 The procedure', title: 'Trace the ID, show the layer doing its job, then fall back to the recording',
        body: 'Recovery is a procedure, not improvisation, and you rehearsed every part of it in Week 9. Take the correlation ID from the failing request and follow it to the exact seam that broke — that is what observability was built for. Then show the reliability layer responding: the timeout fired, the retry backed off, the breaker opened, the fallback or dead-letter caught it. You are not fixing code on stage; you are demonstrating that the system was designed to fail safely. Then open the recorded green run so the panel still sees the full happy path, and finish your talk.',
        bullets: [
          'Correlation ID → the exact seam that broke. Say it out loud as you find it.',
          'Show the timeout, the retry, the breaker, the fallback doing their jobs',
          'You are not editing code — you are proving failure-safe design',
          'Then the recorded run, and finish the story. That is why you recorded it.',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'your TERMINAL (not Claude Code)',
          label: 'Terminal — the two lines you run on stage, in this order',
          code: '# 1. the failing step, and its error class — say what you find OUT LOUD\nexport CID=<the correlation id from the failing run>\ncat logs/capstone.jsonl | jq -c \'select(.correlation_id==env.CID and .outcome=="failure") | [.service,.event,.error_class]\'\n\n# 2. the reliability layer doing exactly what you designed it to do\ncat logs/capstone.jsonl | jq -c \'select(.correlation_id==env.CID) | select(.event=="retry" or .event=="breaker_open" or .event=="dead_letter") | [.event,.service,.context]\'',
          expectedResult: 'The exact failing service and its error class, then the retry, breaker, or dead-letter lines showing containment.',
          stopCondition: 'You can name the seam that broke and show the layer that caught it. Then switch to the recording.',
          rescue: 'No lines come back? The run may have died before emitting. Say that out loud — "it failed before the trace was written, which is itself a gap I would fix" — and go straight to the recording. An honest gap named on stage costs far less than silent hunting.',
        },
        diagram: `flowchart LR
  ID["🧵 Correlation id"] --> SEAM["📍 The exact seam"]
  SEAM --> LAY["🛡️ Show the layer<br/>doing its job"]
  LAY --> FALL["🎬 Fall back to<br/>the recording"]
  FALL --> FIN["✅ Finish the story"]`,
        script: 'Narrate the diagnosis step by step if it happens, slowly, so the room learns the architecture thinking rather than watching a scramble. Then make the Week 9 connection explicit: they broke things on purpose that week specifically so this week would have a procedure instead of a panic. That callback lands hardest at the exact moment it is being used.',
      },
      {
        segment: 'failure', eyebrow: '🏅 The lesson', title: 'A recovery on camera is the one thing in this whole program that cannot be faked',
        body: 'A flawless demo proves the happy path works. A live recovery proves the entire failure-first architecture works — observability, reliability, and governance, all at once, under pressure, unscripted, in front of people. There is no way to rehearse your way into that and no way to fake it. Which is why the presenters who break and recover tonight are, reliably, the ones the panel remembers. It is the clearest line there is between someone who built an AI feature and someone who architected an AI system.',
        bullets: [
          'A flawless demo proves the happy path and nothing else',
          'A live recovery proves reliability, observability, and governance at once',
          'Unscripted and unfakeable — which is exactly why it is worth so much',
          'This is the line between a feature-builder and a system architect',
        ],
        diagram: `flowchart LR
  NOFAIL["✨ A flawless demo"] --> H["🙂 Proves the<br/>happy path"]
  REC["🔧 A live recovery"] --> ALL["🏛️ Proves reliability,<br/>observability, governance"]
  ALL --> LINE["🎓 Feature-builder<br/>→ system architect"]`,
        script: 'If somebody recovered on camera tonight, name them and say this to their face in front of the room. If nobody did, say it anyway — because half of them will present something in the next year, and the sentence they need is "name it, trace it, fall back." That is the last technical thing this program teaches them.',
      },
      {
        segment: 'failure', eyebrow: '📏 The last slide', title: 'Measure the distance. Then go and be the person who can be asked.',
        body: 'Twelve weeks ago you walked into a room able to ask an AI for help. Tonight you froze a system, ran it with a policy gating its actions and a correlation ID threading its logs, showed the evidence behind every claim you made, answered a panel that was trying to find the weak point, and sat an exam on your own architecture. That is the distance. Not "you learned some tools" — you moved from asking for help to being the person who can be asked. Orientation said two kinds of people walk into a room like this, and that tonight would decide which one you were. It decided.',
        bullets: [
          'Wk 1-3: you stopped typing code and started directing, and something of yours ran unattended',
          'Wk 4-6: your judgment became reusable, and your AI reached real systems',
          'Wk 7-9: one assistant became a team, ran itself, and survived being broken on purpose',
          'Wk 10-12: it got a conscience, a map, and tonight, a defence',
          'It is 2 AM, it works, and nobody notices. That was always the goal.',
        ],
        diagram: `flowchart LR
  ORI["🚪 The person who walked<br/>into Orientation"] --> D["📏 Twelve weeks"]
  D --> NOW["🏛️ The person<br/>leaving tonight"]
  NOW --> ACC["✍️ Accountable for a system<br/>they can defend"]`,
        script: 'Slow all the way down. Do not perform this — read the four acts back as facts, because they are facts and the room lived them. Then say the last line plainly and stop: it is 2 AM, it works, and nobody notices, and that is what the whole thing was for. Do not add anything after it. Let the silence be the end of the program.',
      },
    ],

    beforeAfter: {
      label: 'Orientation night → tonight',
      before: [
        'You could ask an AI for help',
        'You approved every single action, one at a time',
        'The knowledge lived in one head — usually yours',
        'Nothing you built ran when you left the room',
        '"It works" was a feeling you had, not a thing you could show',
        'A failure was a surprise you dealt with afterwards',
        'You had an idea you were slightly embarrassed to say out loud',
      ],
      after: [
        'You direct an engineer, and judge what comes back',
        'It acts under policy, with a human gate on the high-risk moves, fully audited',
        'Your judgment is a Skill, a prompt library, and a standards file anyone can inherit',
        'It runs at 2 AM, reaches real systems, and nobody needs to notice',
        '"It works" is an eval score, a trace, and a denial in the log',
        'A failure is a path you designed, tested on purpose, and can recover on camera',
        'You have a working system, a credential, and a recording of yourself defending both',
      ],
    },

    storyBeats: {
      'result-preview': [
        {
          icon: '🚪', tone: 'amber', eyebrow: 'The callback — the first thing Orientation said',
          title: 'Two kinds of people walked into that first room. Tonight decided which one you were.',
          body: 'On the first night the room was told that some people come to collect information — another framework, another tool, another thing half-remembered by Friday — and some people come to leave different than they walked in. And then it said something specific: tonight does not decide which kind of person you are, week 12 does. That was not a motivational line. It was a deferred verdict, and the verdict is due in about ninety minutes, and it gets delivered by you, out loud, on camera.',
          punch: 'Nobody in this room is behind. You are the people who showed up for the week that decides it.',
        },
      ],
      'build-map': [
        {
          icon: '🥅', tone: 'berry', eyebrow: 'About the net',
          title: 'Orientation promised you would face the dragon with a net. This is the net.',
          body: 'The frozen tag so the thing on stage is the thing that worked. The recorded run so a failure costs you two minutes instead of your talk. The evidence card so a hard question has an answer sitting one click away. A room full of people who have each watched their own code fall over in front of everyone at least once since March. None of that removes the dragon. It just means the first swing missing is a thing that happens rather than a thing that ends you.',
          punch: 'You are not being thrown at this. You have been walking toward it for twelve weeks with people who tested every part of the net.',
        },
      ],
      failure: [
        {
          icon: '🎙️', tone: 'cherry', eyebrow: 'A thing that happens more often than anyone admits',
          title: 'The demo died at minute two, and it was the best presentation of the day',
          body: 'The integration failed live, in front of everyone, on the one run that mattered. The presenter did not click away or blame the wifi. She said "there is the failure — let me trace it," pulled the correlation ID out of the log, walked the room to the exact seam that broke, showed the circuit breaker opening exactly as designed, and then played the recorded run so everyone still saw the whole path. Nobody in that room remembered the failure afterwards. They remembered that she was not rattled by it.',
          punch: 'The panel is not grading whether your system fails. They are grading whether you know what happens when it does.',
        },
        {
          icon: '🌙', tone: 'violet', eyebrow: 'The last time we ask the 2 AM question',
          title: 'It is 2 AM. It ran. It worked. Nobody noticed. That is the whole point.',
          body: 'We have asked this every act. In week 3 it was: it is 2 AM and nobody is at the keyboard, does anything happen at all. In week 6: does it fail loudly or quietly. In week 9: it retried four hundred times, who pays for that. In week 10: it did something nobody approved, who answers for it. Tonight the question has its final form and it is not dramatic at all. It is 2 AM, your system did its job, the policy held, the log line exists, and not one human being was involved.',
          punch: 'You did not build something impressive. You built something boring at 2 AM, which is much harder and worth much more.',
        },
      ],
    },

    extraInteractions: [
      {
        segment: 'result-preview', kind: 'poll',
        q: 'Which of these is truest for you right now?',
        options: [
          'I am ready and I want to go first',
          'I am ready, I just do not want to go first',
          'My system is fine, my talk is not',
          'My talk is fine, my system is not',
          'I am mostly just tired and here',
        ],
        eyebrow: '🫱 No right answer', title: 'Say the real thing before we start',
        presenterTip: 'No correct answer and you must say that before they vote. Read the spread out loud without judgement. If "my talk is not" leads, give the room five extra minutes to rehearse out loud in pairs before the first presenter — it is the highest-return five minutes available tonight. If "mostly just tired" leads, acknowledge it warmly and say so: twelve weeks is long, and finishing tired is still finishing.',
      },
      {
        segment: 'readiness', kind: 'poll',
        q: 'Four-point check — where are you?',
        options: ['✅ All four green', '🏷️ Tag not checked out / dirty tree', '🎬 No fallback recording', '🎓 Exam login not verified'],
        eyebrow: '🚦 Roll call', title: 'Before anybody presents',
        presenterTip: 'Operational and non-negotiable. Read the counts out loud and send mentors immediately. The exam-login one is the sleeper: people assume it is fine and discover otherwise at the worst possible moment. Do not start presentations until the last three counts are at zero.',
      },
      {
        segment: 'build-map', kind: 'poll',
        q: 'Your live run breaks at minute two. What is your actual fallback?',
        options: [
          'A recorded green run, saved and one click away',
          'A recording exists but I would have to find it',
          'I would try running it again',
          'I do not have one',
        ],
        answer: 0,
        reveal: 'One click away, or it is not a fallback. "I would have to find it" is thirty seconds of silent folder-hunting on a shared screen in front of a panel, which is worse than the original failure. Anyone on the last two options: fix it in the next five minutes, before anybody presents.',
        eyebrow: '🛟 Safety check', title: 'The net only counts if you can reach it',
        presenterTip: 'This is operational disguised as a knowledge check. Do not just reveal and move — actually stop and make the students on options 2, 3, and 4 fix it right now while the room waits. Five minutes here prevents the single worst thing that can happen tonight.',
      },
      {
        segment: 'guided-build', kind: 'trivia',
        q: 'A panelist asks something about your system you genuinely cannot answer. What is the best move?',
        options: [
          'Give your best guess confidently — hesitation looks bad',
          'Explain adjacent things you do know until the question passes',
          'Say you do not know, then say how you would find out',
          'Say the question is out of scope for this system',
        ],
        answer: 2,
        reveal: 'Say you do not know, then say how you would find out. It is the answer that makes every OTHER answer you gave more credible, because now the panel knows you would tell them if you were unsure. A confident guess is the only one of these four that can actually cost you the credential.',
        eyebrow: '⚔️ Defence check', title: 'One question before the panel starts',
        presenterTip: 'Fast — reveal, one line of why, then move into the talks. But do come back to it: the first time somebody in the room says "I do not know, here is how I would find out," stop and name it as the strong answer it is. That single piece of public praise changes how everyone after them defends.',
      },
      {
        segment: 'failure', kind: 'poll',
        q: 'Your demo just threw an error in front of the panel. First move?',
        options: [
          'Click away and keep talking — do not draw attention to it',
          'Explain that the network in the room is unreliable',
          'Name it out loud and grab the correlation ID',
          'Restart the run and hope',
        ],
        answer: 2,
        reveal: 'Name it and trace it. The other three all tell the panel the same thing — that you do not know what your system does when it fails — which is the one thing this program spent twelve weeks making sure is not true about you.',
        eyebrow: '💥 Under pressure', title: 'Decide this now, not in the moment',
        presenterTip: 'Run this BEFORE the first presentation so the answer is already in their heads. Expect a few honest votes for option 1 and treat that with warmth — it is the human instinct and pretending otherwise helps nobody. Then say the sentence out loud together as a room: "there is the failure, let me trace it."',
      },
      {
        segment: 'demos', kind: 'poll',
        q: 'Across the talks you just watched — what actually made you trust a system?',
        options: [
          'The demo running cleanly',
          'The evidence they showed without being asked',
          'How they handled the hardest question',
          'That they named their own limitation first',
        ],
        eyebrow: '👀 What you noticed', title: 'You just sat on the other side of the table',
        presenterTip: 'No wrong answer — this is a reflection, and its value is that the room has just BEEN the panel for an hour. Read the spread and note out loud that the demo running cleanly almost never wins this poll. That single observation is the most transferable thing anybody takes out of tonight into their next job.',
      },
      {
        segment: 'cta', kind: 'poll',
        theater: true,
        q: 'Twelve weeks done. What happens to this system on Monday?',
        options: [
          'I put it in front of someone at work',
          'I keep building it — the roadmap is real to me',
          'I use it as the portfolio piece and build the next one',
          'I am not sure yet, and that is honest',
        ],
        eyebrow: '🏛️ The last question of the program', title: 'This is not a poll. It is a commitment, and the room is watching.',
        presenterTip: 'Full-screen theatre — the final moment of the entire twelve weeks. Lock the votes, show the spread, and do NOT reveal a correct answer, because there is not one. Instead read the counts out loud, then ask two or three people to say theirs out loud with the specific name of the person or the team they are taking it to. Option 4 is completely respectable and you must say so. Then close the deck and let them talk to each other.',
      },
    ],
  },
};
