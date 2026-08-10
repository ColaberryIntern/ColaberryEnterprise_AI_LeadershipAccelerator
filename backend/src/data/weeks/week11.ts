/**
 * week11.ts — the complete Week 11 content pack: "Systems Architecture +
 * Architecture Package" (Intensive 4 · Design AI That Scales).
 *
 * Arc beat: "You can explain and defend the whole thing — that is what makes
 * you the architect." Week 10 gave the system a conscience; Week 11 makes it
 * explicable; Week 12 they defend it in public. This is the consolidation week,
 * so the teaching deliberately names Weeks 1-10 as they land on the seven
 * layers — the student should feel ten weeks collapse into one picture.
 *
 * The premise the whole week hangs on: an architecture package is diagrams +
 * decisions + evidence, not slides. And the single most valuable idea in it:
 * a decision you cannot explain is a decision you do not own. An ADR is not
 * paperwork; it is how a choice survives the person who made it — which is the
 * arc's recurring "the person who isn't there" thread, paid off one last time
 * before the Expo.
 *
 * Audience note: this room has opinions about documentation, most of them bad
 * and most of them earned. Monday addresses that head on rather than pretending
 * it away — the package exists to make decisions defensible under questioning,
 * not to satisfy a process.
 *
 * Authoring rules honoured here (see TWELVE_WEEK_STORY_ARC.md):
 *   • every teach slide carries a mermaid diagram, ≤7 short-labelled nodes —
 *     and this week they are exemplary on purpose, because these are the
 *     diagrams students copy into their own package
 *   • code blocks are Claude Code PROMPTS that produce artefacts (tables, ADRs,
 *     diagrams, scorecards), plus `kind: 'review'` artefacts read as a room
 *   • current API facts only (claude-opus-5 / claude-sonnet-5 / claude-haiku-4-5,
 *     output_config + json_schema)
 *   • everything points at the student's OWN capstone, and Thursday ends
 *     pointing straight at the Week 12 Expo defence
 *
 * Pure data, type-only import — same contract as every other week pack.
 */
import type { WeekPack } from '../weekPack';

