/**
 * week1.ts — the complete authored content pack for WEEK 1,
 * "Claude Code Foundations + Workspace" (Intensive 1 · Build Your AI Foundation).
 *
 * Arc position. Week 1 OPENS ACT I ("Hands"). The arc beat is: you stop typing
 * code and start directing an engineer. Orientation promised the apprentice and
 * the dragon; this is the first swing of the sword, and the room still contains
 * people who have never opened a terminal. Tone is warm, stakes are low, and the
 * only bar for the night is one prompt, one plan, one thing that actually ran.
 *
 * PRESERVE-AND-UPGRADE. Every teach slide here already ran in front of a live
 * cohort and is carried forward faithfully from `WEEK1` in classTeachContent.ts —
 * same segments, eyebrows, titles, bodies, bullets, code, and scripts. The Monday
 * `hook` and the four Monday story beats come across unchanged from week 1 in
 * classSessionPlan.ts's WEEK_CLASS_CONTENT, and the Thursday `beforeAfter` extends
 * the one already authored there rather than replacing it. Nothing was rewritten
 * for style.
 *
 * What this pack ADDS, which the original layout had no home for:
 *   • A mermaid diagram on all 21 teach slides (there were zero) — ≤7 short-
 *     labelled nodes each, because the instructor click-zooms them full screen.
 *   • Eight Monday and eight Thursday participation questions (there were zero).
 *   • Four Thursday story beats and a fifth Monday beat for the bare micro-build
 *     segment.
 *   • Explicit Build Bay metadata on every code block, so shell commands are
 *     labelled for the TERMINAL and read-along code is labelled REVIEW instead of
 *     rendering as "paste this into Claude Code" — which teaches the opposite of
 *     the lesson in a program whose thesis is that you direct and review.
 *
 * No model IDs appear anywhere in Week 1, and none were introduced.
 */
import type { WeekPack } from '../weekPack';