export const WEEK11_PACK: WeekPack = {
  week: 11,
  arcBeat: 'You can explain and defend the whole thing — that is what makes you the architect.',

  /* ======================================================================== */
  /*  MONDAY · Architecture Day                                               */
  /* ======================================================================== */
  monday: {
    hook: {
      headline: 'Your system works. Nobody can tell why it is the way it is — including you, in six months.',
      caption: 'Tonight you learn the three artefacts that turn ten weeks of choices into something you can defend.',
    },

    teach: [
      /* ============================ check-in ============================== */
      {
        segment: 'checkin', eyebrow: '🏛️ Week 11 · where you stand', title: 'Ten weeks of building. Tonight you learn to explain it.',
        body: 'Look at what is in your repo. Week 1 you directed an engineer instead of typing code. Week 3 something of yours ran while you slept. Weeks 5 and 6 it reached systems the business actually depends on. Week 9 you broke it on purpose. Last week you gave it a conscience — policy, a human gate, an audit trail. There is exactly one thing left that separates you from an architect, and it is not another feature. It is that right now, the reasons behind every one of those choices live in one head. Yours.',
        bullets: [
          'Weeks 1-9: you built it, and you proved it survives failure',
          'Week 10: it acts under policy, with a gate and an audit trail',
          'Week 11 — tonight: you make it explicable',
          'Week 12: you stand in front of people and defend it',
        ],
        diagram: `flowchart LR
  B["🔨 Weeks 1-9<br/>you built it"] --> G["⚖️ Week 10<br/>you governed it"]
  G --> E["📐 Week 11<br/>you explain it"]
  E --> D["🎤 Week 12<br/>you defend it"]`,
        script: 'Open by naming the trust ladder out loud: "in Week 1 you approved every single action; tonight your system acts under policy while you sleep." Then land the turn — the last gap is not capability, it is explicability. Do not rush this; the whole night depends on them accepting that explaining is real architecture work, not admin.',
      },
      {
        segment: 'checkin', eyebrow: '🗂️ Say the quiet part', title: 'Yes, you have read documents nobody ever opened. This is not one of those.',
        body: 'Most people in this room have written or suffered through an architecture document that existed to satisfy a process. It was long, it was already wrong on the day it shipped, and its only real function was to be attached to an email. That experience is legitimate and you should keep it. The package we build this week is a different animal, and the difference is testable: a process document is written so that nobody asks a question, and an architecture package is written so that somebody can. Yours gets interrogated in eight days.',
        bullets: [
          'A process doc is written for a checkbox — success is that nothing happens',
          'A package is written for a hostile question — success is that it answers',
          'Test it: if nobody could ever cross-examine it, it is the wrong document',
          'Yours gets cross-examined at the Expo, by people who were not in the room',
        ],
        diagram: `flowchart TD
  P["📄 Process doc"] --> P1["✍️ Written for<br/>a checkbox"]
  P1 --> P2["😴 Nobody asks<br/>it anything"]
  A["📐 Architecture package"] --> A1["✍️ Written for<br/>a hostile question"]
  A1 --> A2["🎤 Read under fire<br/>in Week 12"]`,
        script: 'Ask the room directly: "who here has written a document nobody read?" Most hands. Say "good, keep that instinct — it is going to protect you tonight." Then draw the distinction and let it sit. If you skip this slide, half the room quietly checks out for the next two hours because they think this is a paperwork week.',
      },
      {
        segment: 'checkin', eyebrow: '📦 Three artefacts', title: 'Everything tonight produces a file. Three of them, and none is a slide.',
        body: 'Here is the shape of the next two hours. First, the seven-layer reference model — the map every agentic system on earth fits onto, including yours, and the exercise of putting each of your own components on the right floor. Second, ADRs: the record of a decision, its rejected alternatives, and why. Third, an INPACT and Trust Band scorecard, which converts "is it ready" from an argument into arithmetic. On Thursday these become one committed folder. Tonight you start all three against your own system.',
        bullets: [
          '1️⃣ The 7-layer map + the two diagrams that prove it',
          '2️⃣ ADRs — the decisions, and the alternatives you rejected',
          '3️⃣ INPACT composite + Trust Band scorecard, with named gaps',
          'All three are files in your repo, not slides on a laptop',
        ],
        diagram: `flowchart TD
  PKG["📦 Your package"] --> M["🧱 7-layer map<br/>+ 2 diagrams"]
  PKG --> A["📝 5+ ADRs"]
  PKG --> S["📊 INPACT +<br/>Trust Band scorecard"]`,
        script: 'Hold up three fingers and name the three. Promise the third one explicitly — "by Thursday you will have a number for how production-ready your system is, and a defensible list of what stands between you and the next twenty points." That promise carries them through the theory.',
      },

      /* ======================== business problem ========================== */
      {
        segment: 'business-problem', eyebrow: '💀 The stakes', title: 'Enterprise AI pilots die at an extraordinary rate. The model is almost never why.',
        body: 'The pattern is consistent enough to be boring: the demo is impressive, the pilot stalls, the budget quietly evaporates, and everyone concludes the technology was not ready. Ram Katamaraja\'s thesis in Trust Before Intelligence is that this is almost never a model limitation — it is an infrastructure and architecture gap that nobody drew, so nobody closed. Data foundations that cannot feed an agent fast enough. Static role-based access where context-aware authorization was required. A proof of concept with no operational architecture under it. The architect\'s job is to close that gap before the model ever runs in front of an executive, and the package is how you prove you closed it.',
        bullets: [
          'Data foundation gaps — batch pipelines cannot feed a sub-two-second agent',
          'Architecture misalignment — static roles where per-request context is needed',
          'Demo-driven development — a POC with no operational architecture beneath it',
          'Reinvention over reference — bespoke glue instead of a known-good structure',
          'None of these is a model problem. Every one is an architecture problem.',
        ],
        evidence: [
          {
            claim: 'Enterprise generative-AI pilots fail predominantly on infrastructure and architecture gaps rather than model limitations',
            publisher: 'Ram Katamaraja', sourceTitle: 'Trust Before Intelligence',
            sourceType: 'internal-verified',
            note: 'This is the book\'s central thesis and the framing this course is built on. Present it as an argued position, not a measured statistic — the failure-rate figures in circulation vary by study and by definition of "failure".',
          },
        ],
        diagram: `flowchart LR
  D["💡 The demo works"] --> P["🧪 The pilot stalls"]
  P --> W{"❓ Why"}
  W -->|"rarely"| M["🧠 The model"]
  W -->|"usually"| I["🏗️ The architecture<br/>nobody drew"]`,
        script: 'Open cold and quiet: "most of the AI pilots running inside your companies right now will not reach production this year. Not because Claude is weak. Because nobody drew the architecture." Let it land for a beat. Then: "this week you become the person who draws it." Be precise about the evidence — say it is Ram\'s argued thesis, not a lab measurement.',
      },
      {
        segment: 'business-problem', eyebrow: '🖼️ Slides vs evidence', title: 'Two architects walk into the same review. Only one of them gets funded.',
        body: 'The first brings a beautiful deck: gradients, a hero diagram, three bullets a slide, and not one trust boundary. The second brings a seven-layer mapping table, five ADRs, a data-flow diagram with the boundaries marked, and a scorecard with the gaps named. The first gets applause and no budget. The second gets interrogated for twenty minutes and walks out funded. That is not a story about presentation skill. It is that only one of them could answer a question that was not on the slide.',
        code: {
          kind: 'review',
          label: 'The review test — what a reviewer actually asks, and what each architect can answer',
          code: 'REVIEWER QUESTION             | SLIDE DECK ANSWER  | PACKAGE ANSWER\n------------------------------|--------------------|--------------------------------\nWhere does untrusted input    | hand-wave          | data-flow diagram, boundary B2,\n  enter?                      |                    |   validator = schema + scan\nWhy this model, not that one? | "it was better"    | ADR-0001: 3 alternatives, each\n                              |                    |   rejected for a stated reason\nWhat happens when it fails?   | silence            | failure/recovery table, per layer\nHow ready are you, really?    | "pretty ready"     | composite 69, Moderate band,\n                              |                    |   4-8 weeks, top-3 gaps named\nProve the governance works.   | "we have auth"     | Layer 5 ADR + policy tests +\n                              |                    |   an audit trace by correlation ID',
          expectedResult: 'Read the middle column out loud once. Every one of those answers is something you have personally said in a meeting.',
        },
        diagram: `flowchart LR
  Q["❓ Where does untrusted<br/>input enter?"] --> S["🖼️ Slide deck:<br/>hand-wave"]
  Q --> E["📐 Package: boundary B2,<br/>named validator"]
  S --> A["👏 Applause,<br/>no budget"]
  E --> F["💰 Interrogated,<br/>then funded"]`,
        script: 'Put the table on screen and read the middle column in a slightly embarrassed voice — the room will laugh, because they have all said "pretty ready" out loud in a real meeting. Then ask: "which architect are you today?" Every hand goes up for column three aspirationally. Say: "by Thursday night, column three is your actual committed folder, not your aspiration."',
      },
      {
        segment: 'business-problem', eyebrow: '🎯 The idea of the week', title: 'A decision you cannot explain is a decision you do not own.',
        body: 'This is the sentence to take out of Week 11. When the reasoning behind a choice exists only in your head, you have not made a decision — you are living with an outcome. You cannot change it safely, because you do not know what it was protecting. You cannot defend it, because you cannot reconstruct the alternatives. And you cannot hand it to anyone, which means the system is quietly hostage to your continued presence. Writing the reasoning down is not documentation overhead. It is how a choice survives the person who made it.',
        bullets: [
          'Reasoning in one head → the system is hostage to that head',
          'Reasoning written down → the choice survives the person',
          'The test: could someone change this safely without calling you?',
          'This is the same problem as Week 2 — knowledge trapped in one person',
        ],
        diagram: `flowchart LR
  D["🎯 A decision"] --> W["✍️ Why written down"]
  D --> N["🤐 Why in one head"]
  W --> S["🏛️ Survives the person"]
  N --> L["💥 Leaves when they do"]`,
        script: 'Say the sentence twice, slowly, and write it on the board: "a decision you cannot explain is a decision you do not own." Then connect it backwards — this is the analyst from Week 2 who was out today, the teammate in Week 4 who wrote the one prompt that worked and left, the engineer in Week 6 who was the only one who understood the integration. Same enemy, final form.',
      },
      {
        segment: 'business-problem', eyebrow: '📈 What it buys', title: 'From a 28 to an 89 — and the package is the reason the money moved.',
        body: 'The case study we run in this course is a health-systems team that scored 28 on the INPACT composite at the start: critical band, effectively a rebuild. Twelve weeks later they scored 89, in the production band. The thing that unlocked the funding was not a better model. It was an architecture package that let executives see exactly which dimensions were weak, which layer owned each fix, and what closing each one would cost in weeks. That is what an evidence-backed package actually buys you: it converts a vague executive fear of AI into a sequenced plan somebody can approve line by line.',
        bullets: [
          'Start: composite 28 — critical band, months of work in front of them',
          'End: composite 89 — production band, gaps closed in a named order',
          'What changed the conversation: the gaps were visible, owned, and priced',
          'Executives do not fund confidence. They fund maps.',
        ],
        diagram: `flowchart LR
  A["📉 Composite 28<br/>Critical band"] --> P["📦 Architecture<br/>package"]
  P --> B["📈 Composite 89<br/>High Trust band"]
  P --> F["💰 A sequenced,<br/>fundable plan"]`,
        script: 'Draw a number line 0 to 100 on the board and put a dot at 28 and a dot at 89. Say: "the package is the map between these two dots." Be honest that this is the course\'s worked case study, not a client anecdote — this room can smell an unfalsifiable success story, and the teaching point survives the disclosure.',
      },

      /* ========================== architecture ============================ */
      {
        segment: 'architecture', eyebrow: '🧱 The reference model', title: 'Seven layers. Every agentic system you will ever meet maps onto them.',
        body: 'A reference architecture is not a rule about how to build; it is a shared set of floors so that two architects can talk about the same system without redefining their terms first. Seven layers, each with exactly one job. Data flows up the stack — storage feeds the fabric, the fabric feeds meaning, meaning feeds reasoning. Control flows down — orchestration coordinates, governance gates, observability watches all of it. When you can name the floor a component lives on, three questions get easy at once: what is its trust boundary, how does it fail, and who owns the fix.',
        bullets: [
          '1 Storage — durable bytes at rest',
          '2 Data Fabric — move and integrate data',
          '3 Semantic — turn data into meaning',
          '4 Intelligence — reason and propose',
          '5 Governance — say yes or no before anything happens',
          '6 Observability — see everything that happened',
          '7 Orchestration — coordinate work across the other six',
        ],
        diagram: `flowchart TD
  L1["1️⃣ Storage"] --> L2["2️⃣ Data Fabric"]
  L2 --> L3["3️⃣ Semantic"]
  L3 --> L4["4️⃣ Intelligence"]
  L4 --> L5["5️⃣ Governance"]
  L5 --> L6["6️⃣ Observability"]
  L6 --> L7["7️⃣ Orchestration"]`,
        script: 'Build the stack on the board from the bottom up, naming the JOB before you name any technology. Resist the urge to list tools — the whole value of the model is that it is tool-agnostic. Close with: "point at your capstone. Every box you drew is a tenant on one of these seven floors. Tonight you assign every tenant to its floor."',
      },
      {
        segment: 'architecture', eyebrow: '🗄️ Layers 1-3', title: 'Storage, Data Fabric, Semantic — the three floors that decide what your agent even knows',
        body: 'Layer 1 is durable bytes: your database, your files, your vectors. Layer 2 is movement — how data gets from where it lives to where the agent needs it, and how fresh it is when it arrives. Layer 3 is where data becomes meaning: entity resolution, the vocabulary your business actually uses, the retrieval that grounds an answer in something real. Most of this is not new to you. Weeks 5 and 6 were Layer 2 — MCP is a data-fabric technology, whatever else it also is. And the vocabulary work from Week 4 was Layer 3 before anyone called it that.',
        bullets: [
          'Layer 1 Storage — your database, object store, and vectors',
          'Layer 2 Data Fabric — MCP, syncs, streams; and freshness is a Layer-2 property',
          'Layer 3 Semantic — entity resolution, business vocabulary, grounded retrieval',
          'Your Weeks 5-6 MCP work is Layer 2. Your Week 4 prompt vocabulary is Layer 3.',
          'A slow answer is usually a Layer 2 problem wearing a Layer 4 costume',
        ],
        diagram: `flowchart LR
  L1["1️⃣ Storage<br/>durable bytes"] --> L2["2️⃣ Data Fabric<br/>move + integrate"]
  W56["🔌 Wk 5-6 MCP"] --> L2
  L2 --> L3["3️⃣ Semantic<br/>data becomes meaning"]
  W4["📚 Wk 4 vocabulary<br/>+ prompt library"] --> L3`,
        script: 'The point of this slide is recognition, not new information. Say each layer, then say which of THEIR weeks landed there. When you say "MCP is a data-fabric technology", pause — several people will visibly re-file six weeks of work in their heads. That re-filing is the lesson.',
      },
      {
        segment: 'architecture', eyebrow: '🧠 Layers 4-5', title: 'Intelligence proposes. Governance disposes. That separation is the whole architecture.',
        body: 'Layer 4 is the model: it reasons over grounded context and proposes an action. Layer 5 decides whether that action is permitted, right now, for this user, on this resource. The most consequential sentence in the entire reference model is that the output of Layer 4 is a proposal, not an instruction. Last week you built this as a governance engine with policy, a human gate, and an audit trail. Tonight you learn its architectural name and why it deserves its own floor: because the moment governance is a helper function inside your agent, it can be skipped by the agent.',
        bullets: [
          'Layer 4 Intelligence — the model reasons and proposes; Weeks 3 and 7 live here',
          'Layer 5 Governance — policy evaluation, human gate, audit; Week 10 lives here',
          'Model output is a PROPOSED action, not a done deal',
          'Governance is a layer, not a helper function — that is what makes it unskippable',
          'Fail-closed: if the policy check cannot run, the action does not happen',
        ],
        diagram: `flowchart LR
  W3["🔌 Wk 3 API"] --> L4["4️⃣ Intelligence<br/>reason + propose"]
  W7["👥 Wk 7 subagents"] --> L4
  L4 -->|"proposed action"| L5["5️⃣ Governance<br/>says yes or no"]
  W10["⚖️ Wk 10 policy<br/>+ HITL + audit"] --> L5`,
        script: 'This is the highest-value architecture slide of the night. Say it plainly: "the model SAID refund four thousand dollars. It does not get to DO it." Then the structural point — if governance lives inside the agent, the agent can route around it; if governance is a layer the action must cross, it cannot. That is why it gets a floor.',
      },
      {
        segment: 'architecture', eyebrow: '👁️ Layers 6-7', title: 'Observability and Orchestration — the two floors that were your last two months',
        body: 'Layer 6 is seeing: traces, metrics, cost attribution, and one correlation ID that lets you follow a single request from symptom back to root cause. Layer 7 is coordination: queues, schedules, retries, timeouts, circuit breakers, dead-letter queues, and exactly-once side effects. Week 8 built Layer 7 when you made the work run itself. Week 9 built both when you broke it on purpose and discovered what you could not see. Notice what this means: reliability is not a phase you do after building. It is two of the seven floors of the building.',
        bullets: [
          'Layer 6 Observability — traces, metrics, cost, one correlation ID end to end',
          'Layer 7 Orchestration — queues, schedules, retries, timeouts, idempotency',
          'Week 8 was Layer 7. Week 9 was Layers 6 and 7 together.',
          'If you cannot trace one failure end to end on a single ID, Layer 6 is incomplete',
          'Reliability is not an add-on. It is two floors of the building.',
        ],
        diagram: `flowchart LR
  W8["🔁 Wk 8 workflows"] --> L7["7️⃣ Orchestration<br/>coordinate the work"]
  W9["💥 Wk 9 reliability"] --> L6["6️⃣ Observability<br/>see everything"]
  L7 --> L6
  L6 --> A["🚨 One correlation ID,<br/>symptom to root cause"]`,
        script: 'Land the reframe hard: "reliability and governance are not things you bolt on when the build is finished. In this model they are floors 5, 6, and 7." That single sentence is the Thursday trivia answer and it is also the thing most enterprise teams get wrong, so say it twice.',
      },
      {
        segment: 'architecture', eyebrow: '🚧 Trust boundaries', title: 'A trust boundary is the exact line where you stop trusting the caller.',
        body: 'Inside a boundary, data has been validated and is safe to act on. Outside it, data is hostile until proven otherwise. Agentic systems have four boundaries that matter, and the one architects consistently forget is the third: your own model\'s output is untrusted until governance has checked it, because a model can be steered by content it retrieved. Prompt injection is not a model defect — it is an unguarded boundary at the data fabric, where poisoned external content crosses in and rides retrieval into the reasoning. Every boundary must name a validator, and a boundary with no named validator is a finding, not a diagramming gap.',
        bullets: [
          'B1 User → system: untrusted input. Validator = schema, auth, rate limit',
          'B2 External data and MCP → system: untrusted retrieval. Validator = injection scan, allow-list, output schema',
          'B3 Intelligence → Governance: model output is a proposal. Validator = policy evaluation, fail-closed',
          'B4 System → irreversible side effect: Validator = idempotency key, human gate on high risk',
          'A boundary with no named validator is a security finding',
        ],
        diagram: `flowchart LR
  U["👤 User"] -->|"B1 schema<br/>+ auth"| S["🏛️ Your system"]
  X["🌐 External data<br/>+ MCP"] -->|"B2 injection scan"| S
  S -->|"B3 policy,<br/>fail-closed"| G["⚖️ Governance"]
  G -->|"B4 idempotency<br/>+ human gate"| E["💥 Irreversible<br/>side effect"]`,
        script: 'Draw a box for "your system" and four arrows crossing its edge. Write UNTRUSTED in red on each arrow, then write the validator that makes it trusted. Then ask the question that starts the real work: "which of your four boundaries has no validator right now?" The silence in the room is people finding their first gap.',
      },
      {
        segment: 'architecture', eyebrow: '📐 Two diagrams', title: 'Every package needs exactly two diagrams, and they answer different questions',
        body: 'The system diagram is static: what the pieces are, who calls whom, and one dashed line around what you control. The data-flow diagram is dynamic: it follows one request through the layers in order, so the sequence of validate, retrieve, propose, gate, execute, log is visible as an ordering rather than a claim. You need both, because each hides what the other reveals. And there are three rules that make a diagram evidence rather than decoration: it is text, so it can be diffed; it names its boundaries; and it fits on one screen. Seven boxes is a good ceiling — if you need more, you need two diagrams.',
        bullets: [
          'System diagram — what the pieces are and who calls whom',
          'Data-flow diagram — how ONE request moves, in order, with the gate visible',
          'Written as text (mermaid), so it can be diffed and reviewed like code',
          'Boundaries labelled on both, or the pair contradict each other',
          'Rule of thumb: seven boxes. More than that means it is two diagrams.',
        ],
        diagram: `flowchart TD
  P["📐 Two diagrams,<br/>two jobs"] --> SY["🗺️ System —<br/>what the pieces are"]
  P --> DF["🔃 Data flow —<br/>how a request moves"]
  SY --> Q1["❓ Answers:<br/>who calls whom"]
  DF --> Q2["❓ Answers:<br/>where the gate fires"]`,
        script: 'Point at the diagram on this very slide and say: "this is the format. Text, seven boxes, short labels, readable from the back of the room." Every diagram you have shown for eleven weeks has followed those rules, and now you are telling them why. That reveal usually gets a small laugh and it makes the standard concrete.',
      },
      {
        segment: 'architecture', eyebrow: '📊 INPACT + Trust Band', title: 'You cannot fund a gap you cannot score. INPACT gives the number; Trust Band gives the timeline.',
        body: 'INPACT scores six things an agent needs from the infrastructure beneath it, one to six each, summed and converted to a hundred-point composite. Trust Band then maps that composite onto a readiness verdict and a realistic timeline, so a single number becomes an executive decision about how many weeks of work stand between here and production. The power is not the number itself. It is that architecture stops being an argument and becomes arithmetic: instead of debating whether the system is ready, you show a 69 in the moderate band, four to eight weeks out, with the three lowest dimensions named as the work.',
        code: {
          kind: 'review',
          label: 'INPACT — six dimensions, and the Trust Band they roll up into',
          code: 'INPACT DIMENSION                             | WHAT A 6 LOOKS LIKE\n---------------------------------------------|------------------------------------\nI  Instant     responsiveness + freshness    | fast enough to be used in the flow\nN  Natural     understands business language | no schema knowledge required\nP  Permitted   context-aware authorization   | per-request, multi-factor, audited\nA  Adaptive    learns from feedback          | a closed loop that measurably improves\nC  Contextual  one view across silos         | cross-domain context, not one system\nT  Transparent observable + auditable        | full trace, complete audit record\n\ncomposite = sum of the six scores / 36 * 100        production threshold = 86\n\nTRUST BAND     | COMPOSITE | READINESS VERDICT\n---------------|-----------|----------------------------------------\nHigh Trust     |  86-100   | production-ready, minimal gaps\nModerate Trust |  67-85    | pilot-ready, known gaps\nLow Trust      |  50-66    | significant work remaining\nVery Low Trust |  33-49    | major transformation required\nCritical       |   < 33    | rebuild\n\nRule: no score without a file you can point at.',
          expectedResult: 'Six dimensions, one composite, one band. Find the two dimensions you would score lowest for your own system right now.',
        },
        diagram: `flowchart LR
  SIX["6️⃣ dimensions,<br/>scored 1-6"] --> SUM["➗ sum ÷ 36 × 100"]
  SUM --> C["🔢 Composite"]
  C --> B["🎚️ Trust Band<br/>+ weeks of work"]
  B --> R["🗺️ Top-3 gaps<br/>= the roadmap"]`,
        script: 'Write "composite 69" on the board and ask: "ship it?" Take a vote. Then reveal the band table: "no — 69 is moderate, four to eight weeks out, and here are the exact three dimensions costing you the other seventeen points." That sentence is the entire value of the framework, and it is the sentence they will use in front of their own leadership.',
      },

      /* =========================== deconstruct ============================ */
      {
        segment: 'deconstruct', eyebrow: '🔬 Anatomy of an ADR', title: 'An ADR that only describes is worthless. Watch the exact line where value appears.',
        body: 'An Architecture Decision Record captures one high-stakes decision so that a new hire, a skeptical reviewer, or you in eight months can understand and defend it without the original author present. The failure mode is the describing ADR, which states what you did and stops. The valuable ADR justifies: context and forces, the decision, the alternatives you considered with a specific technical reason for rejecting each, the consequences you now live with, and a trigger for when it should be reopened. The single most important block is Alternatives considered — because a decision with no rejected alternatives was never actually a decision. It was a default.',
        code: {
          kind: 'review',
          label: 'The same decision, written twice — read both, find the line that matters',
          code: '--- DESCRIBING (worthless in a review) ---\nTitle: Use Postgres\nWe use Postgres for storage. It works well.\n\n\n--- JUSTIFYING (survives cross-examination) ---\nADR-0004: Postgres as the system of record for agent state\nStatus:   Accepted\nContext:  Agent state must survive restarts, support transactional\n          writes at the B4 side-effect boundary, and be queryable\n          for audit. The team knows SQL. Data must stay in-region.\nDecision: Postgres, single region, row-level security enabled.\nAlternatives considered:\n  - Document store: rejected - the refund flow needs multi-row\n      transactions, and audit queries need joins.\n  - Embedded file DB: rejected - no concurrent-writer story for\n      the orchestration queue at Layer 7.\n  - Schemaless store: rejected - undeclared schema drift already\n      cost us a day in Week 8.\nConsequences: a vertical-scale ceiling we accept for now; a read\n  replica becomes necessary before sustained high write volume.\nRevisit when: sustained write throughput passes the agreed ceiling.',
          expectedResult: 'Put your finger on the "Alternatives considered" block. That block is the ADR. Everything above it is context.',
        },
        diagram: `flowchart LR
  A["📝 An ADR"] --> D["😐 Describes<br/>what you did"]
  A --> J["🏛️ Justifies +<br/>names what you rejected"]
  D --> X["❌ Cannot be defended"]
  J --> Y["✅ Survives the review"]`,
        script: 'Read the describing version out loud, then ask: "could you defend that in front of a panel?" Read the justifying version. Point at Alternatives considered and say: "THIS block is the ADR. If you cannot name what you rejected and why, you did not make a decision, you made a default." That line is the one they will repeat back to you at the Expo.',
      },
      {
        segment: 'deconstruct', eyebrow: '🧩 Reverse-engineer one', title: 'Why context-aware authorization, and not roles? Read the decision, not the conclusion.',
        body: 'Here is a real-shaped governance ADR from the course case study, and it is worth deconstructing because the rejection reasons are technical rather than aesthetic. An agent acting on behalf of a person across several domains cannot be pinned to one static role — the question "is this action permitted right now, for this requester, on this resource, for this purpose" is one that role-based access control literally cannot express. That is not a preference. It is an expressiveness limit, and naming it as such is what makes the ADR defensible. Read how each alternative is rejected: every reason names a capability the option does not have.',
        code: {
          kind: 'review',
          label: 'ADR-0003 — context-aware authorization over static roles',
          code: 'ADR-0003: Context-aware, attribute-based authorization at Layer 5\nStatus:   Accepted\nContext:  Agents act on behalf of staff across billing, records, and\n          scheduling. Whether one action is permitted depends on\n          consent, requester relationship, time, and stated purpose\n          - four attributes that change on every single request.\nDecision: Attribute-based policy evaluated inline on every proposed\n          action, with a hard latency budget and fail-closed on any\n          evaluation error or timeout.\nAlternatives considered:\n  - Static role-based access: rejected - cannot express per-request\n      context; would need a role per attribute combination, and it\n      still leaks on cross-domain actions.\n  - Conditional logic inside the application: rejected - no audit\n      trail, no policy versioning, and untestable in isolation.\n  - Post-hoc review of actions already taken: rejected - the side\n      effects at B4 are irreversible; review after the fact is a\n      report, not a control.\nConsequences: policy latency counts against the responsiveness\n  budget; policies are versioned and unit-tested like code; a failed\n  evaluation denies the action and raises an escalation.\nRevisit when: escalation rate rises above the agreed ceiling.',
          expectedResult: 'Three rejected alternatives, three technical reasons. Notice that none of them says "we preferred the other one".',
        },
        diagram: `flowchart LR
  Q["❓ May this agent release<br/>this record, right now?"] --> R["🎭 Static roles"]
  Q --> A["🧬 Attributes: consent ·<br/>relation · time · purpose"]
  R --> F["💥 Role explosion,<br/>and it still leaks"]
  A --> P["✅ A per-request answer"]`,
        script: 'Walk the four attributes: consent, relationship, time, purpose. Then say: "try writing a single role that captures all four. You cannot — and that is not a taste argument, it is an expressiveness limit." Then the transferable move: "every rejection in your own ADRs should name a capability the option does not have. Banned phrase: we liked it better."',
      },
      {
        segment: 'deconstruct', eyebrow: '📋 Read a scorecard', title: 'The composite is not the deliverable. The three gaps underneath it are.',
        body: 'Scoring is the easy half. The analytical move that matters is ranking the dimensions by distance from their target and taking the lowest three, because those three are your roadmap and each one names a layer that owns the fix. Watch what happens in this worked scorecard: the composite is 50, which sounds like a verdict, but the useful output is three sentences that each name a dimension, a layer, and a concrete action. Notice also where the points are. Polishing a dimension already at four is vanity. The architect fixes the two, because that is where the points and the risk both live.',
        code: {
          kind: 'review',
          label: 'A worked scorecard, and the three gaps it produces',
          code: 'DIM           | NOW | TARGET | GAP | LAYER THAT OWNS THE FIX\n--------------|-----|--------|-----|------------------------------\nI Instant     |  3  |   5    |  2  | 2 Data Fabric - freshness\nN Natural     |  4  |   5    |  1  | 3 Semantic - vocabulary\nP Permitted   |  2  |   6    |  4  | 5 Governance - policy engine  <--\nA Adaptive    |  3  |   4    |  1  | 4 Intelligence - feedback evals\nC Contextual  |  3  |   5    |  2  | 3 Semantic - unify two silos\nT Transparent |  3  |   6    |  3  | 6 Observability - full trace  <--\n--------------|-----|--------|-----|------------------------------\nsum = 18 / 36  ->  composite = 50   (Low Trust: significant work)\n\nTOP 3 GAPS, ranked by distance from target:\n  1. Permitted    gap 4  ->  Layer 5: ship the policy engine\n  2. Transparent  gap 3  ->  Layer 6: correlation-ID trace + audit\n  3. Instant      gap 2  ->  Layer 2: close the freshness gap\n\nThat list IS the roadmap. It is also the last slide of your defence.',
          expectedResult: 'Three sentences, each naming a dimension, a layer, and an action. That is what a scorecard is for.',
        },
        diagram: `flowchart LR
  S["📊 Six scores"] --> G["📏 Gap = target − now"]
  G --> R["🔻 Rank by gap"]
  R --> T["🥇 The lowest three<br/>= your roadmap"]
  V["✨ Polishing a 5"] -.->|"vanity"| T`,
        script: 'Point at Permitted sitting at 2 and say: "this is a two, and it is dragging the whole composite down. Improving the thing that is already a four is vanity work. The architect fixes the two." Then the connection they need: "these three lines are the closing slide of your Expo defence. You are writing it tonight, without knowing it."',
      },

      /* =========================== micro-build ============================ */
      {
        segment: 'micro-build', eyebrow: '✍️ Fifteen minutes · your system', title: 'Map YOUR components onto the seven layers — and N/A is a real answer, with a reason',
        body: 'Time to stop looking at examples. Point Claude Code at your own repository and have it draft the mapping table, then correct every row yourself, because the draft describes intent and only you know the fact. Two rules make this exercise honest. Every layer gets either a component or an explicit N/A with a one-line reason, since a justified N/A is a genuine architectural statement and a blank cell is an unanswered question. And every row that sits on the edge of your system gets a boundary marker. This table is checkpoint one of Thursday\'s package, so do it properly now.',
        bullets: [
          'Claude Code drafts from your actual repo — then you correct every row',
          'Every layer: a component, or N/A with a stated reason',
          'Mark B1-B4 in the boundary column wherever they apply',
          'A blank Governance row is not an empty cell, it is an unanswered question',
          'This becomes seven-layer.md on Thursday — it is a real deliverable',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          ccMode: 'Plan Mode',
          label: 'Claude Code prompt — draft your 7-layer mapping table',
          code: 'Read this repository and draft a 7-layer architecture mapping table for the system it contains.\n\nThe seven layers are: 1 Storage, 2 Data Fabric, 3 Semantic, 4 Intelligence, 5 Governance, 6 Observability, 7 Orchestration.\n\nProduce a markdown table with these columns: LAYER | COMPONENT(S) | WHAT IT DOES AT THIS LAYER | TRUST BOUNDARY (B1-B4 or none).\n\nRules:\n1. Only list components that actually exist in this repo, with their file path. Do not infer components from what a system like this usually has.\n2. Place each component on exactly ONE layer. If it plausibly spans two, pick the primary one and say why in a footnote.\n3. If a layer has nothing, write "N/A" plus a one-sentence reason grounded in this repo, not a generic one.\n4. Under the table, list anything you were unsure about as questions for me — I will answer them rather than have you guess.\n\nShow me the table. Do not write any files yet.',
          expectedResult: 'A seven-row table naming real files from your repo, plus a short list of things Claude was not sure about.',
          stopCondition: 'Every row is either a real component you recognise or an N/A you personally believe. No cell says "probably".',
          rescue: 'If it invented components you do not have, say exactly that: "the following do not exist in this repo — remove them and re-draft using only files you can cite." Inventing plausible architecture is the most common failure of this prompt.',
        },
        diagram: `flowchart LR
  REPO[("📁 Your repo")] --> CC["💻 Claude Code<br/>drafts the map"]
  CC --> T["🧱 The 7-layer table"]
  T --> YOU["👤 You correct<br/>every row"]
  YOU --> NA["🚫 N/A with a reason<br/>is a real answer"]`,
        script: 'Set a visible fifteen-minute timer and walk the room. When you find a blank Governance cell, ask the question that matters: "is that an N/A, or is that unfinished?" Force the distinction out loud. The students with blank Governance and Observability rows are the ones who will struggle at the Expo — find them tonight, not in eight days.',
      },
      {
        segment: 'micro-build', eyebrow: '🚧 Now the uncomfortable part', title: 'Mark your four boundaries — and name the validator on each, or write EMPTY',
        body: 'Go back to your table and overlay the four trust boundaries onto concrete components, then give each one a named validator. B1 is your entry point. B2 is every MCP server and every external fetch. B3 is the handoff from your model\'s proposal to whatever decides. B4 is every irreversible side effect. This exercise is deliberately uncomfortable, because any boundary you cannot attach a real validator to is a genuine gap that you will fix on Thursday. Write EMPTY where it is empty. That honesty is the assignment, and a named gap is already halfway to closed.',
        bullets: [
          'B1 entry: what validates the shape and the identity of an inbound request?',
          'B2 external and MCP: what inspects retrieved content before it reaches the model?',
          'B3 proposal → decision: what evaluates the action, and does it fail closed?',
          'B4 side effect: what makes it exactly-once, and what escalates the high-risk cases?',
          'A blank validator cell is a finding. Write EMPTY, do not write "TBD".',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — the boundary and validator worksheet',
          code: 'Using the 7-layer table we just produced and the actual code in this repo, build a trust-boundary worksheet.\n\nFor each of the four boundaries, give me a row with: BOUNDARY | WHERE IT IS (name the file or component) | THE VALIDATOR THAT EXISTS TODAY (cite the file and function, or write EMPTY) | RISK IF EMPTY.\n\nThe four boundaries:\n  B1  untrusted user input entering the system\n  B2  external data and MCP tool results entering the system\n  B3  a model-proposed action crossing into whatever authorises it\n  B4  an irreversible side effect leaving the system\n\nHard rule: only write a validator if you can cite the file and function that implements it. If you cannot find one, write EMPTY. Do not describe what a validator "should" do as though it exists. I want the honest current state, not the target state.\n\nEnd with a one-line summary: how many of my four boundaries currently have a real validator.',
          expectedResult: 'Four rows, each citing a real file or honestly saying EMPTY, and a count at the bottom.',
          stopCondition: 'You believe the EMPTY cells. If every boundary came back covered, be suspicious and check two of the citations yourself.',
          rescue: 'If everything looks suspiciously green, re-run with: "for each validator you claimed, quote the actual lines that perform the validation." Vague citations collapse immediately under that instruction.',
        },
        diagram: `flowchart LR
  T["🧱 Your 7-layer table"] --> B["🚧 Overlay B1-B4"]
  B --> V["🛡️ Name a validator<br/>on each crossing"]
  V --> GAP["🕳️ EMPTY =<br/>Thursday's work"]`,
        script: 'Say the sentence that makes B2 real: "if your validator cell for B2 is empty, a poisoned support ticket can steer your agent into an action you never authorised." Then insist on the word EMPTY rather than TBD — TBD is a promise, EMPTY is a fact, and this package runs on facts.',
      },
      {
        segment: 'micro-build', eyebrow: '📝 One ADR, right now', title: 'Write the ADR for the one decision that would hurt most to get wrong',
        body: 'Pick your riskiest choice. Usually it is one of four: which model you put on which job, which of your tools are allowed to write rather than read, where your data lives, or how you guarantee a side effect happens exactly once. Fill the template completely, and spend most of your effort on Alternatives considered, because that is the block a reviewer attacks and the block that proves you decided rather than defaulted. This is one of the five-plus ADRs Thursday needs, so it is not practice. And if you cannot name a single rejected alternative, you have just discovered a decision you never actually made.',
        bullets: [
          'Candidates: model choice · write-capable tools · data residency · exactly-once side effects',
          'Two rejected alternatives minimum, each with a technical reason',
          '"We liked it better" is banned. "It cannot express per-request context" is the bar.',
          'Add a revisit trigger — the concrete condition that reopens this',
          'For model choice, name the actual ids: claude-opus-5, claude-sonnet-5, claude-haiku-4-5',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — draft one ADR, then interrogate it',
          code: 'I want an Architecture Decision Record for the single highest-stakes decision in this system.\n\nFirst, based on the code in this repo, propose the three decisions that would hurt most to get wrong, ranked, with one line each on why. Wait for me to pick one.\n\nThen draft the ADR in exactly this structure:\n\n  ADR-0001: <the decision in one line>\n  Status: Proposed | Accepted\n  Context: the forces - constraints, requirements, and what is true right now that pushes on this decision\n  Decision: what we are doing, specifically\n  Alternatives considered:\n    - <option>: rejected because <a capability it lacks, stated technically>\n    - <option>: rejected because <a capability it lacks, stated technically>\n  Consequences: what we now live with, good and bad\n  Revisit when: the concrete trigger that reopens this\n\nRules for the alternatives block: every rejection must name a capability the option does not have, or a cost it imposes that we measured. Preference language is not allowed. If you cannot find a technical reason to reject an option, say so instead of inventing one - that would mean the decision is still open.\n\nWhen the draft is done, critique it as a hostile reviewer would and tell me the weakest line in it.',
          expectedResult: 'A complete ADR, plus Claude telling you which line of its own draft is weakest. That last part is the useful half.',
          stopCondition: 'You can read the Alternatives block out loud and every rejection names a capability, not a preference.',
          rescue: 'If the alternatives read like a menu of equally fine options, the decision was a default. Ask Claude Code: "what would have to be true for each rejected option to be the right choice?" — that question usually exposes the real reason you chose what you chose.',
        },
        diagram: `flowchart LR
  R["🎲 Riskiest decision"] --> C["📄 Context + forces"]
  C --> D["✅ The decision"]
  D --> ALT["🚫 Alternatives rejected,<br/>technically"]
  ALT --> RV["⏰ Revisit when…"]`,
        script: 'Give them ten real minutes and enforce one rule out loud: two rejected alternatives minimum, each with a technical reason. Then have two people read their Alternatives block to the room. The difference in quality between a specific rejection and a vague one is instantly audible, and that comparison teaches faster than you can.',
      },
      {
        segment: 'micro-build', eyebrow: '🙈 Score one, honestly', title: 'Give yourself one INPACT score — and name the file you would show to defend it',
        body: 'Pick Transparent or Permitted and score it one to six against the rubric. Then do the part that makes it real: name the file in your repo you would open if a panelist said "show me". If there is no file, the score comes down, not up. That is not pessimism, it is evidence discipline, and it is the single habit that separates a scorecard that survives questioning from one that collapses on the first "prove it". One honest score tonight is the seed of Thursday\'s full composite.',
        bullets: [
          'Score one dimension: Transparent or Permitted',
          'Name the file you would open when someone says "show me"',
          'No file → score it lower. Every time. No exceptions.',
          'Thursday: all six dimensions, the composite, the band, and your top-3 gaps',
          'Bring your whole repo, tonight\'s table, your boundary worksheet, and your ADR',
        ],
        diagram: `flowchart LR
  H["🙈 One honest score"] --> F["📎 Name the file<br/>that proves it"]
  F --> N{"❓ No file?"}
  N -->|"then"| L["🔻 Score it lower"]
  N -->|"otherwise"| TH["🔨 Thursday:<br/>all six + the package"]`,
        script: 'Close the night on the arc, not the admin: "you walked in able to build. You walk out able to explain — and Thursday you assemble the exhibit you will defend in front of people who were not in this room." Then the concrete list of what to bring. Make them write it down; a Build Day dies when half the room arrives without their own artefacts.',
      },
    ],

    storyBeats: {
      checkin: [
        {
          icon: '📐', tone: 'violet', eyebrow: 'Change of pace — what a signature means',
          title: 'On every building site, one set of drawings carries a signature',
          body: 'The architect who signed them did not pour the concrete or run the conduit. What she did was decide where the load goes, and she is the person you call at any hour to ask why a beam is where it is. She will tell you, from memory or from the file, and the answer will hold up. That is the whole difference between having built something and being accountable for it.',
          punch: 'You have been building for ten weeks. This is the week you learn to sign.',
        },
      ],
      'business-problem': [
        {
          icon: '🗂️', tone: 'amber', eyebrow: 'Every document you have ever hated',
          title: 'The ninety-page binder nobody opened, and the two-page memo everybody did',
          body: 'Somewhere in your career there was a binder produced to satisfy a process — enormous, immaculate, obsolete on delivery, and opened by exactly nobody. And somewhere in the same career there was a short memo that recorded one decision and why, and that memo got pulled up in a meeting eighteen months later to settle an argument in about forty seconds. Both were documentation. Only one of them was ever asked a question.',
          punch: 'A document is not measured by its length. It is measured by whether anybody ever interrogates it.',
        },
      ],
      architecture: [
        {
          icon: '🏢', tone: 'leaf', eyebrow: 'Change of pace — the model is one floor',
          title: 'The smartest thing in the building is a tenant on the fourth floor',
          body: 'Listen to how people describe their AI systems and you will notice they say "we use Claude", as though the model were the building. It is not. It is a tenant on one floor. Below it are the pipes that bring data in and the meaning that makes the data usable. Above it are the locks that decide what may actually happen, the cameras that record it, and the loading dock that sequences the work. Six of the seven floors exist to make the fourth one trustworthy.',
          punch: 'Nobody was ever impressed by a tenant. They are impressed by a building that stands up.',
        },
      ],
      deconstruct: [
        {
          icon: '🕳️', tone: 'berry', eyebrow: 'The person who isn\'t there — one last time',
          title: 'She left in March, and by June nobody could say why the timeout was eight seconds',
          body: 'It was in the code, it had been there since the beginning, and it looked arbitrary. So during a performance push somebody raised it, reasonably, to thirty. Two weeks later an upstream partner started throttling them, because eight seconds was not a guess — it was the number that kept their request rate underneath a limit written in a contract nobody on the current team had read. The person who knew that had left four months earlier. She had made a good decision. She had just never written down why.',
          punch: 'A decision you cannot explain is a decision you no longer own. You just live with it.',
        },
      ],
      'micro-build': [
        {
          icon: '🙈', tone: 'cherry', eyebrow: 'Before you score yourself',
          title: 'The team that gave itself a five, and got asked to prove it',
          body: 'A review panel worked down the scorecard politely until it reached Transparent, where the team had written a five. The panelist asked for one thing: pick any request that failed last week and trace it from the symptom back to the root cause. There was a pause, then some scrolling, then an offer to follow up by email. The rest of the scorecard was probably accurate. It no longer mattered, because every other number was now something the panel had to take on faith.',
          punch: 'A number you cannot show is worth less than a low number you can.',
        },
      ],
    },

    extraInteractions: [
      {
        segment: 'checkin', kind: 'poll',
        q: 'Right now, with no notes — could you explain your whole system to a smart stranger in five minutes?',
        options: [
          'Yes, end to end',
          'Mostly, but I would fumble the middle',
          'I could describe what it does, not how it holds together',
          'Honestly, no',
        ],
        eyebrow: '🌡️ Self-check', title: 'Could you explain your own system tonight?',
        presenterTip: 'No right answer, and say so before they vote or you will get flattering data. Read the spread out loud. If most of the room picks the bottom two options, name that as exactly the gap this week closes — it turns the whole night from admin into a fix for a problem they just admitted to.',
      },
      {
        segment: 'checkin', kind: 'poll',
        q: 'Your honest history with architecture documents is…',
        options: [
          'I wrote one nobody ever read',
          'I read one that was already wrong',
          'I have never seen one for a system I worked on',
          'One of them genuinely saved me once',
        ],
        eyebrow: '🗂️ Room read', title: 'Be honest about documentation',
        presenterTip: 'This is permission-giving, not diagnostic. Let people say the cynical thing out loud early so it stops sitting in the room. If someone picks the last option, get the story — thirty seconds of a real "it saved me" beats ten minutes of you arguing for documentation.',
      },
      {
        segment: 'business-problem', kind: 'trivia',
        q: 'When an enterprise AI pilot stalls before production, the cause is most often…',
        options: [
          'The model was not capable enough',
          'Architecture and infrastructure gaps around the model',
          'Not enough prompt engineering',
          'Users refused to adopt it',
        ],
        answer: 1,
        reveal: 'The demo proves the model can do it. The pilot dies on everything around the model — data that arrives too slowly, authorization that cannot express the real question, and no operational architecture underneath. That is the architect\'s territory, and it is why this week exists.',
        eyebrow: '💀 Knowledge check', title: 'What actually kills a pilot?',
        presenterTip: 'Fast. Take the vote, reveal, one line of why, move. Do not let it become a debate about specific failure statistics — the teaching point is the category of cause, not the percentage.',
      },
      {
        segment: 'architecture', kind: 'poll',
        theater: true,
        q: 'Your model just proposed issuing a $4,000 refund to a customer. Which layer decides whether that actually happens?',
        options: [
          'Layer 4 Intelligence — it made the call',
          'Layer 5 Governance — it evaluates the proposal',
          'Layer 7 Orchestration — it executes the work',
          'Layer 6 Observability — it records the outcome',
        ],
        answer: 1,
        reveal: 'Layer 5. The model PROPOSED; it does not get to DECIDE. That one separation is the reason governance is its own floor instead of a helper function inside your agent — a helper function can be routed around, and a layer the action has to cross cannot.',
        eyebrow: '⚖️ The decision that defines the model', title: 'It proposed a $4,000 refund. Who says yes?',
        presenterTip: 'Full-screen theater moment — lock the votes, show the spread, then reveal. Expect a real split between Intelligence and Governance, and that split is the point. This is the single most quotable idea of the night; do not rush the reveal.',
      },
      {
        segment: 'architecture', kind: 'trivia',
        q: 'A poisoned document steers your agent into an action nobody authorised. Which boundary failed?',
        options: [
          'B1 — user input entering the system',
          'B2 — external data and MCP results entering the system',
          'B3 — the proposed action crossing into authorization',
          'B4 — the irreversible side effect leaving the system',
        ],
        answer: 1,
        reveal: 'B2. Prompt injection is not a model defect — it is unvalidated external content crossing a boundary and riding retrieval into the reasoning. B3 is your second line of defence, which is exactly why it exists: two boundaries have to fail before anything irreversible happens.',
        eyebrow: '🚧 Diagnose it', title: 'Where does injection actually enter?',
        presenterTip: 'Many will answer B1 because "input" sounds like a user. Take the vote before revealing — the correction is the lesson. Then make the follow-up point: it takes TWO boundary failures to cause harm, which is the whole argument for defence in depth.',
      },
      {
        segment: 'deconstruct', kind: 'poll',
        q: 'An ADR in your repo reads: "We chose Postgres because it works well for us." What is the missing piece?',
        options: [
          'A diagram',
          'The alternatives you rejected, and the technical reason for each',
          'The date and the author',
          'A link to the documentation',
        ],
        answer: 1,
        reveal: 'The rejected alternatives. Without them you have recorded an outcome, not a decision — and in six months nobody can tell whether the choice was load-bearing or arbitrary, which means nobody can change it safely.',
        eyebrow: '📝 Read it like a reviewer', title: 'What is missing from this ADR?',
        presenterTip: 'Take the vote, then push once: "who has written an ADR that looked exactly like that?" Several hands. Normalise it — the describing ADR is what everyone writes first. The upgrade is one block.',
      },
      {
        segment: 'micro-build', kind: 'poll',
        q: 'Look at your mapping table. Which layer is still blank?',
        options: [
          '2 Data Fabric',
          '3 Semantic',
          '5 Governance',
          '6 Observability',
          'None — every row is a component or a justified N/A',
        ],
        eyebrow: '🚦 Build check', title: 'Which floor of your building is empty?',
        presenterTip: 'Operational, and the most useful poll of the night. Read the counts out loud and go physically stand with the Governance and Observability groups — those are the students whose Expo defence will wobble. Do not advance until the last option is the largest.',
      },
      {
        segment: 'micro-build', kind: 'poll',
        q: 'Score yourself on Transparent, right now, honestly — could you trace one failed request from symptom to root cause?',
        options: [
          '1-2 — I would be guessing from scattered logs',
          '3-4 — I have logs, but no single thread through them',
          '5-6 — I could pull the whole trace up on screen',
          'I do not know what evidence I would even open',
        ],
        eyebrow: '🙈 Honest self-check', title: 'Show me one trace, end to end',
        presenterTip: 'No right answer, and say so — but ask anyone who picks 5-6 to name the file they would open. Half of them will downgrade themselves mid-sentence, in public, which teaches evidence discipline better than any slide can. Be warm about it; the downgrade is the win.',
      },
    ],
  },

  /* ======================================================================== */
  /*  THURSDAY · Build Day                                                    */
  /* ======================================================================== */
  thursday: {
    teach: [
      /* ============================ build map ============================= */
      {
        segment: 'build-map', eyebrow: '🗺️ Tonight', title: 'By 8:30 you have a committed architecture package you could hand to a stranger',
        body: 'One deliverable, four checkpoints, and every checkpoint produces a real file. An inventory of everything your system actually contains. A seven-layer table plus two diagrams with the boundaries marked. Five or more ADRs for the decisions that would hurt most to get wrong. And an INPACT composite with a Trust Band and your top three gaps named. The rule for the whole night: every claim in the package points at an artefact in the repo. If it is not a committed file at the end, it did not happen.',
        bullets: [
          'CP0 Inventory — every component listed, verified against the repo',
          'CP1 Mapped — the 7-layer table plus system and data-flow diagrams',
          'CP2 Justified — five or more ADRs, each with rejected alternatives',
          'CP3 Scored — composite, Trust Band, and the top three gaps',
          'Four files. Not four slides.',
        ],
        diagram: `flowchart LR
  CP0["📦 CP0 Inventory"] --> CP1["🗺️ CP1 Map<br/>+ 2 diagrams"]
  CP1 --> CP2["📝 CP2 5+ ADRs"]
  CP2 --> CP3["📊 CP3 Scorecard<br/>+ top-3 gaps"]
  CP3 --> PKG["📁 architecture/<br/>committed"]`,
        script: 'Show a finished package on screen first — the cold open. Open a real /architecture folder, click into one ADR, click into the scorecard. Then put the four checkpoints on the board and leave them there all night, ticking each one off in front of the room as it lands. Visible progress is what keeps a documentation-heavy build day alive.',
      },
      {
        segment: 'build-map', eyebrow: '📁 Where it lives', title: 'The package is a folder in your repo, not an export from a slide tool',
        body: 'This is the decision that makes the package evidence rather than decoration. Every diagram is text, so it can be diffed. Every decision is a numbered markdown file, so it can be reviewed like code. The scorecard is a table anybody can compare against last month\'s. It renders to a PDF or a site for the Expo, but the source of truth lives beside the code it describes — and the moment it stops living there, it starts drifting, silently, and someone builds against a lie. Create the skeleton now, empty, and commit it. Then we fill it checkpoint by checkpoint.',
        bullets: [
          'Diagrams as mermaid text — diffable, reviewable, never a screenshot',
          'One numbered markdown file per decision, in adr/',
          'The scorecard as a table, so month over month is a comparison',
          'It lives beside the code, because separated documentation always drifts',
          'Commit the empty skeleton first — every checkpoint needs a home to land in',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — create and commit the package skeleton',
          code: 'Create an /architecture folder in this repository with this exact structure, and put a one-line placeholder comment in each file saying which checkpoint fills it:\n\narchitecture/\n  README.md              how to read this package, filled last\n  inventory.md           CP0\n  seven-layer.md         CP1\n  diagrams/\n    system.mmd           CP1 - component diagram\n    data-flow.mmd        CP1 - request trace\n  adr/\n    .gitkeep\n  scorecard.md           CP3\n\nThen add a short section at the top of README.md titled "How to read this package" that explains, in four lines, what each artefact answers for a reviewer.\n\nCommit it with the message: architecture package skeleton.',
          expectedResult: 'An empty but committed /architecture folder. Nothing in it is filled in yet, and that is correct.',
          stopCondition: 'git log shows the skeleton commit. The package now exists as a place, and everything tonight lands inside it.',
          rescue: 'If Claude Code helpfully fills the files with invented content, delete it and re-run with "placeholders only — do not invent any architecture content". Filling ahead of the evidence is exactly the habit this week is trying to break.',
        },
        diagram: `flowchart TD
  A["📁 architecture/"] --> R["📄 README.md"]
  A --> SL["🧱 seven-layer.md"]
  A --> D["📐 diagrams/*.mmd"]
  A --> ADR["📝 adr/000X-*.md"]
  A --> SC["📊 scorecard.md"]`,
        script: 'Have everyone run the prompt and commit within three minutes, then say the line that makes it stick: "you just made the package real. It is empty, and it is real, and those are different problems." An empty committed skeleton beats a beautiful uncommitted draft every single time.',
      },
      {
        segment: 'build-map', eyebrow: '🎯 The gate', title: 'Three questions. If the files answer them without you, the package is done.',
        body: 'Before we build anything, agree on how we will know it is finished. A reviewer at the Expo asks three questions of any architecture: where does untrusted input enter, why was this decision made rather than the obvious alternative, and how ready is this really. Tonight\'s gate is that all three are answerable from the files alone, by somebody who was not in this room and cannot ask you a follow-up. That last constraint is the whole point. You will not be standing next to this package for the rest of its life.',
        bullets: [
          '❓ Where does untrusted input enter? → the diagrams and the boundary markers',
          '❓ Why this decision and not the obvious alternative? → the ADRs',
          '❓ How ready is this, honestly? → the composite, the band, the gaps',
          'Answerable by someone who cannot ask you a follow-up question',
          'That is also, exactly, the Week 12 panel',
        ],
        diagram: `flowchart LR
  Q1["❓ Where does untrusted<br/>input enter?"] --> F["📁 The files"]
  Q2["❓ Why this decision?"] --> F
  Q3["❓ How ready is it?"] --> F
  F --> A["🗣️ Answered without<br/>you in the room"]`,
        script: 'Write the three questions on the board and leave them up next to the four checkpoints. Every time a checkpoint lands, point back and ask which question it just answered. That pairing turns a documentation night into a build with a visible win condition.',
      },

      /* ========================== guided build ============================ */
      {
        segment: 'guided-build', eyebrow: '0️⃣ CP0 · Inventory', title: 'You cannot map what you have not listed — and the draft is not the list',
        body: 'Start by inventorying every service, model call, MCP server, datastore, queue, scheduled job, and policy file in your system, because the map is only ever as complete as the inventory beneath it. Have Claude Code draft it from the repository, then verify every line by hand. This is not ceremony: the draft describes what a system like yours usually has, and only the repo describes what yours actually has. In practice it will invent one or two components you do not have and miss one you do. Finding both is how you earn the inventory.',
        bullets: [
          'Every service, model call, MCP server, datastore, queue, cron, and policy file',
          'Each row cites a real path — a component with no path is a guess',
          'Claude drafts; you verify. It will invent one and miss one. Find both.',
          'A component you forget has no layer, no boundary, and no failure plan',
          'The inventory should be regenerable, so it never silently drifts',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — draft architecture/inventory.md from the repo',
          code: 'Scan this repository and write architecture/inventory.md.\n\nList every component you can find evidence for: services and entry points, model calls, MCP servers and external integrations, datastores, queues, scheduled jobs, and policy or config files that change behaviour.\n\nColumns: COMPONENT | PATH | ONE-LINE PURPOSE | LAST-TOUCHED (from git if available).\n\nHard rules:\n1. Every row must cite a real path in this repo. If you cannot cite a path, do not list it.\n2. Do not infer components that a system like this "usually" has.\n3. At the bottom, add a section called "Uncertain" listing anything you found but could not classify, phrased as questions for me.\n\nThen tell me which two rows you are least confident about and why.',
          expectedResult: 'A table where every row has a path you recognise, plus a short Uncertain section that is genuinely useful.',
          stopCondition: 'You have deleted at least one row Claude invented and added at least one it missed. If you deleted nothing, look harder.',
          rescue: 'If the table is suspiciously tidy, ask: "which of these did you find in the code and which did you infer from the project structure?" The answer separates fact from plausible fiction immediately.',
        },
        diagram: `flowchart LR
  REPO[("📁 Repo")] --> CC["💻 Claude Code<br/>drafts the inventory"]
  CC --> DR["📄 inventory.md<br/>draft"]
  DR --> V["👤 You delete one,<br/>you add one"]
  V --> OK["✅ A verified inventory"]`,
        script: 'Say it plainly: "run the prompt, then delete two lines Claude invented and add one it missed. It always does both." Then walk the room and ask people what they deleted. The first time someone says "it listed a caching layer we do not have" the whole room understands trust-but-verify without a lecture.',
      },
      {
        segment: 'guided-build', eyebrow: '1️⃣ CP1a · System diagram', title: 'Boxes are components, arrows are calls, and the dashed line is what you control',
        body: 'The system diagram answers what the pieces are and who calls whom, and it has exactly one non-negotiable element: a dashed boundary around what you control. Everything crossing that line is untrusted until a named validator clears it, which makes B1 through B4 visible at a glance instead of implied. Write it in mermaid so it is text you can diff and commit. Keep it to seven boxes — if you cannot, you have two diagrams, not one crowded one. If a reviewer cannot point at where untrusted input crosses your boundary using this diagram alone, it is not finished.',
        bullets: [
          'A dashed subgraph around what you control — the single non-negotiable element',
          'Label every crossing B1 through B4, on the arrow, not in a legend',
          'Seven boxes is the ceiling; beyond that, split it',
          'Mermaid text in diagrams/system.mmd, committed like code',
          'Count the crossings. Fewer than four usually means one is hidden.',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — generate diagrams/system.mmd',
          code: 'Using architecture/inventory.md, write architecture/diagrams/system.mmd as a mermaid flowchart of MY system.\n\nRequirements:\n1. A subgraph with a dashed style around everything we control, labelled "Trust boundary".\n2. External actors and external systems OUTSIDE that subgraph.\n3. Every arrow that crosses the subgraph edge is labelled with its boundary id and its validator, e.g. "B1 schema + auth" or "B2 UNVALIDATED".\n4. Where no validator exists in the code today, label the arrow UNVALIDATED. Do not label a validator you cannot cite from the repo.\n5. Keep it to at most 8 nodes total. If my system needs more, group components and tell me what you grouped.\n6. Short quoted labels, and use <br/> for line breaks, never a newline character.\n\nAfter writing the file, tell me how many arrows cross the boundary and how many of them are UNVALIDATED.',
          expectedResult: 'A mermaid file that renders, plus a count: how many crossings, how many still unvalidated.',
          stopCondition: 'The diagram renders and you agree with every UNVALIDATED label on it. Those labels are honest, not embarrassing.',
          rescue: 'If it renders as a blob with no boundary, the subgraph is missing — tell it exactly that: "wrap everything we control in a subgraph and put external systems outside it."',
        },
        diagram: `flowchart LR
  I["📄 inventory.md"] --> CC["💻 Claude Code"]
  CC --> M["📐 system.mmd"]
  M --> TB["⬛ Dashed boundary:<br/>what you control"]
  TB --> X["🔢 Every crossing<br/>labelled B1-B4"]`,
        script: 'Render one live on screen and trace the dashed box with your finger. Say: "everything inside this box is ours. Every arrow that crosses the line is a boundary. Count them out loud." When someone reports fewer than four crossings, that is not a smaller system — that is a hidden one, and a reviewer will find it.',
      },
      {
        segment: 'guided-build', eyebrow: '👀 Read it together', title: 'Four things to check on your diagram before you commit it',
        body: 'Before we move on, look at what came back and check it against four properties. Boxes are components, not concepts — "the AI" is not a box, your triage service is. Arrows are calls with a direction, so if you cannot say who initiates, the arrow is wrong. The dashed subgraph contains only what you control, which is usually smaller than people first draw. And every crossing carries a boundary id and either a validator or the word UNVALIDATED. Yours will not look identical to this one; all four properties still have to be present.',
        code: {
          kind: 'review',
          label: 'diagrams/system.mmd — read it, do not paste it',
          code: 'flowchart LR\n  user(["User"])\n  ext[("External systems<br/>via MCP")]\n  subgraph TRUST["Trust boundary - what we control"]\n    gw["Entry service"]\n    agent["Agent L4"]\n    gov["Policy engine L5"]\n    work["Queue + side effects L7"]\n  end\n  user -->|"B1 schema + auth"| gw\n  gw --> agent\n  ext -->|"B2 UNVALIDATED"| agent\n  agent -->|"B3 policy, fail-closed"| gov\n  gov -->|"B4 idempotency + gate"| work\n  work --> ext',
          expectedResult: 'Put a finger on four things: the dashed subgraph, the four labelled crossings, the one honest UNVALIDATED, and the fact that no box is called "the AI".',
        },
        diagram: `flowchart LR
  D["📐 system.mmd"] --> C1["📦 Boxes = components,<br/>not concepts"]
  D --> C2["➡️ Arrows = calls,<br/>with a direction"]
  D --> C3["⬛ Dashed box = only<br/>what you control"]
  D --> C4["🔢 Crossings carry an id<br/>+ a validator"]`,
        script: 'Open the REAL file each student generated, not this slide — this is your safety net if their output drifted. Four fingers, four properties, then move. Do not line-by-line the whole file or you will lose the segment. Point at the UNVALIDATED label and say: "that word on a diagram is a sign of a serious architect, not a sloppy one."',
      },
      {
        segment: 'guided-build', eyebrow: '2️⃣ CP1b · Data-flow diagram', title: 'Now follow ONE request through the layers, in order, on one correlation ID',
        body: 'Where the system diagram is static, this one is dynamic: it follows a single request through the layers in sequence and shows exactly where validation, governance, and the side effect happen relative to each other. This is the diagram that exposes the deadly gap, because ordering is a claim you cannot hide in a sequence. If the side effect appears before the policy check, you built an unguarded system that happens to behave in the demo. And if the correlation ID first appears halfway down, you cannot trace a failure end to end, which means Layer 6 is incomplete regardless of how many logs you have.',
        bullets: [
          'Stamp the correlation ID at the entry, and carry it to the last log line',
          'Propose, THEN gate, THEN execute — in that order, visibly',
          'Mark where B1, B2, B3, and B4 fire along the sequence',
          'If execute comes before gate, you just found a real architecture bug',
          'If you cannot trace one failure on one ID, Observability is not done',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — generate diagrams/data-flow.mmd',
          code: 'Write architecture/diagrams/data-flow.mmd as a mermaid sequenceDiagram tracing ONE real request through my system, based on the actual code path in this repo.\n\nRequirements:\n1. Participants are the layers involved, named with their layer number, e.g. "Orchestration L7".\n2. The first message stamps a correlation id, and the last message logs under that same id.\n3. Add a Note at each of the four boundaries showing what validates there, or the word UNVALIDATED if nothing does today.\n4. The proposed action must be a separate message from the executed action, so the propose-then-gate ordering is visible.\n5. Trace what the code ACTUALLY does today, not what it should do. If the code executes before it checks policy, draw it that way and flag it to me in a note underneath.\n\nAfter writing the file, tell me in one sentence whether the real ordering in my code matches propose -> gate -> execute.',
          expectedResult: 'A sequence diagram of your real code path, plus a plain answer about whether the ordering is right.',
          stopCondition: 'You know whether your system gates before it executes. If the answer is no, write it down — that is an ADR and a gap, not a defeat.',
          rescue: 'If it drew the ideal flow instead of yours, re-run with: "trace the actual call path starting from <your entry file> and cite the function at each step." Grounding it in a real file stops it from drawing the textbook.',
        },
        diagram: `flowchart LR
  IN["📥 Request,<br/>corr_id stamped"] --> V["🛡️ B1 validate"]
  V --> RET["🔎 Retrieve<br/>B2 scan"]
  RET --> PR["🧠 Propose action"]
  PR --> G["⚖️ B3 policy,<br/>fail-closed"]
  G --> SE["💥 B4 execute once"]
  SE --> OB["👁️ Logged under<br/>the same corr_id"]`,
        script: 'Trace the diagram on screen with your finger and stop hard between propose and gate: "the model SAID do this. It does not get to DO it, and this diagram is where that becomes provable." Then ask the room how many people\'s generated diagram showed execute before gate. Every hand that goes up just found a genuine bug in public, which is a good night.',
      },
      {
        segment: 'guided-build', eyebrow: '3️⃣ CP1c · The 7-layer table', title: 'Finish the table, then make it agree with your diagrams',
        body: 'Bring Monday\'s draft up to date against tonight\'s verified inventory, so every component sits on exactly one layer with a note on what it does there and a boundary marker where one applies. Then do the cross-check that most people skip: read the boundary column top to bottom and confirm that B1, B2, B3, and B4 all appear, and that they land on the same components your diagrams show. Evidence that contradicts itself is worse than no evidence, because it tells a reviewer that nobody read the package before handing it over.',
        bullets: [
          'Every inventoried component bound to exactly one layer',
          'Every layer filled, or N/A with a reason grounded in your system',
          'Read the boundary column: B1, B2, B3, B4 should all appear',
          'Cross-check against both diagrams — they must name the same components',
          'A table and a diagram that disagree is the fastest way to lose a reviewer',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — finish seven-layer.md and cross-check it',
          code: 'Update architecture/seven-layer.md so it is consistent with architecture/inventory.md and both files in architecture/diagrams/.\n\nColumns: LAYER | COMPONENT(S) | WHAT IT DOES AT THIS LAYER | BOUNDARY.\n\nThen run a consistency check and report, as a short list:\n1. Any component in inventory.md that does not appear in the table.\n2. Any component in the table that is not in inventory.md.\n3. Any boundary that appears in a diagram but not in the table, or the reverse.\n4. Any layer with no component and no stated N/A reason.\n\nDo not fix the inconsistencies silently. List them and let me decide which side is right - in some cases the diagram is wrong and in some cases the table is, and I am the one who knows which.',
          expectedResult: 'A finished table plus a short list of disagreements between your own artefacts.',
          stopCondition: 'The inconsistency list is empty, and you resolved each item yourself rather than letting it be resolved for you.',
          rescue: 'A long inconsistency list is a good sign, not a bad one — it means the check works. Resolve them one at a time, deciding each time which artefact is telling the truth.',
        },
        diagram: `flowchart LR
  INV["📄 inventory.md"] --> TAB["🧱 seven-layer.md"]
  TAB --> COL["🚧 The boundary column"]
  COL --> X{"🔍 B1-B4<br/>all present?"}
  X -->|"no"| FIX["⚠️ Table and diagram<br/>disagree"]
  X -->|"yes"| OK["✅ CP1 complete"]`,
        script: 'Say the discipline out loud: "do not let Claude Code silently reconcile your own artefacts. It will pick a side, and it does not know which one is true." Then tick CP1 off the board. That is the "diagrams" third of diagrams-plus-decisions-plus-evidence, complete.',
      },
      {
        segment: 'guided-build', eyebrow: '4️⃣ CP2a · Name the five', title: 'Name your five highest-stakes decisions before you write a single word of them',
        body: 'Five ADRs is the floor, and they should cover the decisions that would hurt most to get wrong rather than the five that are easiest to write. For an agentic system the canonical set is: which model does which job, which of your tools are allowed to write rather than only read, how authorization works, where state and sensitive data live, and how you guarantee a side effect happens exactly once. Write all five titles first, before any content. Seeing them listed forces you to notice the one you have been avoiding, and that one is almost always the write-boundary decision.',
        bullets: [
          '0001 Model choice — which job gets opus-5, sonnet-5, or haiku-4-5, and why not one for everything',
          '0002 Write boundary — which tools may cause side effects, and what gates them',
          '0003 Authorization — how permission is decided, and what happens on failure',
          '0004 Data — where state and sensitive data live, and how long they stay',
          '0005 Exactly-once — idempotency keys, retry policy, dead-letter path',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — propose the five titles, and the one I am avoiding',
          code: 'Based on this repository, propose the five highest-stakes architecture decisions embedded in it - the ones that would cost the most to get wrong or to reverse later.\n\nFor each, give me:\n  - a proposed ADR filename, numbered, e.g. adr/0002-write-boundary.md\n  - the decision as a single question\n  - one line on why getting it wrong would be expensive\n  - whether the code shows this was actually a DECISION or a DEFAULT nobody discussed\n\nThen tell me which of the five I am most likely to skip, and why you think so.\n\nDo not write the ADRs yet. Titles and questions only.',
          expectedResult: 'Five numbered titles, each phrased as a question, plus an honest call on which ones were defaults rather than decisions.',
          stopCondition: 'You have five titles and you agree that these are genuinely your riskiest five — not the five that are easiest to write up.',
        },
        diagram: `flowchart TD
  F["📝 Five decisions"] --> A["🎚️ Which model,<br/>which job"]
  F --> B["✍️ Which tools<br/>may WRITE"]
  F --> C["⚖️ How permission<br/>is decided"]
  F --> D["🗄️ Where data lives"]
  F --> E["🔁 Exactly-once<br/>side effects"]`,
        script: 'Stop on 0002 and ask the room directly: "which of your tools can WRITE? Send an email, move money, update a record?" Let people count on their fingers. Then: "that is your most dangerous decision and the one everybody skips. If you skip it, a reviewer asks what stops the agent from emailing every customer, and you have no file to point at."',
      },
      {
        segment: 'guided-build', eyebrow: '5️⃣ CP2b · Write them so they justify', title: 'Draft all five with Claude Code — but you own the Alternatives block',
        body: 'Draft the five files, then apply the justify test to each one: does it name the alternatives you rejected, does each rejection give a specific technical reason, and does it state a trigger for revisiting. Claude Code can draft context and consequences well, because both are recoverable from the code. It cannot know what you actually considered and ruled out, so that block is yours to write or to correct. If any of your five comes back with an empty or generic Alternatives block, it is not an ADR yet — it is a description wearing one.',
        bullets: [
          'Claude drafts context, decision, and consequences from the code',
          'You own Alternatives considered — it is the only block it cannot recover',
          'Each rejection names a capability the option lacks, or a cost you measured',
          'Every ADR gets a revisit trigger — the concrete condition that reopens it',
          'For the model ADR, name real ids: claude-opus-5, claude-sonnet-5, claude-haiku-4-5',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — draft the five ADRs, then attack them',
          code: 'Write the five ADRs we named, one file each in architecture/adr/, using this structure:\n\n  ADR-000N: <decision in one line>\n  Status: Proposed | Accepted\n  Context: the forces - what is true in this system right now that pushes on the decision. Cite files.\n  Decision: what we do, specifically.\n  Alternatives considered:\n    - <option>: rejected because <a capability it lacks or a cost it imposes>\n  Consequences: what we now live with, good and bad.\n  Revisit when: the concrete trigger that reopens this.\n\nRules:\n1. Context and Consequences must cite real files or real behaviour in this repo.\n2. For Alternatives, propose candidates but mark each one [CONFIRM] - I will supply or correct the real reason we rejected it. Do not assert a rejection reason as fact.\n3. Preference language is banned. "We preferred X" is not a reason. "X cannot express per-request context" is.\n4. In the model-choice ADR, use the current model ids exactly: claude-opus-5, claude-sonnet-5, claude-haiku-4-5. If the repo pins a model, cite where.\n\nWhen all five exist, review them as a hostile reviewer and tell me which ONE is weakest and what question would break it.',
          expectedResult: 'Five files in adr/, every Alternatives block marked [CONFIRM] for you to own, and one named weakest ADR.',
          stopCondition: 'You have replaced every [CONFIRM] with a real reason, and the weakest ADR has been strengthened rather than deleted.',
          rescue: 'If the alternatives read like a menu of equally good options, ask: "what would have to be true for each rejected option to be the RIGHT choice?" That question surfaces the real constraint almost every time.',
        },
        diagram: `flowchart LR
  T["📋 Five titles"] --> CC["💻 Claude Code<br/>drafts five files"]
  CC --> Y["👤 You own the<br/>rejected alternatives"]
  Y --> TEST{"🧪 The justify test"}
  TEST -->|"fails"| BACK["↩️ Decorated,<br/>not decided"]
  TEST -->|"passes"| DONE["✅ Defensible"]`,
        script: 'Enforce the [CONFIRM] rule hard — it is the whole design of this prompt. Claude Code marking its guesses instead of asserting them is exactly the trust-but-verify habit the program has taught since Week 1, made mechanical. Walk the room and check that people are actually replacing those markers rather than deleting them.',
      },
      {
        segment: 'guided-build', eyebrow: '👀 Read it together', title: 'One worked ADR at the density a reviewer expects',
        body: 'Here is the most-skipped decision, written properly. Read it as a room and notice the proportions: context is short, the decision is one sentence, and the largest block by far is the three things it says no to. Notice too that each rejection names a capability or a cost, never a taste. And notice the revisit trigger at the bottom, which is what stops an ADR from silently becoming folklore. Hold your own five against this bar. If yours has an empty Alternatives block, it is not done, it is decorated.',
        code: {
          kind: 'review',
          label: 'architecture/adr/0002-write-boundary.md — read it, do not paste it',
          code: 'ADR-0002: Tools split into read-only and gated-write\nStatus:   Accepted\nContext:  The agent has six tools. Three read (fetch record, look up\n          account, search the knowledge base) and three cause side\n          effects (issue a credit, send an email, close a case).\n          Retrieved content crosses B2 unvalidated today, so a\n          poisoned document could steer the model toward a write.\nDecision: Read tools stay directly available. Every write tool is\n          behind Layer 5: the model emits a PROPOSED action, policy\n          evaluates it, and only then does Orchestration execute.\n          Credits above the agreed threshold and any bulk send also\n          require a human approval before execution.\nAlternatives considered:\n  - All six tools freely callable: rejected - a poisoned document\n      becomes an unauthorised credit with no gate and no audit\n      record of who or what approved it.\n  - Human approval on every single write: rejected - measured at\n      roughly 40 approvals a day, which removes the automation\n      benefit that justified the project.\n  - A separate write-only agent: rejected - moves the same boundary\n      one hop without adding a control, and widens the surface.\nConsequences: one policy evaluation is added to every write path;\n  high-value credits raise escalations, which we watch against the\n  agreed escalation ceiling; every write carries an idempotency key.\nRevisit when: a new write-capable tool is added, or the injection\n  scan at B2 starts missing cases in review.',
          expectedResult: 'Count the lines. The Alternatives block is the biggest thing on the page, and that is the correct shape for an ADR.',
        },
        diagram: `flowchart LR
  ADR["📝 adr/0002"] --> C["📄 Context: 6 tools,<br/>3 of them write"]
  C --> D["✅ Decision: writes<br/>cross B3 first"]
  D --> R["🚫 3 alternatives rejected,<br/>each for a capability"]
  R --> RV["⏰ Revisit when a new<br/>write tool appears"]`,
        script: 'Read the three rejected alternatives aloud, slowly. Then say: "this is a defensible decision — not because of the Decision line, but because of the three things it says no to and why." Then have one student read their own Alternatives block. The comparison does the teaching; you barely have to comment.',
      },
      {
        segment: 'guided-build', eyebrow: '6️⃣ CP3a · Score it', title: 'Six dimensions, one to six, and every score cites a file',
        body: 'Score each INPACT dimension against the rubric, sum the six, and convert to the hundred-point composite. Then the rule that makes the scorecard survive a review: no score without a file you can point at. Have Claude Code propose scores from the evidence in your repo, then challenge each one yourself — can you actually open something that justifies it? A dimension you cannot back with an artefact should be scored lower, not higher. Inflating a score does not buy you anything, because the panel asks "show me" and the whole card loses credibility on the first miss.',
        bullets: [
          'Score all six, one to six, against the rubric anchors',
          'Every score cites a real file, trace, test, or measurement',
          'No artefact → score it lower. This is the entire discipline.',
          'composite = sum ÷ 36 × 100 · production threshold is 86',
          'A 69 you can defend is worth more than an 86 you invented',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — propose INPACT scores with citations',
          code: 'Write architecture/scorecard.md.\n\nScore my system on the six INPACT dimensions, 1-6 each: Instant, Natural, Permitted, Adaptive, Contextual, Transparent.\n\nColumns: DIMENSION | SCORE | EVIDENCE (cite a real file, test, trace, or measurement in this repo) | WHY NOT ONE HIGHER.\n\nHard rules:\n1. If you cannot cite a real artefact for a score, score the dimension at most 2 and write "no evidence in repo" in the evidence column. Do not score on plausibility.\n2. The "why not one higher" column must name the specific missing thing, not a vague improvement.\n3. Compute composite = sum / 36 * 100 and show the arithmetic.\n\nThen tell me which two scores you are least confident about, so I can check those first.\n\nBe conservative. I would rather defend a low number than explain a high one.',
          expectedResult: 'Six scored rows, each citing something real, plus a composite with the arithmetic shown.',
          stopCondition: 'You have personally checked at least two citations by opening the file. If a citation does not hold up, lower the score on the spot.',
          rescue: 'If every dimension came back a 4 or 5, the model is being polite. Re-run with: "assume a hostile reviewer will open every file you cite and will not accept intent as evidence."',
        },
        diagram: `flowchart LR
  DIM["6️⃣ dimensions"] --> SC["🔢 Score 1-6"]
  SC --> EV["📎 Cite a file<br/>for each score"]
  EV --> Q{"❓ No artefact?"}
  Q -->|"then"| LOW["🔻 Score it lower"]
  Q -->|"otherwise"| C["📊 Composite =<br/>sum ÷ 36 × 100"]`,
        script: 'Make two people open a cited file on screen and confirm it says what the scorecard claims. One of them will not hold up, and that public correction teaches evidence discipline better than any explanation. Say the line: "score what you can show, not what you meant to build."',
      },
      {
        segment: 'guided-build', eyebrow: '7️⃣ CP3b · Band, gaps, commit', title: 'Place the number, name the three gaps, run the gate, commit the package',
        body: 'Map the composite onto the Trust Band so a number becomes a verdict and a timeline. Then rank the dimensions by distance from target and take the lowest three, because those three name an INPACT dimension, the layer that owns the fix, and a concrete action. That list is not a consolation prize for a low score — it is the closing slide of your Expo defence, and having it is the difference between "we are not ready" and "we are eight weeks out, here is the sequence". Then run the package gate and commit. The commit is the deliverable.',
        bullets: [
          'Composite → band → a readiness verdict with a timeline',
          'Top three gaps, each naming a dimension, a layer, and an action',
          'That list IS the roadmap section of your Week 12 defence',
          'Run the gate: diagrams render, no blank rows, every ADR justifies, every score cites',
          'git commit — an uncommitted package is a package nobody can review',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — Trust Band, top-3 gaps, and the package gate',
          code: 'Finish architecture/scorecard.md and then gate the whole package.\n\n1. Place my composite on the Trust Band (High 86-100, Moderate 67-85, Low 50-66, Very Low 33-49, Critical below 33) and state the readiness verdict in one sentence.\n\n2. Rank the six dimensions by distance from their target and list the TOP 3 GAPS. For each: the dimension, the layer that owns the fix, the concrete action, and what evidence would prove it closed.\n\n3. Then run this checklist against the whole /architecture folder and report PASS or FAIL per line with the reason:\n   - both diagrams render as valid mermaid\n   - seven-layer.md has no blank rows and no unjustified N/A\n   - at least 5 ADRs exist, each with a non-empty Alternatives block and a revisit trigger\n   - every INPACT score cites an artefact that actually exists\n   - README.md explains how to read the package in four lines\n   - no secrets, keys, or credentials appear anywhere in the folder\n\n4. Fix only the mechanical failures (broken mermaid, missing headings). Report the judgement failures to me - do not invent content to make a check pass.\n\nThen commit with the message: architecture package v1.',
          expectedResult: 'A Trust Band verdict, three named gaps, a pass/fail checklist, and a commit.',
          stopCondition: 'Every line of the gate is PASS, or you have written down exactly why one is not and what you will do about it before the Expo.',
          rescue: 'If it starts inventing content to make a check pass, stop it immediately: "report the failure, do not fix it by writing something that is not true." That instinct is the thing this whole week exists to prevent.',
        },
        diagram: `flowchart LR
  C["🔢 Composite"] --> B["🎚️ Trust Band<br/>+ a timeline"]
  B --> G["🥇 Top-3 gaps"]
  G --> RM["🗺️ The roadmap section<br/>of your defence"]
  RM --> GATE["✅ Gate passes<br/>→ git commit"]`,
        script: 'Check the gate lines off on the board with the room, out loud, one at a time. Then say what the commit actually is: "that folder answers where untrusted input enters, why every hard call was made, and how ready you really are — all from files. You did not make slides. You made evidence." Then straight into the failure segment while the energy is high.',
      },

      /* ============================= failure ============================== */
      {
        segment: 'failure', eyebrow: '💥 Break it on purpose', title: 'Erase the boundaries from your own diagram. Now answer the killer question.',
        body: 'Take the system diagram you just committed and strip the dashed boundary and every B-marker out of it, leaving only components and arrows — which is precisely the form in which most real architecture diagrams arrive at a review. Now answer out loud: where does untrusted input enter this system? Without the markers the answer is guesswork, and the gap becomes physical rather than theoretical. Nothing about your system changed in the last thirty seconds. The only thing that changed is that you can no longer see the controls, and neither can a reviewer.',
        bullets: [
          'Same system, same code — only the markers are gone',
          'Without them, "where does untrusted input enter" has no fast answer',
          'B2 unmarked → injection rides retrieval straight into reasoning',
          'B3 unmarked → a model proposal becomes an action with nothing between',
          'A diagram that hides its boundaries hides its vulnerabilities',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — strip the boundaries on a COPY',
          code: 'This is a deliberate failure exercise. Do NOT modify my committed diagrams.\n\nCopy architecture/diagrams/system.mmd to /tmp/system-stripped.mmd and, in the copy only:\n1. Remove the trust-boundary subgraph, so every component sits at the same level.\n2. Remove every boundary label from every arrow, leaving unlabelled arrows.\n3. Change nothing else - same components, same connections.\n\nRender or print the stripped version so we can look at it, then answer this question using ONLY the stripped diagram, with no reference to the original: where does untrusted input enter this system, and what validates it?\n\nIf you cannot answer confidently from the stripped diagram alone, say so plainly. That is the result we are looking for.',
          expectedResult: 'The same architecture, visually identical in structure, and now unanswerable. Claude should say it cannot tell.',
          stopCondition: 'You have looked at your own system rendered as an unanswerable picture and felt how normal it looks.',
        },
        diagram: `flowchart LR
  D["📐 Your diagram"] --> E["🧽 Erase the<br/>boundaries"]
  E --> Q["❓ Where does untrusted<br/>input enter?"]
  Q --> S["🤐 Guesswork"]
  S --> R["😳 The gap was<br/>always there"]`,
        script: 'Do this live on one student\'s diagram, with permission, and ask them the question. Let them struggle for a genuine five seconds — do not rescue them. Then say: "that struggle is exactly what a reviewer feels looking at a boundary-less diagram. The gap did not appear when we erased the line. Erasing the line just stopped hiding it."',
      },
      {
        segment: 'failure', eyebrow: '🔧 Harden it', title: 'Draw the line, name the validator, default to deny — and the question answers itself',
        body: 'The recovery is unglamorous, which is the sign that it is right. Put the dashed boundary back. Re-mark the four crossings. Name the validator at each one, and where there is no validator, write UNVALIDATED rather than something aspirational. Then set the default: an input that no validator recognises is denied, not passed through. That is the whole fix, and it is not cosmetic — naming the validator is the control, and the default deny is what makes it hold when something unexpected arrives. Ask the same killer question now and it has a one-word answer at every crossing.',
        bullets: [
          'Boundary back on the diagram, and on the table, and they agree',
          'A named validator on every crossing — or the honest word UNVALIDATED',
          'Default deny: unrecognised input does not get the benefit of the doubt',
          'Every UNVALIDATED becomes a line in your top-3 gaps, not a secret',
          '"Where does untrusted input enter?" now answers in about two seconds',
        ],
        code: {
          kind: 'review',
          label: 'Before and after — the same system, twice',
          code: 'BEFORE (boundaries stripped):\n  user --> entry --> agent --> credit tool\n  No line, no validator, no answer to "where does untrusted input enter".\n  Looks clean. Looks finished. Answers nothing.\n\nAFTER (boundaries restored):\n  user       --| B1  schema + auth            |--> entry\n  entry      --------------------------------->  agent\n  external   --| B2  UNVALIDATED - gap 2      |--> agent\n  agent      --| B3  policy eval, fail-closed |--> governance\n  governance --| B4  idempotency + human gate |--> credit tool\n\n  At every crossing: a named validator, and default DENY.\n  "Where does untrusted input enter?"  ->  B1 and B2. Answered.\n  "Which one is not protected?"        ->  B2, and it is gap 2\n                                            on the scorecard.',
          expectedResult: 'Read the AFTER block. The honest UNVALIDATED at B2 is the strongest line on the page, not the weakest.',
        },
        diagram: `flowchart LR
  E["🧽 Boundary-less"] --> L["⬛ Draw the line back"]
  L --> N["🛡️ Name a validator<br/>at each crossing"]
  N --> DEF["🚫 Default deny"]
  DEF --> A["🗣️ Answered in<br/>two seconds"]`,
        script: 'Redraw the boundaries live and ask the same student the same question. This time they answer instantly. Say: "same system, same code. The only thing that changed is that you can see the controls — and that visibility is the entire product an architecture package sells."',
      },
      {
        segment: 'failure', eyebrow: '🐉 One week out', title: 'Three ways this package fails a review — kill all three before Thursday',
        body: 'Packages fail in exactly three ways and each has a fix you can apply tonight. It fails as slides instead of evidence, when a claim cannot be traced to a committed file — the fix is the gate you just ran. It fails on missing trust boundaries, when a reviewer asks where untrusted input enters and gets silence — the fix is B1 through B4 marked on both diagrams with named validators. And it fails on ADRs that describe instead of justify — the fix is a rejected-alternatives block in every one. Next Thursday is the Expo. You will be asked to justify your three highest-stakes decisions by someone who was not here, and the package is what lets you answer without hesitating.',
        bullets: [
          'Fail 1 — slides not evidence → every claim traces to a committed file',
          'Fail 2 — missing boundaries → B1-B4 on both diagrams, each with a validator',
          'Fail 3 — ADRs that describe → a rejected-alternatives block in every one',
          'The Expo is a defence, not a demo: every claim gets "show me"',
          'Your top-3 gaps are the roadmap you close on. Rehearse saying them out loud.',
        ],
        diagram: `flowchart TD
  P["📦 Your package"] --> F1["🖼️ Slides, not evidence<br/>→ trace every claim"]
  P --> F2["🚧 Missing boundaries<br/>→ B1-B4 + validators"]
  P --> F3["📝 ADRs that describe<br/>→ name what you rejected"]
  P --> EX["🐉 Week 12:<br/>the dragon, as promised"]`,
        script: 'Close the week on the arc: "you arrived twelve weeks ago able to ask an AI for help. Tonight you committed a folder that explains a system you built, defends every hard decision in it, and scores honestly how far it is from production. That is the architect job." Then the promise from Orientation, kept: "next Thursday you face the dragon. You are not walking in with slides. You are walking in with evidence. See you at the Expo."',
      },
    ],

    beforeAfter: {
      label: 'Monday → Thursday',
      before: [
        'A system only you can explain',
        'Ten weeks of decisions living in one head',
        '"It is pretty much ready"',
        'A diagram in a slide, on one laptop, if at all',
        'Boundaries you assume are covered',
      ],
      after: [
        'A committed folder a stranger can read',
        'Five ADRs, each naming what you rejected and why',
        'A composite, a Trust Band, and three named gaps',
        'Two mermaid diagrams in the repo, diffable like code',
        'B1-B4 marked, each with a named validator or an honest UNVALIDATED',
      ],
    },

    storyBeats: {
      'result-preview': [
        {
          icon: '🏠', tone: 'violet', eyebrow: 'Before you build — what you are actually making',
          title: 'You can love a house. The bank funds the inspection report.',
          body: 'Anyone can walk a buyer through a house and point at the good light and the new kitchen. What moves money is a report from someone who crawled the roof space, wrote down what they found, and signed it — including the two things that need fixing and roughly what they will cost. The report is not more beautiful than the tour. It is just the only document in the transaction that anybody can act on.',
          punch: 'Nobody funds a tour. They fund a report — and tonight you write yours.',
        },
      ],
      'build-map': [
        {
          icon: '🗄️', tone: 'leaf', eyebrow: 'Why it lives in the repo',
          title: 'The diagram was right. It was right on a laptop that got wiped in March.',
          body: 'Somebody drew a genuinely good architecture diagram in a slide tool. It was exported once, pasted into a wiki, and never touched again. Six months later the system had a new queue, a retired service, and a completely different failure path, and the picture said none of it. A new engineer built against that picture for two weeks. She was not careless. She was reading the only document anybody had given her, and it had been quietly lying since roughly week three.',
          punch: 'A diagram that cannot be diffed will be wrong within a month, and nobody will be able to tell when it happened.',
        },
      ],
      failure: [
        {
          icon: '🚧', tone: 'cherry', eyebrow: 'A pattern, not an anecdote',
          title: 'The poisoned document that asked, very politely, for a refund',
          body: 'The attack does not look like an attack. It looks like an ordinary attachment with a paragraph buried in it addressed to whatever system might read it later, phrased helpfully, requesting an action. The agent retrieved it, reasoned over it as context, and proposed exactly what the paragraph suggested. Nothing malfunctioned. Every component did its job correctly. The only thing standing between that proposal and a real transfer of money was a policy check at one boundary somebody had bothered to draw.',
          punch: 'The boundary you did not draw is the one they find first.',
        },
        {
          icon: '🐉', tone: 'amber', eyebrow: 'The dragon, one week out',
          title: 'Next Thursday somebody who was not here asks you why',
          body: 'They will not ask what it does — the demo answers that in ninety seconds. They will ask why this model and not the cheaper one, what stops it from taking an action nobody approved, and how ready it honestly is. Those are the three questions the panel always asks, and you now have a file for each of them. You do not have to remember your reasoning under pressure. You wrote it down while you were calm.',
          punch: 'The package is not for the panel. It is for you, standing there, with an answer.',
        },
      ],
    },

    extraInteractions: [
      {
        segment: 'readiness', kind: 'poll',
        q: 'Four-point check — where are you?',
        options: [
          '✅ All four: repo open, Monday\'s table, boundary worksheet, one ADR',
          '📁 Repo is open but I have no table from Monday',
          '🚧 No boundary worksheet',
          '📝 No ADR started',
        ],
        eyebrow: '🚦 Roll call', title: 'Before anyone writes a file',
        presenterTip: 'Operational. Read the counts out loud and send mentors to the non-green students immediately. Anyone missing Monday\'s artefacts can regenerate the table in five minutes from the repo — start them on that now rather than at the break.',
      },
      {
        segment: 'result-preview', kind: 'poll',
        q: 'If a panelist asked right now — where does untrusted input enter your system? — what happens?',
        options: [
          'I could point at it immediately',
          'I could work it out, slowly, out loud',
          'I would describe what should happen, not what does',
          'I genuinely do not know',
        ],
        eyebrow: '🎯 Baseline', title: 'The killer question, before we start',
        presenterTip: 'Ask this before any building and write the spread on the board. You will ask the exact same question at the end of the night, and the shift is the most satisfying evidence of progress the class produces. Do not skip the before-reading or you lose the after.',
      },
      {
        segment: 'build-map', kind: 'poll',
        q: 'Where does the architecture documentation for your system live today?',
        options: [
          'Nowhere — it does not exist',
          'In my head',
          'Slides or a doc outside the repo',
          'In the repo, beside the code',
        ],
        eyebrow: '🗄️ Room read', title: 'Be honest about where it lives',
        presenterTip: 'Most of the room is on the first two options and that is fine — say so. Then name what tonight changes: by 8:30 everybody moves to option four. It reframes the night as a migration rather than an assignment.',
      },
      {
        segment: 'guided-build', kind: 'trivia',
        q: 'Claude Code just drafted your component inventory from the repo. What do you do FIRST?',
        options: [
          'Commit it — it read the actual code',
          'Verify every row against the repo before anything else',
          'Render it into the package',
          'Start scoring INPACT from it',
        ],
        answer: 1,
        reveal: 'Verify. The draft describes what a system like yours usually contains; only the repo describes what yours actually contains. It will typically invent one or two components and miss one. Finding both is how you earn the inventory — and everything downstream inherits its errors.',
        eyebrow: '🔍 Trust but verify', title: 'The draft is back. Now what?',
        presenterTip: 'Fast, right as their drafts land. Reveal, then ask two people what they deleted. The first real answer — "it listed a caching layer we do not have" — teaches the whole principle in one sentence.',
      },
      {
        segment: 'guided-build', kind: 'poll',
        q: 'Look at your inventory. How many of your tools or integrations can WRITE — cause a real side effect?',
        options: [
          'None — everything is read-only',
          'One or two',
          'Three or more',
          'I have honestly never counted',
        ],
        eyebrow: '✍️ Count them', title: 'Which of your tools can actually do something?',
        presenterTip: 'The last option is the honest one and usually the largest. Say so warmly — then point out that this is exactly why ADR-0002 exists and why it is the one everybody skips. Several people will reorder their five ADRs on the spot.',
      },
      {
        segment: 'guided-build', kind: 'poll',
        theater: true,
        q: 'Your composite comes out at 69. The Expo is in eight days. What do you put in the package?',
        options: [
          'Round it to 86 — nobody is going to audit the arithmetic',
          'Spend the eight days fixing gaps, then score again and show only the new number',
          'Show the 69, the band, and the top three gaps with a timeline',
          'Leave the scorecard out and lead with the demo',
        ],
        answer: 2,
        reveal: 'Show the 69. A number you can defend beats a number you invented, every single time — and the three gaps ARE your roadmap, which is the part executives actually fund. "We are four to eight weeks out, here is the sequence" is a stronger position than a suspiciously round 86 that collapses on the first "show me".',
        eyebrow: '📊 The real decision', title: 'Your score is a 69. The Expo is in eight days.',
        presenterTip: 'Full-screen theater moment — lock votes, show the spread, then reveal. Expect real support for option two, which is the seductive wrong answer: it hides the starting point, and hiding the starting point removes the evidence of progress. Do not rush this; it is the judgment that separates an architect from a presenter.',
      },
      {
        segment: 'failure', kind: 'poll',
        q: 'Before we erased them — how many boundary crossings did your system diagram actually show?',
        options: ['Zero or one', 'Two', 'Three', 'Four or more'],
        answer: 3,
        reveal: 'Four is the expected number, because there are four places a real agentic system touches something it does not control. Fewer than four almost never means a simpler system — it usually means one crossing is hidden inside a box, and a reviewer will find it before you do.',
        eyebrow: '🚧 Count them', title: 'How many crossings did you draw?',
        presenterTip: 'Take the vote before revealing. Anyone below four should re-open their diagram right now and hunt for the hidden crossing — that hunt is worth more than the next slide, so give it two minutes if the numbers are low.',
      },
      {
        segment: 'cta', kind: 'poll',
        q: 'Same question as the start of the night: where does untrusted input enter your system?',
        options: [
          'I can point at it in my own diagram, right now',
          'I can point at it, and at the one crossing that is still UNVALIDATED',
          'Closer than I was, still assembling',
          'Not yet — I know exactly what I am missing',
        ],
        eyebrow: '🎯 The same question, four hours later', title: 'Ask it again',
        presenterTip: 'Put tonight\'s result next to the reading you took at the start and read both spreads out loud. The second option is the strongest answer in the list — say that explicitly, because knowing your own unvalidated crossing is exactly the posture that survives a panel. Close by pointing at the Expo.',
      },
    ],
  },
};