export const WEEK1_PACK: WeekPack = {
  week: 1,
  arcBeat: 'You stop typing code and start directing an engineer.',

  /* ====================================================================== */
  /*  MONDAY — Architecture Day                                             */
  /* ====================================================================== */
  monday: {
    hook: {
      headline: 'You gave AI an answer to type. Now it can act.',
      caption: 'The unit of work just changed — from “what should I do” to “do it, and show me it worked.”',
    },

    teach: [
      /* ===================== business problem (~15 min) ==================== */
      {
        segment: 'business-problem', eyebrow: '💼 The gap', title: 'Most people use Claude like a smarter search box',
        body: 'The average professional opens a chat window, asks a question, copies the answer, and closes it. Useful — but the productivity gain stops at their own keyboard, and it’s a skill every peer already has. Companies don’t automate work by chatting faster; they automate it by giving an AI the ability to act inside their systems.',
        bullets: ['User: prompts, copies, closes', 'Builder: gives AI the ability to act', 'The gap is the story of your career'],
        diagram: `flowchart LR
  Q["❓ Your question"] --> CH["💬 Chat window"]
  CH --> AN["📋 An answer<br/>you copy"]
  AN --> HD["🖐️ You still do<br/>every step by hand"]
  HD --> ST["🛑 It stops at<br/>your own keyboard"]`,
        script: 'Ask the room: “Has AI ever done something FOR you while you weren’t watching?” Most hands drop. That’s the gap we close today.',
      },
      {
        segment: 'business-problem', eyebrow: '⚙️ What changes', title: 'When Claude can act, the unit of work changes',
        body: 'Claude Code isn’t a chat box — it reads your repository, plans a change, edits files, runs commands, and commits, in a loop it drives itself. You stop typing code and start directing an engineer. The unit of work goes from “a sentence” to “a shipped change.”',
        bullets: ['Reads → plans → edits → runs → commits', 'You direct; it executes', 'Output = a shipped change, not a paragraph'],
        diagram: `flowchart LR
  RD["📖 Reads<br/>your repo"] --> PL["🧭 Plans<br/>the change"]
  PL --> ED["✏️ Edits files"]
  ED --> RN["▶️ Runs commands"]
  RN --> CM["✅ Commits"]
  CM --> RD`,
        script: 'This is the reframe of the whole program. Say it plainly, then promise the payoff: “By Thursday you’ll have done this yourself.”',
      },
      {
        segment: 'business-problem', eyebrow: '📈 The business case', title: 'Chatters plateau. Builders multiply.',
        body: 'A team that only chats plateaus at individual productivity. A team that builds multiplies — one architect can direct ten agents at once. That’s why the wage premium for AI builders is real and widening. Today we lay the foundation everything else in the program stands on.',
        diagram: `flowchart LR
  CHT["💬 Chatter"] --> P1["📈 One person,<br/>somewhat faster"]
  P1 --> CEIL["🧱 A ceiling"]
  BLD["🏗️ Builder"] --> P2["🤖 Directs work<br/>that runs itself"]
  P2 --> MULT["🚀 A whole team<br/>multiplies"]`,
        script: 'Tie it to their goals: “Whatever you want to build or earn, it runs through the skill we start today.”',
      },

      /* ======================== architecture (~20 min) ===================== */
      {
        segment: 'architecture', eyebrow: '🧠 Working memory', title: 'The context window is Claude’s working memory',
        body: 'Claude can only reason about what’s in its context window. It fills as you work — every file read, every command output. Claude Code now manages this for you automatically: it compacts the conversation as it approaches the limit, so a long session keeps going without you babysitting it or losing the thread. Your job is direction, not memory management — if you’re ever curious what’s loaded, `/context` still shows you.',
        code: {
          kind: 'paste', pasteWhere: 'Claude Code',
          label: 'See what is loaded (rarely needed)',
          code: '/context   # inspect the current context window — auto-compaction handles the rest',
          expectedResult: 'A breakdown of what is currently loaded into the window. Nothing changes; this is a read-only look.',
          rescue: 'Slash command not recognised? You are probably typing it in the terminal instead of inside a running Claude Code session.',
        },
        diagram: `flowchart LR
  FL["📄 Files it read"] --> CW["🧠 Context window —<br/>its working memory"]
  OUT["🖥️ Command output"] --> CW
  CW --> AC["🔄 Auto-compaction<br/>as it fills up"]
  AC --> CW
  CW --> YOU["🎯 You direct.<br/>You do not manage memory."]`,
        script: '“Older tools made you manage this by hand. Claude Code now does it in the background — you focus on the work, not the window.”',
      },
      {
        segment: 'architecture', eyebrow: '🔧 Tools + permissions', title: 'Tools are what Claude can DO — permissions gate them',
        body: 'Tools let Claude read files, edit them, run shell commands, and search. Permissions decide what fires without asking. Manual mode asks before every action; Plan mode proposes a plan and waits for you; Auto mode runs freely. The mode you choose is a trust decision — high trust for a scratch repo, low trust for production. (Product terms can shift — teach the behavior, not the label.)',
        bullets: ['Tools: read · edit · run · search', 'Manual (approve each) · Plan (propose, wait) · Auto (run freely)', 'The mode is a trust decision'],
        diagram: `flowchart TD
  TL["🔧 Tools — read ·<br/>edit · run · search"] --> GT{"🚦 Permission mode"}
  GT -->|"Manual"| MN["✋ Approve<br/>every action"]
  GT -->|"Plan"| PN["🧭 Propose,<br/>then wait"]
  GT -->|"Auto"| AU["🏃 Run freely"]
  MN --> TR["🤝 The terrain picks<br/>the mode, not taste"]
  PN --> TR
  AU --> TR`,
        script: 'Frame it as safety, not friction: “The permission mode is how you sleep at night when an agent is editing your code.”',
      },
      {
        segment: 'architecture', eyebrow: '🔁 The workflow', title: 'explore → plan → code → commit',
        body: 'The workflow that scales. Explore: let Claude read the code first. Plan: in Plan Mode it proposes the approach and waits. Code: it implements the approved plan. Commit: it writes the change with a clear message. Skipping explore and plan is the single biggest cause of Claude editing the wrong thing.',
        code: {
          kind: 'paste', pasteWhere: 'Claude Code', ccMode: 'Plan Mode',
          label: 'The loop, as a prompt',
          code: 'Explore this repo, then in Plan Mode propose how you would add a /health endpoint. Show the plan; do not edit yet.',
          expectedResult: 'A summary of what it found, then a proposed approach — and a stop. Zero files touched.',
          stopCondition: 'It shows you the plan and waits for you instead of editing.',
          rescue: 'If it starts editing anyway, stop it and say: “You skipped Plan Mode. Show me the plan first and change nothing.”',
        },
        diagram: `flowchart LR
  EXP["🔍 Explore —<br/>read it first"] --> PLN["🧭 Plan —<br/>propose and wait"]
  PLN --> COD["✏️ Code — exactly<br/>the approved plan"]
  COD --> CMT["✅ Commit —<br/>a clear message"]
  SKP["⚠️ Skip explore<br/>and plan"] -.-> WRG["❌ It edits the<br/>wrong thing"]`,
        script: 'The one-liner to repeat all program: “Plan Mode is your seatbelt. The best builders plan more, not less.”',
      },
      {
        segment: 'architecture', eyebrow: '📄 Persistent standards', title: 'CLAUDE.md gives Claude your standards once',
        body: 'CLAUDE.md is a file Claude reads at the start of every session — how you give it your conventions once instead of repeating them. The rule for what goes in it: only rules that CHANGE behavior, and make them specific and testable. “Write clean code” does nothing; “functions ≤ 50 lines, no any without a comment” bites.',
        code: {
          kind: 'review',
          label: 'A rule that bites — read the three together',
          code: '# CLAUDE.md\n- Functions ≤ 50 lines. Split before adding new code.\n- No `any` without a one-line justification comment.\n- Run tests with `npm test` before every commit.',
          expectedResult: 'Ask of each line: could Claude tell whether it broke this rule? All three: yes. That is the whole test.',
        },
        diagram: `flowchart LR
  WR["🧑 Write the rule<br/>once"] --> FL["📄 CLAUDE.md"]
  FL --> SS["🔄 Read at the start<br/>of every session"]
  SS --> DQ{"🦷 Does it change<br/>behavior?"}
  DQ -->|"vague"| BLT["🗑️ Context bloat"]
  DQ -->|"specific + testable"| BIT["✅ It bites"]`,
        script: 'Contrast a vague rule and a sharp one on screen. “Aspirational prose is context bloat. Specific + testable is the standard.”',
      },

      /* ======================== deconstruct (~15 min) ====================== */
      {
        segment: 'deconstruct', eyebrow: '✅ What works', title: 'A clean explore → plan → code → commit',
        body: 'Watch one real change go through the loop. Claude reads before it writes, shows a plan you approve, makes exactly that change, runs the tests, and commits. Every step is visible and reversible — that’s what “directing an engineer” feels like.',
        diagram: `flowchart LR
  RB["📖 Reads before<br/>it writes"] --> PA["🧭 Shows a plan<br/>you approve"]
  PA --> EX["✏️ Makes exactly<br/>that change"]
  EX --> TS["🧪 Runs the tests"]
  TS --> CT["✅ Commits"]
  CT --> VS["👀 Every step visible<br/>and reversible"]`,
        script: 'Do this LIVE if you can. Narrate the DECISIONS, not the keystrokes. Change your visual mode every ~30 seconds.',
      },
      {
        segment: 'deconstruct', eyebrow: '❌ What fails', title: 'The two habits that wreck a session',
        body: 'Now the anti-patterns: skipping Plan Mode so Claude edits the wrong file, and a vague CLAUDE.md that Claude quietly ignores. Each is a habit — and each has a fix you’ll practice on Thursday.',
        bullets: ['Skipping Plan Mode → wrong edits', 'Vague CLAUDE.md → ignored rules'],
        diagram: `flowchart TD
  H1["⏭️ Skipped<br/>Plan Mode"] --> W1["❌ Edits the<br/>wrong file"]
  H2["🌫️ Vague<br/>CLAUDE.md"] --> W2["🙈 Rules quietly<br/>ignored"]
  W1 --> FX["🔧 Both are habits.<br/>Both have a fix Thursday."]
  W2 --> FX`,
        script: 'This is the breakdown clip. Show the failure honestly; the recovery is Thursday’s payoff.',
      },

      /* ======================== micro-build (~30 min) ====================== */
      {
        segment: 'micro-build', eyebrow: '🛠️ Stand it up', title: 'Your Architect Workspace — built once, used all program',
        body: 'For the next 30 minutes you install Claude Code, open your Architect Workspace, and run your first Plan-Mode change. This repo is the home for your Skills, subagents, MCP servers, and your capstone — everything you build lives here.',
        diagram: `flowchart LR
  WS["🏠 Architect<br/>Workspace repo"] --> SK["🧩 Your Skills<br/>(Week 2)"]
  WS --> SA["🤖 Your subagents<br/>(Week 7)"]
  WS --> MC["🔌 Your MCP servers<br/>(Weeks 5–6)"]
  WS --> CP["🏆 Your capstone<br/>(Week 12)"]`,
        script: 'Watch the pulse rail. If people go “stuck,” slow down — nobody moves past CP0 until their prompt runs.',
      },
      {
        segment: 'micro-build', eyebrow: '1️⃣ Install + verify', title: 'Get Claude Code running',
        body: 'Install Claude Code, confirm the version, and start a session. If this works, you’re ready to build.',
        code: {
          kind: 'paste', pasteWhere: 'your TERMINAL (not Claude Code)',
          label: 'Verify',
          code: 'npm install -g @anthropic-ai/claude-code\nclaude --version\nclaude   # start a session, say hello',
          expectedResult: 'A version number prints, then a session starts and answers you.',
          stopCondition: 'Claude has replied to you once. That is the whole bar for this step.',
          rescue: 'Command not found after installing? Close the terminal and open a brand-new one — that fixes it most of the time. Still stuck: tap “I’m stuck” and a mentor comes to you.',
        },
        diagram: `flowchart LR
  IN["📦 npm install -g"] --> VR["🔢 claude --version"]
  VR --> SE["💬 claude —<br/>start a session"]
  SE --> HI["👋 It replies"]
  HI --> RDY["✅ You are ready<br/>to build"]`,
        script: 'Everyone taps “I’m here” when Claude replies. Anyone stuck goes to a mentor now, not later.',
      },
      {
        segment: 'micro-build', eyebrow: '2️⃣ First Plan-Mode prompt', title: 'See the plan before anything changes',
        body: 'Run one Plan-Mode prompt and read the plan before a single file changes. This is the muscle memory the whole program is built on — you approve the approach, then Claude executes it.',
        code: {
          kind: 'paste', pasteWhere: 'Claude Code', ccMode: 'Plan Mode',
          label: 'Plan Mode',
          code: 'Explore this repo and summarize its structure. Then, in Plan Mode, propose a small first change. Do not edit yet.',
          expectedResult: 'A short tour of the repo, a proposed change, and a stop. Nothing on disk moved.',
          stopCondition: 'You have read a plan you did not write, and no file changed.',
          rescue: 'Empty or confused summary? The repo may not be open where you think. Check the folder name at the top of the session and re-open the workspace.',
        },
        diagram: `flowchart LR
  PR["📝 One Plan-Mode<br/>prompt"] --> RE["📖 Claude explores<br/>the repo"]
  RE --> PP["🧭 Proposes<br/>an approach"]
  PP --> WT["🛑 Waits — nothing<br/>has changed yet"]
  WT --> AP["👤 You approve<br/>the approach"]`,
        script: 'Have a few students read their plan out loud. “Notice it didn’t touch anything — it asked first.”',
      },
      {
        segment: 'micro-build', eyebrow: '3️⃣ Draft your CLAUDE.md', title: 'Three rules that actually change behavior',
        body: 'Write a CLAUDE.md with three specific, testable rules. On Thursday you’ll prove they bite by asking Claude to break one and watching it push back.',
        code: {
          kind: 'paste', pasteWhere: 'Claude Code',
          label: 'Author it',
          code: 'Draft a CLAUDE.md for this project with 3 specific, testable rules for naming, file size, and how to run the tests. Keep only rules that change behavior.',
          expectedResult: 'Three rules you could check compliance against. If a rule reads like a motivational poster, it did not qualify.',
          stopCondition: 'You have read all three rules yourself and can say what each one forbids.',
          rescue: 'Got vague rules like “write clean code”? Say so: “Rewrite each rule so you could tell me whether you broke it.” That one sentence usually fixes all three.',
        },
        diagram: `flowchart LR
  TH["✍️ 3 specific,<br/>testable rules"] --> CMD["📄 CLAUDE.md"]
  CMD --> NM["📛 Naming"]
  CMD --> SZ["📏 File size"]
  CMD --> TT["🧪 How to run<br/>the tests"]
  NM --> THU["🗓️ Thursday: we break<br/>one on purpose"]`,
        script: 'This is the bridge to Build Day. “Thursday we make Claude follow these — and we break one on purpose.”',
      },
    ],

    storyBeats: {
      checkin: [
        {
          icon: '🧭', tone: 'violet', eyebrow: 'Right now — the room you are in',
          title: 'You just made a prediction. Hold onto it — you will be wrong or right in about ten minutes, on purpose.',
          body: 'Architecture Day is not a lecture with slides in the middle. It is a working session with theory bolted to both sides. Every prediction you make tonight, including the one you just tapped, gets tested against a real example before the class ends. That is not a gimmick — it is the fastest way anyone learns architecture: commit to a guess, then watch reality correct it.',
          punch: 'Being wrong in the next two hours is the whole point. Being wrong in production next month is the thing we are training you to avoid.',
        },
      ],
      'business-problem': [
        {
          icon: '🎫', tone: 'berry', eyebrow: 'Change of pace — a real support ticket',
          title: 'The chatbot gave the right answer. The customer waited four more days anyway.',
          body: 'A support agent pastes a customer’s error into a chatbot, gets a correct three-step fix, and then does what every chatbot user does next: copies it, opens four different internal tools by hand, retypes half of it because the formatting broke, and finally closes the ticket — three hours after the “answer” arrived. The chatbot was never the bottleneck. The eight manual handoffs after it were.',
          punch: 'An agent does not just answer the ticket. It opens the tools, makes the change, and closes the loop.',
        },
      ],
      architecture: [
        {
          icon: '✈️', tone: 'violet', eyebrow: 'Change of pace — the pilot’s three hands',
          title: 'Manual, Plan, and Auto are not settings. They are how much you trust the runway.',
          body: 'A pilot hand-flies through a crowded pattern near the ground, engages autopilot to propose the cruise route and waits for a nod before committing to it, and only lets the plane fly itself hands-off over open, familiar sky. Nobody argues about which mode is “best” — the terrain decides. A vague CLAUDE.md rule in Auto mode is flying blind through the pattern.',
          punch: 'The skill is not picking a favorite mode. It is reading the terrain correctly, every single time.',
        },
      ],
      deconstruct: [
        {
          icon: '🐉', tone: 'cherry', eyebrow: 'Change of pace — the dragon in this example',
          title: 'This is the dragon almost every builder in this room will eventually meet',
          body: 'An agent with too much context, a vague instruction, and no plan will not fail loudly — it will fail confidently, editing the wrong files with total conviction and telling you it succeeded. That is not a Claude problem. It is what happens any time a powerful tool is given a fuzzy goal and full permission at the same time. You just watched it happen in the failing example above.',
          punch: 'You do not slay this dragon by trusting it less. You slay it by being specific enough that it cannot wander.',
        },
      ],
      'micro-build': [
        {
          icon: '🌱', tone: 'leaf', eyebrow: 'Before you build — the locker room talk, again',
          title: 'The first person to get it working tonight will not be the best builder in this room',
          body: 'Somebody in here is going to have Claude Code answering them in four minutes, and somebody else is going to spend twenty-five minutes on a version number and a PATH. By Week 6 you will not be able to tell which was which, because none of this is a measure of aptitude — it is a measure of which laptop you happened to buy. Orientation told you everyone feels behind their first week. Tonight is the week it was talking about.',
          punch: 'Tonight the goal is not mastery. It is one prompt, one plan, one thing that actually ran.',
        },
      ],
    },

    extraInteractions: [
      {
        segment: 'cold-open', kind: 'poll',
        q: 'Right now — when you use AI at work, what actually happens afterward?',
        options: [
          'I read the answer and do the work myself',
          'I copy the output into another tool by hand',
          'I have it write something I then edit',
          'It does the task and I check the result',
        ],
        eyebrow: '🔍 Room read', title: 'What happens after the AI answers?',
        presenterTip: 'No right answer — this is the diagnosis, not the test. Read the spread out loud and point at how few picked the last option, then say: “that last one is the whole program, and you take your first step toward it tonight.” If somebody did pick it, ask what the task is; the room will lean in.',
      },
      {
        segment: 'checkin', kind: 'poll',
        q: 'Honest answer — how much of a terminal have you ever used?',
        options: [
          '🙂 Never opened one in my life',
          '📋 I have pasted commands somebody gave me',
          '💻 I use one occasionally',
          '🧙 I basically live in one',
        ],
        eyebrow: '🌡️ Honest self-check', title: 'Where are you actually starting from?',
        presenterTip: 'Ask this early and receive it warmly — a big first-option count is completely normal in Week 1 and you should say so out loud without softening it into a joke. Then make the promise plainly: nobody leaves tonight un-set-up, and the people in the last group get asked to help their neighbours at micro-build.',
      },
      {
        segment: 'business-problem', kind: 'poll',
        q: 'Your team wants to cut ticket handling time in half. Which one actually gets you there?',
        options: [
          'Everyone learns to write better chat prompts',
          'Buy a bigger AI subscription for the team',
          'Something that opens the tools and makes the change itself',
          'Hire one more person on the support desk',
        ],
        answer: 2,
        reveal: 'The chatbot was never the bottleneck — the eight manual handoffs after it were. Better prompts make the answer arrive faster; only something that can ACT removes the handoffs. That is the difference between the user side and the builder side of the line.',
        eyebrow: '⚖️ Judgment call', title: 'Half the handling time. How?',
        presenterTip: 'Take answers before revealing. Option one polls well and deserves respect — better prompts genuinely help — so honour it, then ask what the agent does with the answer once they have it. The room reaches the reveal themselves and it lands harder that way.',
      },
      {
        segment: 'architecture', kind: 'poll',
        theater: true,
        q: 'You are about to point Claude at the repository that runs your company’s billing. Which mode do you start in?',
        options: [
          'Auto — it is faster and I trust it',
          'Plan — propose the approach and wait for me',
          'Manual — approve literally every action',
          'Whichever one it opened in',
        ],
        answer: 1,
        reveal: 'Plan. Manual is not wrong, it is just exhausting enough that people abandon it by Wednesday, and a safety habit nobody keeps is not a safety habit. Auto is fine on a scratch repo and reckless on billing. The mode is a trust decision, and the terrain here is unforgiving.',
        eyebrow: '✈️ Read the terrain', title: 'Billing code. Pick your mode.',
        presenterTip: 'Full-screen theater moment — lock the votes, show the spread, then reveal. Expect a real split between Plan and Manual, which is the useful part: both are defensible and the argument between them teaches more than the answer does. Anyone who picked the last option gets a kind laugh and an honest point — that is what most people do, and it is exactly how accidents happen.',
      },
      {
        segment: 'architecture', kind: 'trivia',
        q: 'Your session has been running for two hours and the context window is filling up. What do you do?',
        options: [
          'Quit and start a fresh session',
          'Nothing — Claude Code compacts it in the background',
          'Delete files from the repo',
          'Paste everything important again',
        ],
        answer: 1,
        reveal: 'Nothing. Claude Code compacts the conversation for you as it approaches the limit, which is why your job is direction rather than memory management. If you are curious what is loaded, `/context` shows you — but curiosity is the only reason to look.',
        eyebrow: '🧠 Knowledge check', title: 'Two hours in. The window is filling.',
        presenterTip: 'Fast — reveal, one sentence, move. This corrects a habit people bring in from older tools where they restarted sessions constantly. Do not let it turn into a token-budgeting discussion; that conversation belongs to Week 3 when runs start costing money.',
      },
      {
        segment: 'deconstruct', kind: 'poll',
        q: 'Claude just confidently edited a file you never mentioned. What do you check FIRST?',
        options: [
          'Whether the model is having a bad day',
          'Whether you skipped explore and Plan Mode',
          'Whether your internet connection dropped',
          'Whether you need a bigger context window',
        ],
        answer: 1,
        reveal: 'Almost always the plan you never asked to see. An agent given a fuzzy goal and permission to act will fill in the gap itself, confidently. Explore tells it what is actually there; Plan Mode shows you what it intends before it can be wrong at speed.',
        eyebrow: '🔎 Diagnose it', title: 'It edited a file you never mentioned',
        presenterTip: 'Take answers before revealing. The first option gets picked more than you would expect and is worth naming gently: blaming the model is comfortable and it stops you finding the actual cause, which is nearly always a step you skipped. This is the diagnostic instinct the whole program is training.',
      },
      {
        segment: 'micro-build', kind: 'poll',
        q: 'Where are you right now?',
        options: [
          '✅ Claude Code replied — I am in',
          '⏳ Installing, not finished yet',
          '📄 Running my first Plan-Mode prompt',
          '😵 Stuck — I need someone',
        ],
        eyebrow: '🚦 Roll call', title: 'Nobody moves on until this is green',
        presenterTip: 'Operational, not teaching. Read the counts out loud — “sixteen of twenty-two, six to go” — and send mentors to the last option before you say another word. This is the single most important checkpoint of Week 1: a student who leaves tonight without a working install starts Thursday behind, and that is the gap that makes people quit in Week 2.',
      },
      {
        segment: 'trailer', kind: 'poll',
        q: 'Honestly — how did tonight feel?',
        options: [
          '😅 Like a foreign language',
          '🙂 Confusing but I got one thing working',
          '💪 Clearer than I expected',
          '🔥 I want to keep going right now',
        ],
        eyebrow: '🌡️ Honest self-check', title: 'How did that actually feel?',
        presenterTip: 'No right answer, and ask it AFTER they have built something so it is a reflection rather than an accusation. If the first two options dominate, say so plainly and without reassurance theatre: that is what the first week of a new unit of work feels like from the inside, and the people who eventually build the most impressive things describe their first session exactly this way. Then close on Thursday.',
      },
    ],
  },

  /* ====================================================================== */
  /*  THURSDAY — Build Day                                                  */
  /* ====================================================================== */
  thursday: {
    teach: [
      /* ============================ build map ============================= */
      {
        segment: 'build-map', eyebrow: '🗺️ Today’s build', title: 'By 8:30 you have a governed foundation, ready for Week 3',
        body: 'You leave with a project foundation whose structure and docs trace back to your own CLAUDE.md and your requirements — proposed by Claude, challenged by you, approved before anything was created, and validated at the end. Five checkpoints, a rescue branch, and nobody left behind. (Building a Personal Assistant of your own? This is exactly the flow you’ll use for it too.)',
        code: {
          kind: 'review',
          label: 'The end state — one look at the traceability table you will produce',
          code: 'FOLDER          NEEDED     WHY IT EXISTS (traced to a rule)                    WHAT MUST NEVER GO HERE\nsrc/services    NOW        CLAUDE.md: business logic lives in services         HTTP routing, SQL strings\nsrc/routes      NOW        Requirements: it is called over HTTP                business logic\ndocs            NOW        CLAUDE.md: architecture decisions are written down  generated output\nlegacy          EXISTING   CLAUDE.md: DO-NOT-TOUCH, pre-existing work          anything at all\ninfra           LATER      Requirements mention deployment much later          anything before then\n\n# Read the last column out loud. A folder nobody can say NO for is a folder\n# that quietly becomes a junk drawer by Week 5.',
          expectedResult: 'Every row points back at a rule or a requirement. Nothing here exists “because every project has one”.',
        },
        diagram: `flowchart LR
  CMD["📄 Your CLAUDE.md<br/>+ requirements"] --> PRP["🧭 Claude proposes"]
  PRP --> CHL["🤔 You challenge it"]
  CHL --> APV["✅ You approve"]
  APV --> BLT["🏗️ Foundation built"]
  BLT --> VAL["🔎 Validated against<br/>your own rules"]`,
        script: 'Show the finished result first (the cold open). “This is where we all are by the end — let’s get there together.”',
      },

      /* ============================ guided build ========================== */
      {
        segment: 'guided-build', eyebrow: '0️⃣ CP0 — CLAUDE.md ready', title: 'Confirm your constitution is sharp before Claude reads it',
        body: 'Before Claude treats your CLAUDE.md as governance, make sure every rule in it actually changes behavior. This is Checkpoint 0 — we don’t move until everyone’s file is ready.',
        code: {
          kind: 'paste', pasteWhere: 'Claude Code, in your Architect Workspace repo', ccMode: 'Plan Mode',
          label: 'Ready-check',
          code: 'Show me the CLAUDE.md at the root of this repository. Confirm every rule in it is specific and testable, not aspirational. If any rule is vague, propose a sharper version — but do not edit the file yet, just show me the diff.',
          expectedResult: 'Confirmation every rule is specific and testable, or a proposed sharper rewrite of any vague rule. No files touched.',
          stopCondition: 'Claude shows the confirmation or proposed diff and stops.',
          rescue: 'No CLAUDE.md yet, or Claude Code not already running? Open a terminal once: `cd architect-workspace && claude`, then paste this.',
        },
        diagram: `flowchart LR
  FLE["📄 CLAUDE.md"] --> CHK{"🔎 Every rule specific<br/>and testable?"}
  CHK -->|"yes"| GRN["✅ CP0 green"]
  CHK -->|"vague"| SHP["✂️ Claude proposes<br/>a sharper version"]
  SHP --> YOU["👤 You decide —<br/>no file edited yet"]`,
        script: 'Wait for the pulse rail to fill with “I’m here.” Call the number out loud: “18 of 22 — three more.”',
      },
      {
        segment: 'guided-build', eyebrow: '🔍 CP1 — governance gate', title: 'Claude reads before it writes',
        body: 'Claude reads your CLAUDE.md in full, inspects the repo without touching it, then goes and finds what you’re actually building — a requirements doc, a Project Builder output, a README. It does not invent your product. This loads the right context before a single folder is proposed.',
        code: {
          kind: 'paste', pasteWhere: 'Claude Code', ccMode: 'Plan Mode',
          label: 'Governance gate',
          code: 'Read the entire root CLAUDE.md and follow any session-start or verification protocol it requires. Inspect this repository without modifying anything. Then locate my project’s definition — a requirements doc, Project Builder output, README, or brief describing what I’m building (if you can’t find one, stop and ask me where it is — do not invent the product). Summarize: what the project is, who it serves, the primary problem it solves, the tech stack, the CLAUDE.md rules that affect structure, and any protected, legacy, generated, or read-only locations. Do not create or modify any files.',
          expectedResult: 'A summary of your project and its governing rules, including any protected/legacy areas. Zero files touched.',
          stopCondition: 'Claude finishes the summary. If it stops and asks for your project brief instead, go find it — don’t skip this.',
          rescue: 'No requirements doc exists yet? Point Claude at whatever you have — even a paragraph counts. It must not invent your product.',
        },
        diagram: `flowchart LR
  RDF["📖 Read CLAUDE.md<br/>in full"] --> INS["🔍 Inspect the repo,<br/>touch nothing"]
  INS --> DEF["📋 Find YOUR project<br/>definition"]
  DEF --> FND{"❓ Found it?"}
  FND -->|"no"| ASK["🙋 Stop and ask.<br/>Never invent the product."]
  FND -->|"yes"| SUM["🧾 Summary + the<br/>protected areas"]`,
        script: 'Narrate why: “We’re spending context on governance now so Claude can’t wander later.”',
      },
      {
        segment: 'guided-build', eyebrow: '📐 CP2 — architecture proposal', title: 'A folder tree, traced back to your rules — then you challenge it',
        body: 'Claude proposes a personalized architecture: every folder justified by a rule or requirement, tagged NOW/LATER/PROTECTED/etc., with a traceability table and the recommended home for your first Week 3 component. It stops and waits — ARCHITECTURE APPROVAL REQUIRED. As a class: what belongs in this folder? What must never go here? Which folder is protected? Only once you’re satisfied do you type the approval.',
        code: {
          kind: 'paste', pasteWhere: 'Claude Code', ccMode: 'Plan Mode',
          label: 'Propose + approve',
          code: 'Propose a personalized folder-tree architecture for this project. For every top-level folder, give: its purpose, what belongs there, what must never go there, the CLAUDE.md rule or requirement that supports it, whether it’s needed NOW/LATER/EXISTING/GENERATED/LEGACY/DO-NOT-TOUCH, and how it will be verified. Only include a folder if my requirements, my stack, an existing convention, or a CLAUDE.md rule supports it. Include a traceability table, your assumptions, and the recommended home for my first Week 3 component. Do not create anything yet. End with: ARCHITECTURE APPROVAL REQUIRED.',
          expectedResult: 'A folder tree, a rule-to-architecture traceability table, and the line ARCHITECTURE APPROVAL REQUIRED. No files created.',
          stopCondition: 'Claude prints ARCHITECTURE APPROVAL REQUIRED and waits. Discuss it as a class before anyone types the approval.',
          rescue: 'Proposal missing a rule or looks wrong? Point out the gap and ask it to re-propose before you approve anything.',
        },
        diagram: `flowchart TD
  TRE["📐 Proposed<br/>folder tree"] --> TRC["🔗 Every folder traced<br/>to a rule"]
  TRC --> TAG["🏷️ NOW · LATER ·<br/>PROTECTED"]
  TAG --> WAIT["🛑 ARCHITECTURE<br/>APPROVAL REQUIRED"]
  WAIT --> CLS["🗣️ The class<br/>challenges it"]
  CLS --> APR["✅ APPROVE<br/>FOUNDATION"]`,
        script: 'This is the main build footage. Zoom in on the traceability table. Read one folder’s justification out loud, then have the room shout APPROVE FOUNDATION together before anyone types it.',
      },
      {
        segment: 'guided-build', eyebrow: '🏗️ CP3 — approved foundation', title: 'Structure and docs only — never product code',
        body: 'Once approved, Claude creates ONLY what was approved: the folders, a short README in each explaining its purpose, the full architecture doc, and updated progress tracking. No feature code. No installed dependencies. This is the discipline that keeps 20+ different personalized repos all trustworthy.',
        code: {
          kind: 'paste', pasteWhere: 'Claude Code', ccMode: 'Auto',
          label: 'Build the foundation',
          code: 'APPROVE FOUNDATION. Create only the approved structure — preserve all existing work, and do not touch protected, generated, legacy, or read-only locations. Do not build product features and do not install any dependencies. Add a short README to each new major folder. Then write the full architecture documentation and update progress tracking exactly as CLAUDE.md requires.',
          expectedResult: 'The approved folders exist, each with a short README, plus an architecture doc and updated progress tracking — no product code, no installed packages.',
          stopCondition: 'Claude reports the structure created and shows the new files it wrote.',
          rescue: 'Did it touch a protected/legacy folder or install something? Stop it, point to the exact CLAUDE.md rule it broke, and have it undo that part.',
        },
        diagram: `flowchart LR
  APR["✅ APPROVE<br/>FOUNDATION"] --> FLD["📁 Only the<br/>approved folders"]
  APR --> RDM["📄 A short README<br/>in each one"]
  APR --> DOC["📚 Architecture doc<br/>+ progress tracking"]
  NON["🚫 No product code ·<br/>no dependencies"] -.-> FLD`,
        script: 'Celebrate the folders landing on the pulse rail. “Notice what’s NOT here — no app code yet. That’s next week, on a foundation that’s actually yours.”',
      },
      {
        segment: 'guided-build', eyebrow: '✅ CP4 — validate + report', title: 'Claude audits its own work against your rules',
        body: 'The last step: Claude checks itself — CLAUDE.md unchanged, every folder justified, nothing protected touched, no stray dependencies — and reports a single status line. FOUNDATION VERIFIED means Week 3 starts on solid ground. FOUNDATION BLOCKED is just as valuable — it means governance caught something before it became a real problem.',
        code: {
          kind: 'paste', pasteWhere: 'Claude Code', ccMode: 'Auto',
          label: 'Validate + report',
          code: 'Audit the foundation you just created. Verify: CLAUDE.md is unchanged, every new folder has a documented responsibility, no implementation code or dependencies were added, no protected or generated location was touched, and progress tracking was updated. Show the final folder tree and the recommended first Week 3 implementation task. End with exactly one line: FOUNDATION VERIFIED — READY FOR WEEK 3, or FOUNDATION BLOCKED — ACTION REQUIRED.',
          expectedResult: 'A validation report ending in exactly FOUNDATION VERIFIED — READY FOR WEEK 3 (or a named blocker).',
          stopCondition: 'Claude prints the final status line.',
          rescue: 'Got FOUNDATION BLOCKED? That’s a correct, valuable outcome — read the blocker with Claude and fix it together; don’t force past it.',
        },
        diagram: `flowchart LR
  BLT["🏗️ What Claude<br/>just built"] --> AUD["🔎 It audits<br/>its own work"]
  AUD --> AGN{"⚖️ Against your<br/>CLAUDE.md"}
  AGN -->|"clean"| VER["✅ FOUNDATION<br/>VERIFIED"]
  AGN -->|"gap found"| BLK["🚧 FOUNDATION<br/>BLOCKED"]
  BLK --> CGT["🎁 Governance caught it<br/>before it cost you"]`,
        script: 'Celebrate CP4 on the pulse rail. “Everyone who just got VERIFIED — that’s a foundation you can build Week 3 on with zero cleanup.”',
      },

      /* ============================== failure ============================= */
      {
        segment: 'failure', eyebrow: '💥 Break it on purpose', title: 'The proposal that reaches into a protected folder',
        body: 'Ask Claude to scaffold before it has fully read CLAUDE.md’s protected and legacy areas. Watch it propose writing into a DO-NOT-TOUCH or legacy folder anyway — confidently, with a plausible-sounding reason. This is the most common governance mistake in the wild — do not rescue it yet.',
        code: {
          kind: 'paste', pasteWhere: 'Claude Code',
          label: 'The unchecked proposal',
          code: 'Propose a folder structure for this project. (Deliberately skip telling it to check CLAUDE.md’s protected/legacy areas first.)',
          expectedResult: 'A confident, reasonable-looking proposal that reaches somewhere it was never allowed to go — and no warning of any kind.',
          stopCondition: 'You can point at the line in its proposal that breaks one of your own rules. Do not fix it yet.',
        },
        diagram: `flowchart LR
  SKP["⏭️ Scaffold before<br/>reading the rules"] --> PRP["📐 A confident<br/>proposal"]
  PRP --> DNT["🚫 Reaches into a<br/>DO-NOT-TOUCH folder"]
  DNT --> RSN["🙂 With a plausible<br/>sounding reason"]
  RSN --> QUI["😐 Nothing errors.<br/>Nothing warns you."]`,
        script: 'Let it fail visibly. This controlled failure is the highest-retention moment of the class — sit in it for a beat.',
      },
      {
        segment: 'failure', eyebrow: '🔧 Fix it like an architect', title: 'Point back to the rule it missed',
        body: 'An architect never approves a plan without checking it against governance first: point Claude back to the exact CLAUDE.md rule it missed — the protected path, the legacy boundary — and have it re-propose. This is exactly what CP4 validation exists to catch before real damage is done. The lesson generalizes: a proposal is a plan, not permission to act.',
        code: {
          kind: 'paste', pasteWhere: 'Claude Code',
          label: 'The governed re-proposal',
          code: 'You missed the CLAUDE.md rule marking that folder DO-NOT-TOUCH. Re-read CLAUDE.md’s protected/legacy list, then re-propose the architecture respecting it.',
          expectedResult: 'A corrected proposal that leaves the protected area alone — and, usually, an explicit acknowledgement of the rule it missed.',
          stopCondition: 'The new proposal respects every protected and legacy path, and you checked that yourself rather than taking its word.',
          rescue: 'Still reaching into the protected folder? Your rule is not specific enough to bite. Quote the exact path in the rule and try again — that is a CLAUDE.md defect, not a Claude defect.',
        },
        diagram: `flowchart LR
  MIS["❌ The rule<br/>it missed"] --> PNT["👉 Point at the exact<br/>CLAUDE.md line"]
  PNT --> REP["🔁 Re-propose,<br/>respecting it"]
  REP --> GOV["✅ A governed<br/>structure"]
  GOV --> LSN["🧠 A proposal is a plan,<br/>not permission to act"]`,
        script: 'Land the generalization: “This is the entire program in miniature — governance in, trustworthy foundation out.”',
      },
    ],

    beforeAfter: {
      label: 'The foundation changed',
      before: [
        'Copy a generic starter folder structure',
        'Hope it fits your project',
        'Start coding immediately',
        'Find out later a folder was wrong',
        'Nobody could say why any folder existed',
      ],
      after: [
        'Claude reads CLAUDE.md + your project brief',
        'Proposes a personalized, traced architecture',
        'You approve before anything is created',
        'The foundation is validated against governance, ready for Week 3',
        'Every folder traces back to a rule you wrote',
      ],
    },

    storyBeats: {
      'result-preview': [
        {
          icon: '🧱', tone: 'violet', eyebrow: 'Before you build — what you are actually making',
          title: 'Nobody ever praises a foundation. They only ever notice a bad one.',
          body: 'A foundation is the one part of a building that gets no photographs, no compliments, and no attention at all — right up until a door stops closing properly on the second floor two years later, and somebody has to explain that the problem is not the door. That is what tonight is. What you create in the next two hours will be invisible for eleven weeks, and then, in Week 12, it will either be the reason your system was easy to extend or the reason it was not.',
          punch: 'You are not making folders tonight. You are deciding how hard the next eleven weeks are going to be.',
        },
      ],
      'build-map': [
        {
          icon: '🗺️', tone: 'leaf', eyebrow: 'Why we approve before we create',
          title: 'The surveyor walks the land before anyone brings a shovel',
          body: 'On any site worth building on, somebody walks the ground first: where the water goes, where the rock is, which corner belongs to the neighbour. It is slow, it produces nothing you can photograph, and every single person on the crew would rather be digging. It also happens to be the only part of the process that is genuinely irreversible if you get it wrong, because the shovel does not un-dig. Tonight the walk is CP1 and CP2, and the shovel does not come out until you say the words.',
          punch: 'The approval gate is not ceremony. It is the last moment where changing your mind is free.',
        },
      ],
      failure: [
        {
          icon: '🐉', tone: 'cherry', eyebrow: 'The dragon, as promised — here it is on your own screen',
          title: 'It did not hesitate, it did not warn you, and its reason sounded better than yours',
          body: 'On Monday you were told the dragon does not fail loudly, it fails confidently. You just watched it happen on your own machine, in your own repo, with a folder you personally marked as off-limits. It was not confused and it was not broken. It was given a fuzzy goal and enough permission to fill in the gap itself, and it filled it in with something entirely reasonable that happened to be against your rules.',
          punch: 'The scary version of this is not the one that crashes. It is the one that sounds right.',
        },
        {
          icon: '🖐️', tone: 'amber', eyebrow: 'The moment that just made you the architect',
          title: 'You read a plan, found the thing that was wrong with it, and said no',
          body: 'That sounds small and it is not. Ninety seconds ago a competent, fast, confident engineer handed you a proposal, and you did not accept it — you checked it against a standard you had written down in advance, found the line that broke it, and sent it back. That is not a Claude Code skill. It is the job. Every week from here just widens what the plan covers, and the reading and the saying-no stay exactly the same.',
          punch: 'Directing an engineer is mostly this: knowing what you asked for well enough to notice when you did not get it.',
        },
      ],
    },

    extraInteractions: [
      {
        segment: 'result-preview', kind: 'poll',
        q: 'What is the actual test that tonight worked?',
        options: [
          'The folder tree looks professional',
          'Every folder traces back to a rule or a requirement',
          'There are a lot of folders',
          'Claude finished without any errors',
        ],
        answer: 1,
        reveal: 'Traceability. A tree that looks professional but that nobody can justify is a template somebody copied, and by Week 5 it is full of things that do not belong anywhere else. If you cannot say which rule put a folder there, that folder is a guess wearing a nice font.',
        eyebrow: '🎯 Set the bar', title: 'How will you know tonight worked?',
        presenterTip: 'Take answers first — “no errors” gets picked and deserves a serious response, because a clean run that produced an unjustifiable structure is exactly the failure we are guarding against tonight. Then tell them the traceability table is coming at CP2 so they build toward it.',
      },
      {
        segment: 'readiness', kind: 'poll',
        q: 'Three-point check — where are you?',
        options: [
          '✅ All three: CLAUDE.md, project brief, Claude Code running',
          '📄 No project brief or requirements doc yet',
          '📝 CLAUDE.md is missing or still vague',
          '😵 Claude Code is not running — I need help now',
        ],
        eyebrow: '🚦 Roll call', title: 'Before anybody proposes anything',
        presenterTip: 'Operational. Read the counts out loud and send mentors to the last option immediately — do not begin the guided build with anyone still installing. The second option is the most common and the least alarming: a single honest paragraph about what they are building counts as a brief, and telling them that out loud unblocks half of them on the spot.',
      },
      {
        segment: 'build-map', kind: 'prediction',
        q: 'Five checkpoints tonight. Which one do you think will be the hardest for you?',
        options: [
          'CP0 — making my rules specific enough',
          'CP2 — challenging the proposal instead of just approving it',
          'CP3 — keeping it to structure only, no code',
          'CP4 — reading the audit honestly',
        ],
        eyebrow: '🔮 Call it now', title: 'Which checkpoint gets you?',
        presenterTip: 'A prediction, not a test — the value is that they commit before they find out, and you can call back to the spread at the end of the night. In most rooms CP2 wins and it is the right answer: approving a plan is comfortable, challenging one in front of everybody is not. Say that out loud when you read the votes.',
      },
      {
        segment: 'guided-build', kind: 'poll',
        q: 'Claude’s proposal includes a folder you do not recognise and cannot trace to any rule. What do you do?',
        options: [
          'Approve it — Claude probably knows a convention I do not',
          'Delete it manually after the foundation is built',
          'Ask which rule or requirement put it there before approving anything',
          'Rewrite CLAUDE.md so the folder is justified',
        ],
        answer: 2,
        reveal: 'Ask. Every folder is a promise about where things belong, so an unexplained one is a promise nobody made — and the answer is genuinely useful either way: sometimes it names a real requirement you forgot, and sometimes it names a generic template you did not want. Approving first and deleting later is how the tree and the rules quietly stop matching.',
        eyebrow: '🔎 Diagnose it', title: 'A folder you cannot explain',
        presenterTip: 'Fires right when the proposals land, when several people are looking at exactly this. Take answers, reveal, then make it real: have one student ask Claude that question live about a folder in their own proposal and read the reply to the room. It is the fastest possible demonstration that challenging a plan costs nothing.',
      },
      {
        segment: 'guided-build', kind: 'poll',
        q: 'Where are you in the build?',
        options: [
          '0️⃣ CP0 — sharpening my rules',
          '1️⃣ CP1 — governance gate running',
          '2️⃣ CP2 — reading the proposal',
          '3️⃣ CP3 or CP4 — building or validating',
        ],
        eyebrow: '🚦 Build check', title: 'Checkpoint roll call',
        presenterTip: 'Operational. Call the numbers out loud. If the room is bunched at CP2, that is correct and you should not accelerate past it — CP2 is where the whole night is won, and the checkpoints after it are mechanical by comparison. Anyone still at CP0 after fifteen minutes gets a mentor, not encouragement.',
      },
      {
        segment: 'failure', kind: 'poll',
        theater: true,
        q: 'Claude proposes writing into the folder your CLAUDE.md marked DO-NOT-TOUCH, and its reason genuinely sounds good. What do you do?',
        options: [
          'Approve it — the reasoning is sound',
          'Approve it and clean up afterwards',
          'Point it back at the exact rule and make it re-propose',
          'Delete the rule, since it clearly gets in the way',
        ],
        answer: 2,
        reveal: 'Re-propose. The whole point of writing the rule down in advance was that you were calm when you wrote it and you are under time pressure now. A good-sounding reason at 7:40 PM on a Thursday is exactly the thing rules exist to survive — and if the rule really is wrong, that is a separate, deliberate decision made outside the build.',
        eyebrow: '🐉 The dragon speaks well', title: 'Its reason sounds better than your rule',
        presenterTip: 'Full-screen theater moment — lock the votes before revealing. The last option always gets a few votes and deserves to be taken seriously rather than laughed at: sometimes the rule IS wrong. Then make the distinction that matters — changing a rule on purpose is governance, changing it because it is currently inconvenient is how governance dies.',
      },
      {
        segment: 'failure', kind: 'trivia',
        q: 'Your CP4 audit comes back FOUNDATION BLOCKED. How bad is that?',
        options: [
          'Bad — you failed the build',
          'Good — the audit caught something before it cost you anything',
          'Neutral — just re-run it until it passes',
          'Bad — it means CLAUDE.md is broken',
        ],
        answer: 1,
        reveal: 'BLOCKED is the system working. The alternative is not “no problem” — it is the same problem, undetected, sitting in your foundation until Week 5 when something built on top of it starts behaving strangely. A gate that never blocks anything is not protecting you; it is just not looking.',
        eyebrow: '🚧 Reframe it', title: 'BLOCKED. Good or bad?',
        presenterTip: 'Ask for a show of hands from anyone who got BLOCKED before you reveal, and thank them out loud — genuinely, not as a bit. Week 1 is where students learn whether it is safe to report a failure in this room, and how you handle this exact moment decides that for the next eleven weeks.',
      },
      {
        segment: 'demos', kind: 'poll',
        q: 'Honestly — could you explain your folder tree to a colleague right now, folder by folder?',
        options: [
          '✅ Yes, every folder, with the rule behind it',
          '🤏 Most of them',
          '🙃 I approved it faster than I read it',
          '⏳ Still building',
        ],
        eyebrow: '🌡️ Honest self-check', title: 'Can you defend your own tree?',
        presenterTip: 'No wrong answer, and the third option is the most valuable thing anyone can say tonight — thank whoever picks it, because it is the single most common way a foundation goes wrong and almost nobody admits it. Then give them the ninety-second fix: pick the folder you understand least and ask Claude which rule put it there.',
      },
    ],
  },
};
