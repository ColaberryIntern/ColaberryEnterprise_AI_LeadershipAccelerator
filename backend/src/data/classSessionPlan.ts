/**
 * classSessionPlan.ts — the canonical per-class content spine for the AI Systems
 * Architect Accelerator live sessions ("AI Architect Today · Learn It Monday /
 * Build It Thursday").
 *
 * This file is the single source of truth that BOTH of these consume:
 *   1. The session-content writer (scripts/updateClassSessionContent.ts) — sets
 *      each live_session's title, description, and kit_json.
 *   2. The Class Kit deck builder (services/classKit/*) — turns each class into
 *      an interactive, Open-House-style teaching deck with a live pace tracker.
 *
 * Design: the run-of-show TIMING structure is templated per day kind (Architecture
 * Day / Build Day / Orientation) in services/classKit/runOfShow.ts — identical
 * every week, straight from AI_BUILD_SHOW_STRATEGY.md §3/§4. The CONTENT below
 * fills that structure per week, grounded in data/weekBlueprints.ts (purpose,
 * objectives, evidence, github deliverables, risk_areas) and the 12-week show
 * slate (AI_BUILD_SHOW_STRATEGY.md §6). Templated timing + blueprint-driven
 * content = consistent show format, authentic per-week substance.
 *
 * Dependency-free (inline types, pure data) so it type-checks and unit-tests in
 * isolation, exactly like data/weekBlueprints.ts.
 *
 * Naming contract (matches the curriculum blueprint titles the admin dropdown
 * shows, per Ali 2026-07-21): a week's two sessions are titled
 *   "Week N · Architecture Day — <Blueprint Title>"  (Monday)
 *   "Week N · Build Day — <Blueprint Title>"          (Thursday)
 * so getSessionCurriculum's /Week\s+(\d+)/ parse still resolves the blueprint.
 */

export type DayKind = 'orientation' | 'architecture' | 'build';
export type InteractionKind = 'prediction' | 'poll' | 'trivia';

export interface Interaction {
  kind: InteractionKind;
  q: string;
  options: string[];
  /** Index of the correct option for `trivia`; omitted for opinion polls/predictions. */
  answer?: number;
  /** One line the instructor reads on reveal. */
  reveal?: string;
  /** Render as a full-screen "Live Decision Theater" moment (voting badge, live
   * count, locked vote, animated reveal) instead of the compact inline treatment.
   * Use sparingly — a handful of times per class, for decisions worth stopping for. */
  theater?: boolean;
}

export interface BuildCheckpoint {
  n: number; // 0..3
  label: string;
  detail: string;
}

/** A visual "change of pace" story/teaching-moment slide — icon + narrative,
 * for metaphors, real-world examples, and the human stakes behind the tool.
 * Code-rendered (large emoji + color), not a photo — no image pipeline exists. */
export interface StoryBeat {
  icon: string;             // large emoji anchor
  eyebrow: string;
  title: string;
  body: string;             // 2-4 sentences, the story itself
  punch?: string;           // optional closing one-liner, styled distinctly
  tone?: 'cherry' | 'berry' | 'amber' | 'leaf' | 'violet';
}

/** Optional "Build Bay" metadata for a coding prompt. All fields are optional —
 * a prompt with none of them still renders (generic paste target + a fallback
 * rescue line), so this degrades gracefully on the hundreds of existing prompts
 * authored before this model existed. Populate real values for flagship weeks. */
export interface BuildBayMeta {
  /** Where the prompt gets pasted. Defaults to "Claude Code" at render time. */
  pasteWhere?: string;
  /** e.g. "Plan Mode" | "Manual" | "Auto" — omitted (no chip) if not set. */
  ccMode?: string;
  /** "YOU SHOULD SEE" — omitted if not set. */
  expectedResult?: string;
  /** "STOP WHEN" — omitted if not set. */
  stopCondition?: string;
  /** "IF YOU GET STUCK" — falls back to a generic line at render time if not set. */
  rescue?: string;
}

export interface ClassPrompt extends BuildBayMeta {
  label: string;
  /** The copy-ready Claude Code prompt the instructor pastes on screen. */
  prompt: string;
}

export interface WeekClassContent {
  week: number;
  /** Blueprint title — the "section name" that must match the curriculum. */
  title: string;
  intensive: string;
  /** YouTube title direction (result-first), from the show slate. */
  publicTitle: string;

  monday: {
    /** The business tension — why this matters beyond the tool. */
    tension: string;
    /** Cold-open payoff: what will exist by Thursday. */
    payoffPreview: string;
    /** 3–5 architecture story beats (diagram, components, risks, decisions). */
    architectureBeats: string[];
    /** Deconstruct a real example — what works and what fails. */
    realExample: string;
    /** Guided micro-build: the first component students start on Monday. */
    microBuild: string;
    /** Architecture challenge — students choose between design options. */
    designChoice: Interaction;
    /** Knowledge-check trivia. */
    trivia: Interaction;
    /** Open loop into Thursday. */
    thursdayTrailer: string;
    /** Optional Story Mode cold-open — a single-statement full-screen visual hook
     * shown before the business-problem beat. Omit for weeks without one authored. */
    hook?: { headline: string; caption: string };
    /** Optional "change of pace" story beats, inserted right after the named
     * segment's content (segment id -> beats to insert there). Omit for weeks
     * without any authored. */
    storyBeats?: Record<string, StoryBeat[]>;
  };

  thursday: {
    /** Result preview — what students are producing today. */
    resultPreview: string;
    /** Readiness check — the setup that must be true to build along. */
    readinessCheck: string;
    /** Build map — checkpoints + safety rules, narrated. */
    buildMap: string[];
    /** Checkpoint branches (CP0 clean → CP3 artifact). */
    checkpoints: BuildCheckpoint[];
    /** Copy-ready Claude Code prompts driven live. */
    prompts: ClassPrompt[];
    /** The authentic failure to inject (drawn from blueprint risk_areas). */
    failureInjection: string;
    /** How an architect diagnoses and recovers from it. */
    recovery: string;
    /** Knowledge-check trivia. */
    trivia: Interaction;
    /** Optional Story Mode before/after comparison, shown before the assignment
     * brief as the transformation payoff. Omit for weeks without one authored. */
    beforeAfter?: { label?: string; before: string[]; after: string[] };
  };

  /** Prove-it-by-Friday: the graded deliverable. */
  assignment: {
    title: string;
    deliverables: string[];
    proof: string;
  };

  /** The week-specific artifact each student names in their 30-sec Builder Broadcast. */
  builderBroadcastFocus: string;
}

/* ========================================================================== */
/*  ORIENTATION — the cohort opener (Thursday, week 0 slot).                   */
/*  1 hr Ali (big picture) + 30 min Taiwo (platform) + 30 min Swati (setup).   */
/* ========================================================================== */

export interface OrientationSegmentSpec {
  presenter: string;
  minutes: number;
  title: string;
  beats: string[];
}

export const ORIENTATION_PLAN: {
  title: string;
  publicTitle: string;
  intensive: string;
  welcome: string;
  segments: OrientationSegmentSpec[];
  designChoice: Interaction;
  trivia: Interaction;
  assignment: { title: string; deliverables: string[]; proof: string };
  storyBeats?: Record<string, StoryBeat[]>;
} = {
  title: 'Orientation — Welcome to the Accelerator',
  publicTitle: 'From AI User to AI Builder — Orientation',
  intensive: 'Kickoff',
  welcome:
    'Welcome to the AI Systems Architect Accelerator. Tonight is the big picture, the platform, and getting your build environment live — you leave able to open Claude Code and start.',
  segments: [
    {
      presenter: 'Ali Muwwakkil',
      minutes: 60,
      title: 'The big picture — from AI user to AI builder',
      beats: [
        'The moment we are in: what the people building AI say is coming, and the gap between AI users and AI builders',
        'Quotes and data: displacement AND creation, the wage premium, the leverage curve (learn it → build it → architect it)',
        'What Colaberry has done: 14 years, careers launched, the Anthropic / Claude Code partnership',
        'How this program works: Learn It Monday, Build It Thursday, Prove It By Friday — one continuous 12-week build, your own idea',
        'What to expect: the platform, live classes, attendance and points, the credential (CCA-F), the portfolio, the free internship lane',
        'The deal: bring your idea, leave with a working, governed AI system you can defend',
      ],
    },
    {
      presenter: 'Taiwo',
      minutes: 30,
      title: 'Your platform — the daily command center',
      beats: [
        'Today: your one feed for the whole program — lessons, project, schedule, community',
        'The Path: your real position on the 12-week road; streaks and points you claim daily',
        'Classroom + Schedule: live sessions with one-click Join, recordings after, countdowns to the next class',
        'Your Project: your idea decomposed into releases, steps, and scheduled tasks with copy-ready prompts',
        'Portfolio + Readiness: everything you build becomes graded, public proof',
      ],
    },
    {
      presenter: 'Swati',
      minutes: 30,
      title: 'Get your build environment live — Claude Code + VS Code',
      beats: [
        'Install VS Code and open the integrated terminal',
        'Install Claude Code and sign in; verify it runs with a first prompt',
        'Clone your Architect Workspace starter repo',
        'Run a first Plan-Mode prompt so you see the agentic loop before Week 1',
        'Troubleshooting stations: anyone not fully set up leaves tonight set up',
      ],
    },
  ],
  designChoice: {
    kind: 'poll',
    q: 'Where are you starting from tonight?',
    options: ['I mostly use AI as a chat tool', 'I automate a few things', 'I write some code', 'I build systems already'],
    reveal: 'Wherever you start, in 12 weeks you leave on the builder side of that line.',
  },
  trivia: {
    kind: 'trivia',
    q: 'What do you leave this program with?',
    options: ['A certificate of attendance', 'A working, governed AI system + CCA-F credential + public portfolio', 'A set of recordings', 'A reading list'],
    answer: 1,
    reveal: 'A defended capstone, the Claude Certified Architect — Foundations credential, and a public portfolio.',
  },
  assignment: {
    title: 'You are set up and oriented',
    deliverables: [
      'Claude Code installed and running (verified with one prompt)',
      'VS Code installed with your Architect Workspace repo cloned',
      'Portal tour completed: found Today, the Path, and your next class',
    ],
    proof: 'A screenshot of Claude Code responding to your first prompt in VS Code.',
  },
  storyBeats: {
    welcome: [
      {
        icon: '🚪', tone: 'amber', eyebrow: 'Right now — the room you are in',
        title: 'Two kinds of people walk into a room like this one',
        body: 'One kind is here to collect information — another framework, another tool, another thing to half-remember by Friday. The other kind is here to leave different than they walked in: with a real system running, a habit of building instead of asking, and proof they can point to. Tonight does not decide which kind of person you are. Week 12 does. Tonight just decides whether you show up for it.',
        punch: 'Nobody in this room is behind yet. That only becomes true if you decide it is.',
      },
    ],
    'big-picture': [
      {
        icon: '🗡️', tone: 'cherry', eyebrow: 'The story behind this room',
        title: 'Every builder starts as an apprentice',
        body: 'In the old story, the hero trains for years before ever facing the dragon. In this one, you face it in week 12 — a real system, live, solving a real problem — and every week between now and then is you learning to hold the sword without cutting yourself. Nobody in this room slays anything alone; the rescue branch exists because the first swing is supposed to miss sometimes.',
        punch: 'You are not here to watch someone else fight it. You are here to fight it yourself, with a net.',
      },
    ],
    platform: [
      {
        icon: '🧗', tone: 'berry', eyebrow: 'Change of pace — the 1% architect',
        title: 'Nobody notices day 3. Everyone notices week 12.',
        body: 'A climber training for a summit does not feel stronger after one workout. She feels the SAME — sore, unsure, checking her form against people ahead of her. But she is 1% better, and 1% compounded for 84 days is not a small number anymore. Your points, your streak, your daily card on Today are not a game layer bolted onto learning. They are the only proof that day 3 mattered, on a day when it will not feel like it did.',
        punch: 'Trust the compounding. The summit is not visible from base camp — that is normal, not a warning sign.',
      },
    ],
    setup: [
      {
        icon: '🌱', tone: 'leaf', eyebrow: 'Before we set up — the locker room talk',
        title: 'Everyone in this room feels behind their first week. That is the baseline, not a red flag.',
        body: 'The people who eventually build the most impressive things almost always describe their first working session the same way: confusing, slower than expected, one small win they almost missed because they were looking for a bigger one. That feeling is not a sign you are in the wrong room. It is what "the unit of work just changed" feels like from the inside, before it feels like anything else.',
        punch: 'Tonight the goal is not mastery. It is one prompt, one plan, one thing that actually ran.',
      },
    ],
  },
};

/* ========================================================================== */
/*  WEEKS 1–12                                                                 */
/* ========================================================================== */

export const WEEK_CLASS_CONTENT: WeekClassContent[] = [
  /* ------------------------------------------------------------------ Week 1 */
  {
    week: 1,
    title: 'Claude Code Foundations + Workspace',
    intensive: 'Intensive 1 · Build Your AI Foundation',
    publicTitle: 'Build Your First Claude Code Workspace the Right Way',
    monday: {
      tension:
        'Most people use Claude like a smarter search box. That is not how companies automate work. Claude Code runs an agentic loop — a context window, tools, and permissions — that reads your repo, plans, edits files, runs commands, and commits.',
      payoffPreview: 'By Thursday you have a working Architect Workspace and a CLAUDE.md that makes Claude carry your project standards for the rest of the program.',
      architectureBeats: [
        'The agentic loop: context window + tools + permissions — what Claude Code can see, do, and is allowed to do',
        'The workflow that scales: explore → plan → code → commit (never skip explore and plan)',
        'Permission modes: Manual (approve each action), Plan (propose then wait), and Auto (run freely) — and when each is safe',
        'Claude Code manages context automatically now — compaction happens in the background, so you focus on direction, not memory management',
        'CLAUDE.md as persistent project memory — Claude reads it every session',
      ],
      realExample: 'Watch one real explore → plan → code → commit loop end to end, then a session where skipping Plan Mode lets Claude edit the wrong area — and what that costs.',
      microBuild: 'Install Claude Code, open the Architect Workspace repo, and run your first Plan-Mode prompt so you see the plan before any file changes.',
      designChoice: {
        kind: 'poll',
        q: 'Your CLAUDE.md is getting long. What earns its place in it?',
        options: ['Everything Claude might ever need', 'Only rules that change how Claude behaves, testably', 'A copy of the README', 'Nothing — keep it empty'],
        reveal: 'A rule belongs in CLAUDE.md only if a change to it changes behavior. Aspirational prose is context bloat.',
        theater: true,
      },
      trivia: {
        kind: 'trivia',
        q: 'What does Plan Mode do?',
        options: ['Auto-accepts every edit', 'Proposes a plan and waits before touching files', 'Clears the context window', 'Commits automatically'],
        answer: 1,
        reveal: 'Plan Mode is your seatbelt: Claude proposes the approach and waits for you before editing.',
      },
      thursdayTrailer: 'Thursday we make Claude follow your standards — we build the Workspace and a CLAUDE.md that actually steers it.',
      hook: {
        headline: 'You gave AI an answer to type. Now it can act.',
        caption: 'The unit of work just changed — from "what should I do" to "do it, and show me it worked."',
      },
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
            body: 'A support agent pastes a customer\'s error into a chatbot, gets a correct three-step fix, and then does what every chatbot user does next: copies it, opens four different internal tools by hand, retypes half of it because the formatting broke, and finally closes the ticket — three hours after the "answer" arrived. The chatbot was never the bottleneck. The eight manual handoffs after it were.',
            punch: 'An agent does not just answer the ticket. It opens the tools, makes the change, and closes the loop.',
          },
        ],
        architecture: [
          {
            icon: '✈️', tone: 'violet', eyebrow: 'Change of pace — the pilot\'s three hands',
            title: 'Manual, Plan, and Auto are not settings. They are how much you trust the runway.',
            body: 'A pilot hand-flies through a crowded pattern near the ground, engages autopilot to propose the cruise route and waits for a nod before committing to it, and only lets the plane fly itself hands-off over open, familiar sky. Nobody argues about which mode is "best" — the terrain decides. A vague CLAUDE.md rule in Auto mode is flying blind through the pattern.',
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
      },
    },
    thursday: {
      resultPreview: 'A governed project foundation — folder structure, docs, and progress tracking — traced back to your own CLAUDE.md and your project requirements, approved by you before Claude created a single folder, and validated as ready for the first component you build in Week 3.',
      readinessCheck: 'Your CLAUDE.md and a project brief/requirements doc (Project Builder output, a README, or wherever you defined what you\'re building) both present in the repo; Claude Code running.',
      buildMap: [
        'CP0: CLAUDE.md confirmed specific and testable',
        'CP1: governance verified — rules read, project brief located',
        'CP2: architecture proposed, challenged, and approved',
        'CP3: foundation built — structure + docs only, no product code',
        'CP4: foundation validated — ready for Week 3',
      ],
      checkpoints: [
        { n: 0, label: 'CLAUDE.md ready', detail: 'Every rule in your CLAUDE.md is specific and testable, not aspirational.' },
        { n: 1, label: 'Governance verified', detail: 'Claude has read CLAUDE.md in full and located your project brief — it does not invent the product.' },
        { n: 2, label: 'Architecture approved', detail: 'A personalized folder tree + rule-to-architecture traceability table, challenged by you, then approved with APPROVE FOUNDATION.' },
        { n: 3, label: 'Foundation built', detail: 'Only the approved structure, per-folder READMEs, and an architecture doc created — zero product code, zero dependencies.' },
        { n: 4, label: 'Foundation validated', detail: 'Claude audits itself against CLAUDE.md and reports FOUNDATION VERIFIED — READY FOR WEEK 3.' },
      ],
      prompts: [
        {
          label: 'CLAUDE.md ready-check', prompt: 'Show me the CLAUDE.md at the root of this repository. Confirm every rule in it is specific and testable, not aspirational. If any rule is vague, propose a sharper version — but do not edit the file yet, just show me the diff.',
          pasteWhere: 'Claude Code, in your Architect Workspace repo', ccMode: 'Plan Mode',
          expectedResult: 'Confirmation every rule is specific and testable, or a proposed sharper rewrite of any vague rule. No files touched.',
          stopCondition: 'Claude shows the confirmation or proposed diff and stops.',
          rescue: 'No CLAUDE.md yet, or Claude Code not already running? Open a terminal once: `cd architect-workspace && claude`, then paste this.',
        },
        {
          label: 'Governance gate', prompt: 'Read the entire root CLAUDE.md and follow any session-start or verification protocol it requires. Inspect this repository without modifying anything. Then locate my project\'s definition — a requirements doc, Project Builder output, README, or brief describing what I\'m building (if you can\'t find one, stop and ask me where it is — do not invent the product). Summarize: what the project is, who it serves, the primary problem it solves, the tech stack, the CLAUDE.md rules that affect structure, and any protected, legacy, generated, or read-only locations. Do not create or modify any files.',
          pasteWhere: 'Claude Code', ccMode: 'Plan Mode',
          expectedResult: 'A summary of your project and its governing rules, including any protected/legacy areas. Zero files touched.',
          stopCondition: 'Claude finishes the summary. If it stops and asks for your project brief instead, go find it — don\'t skip this.',
          rescue: 'No requirements doc exists yet? Point Claude at whatever you have — even a paragraph counts. It must not invent your product.',
        },
        {
          label: 'Architecture proposal', prompt: 'Propose a personalized folder-tree architecture for this project. For every top-level folder, give: its purpose, what belongs there, what must never go there, the CLAUDE.md rule or requirement that supports it, whether it\'s needed NOW/LATER/EXISTING/GENERATED/LEGACY/DO-NOT-TOUCH, and how it will be verified. Only include a folder if my requirements, my stack, an existing convention, or a CLAUDE.md rule supports it — do not copy a generic template. Include a rule-to-architecture traceability table, your assumptions, decisions that need my approval, and the recommended home for my first Week 3 component. Do not create anything yet. End with: ARCHITECTURE APPROVAL REQUIRED.',
          pasteWhere: 'Claude Code', ccMode: 'Plan Mode',
          expectedResult: 'A folder tree, a rule-to-architecture traceability table, and the line ARCHITECTURE APPROVAL REQUIRED. No files created.',
          stopCondition: 'Claude prints ARCHITECTURE APPROVAL REQUIRED and waits. Discuss it as a class — which folder holds the first Week 3 component? what\'s protected? what\'s needed now vs. later? — then type: APPROVE FOUNDATION',
          rescue: 'Proposal missing a rule or looks wrong? Point out the gap and ask it to re-propose before you approve anything.',
        },
        {
          label: 'Approved foundation build', prompt: 'APPROVE FOUNDATION. Create only the approved structure — preserve all existing work, and do not touch protected, generated, legacy, or read-only locations. Do not build product features and do not install any dependencies. Add a short README to each new major folder explaining why it exists, what belongs there, what doesn\'t, and how it will eventually be tested. Then write the full architecture documentation (purpose, principles, folder tree, component responsibilities, rule-to-structure traceability, testing strategy, security boundaries, protected locations, deferred folders, first Week 3 build target, assumptions and risks) in the documentation location CLAUDE.md requires, and update progress tracking exactly as CLAUDE.md requires.',
          pasteWhere: 'Claude Code', ccMode: 'Auto',
          expectedResult: 'The approved folders exist, each with a short README, plus an architecture doc and updated progress tracking — no product code, no installed packages.',
          stopCondition: 'Claude reports the structure created and shows the new files it wrote.',
          rescue: 'Did it touch a protected/legacy folder or install something? Stop it, point to the exact CLAUDE.md rule it broke, and have it undo that part.',
        },
        {
          label: 'Validate + report', prompt: 'Audit the foundation you just created. Verify: CLAUDE.md is unchanged, every new folder has a documented responsibility with no conflicts, no implementation code or dependencies were added, no secrets exist, no protected or generated location was touched, and progress tracking was updated. Show the final folder tree, files created, files deliberately not created, which rules drove each decision, and the recommended first Week 3 implementation task. Write a short foundation report. End with exactly one line: FOUNDATION VERIFIED — READY FOR WEEK 3, or FOUNDATION BLOCKED — ACTION REQUIRED with the blocker.',
          pasteWhere: 'Claude Code', ccMode: 'Auto',
          expectedResult: 'A validation report ending in exactly FOUNDATION VERIFIED — READY FOR WEEK 3 (or a named blocker).',
          stopCondition: 'Claude prints the final status line.',
          rescue: 'Got FOUNDATION BLOCKED? That\'s a correct, valuable outcome — read the blocker with Claude and fix it together; don\'t force past it.',
        },
      ],
      failureInjection: 'Ask Claude to scaffold before it has fully read CLAUDE.md\'s protected/legacy areas — watch it propose creating files inside a DO-NOT-TOUCH or legacy folder.',
      recovery: 'An architect never approves a plan without checking it against governance first: point Claude back to the specific CLAUDE.md rule it missed and have it re-propose. This is exactly what CP4 validation exists to catch before real damage is done.',
      trivia: {
        kind: 'trivia',
        q: 'What has to happen between Claude\'s Architecture Proposal and it actually creating files?',
        options: ['Nothing — it creates immediately', 'You review it and type APPROVE FOUNDATION', 'Claude asks you to rewrite CLAUDE.md', 'It skips straight to Week 3'],
        answer: 1,
        reveal: 'The approval gate is the whole point of CP2 — a proposal is a plan, not permission to act.',
      },
      beforeAfter: {
        label: 'The foundation changed',
        before: ['Copy a generic starter folder structure', 'Hope it fits your project', 'Start coding immediately', 'Find out later a folder was wrong'],
        after: ['Claude reads CLAUDE.md + your project brief', 'Proposes a personalized, traced architecture', 'You approve before anything is created', 'The foundation is validated against governance, ready for Week 3'],
      },
    },
    assignment: {
      title: 'From CLAUDE.md to a Build-Ready Project Foundation',
      deliverables: [
        'Personalized repository tree from Claude\'s approved architecture proposal',
        'Architecture/foundation report + rule-to-architecture traceability table',
        'Screenshot of the VS Code project tree',
        'Screenshot of Claude\'s architecture proposal before approval',
        'GitHub commit showing the foundation',
        'One-paragraph Week 3 build target',
      ],
      proof: 'A short screen recording or GIF walking the approved folder tree, plus the FOUNDATION VERIFIED report.',
    },
    builderBroadcastFocus: 'the governed project foundation traced back to their own CLAUDE.md — and exactly where their first Week 3 component will live',
  },

  /* ------------------------------------------------------------------ Week 2 */
  {
    week: 2,
    title: 'Agent Skills (build 3 skills)',
    intensive: 'Intensive 1 · Build Your AI Foundation',
    publicTitle: 'Teach Claude Once and Reuse It Forever',
    monday: {
      tension:
        'Repeating the same instructions every session does not scale. Agent Skills let you teach Claude a capability once — with a clear description and its own files — and reuse it everywhere, consistently and context-efficiently.',
      payoffPreview: 'By Thursday you have three project-specific Skills that trigger on demand and are shareable across a team.',
      architectureBeats: [
        'What a Skill is, and how it differs from CLAUDE.md, subagents, and MCP',
        'Anatomy: frontmatter + an effective description (the trigger) + the instruction body',
        'Multi-file Skills and scoping tool access to only what the Skill needs',
        'Packaging and sharing Skills across a team or org',
        'Why a vague description is the #1 reason a Skill never fires',
      ],
      realExample: 'Compare two Skills with the same body but different descriptions — one triggers reliably, one never does. The description is the architecture.',
      microBuild: 'Author your first Skill: frontmatter, a sharp description, and a 5-line body. Invoke it once to confirm it triggers.',
      designChoice: {
        kind: 'poll',
        q: 'A task repeats in three places. Skill, CLAUDE.md, or subagent?',
        options: ['CLAUDE.md — always', 'A Skill — reusable, scoped, invocable on demand', 'A subagent — always', 'Copy-paste the prompt each time'],
        answer: 1,
        reveal: 'A repeated, self-contained capability is a Skill. CLAUDE.md is standing context; subagents are for delegated, isolated work.',
      },
      trivia: {
        kind: 'trivia',
        q: 'Your Skill never triggers. First thing to check?',
        options: ['The body length', 'The description — is it specific about when to use it?', 'Your internet', 'The repo name'],
        answer: 1,
        reveal: 'Claude decides to invoke a Skill from its description. Vague description → no trigger.',
      },
      thursdayTrailer: 'Thursday we build three real Skills for your project — and debug one that refuses to fire.',
      storyBeats: {
        checkin: [
          {
            icon: '🔁', tone: 'violet', eyebrow: 'Right now — the room you are in',
            title: 'You just guessed where a repeated task belongs. Almost everyone in this room has typed the same instruction into Claude five times this month without noticing.',
            body: 'That repetition is not a discipline problem — it is a missing Skill. Tonight you will watch the exact moment a copy-pasted instruction turns into something Claude triggers on its own, and by the time you predict-and-reveal again in a few minutes, you will already know which one is right.',
            punch: 'The fifth time you type the same instruction is the signal, not the habit.',
          },
        ],
        'business-problem': [
          {
            icon: '📋', tone: 'berry', eyebrow: 'Change of pace — the onboarding doc nobody reads',
            title: 'Every new hire gets the same 40-minute walkthrough. Nobody remembers slide 30.',
            body: 'A team lead re-explains the deploy checklist to every new engineer, live, from memory, slightly differently each time — because writing it down once felt like overkill for "something everyone just learns." Six months and four hires later, the checklist has never been the same twice, and two of those four hires shipped a bad deploy doing it "their way." The knowledge was never missing. It was never packaged.',
            punch: 'A Skill is not documentation nobody reads. It is documentation Claude actually runs.',
          },
        ],
        architecture: [
          {
            icon: '🔑', tone: 'violet', eyebrow: 'Change of pace — the labeled toolbox',
            title: 'Two toolboxes, same tools inside. One has labels. Guess which one gets used at 2am.',
            body: 'A mechanic with an unlabeled toolbox still has every wrench she needs — she just cannot find the right one under pressure, so she reaches for whatever is closest and makes it work, badly. A Skill with a vague description is the unlabeled drawer: the capability exists, but nothing tells Claude when to reach for it, so it either never fires or fires for the wrong job. The description is not documentation about the Skill. It is the label on the drawer.',
            punch: 'A Skill nobody can find is a Skill that does not exist yet.',
          },
        ],
        deconstruct: [
          {
            icon: '👻', tone: 'cherry', eyebrow: 'Change of pace — the Skill that was technically there',
            title: 'The Skill existed. The instructions were perfect. It never once fired.',
            body: 'A team spent an afternoon writing a beautifully detailed Skill for release notes — multi-step instructions, examples, edge cases, the works — then described it as "helps with releases." Weeks later, nobody could explain why Claude kept ignoring it in favor of generic answers. The body of the Skill was never the problem. Claude was never told, precisely, when "helps with releases" meant THIS.',
            punch: 'A Skill is judged by its trigger, not its prose. Write the description like the whole Skill depends on it — because it does.',
          },
        ],
      },
    },
    thursday: {
      resultPreview: 'Three project-specific Agent Skills committed to your workspace, one of them multi-file with scoped tool access.',
      readinessCheck: 'Your Architect Workspace from Week 1, with a .claude/skills/ folder.',
      buildMap: ['CP0: skills folder ready', 'CP1: first skill triggers', 'CP2: three skills authored', 'CP3: one multi-file, scoped, and shared'],
      checkpoints: [
        { n: 0, label: 'Clean start', detail: '.claude/skills/ exists in your workspace.' },
        { n: 1, label: 'First skill fires', detail: 'One Skill authored and invoking correctly.' },
        { n: 2, label: 'Three skills', detail: 'Three project-specific Skills authored.' },
        { n: 3, label: 'Scoped + shared', detail: 'One multi-file Skill with restricted tool access, committed.' },
      ],
      prompts: [
        { label: 'Scaffold a skill', prompt: 'Create an Agent Skill named "commit-summary" that writes a conventional-commit message from staged changes. Give it a precise description of when to use it.' },
        { label: 'Multi-file skill', prompt: 'Turn the "release-notes" skill into a multi-file Skill: a main instruction file plus a template file, and restrict its tool access to reading files and running git.' },
        { label: 'Debug a trigger', prompt: 'This Skill is not being invoked when I ask for release notes. Diagnose why and fix the description so it triggers reliably.' },
      ],
      failureInjection: 'Author a Skill with a vague description ("helps with git") and show Claude ignoring it.',
      recovery: 'Rewrite the description to name the trigger and the output ("Use when the user asks for a commit message; writes a conventional-commit summary from staged changes"). Re-invoke — it fires.',
      trivia: {
        kind: 'trivia',
        q: 'Best tool-access setting for a Skill that only formats text?',
        options: ['Full access to everything', 'The narrowest scope it needs', 'No tools at all, always', 'Whatever is default'],
        answer: 1,
        reveal: 'Scope tools to the minimum the Skill needs — least privilege is an architecture habit, not a nicety.',
      },
    },
    assignment: {
      title: 'Three reusable Agent Skills',
      deliverables: ['.claude/skills/ with 3 skills committed', 'A README on how to invoke them'],
      proof: 'A short demo invoking each of the three skills.',
    },
    builderBroadcastFocus: 'a Skill that teaches Claude your task once and reuses it forever',
  },

  /* ------------------------------------------------------------------ Week 3 */
  {
    week: 3,
    title: 'Claude API + Workflow Assistant',
    intensive: 'Intensive 1 · Build Your AI Foundation',
    publicTitle: 'Build Your First AI Workflow Assistant',
    monday: {
      tension:
        'A chat window cannot run your business process at 2am. Moving from the CLI to the Claude API turns a conversation into a program: authenticated, multi-turn, structured output, and tool use so Claude can actually act.',
      payoffPreview: 'By Thursday you ship a Business Workflow Assistant — a small program that automates one real workflow end to end. This is your Intensive 1 deliverable.',
      architectureBeats: [
        'From CLI to code: API auth, messages, system prompts, streaming',
        'Structured (JSON) output so downstream code can trust the shape',
        'Tool use: define a tool schema, handle tool-result blocks, run multi-tool turns',
        'Evaluation: a test dataset + a grader, so quality is measured not eyeballed',
        'The Workflow Assistant pattern: input → reason → call tools → structured result',
      ],
      realExample: 'Deconstruct an assistant that works in the demo but has no eval and unbounded tool calls — where it silently breaks in production.',
      microBuild: 'Make your first authenticated API call from code, then add one tool and get structured output back.',
      designChoice: {
        kind: 'poll',
        q: 'Your assistant sometimes returns malformed output. Best fix?',
        options: ['Add more prompt pleading', 'Require structured JSON output and validate it', 'Retry forever', 'Ship it'],
        reveal: 'Ask for structured output and validate at the boundary. Hope is not a parsing strategy.',
      },
      trivia: {
        kind: 'trivia',
        q: 'How do you know a prompt actually improved?',
        options: ['It feels better', 'An eval: a dataset + a grader with a score', 'More tokens', 'A colleague nods'],
        answer: 1,
        reveal: 'An eval turns "feels better" into a number you can defend.',
      },
      thursdayTrailer: 'Thursday we ship the Workflow Assistant — API, tools, structured output, and a real eval.',
    },
    thursday: {
      resultPreview: 'A running Business Workflow Assistant that automates one real workflow, plus a basic eval harness.',
      readinessCheck: 'An API key in your environment (never in source), Python or Node ready, your repo open.',
      buildMap: ['CP0: authenticated call', 'CP1: tool use working', 'CP2: structured output + one workflow', 'CP3: eval harness green'],
      checkpoints: [
        { n: 0, label: 'Authenticated', detail: 'A single API call returns from code.' },
        { n: 1, label: 'Tool use', detail: 'Claude calls one defined tool and you handle the result.' },
        { n: 2, label: 'Workflow', detail: 'The assistant automates one real workflow with structured output.' },
        { n: 3, label: 'Evaluated', detail: 'A dataset + grader scores the assistant.' },
      ],
      prompts: [
        { label: 'API client', prompt: 'Write a minimal Claude API client that sends a system prompt and a user message and prints the response. Read the key from an environment variable, never hardcode it.' },
        { label: 'Add a tool', prompt: 'Add a tool named "lookup_order" with a JSON schema, handle the tool-result turn, and return the final structured answer as JSON.' },
        { label: 'Eval harness', prompt: 'Write an eval script: a small dataset of inputs + expected fields, run the assistant on each, and grade whether the required fields are present and valid.' },
      ],
      failureInjection: 'Hardcode the API key in source (then "accidentally" show it), and let a tool call run unbounded with no error handling.',
      recovery: 'Move the key to an env var, redact it in logs, and wrap the tool call with a timeout, capped retries, and a clear error class. Re-run safely.',
      trivia: {
        kind: 'trivia',
        q: 'Where does an API key belong?',
        options: ['In the source file', 'In an environment variable, never committed', 'In the README', 'In the commit message'],
        answer: 1,
        reveal: 'Secrets live in env vars — never in source, logs, or history.',
      },
    },
    assignment: {
      title: 'Business Workflow Assistant + eval',
      deliverables: ['Repo with API client, tool definitions, eval script, and the Workflow Assistant'],
      proof: 'A demo video of the assistant automating a real workflow.',
    },
    builderBroadcastFocus: 'a Workflow Assistant that automates one real task end to end',
  },

  /* ------------------------------------------------------------------ Week 4 */
  {
    week: 4,
    title: 'Prompt Engineering + Prompt Library',
    intensive: 'Intensive 2 · Create Your AI Team',
    publicTitle: 'The Prompt Library Every AI Team Needs',
    monday: {
      tension:
        'When every teammate writes prompts their own way, enterprise prompting becomes chaos — nothing is reproducible, tested, or shared. The fix is a systematic prompt-engineering ladder and a governed, versioned Prompt Library.',
      payoffPreview: 'By Thursday you have an Enterprise Prompt Library: at least 8 versioned, tested, documented prompts your whole team can rely on.',
      architectureBeats: [
        'The technique ladder: clear & direct → specific → XML/structure → examples → decomposition',
        'Prompt templates with variables for reuse across tasks',
        'Library structure: naming, versioning, metadata, and the workflow each prompt serves',
        'Quality gates: a prompt is "library-ready" only when it passes an eval',
        'Prompts as reusable assets — the foundation for the multi-agent team in Weeks 5–7',
      ],
      realExample: 'Take one weak prompt and walk it up the ladder, scoring each step against an eval — watch the number climb.',
      microBuild: 'Turn one ad-hoc prompt into a versioned template with variables and a tested example.',
      designChoice: {
        kind: 'poll',
        q: 'When is a prompt "library-ready"?',
        options: ['When it works once', 'When it passes an eval and has metadata + a version', 'When it looks long', 'When someone likes it'],
        reveal: 'Library-ready = tested against an eval, versioned, documented. "Worked once" is not a standard.',
      },
      trivia: {
        kind: 'trivia',
        q: 'What makes a prompt reproducible across a team?',
        options: ['Everyone rewrites it', 'A versioned template with variables and a tested example', 'Longer prompts', 'Luck'],
        answer: 1,
        reveal: 'A versioned template with a tested example is what makes a prompt an asset instead of a one-off.',
      },
      thursdayTrailer: 'Thursday we build the library — 8+ versioned prompts with tests and a "library-ready" standard.',
    },
    thursday: {
      resultPreview: 'An Enterprise Prompt Library with 8+ versioned, documented prompts, each with a tested example and metadata.',
      readinessCheck: 'Your repo open with a prompts/ folder and your Week 3 eval pattern handy.',
      buildMap: ['CP0: prompts/ scaffold', 'CP1: first versioned template', 'CP2: 8 prompts with metadata', 'CP3: standard doc + eval gate'],
      checkpoints: [
        { n: 0, label: 'Scaffold', detail: 'prompts/ folder with a template format chosen.' },
        { n: 1, label: 'First template', detail: 'One versioned prompt template with variables + a tested example.' },
        { n: 2, label: 'Eight prompts', detail: '8+ prompts, each with metadata and a workflow mapping.' },
        { n: 3, label: 'Governed', detail: 'A written "library-ready" standard and an eval gate.' },
      ],
      prompts: [
        { label: 'Templatize', prompt: 'Turn this prompt into a reusable template: extract variables, add an XML structure, and include one worked example.' },
        { label: 'Add metadata', prompt: 'For each prompt in prompts/, add front-matter: name, version, purpose, the workflow it serves, and its last eval score.' },
        { label: 'Library standard', prompt: 'Write a CONTRIBUTING doc defining exactly what makes a prompt "library-ready" (tested example, version, metadata, passing eval).' },
      ],
      failureInjection: 'Add a prompt with no version and no test that "works on my machine," then change the model and watch it drift.',
      recovery: 'Gate it: no prompt enters the library without a version, metadata, and a passing eval example. Re-add it the right way.',
      trivia: {
        kind: 'trivia',
        q: 'Why version prompts?',
        options: ['To look organized', 'So changes are traceable and the library does not silently rot', 'For fun', 'It is required by law'],
        answer: 1,
        reveal: 'Versioning makes prompt changes traceable — the difference between a library and a junk drawer.',
      },
    },
    assignment: {
      title: 'Enterprise Prompt Library',
      deliverables: ['prompts/ library with 8+ versioned templates', 'A CONTRIBUTING/standard doc'],
      proof: 'A before/after of one prompt with its eval scores.',
    },
    builderBroadcastFocus: 'a versioned, tested Prompt Library your whole team can reuse',
  },

  /* ------------------------------------------------------------------ Week 5 */
  {
    week: 5,
    title: 'MCP Foundations + First MCP Server',
    intensive: 'Intensive 2 · Create Your AI Team',
    publicTitle: 'Build Your First MCP Server With Claude',
    monday: {
      tension:
        'AI is only as useful as what it can reach. MCP (Model Context Protocol) moves tool definition and execution off your app onto specialized servers — the standard way to connect AI to real tools and data.',
      payoffPreview: 'By Thursday you have your first MCP server exposing a real capability, verified in the inspector and called by a client.',
      architectureBeats: [
        'MCP architecture: how it shifts tool definition/execution to specialized servers',
        'The three primitives — tools, resources, prompts — and when to use each',
        'Building a server with the SDK; resources with proper MIME types',
        'Testing and debugging with the MCP inspector',
        'Connecting a client to your server',
      ],
      realExample: 'Look at a server that confuses tools with resources — and why the client cannot use it correctly.',
      microBuild: 'Scaffold an MCP server and define one tool; open the inspector and call it.',
      designChoice: {
        kind: 'poll',
        q: 'Read-only reference data your AI needs. Tool, resource, or prompt?',
        options: ['A tool', 'A resource', 'A prompt', 'Hardcode it'],
        reveal: 'Read-only context is a resource; an action Claude performs is a tool; a reusable message template is a prompt.',
      },
      trivia: {
        kind: 'trivia',
        q: 'What do you use to test an MCP server?',
        options: ['Print statements only', 'The MCP inspector', 'A browser', 'Nothing, ship it'],
        answer: 1,
        reveal: 'The inspector lets you exercise tools/resources/prompts before wiring a client.',
      },
      thursdayTrailer: 'Thursday we build the server — tools, resources, prompts — and prove it in the inspector.',
    },
    thursday: {
      resultPreview: 'A working MCP server with at least one tool and one resource, verified in the inspector and called by a client.',
      readinessCheck: 'Python and the MCP SDK installed; JSON/HTTP basics; your repo open.',
      buildMap: ['CP0: server scaffold', 'CP1: one tool', 'CP2: a resource + a prompt', 'CP3: client calls it'],
      checkpoints: [
        { n: 0, label: 'Scaffold', detail: 'An MCP server project that starts.' },
        { n: 1, label: 'A tool', detail: 'One tool defined with the SDK and validated input.' },
        { n: 2, label: 'Resource + prompt', detail: 'A resource with a MIME type and one prompt primitive.' },
        { n: 3, label: 'Client call', detail: 'A client successfully calls the server.' },
      ],
      prompts: [
        { label: 'Scaffold server', prompt: 'Create an MCP server using the SDK with one tool "search_docs(query)" that validates its input and returns structured results.' },
        { label: 'Add a resource', prompt: 'Add a resource that exposes a docs file with the correct MIME type, and a prompt primitive that templates a support reply.' },
        { label: 'Connect client', prompt: 'Write a minimal MCP client that connects to this server, lists its tools/resources, and calls search_docs.' },
      ],
      failureInjection: 'Define a tool with no input validation and pass it garbage — watch it throw deep in the server.',
      recovery: 'Add schema validation at the tool boundary so bad input is rejected with a clear message before it reaches logic.',
      trivia: {
        kind: 'trivia',
        q: 'The three MCP primitives are…',
        options: ['Tools, resources, prompts', 'GET, POST, PUT', 'Model, view, controller', 'Read, write, execute'],
        answer: 0,
        reveal: 'Tools (actions), resources (context), prompts (templates).',
      },
    },
    assignment: {
      title: 'First MCP server',
      deliverables: ['mcp-server repo with tools/resources/prompts + run instructions'],
      proof: 'An inspector demo of the server.',
    },
    builderBroadcastFocus: 'an MCP server that connects Claude to a real tool',
  },

  /* ------------------------------------------------------------------ Week 6 */
  {
    week: 6,
    title: 'Advanced MCP + System Integration',
    intensive: 'Intensive 2 · Create Your AI Team',
    publicTitle: 'Turn a Basic MCP Server Into a Real Integration',
    monday: {
      tension:
        'Prototype integrations break in production. Taking an MCP server from toy to production means sampling, progress/log notifications, file-access roots, the right transport, and stateless-vs-stateful scaling.',
      payoffPreview: 'By Thursday your server is production-shaped and integrated with a real business system — your Intensive 2 deliverable alongside the Prompt Library.',
      architectureBeats: [
        'Sampling: a server requesting model calls through the client',
        'Progress and log notifications for long-running operations',
        'Roots: controlling file access with permission patterns',
        'Transports: STDIO vs StreamableHTTP, and stateless vs stateful scaling',
        'Integrating with a real system or data source safely',
      ],
      realExample: 'A server that assumes it is stateful and breaks the moment it scales to two instances — and the transport choice that caused it.',
      microBuild: 'Add progress notifications to a long-running tool so the client shows real feedback.',
      designChoice: {
        kind: 'poll',
        q: 'A public, multi-user integration. Which transport?',
        options: ['STDIO', 'StreamableHTTP (stateless where possible)', 'Whatever the tutorial used', 'None'],
        reveal: 'STDIO is great for local/single-user; a scaled, multi-user integration wants StreamableHTTP, stateless where possible.',
      },
      trivia: {
        kind: 'trivia',
        q: 'What do "roots" control in MCP?',
        options: ['Server startup order', 'File-access boundaries', 'The model version', 'Log levels'],
        answer: 1,
        reveal: 'Roots bound which files a server may touch — a security control, not a nicety.',
      },
      thursdayTrailer: 'Thursday we harden the server — sampling, notifications, roots, transport — and wire it to a real system.',
    },
    thursday: {
      resultPreview: 'A production-shaped MCP server (sampling + notifications + roots) integrated with a real business system, with a justified transport choice.',
      readinessCheck: 'Your Week 5 server, plus access to a real system or dataset to integrate.',
      buildMap: ['CP0: server running', 'CP1: sampling + notifications', 'CP2: roots + transport chosen', 'CP3: real integration'],
      checkpoints: [
        { n: 0, label: 'Baseline', detail: 'Week 5 server running.' },
        { n: 1, label: 'Upgraded', detail: 'Sampling and progress/log notifications added.' },
        { n: 2, label: 'Bounded + transported', detail: 'Roots set and a documented transport choice.' },
        { n: 3, label: 'Integrated', detail: 'Server integrated against a real system/data source.' },
      ],
      prompts: [
        { label: 'Add sampling', prompt: 'Add sampling so the server can request a model call through the client to summarize a long document, and stream progress notifications.' },
        { label: 'Bound roots', prompt: 'Configure roots so the server can only read from the ./data directory, and explain the security rationale in a comment.' },
        { label: 'Integrate', prompt: 'Add an adapter that connects a tool to a real system (database or API), with a timeout and error handling.' },
      ],
      failureInjection: 'Leave file roots wide open and let a tool read outside its directory.',
      recovery: 'Constrain roots to the intended directory and add a check; the escape attempt is now denied and logged.',
      trivia: {
        kind: 'trivia',
        q: 'Stateful server, scaled to 3 instances, shared in-memory session. What breaks?',
        options: ['Nothing', 'Requests hit different instances and lose state', 'Only the logs', 'The favicon'],
        answer: 1,
        reveal: 'Stateful assumptions break under horizontal scaling — go stateless or externalize state.',
      },
    },
    assignment: {
      title: 'Integrated, production-shaped MCP server',
      deliverables: ['Upgraded server repo with transport config + integration adapter'],
      proof: 'A demo of the integrated server handling a real task.',
    },
    builderBroadcastFocus: 'an MCP server that securely integrates with a real system',
  },

  /* ------------------------------------------------------------------ Week 7 */
  {
    week: 7,
    title: 'Subagents + Multi-Agent Team',
    intensive: 'Intensive 3 · Connect AI To The Real World',
    publicTitle: 'I Turned Claude Code Into an AI Team',
    monday: {
      tension:
        'One assistant hits a ceiling. Subagents give Claude Code isolated context windows and specialized roles — turning a single assistant into a coordinated team that splits exploration from editing and runs independent work in parallel.',
      payoffPreview: 'By Thursday you have a coordinated team of three specialized subagents, each with structured output and scoped tools.',
      architectureBeats: [
        'How subagents work: separate context windows, input flow in, summaries back',
        'Designing reliable subagents: structured output, obstacle reporting, limited tools',
        'When to delegate — and the anti-patterns (over-delegation, unscoped tools)',
        'Coordinating a team: split exploration from editing',
        'Running independent subagents in parallel',
      ],
      realExample: 'A team that over-delegates trivial work and one with unscoped tools returning untrusted results — why both fail.',
      microBuild: 'Create one specialized subagent with the /agents command and delegate a scoped task to it.',
      designChoice: {
        kind: 'poll',
        q: 'When should you NOT use a subagent?',
        options: ['For trivial one-line work', 'For a large read-only exploration', 'For parallel independent tasks', 'For isolating context'],
        reveal: 'Subagents cost coordination overhead — skip them for trivial work; use them to isolate context and parallelize.',
      },
      trivia: {
        kind: 'trivia',
        q: 'Why require structured output from a subagent?',
        options: ['It looks nice', 'So the coordinator can trust and act on the result', 'To use more tokens', 'No reason'],
        answer: 1,
        reveal: 'Structured output is the contract that lets the coordinator trust a subagent’s result.',
      },
      thursdayTrailer: 'Thursday we build the team — three subagents, scoped and coordinated on one real task.',
    },
    thursday: {
      resultPreview: 'A multi-agent team of 3+ specialized subagents, each with structured output and scoped tools, plus a worked coordination example.',
      readinessCheck: 'Your Architect Workspace with a .claude/agents/ folder.',
      buildMap: ['CP0: agents folder', 'CP1: first subagent', 'CP2: three specialized subagents', 'CP3: coordinated run'],
      checkpoints: [
        { n: 0, label: 'Scaffold', detail: '.claude/agents/ ready.' },
        { n: 1, label: 'First subagent', detail: 'One specialized subagent with structured output.' },
        { n: 2, label: 'Team of three', detail: 'Three subagents with scoped tools.' },
        { n: 3, label: 'Coordinated', detail: 'A run splitting exploration from editing across the team.' },
      ],
      prompts: [
        { label: 'Create subagent', prompt: 'Create a subagent "explorer" that maps a subsystem read-only and returns a structured summary. Restrict it to read and search tools.' },
        { label: 'Build the team', prompt: 'Add a "reviewer" and an "editor" subagent, each with a structured output format and only the tools it needs.' },
        { label: 'Coordinate', prompt: 'Run the team on a real change: explorer maps it, reviewer flags risks, editor implements. Show the handoffs.' },
      ],
      failureInjection: 'Give a subagent full tool access and let it wander outside its job, returning unstructured mush.',
      recovery: 'Scope its tools to only what the role needs and require a structured output schema; the result becomes trustworthy.',
      trivia: {
        kind: 'trivia',
        q: 'Two independent tasks. Best pattern?',
        options: ['One agent, sequential', 'Run two subagents in parallel', 'Skip both', 'Do it by hand'],
        answer: 1,
        reveal: 'Independent work runs in parallel — that is the point of a team.',
      },
    },
    assignment: {
      title: 'Coordinated multi-agent team',
      deliverables: ['.claude/agents/ with 3+ subagents + a coordination example'],
      proof: 'A demo of the team handling a multi-step task.',
    },
    builderBroadcastFocus: 'a team of subagents that split the work and report back',
  },

  /* ------------------------------------------------------------------ Week 8 */
  {
    week: 8,
    title: 'Claude Code Workflows + Automation',
    intensive: 'Intensive 3 · Connect AI To The Real World',
    publicTitle: 'Make Claude Code Run a Complete Workflow Automatically',
    monday: {
      tension:
        'AI work only compounds when it is repeatable. Custom commands, hooks, the SDK, headless runs, and GitHub Actions turn Claude Code into an automation platform that runs routine engineering itself — safely and unsupervised.',
      payoffPreview: 'By Thursday you have a real dev workflow that runs itself: custom commands + a hook + a headless run + automated code review on PRs.',
      architectureBeats: [
        'Custom commands and reusable automations',
        'Hooks for formatting, command control, and guardrails',
        'The Claude Code SDK and headless/routines for unattended runs',
        'Permission modes for supervised vs unsupervised work',
        'GitHub Actions + automated code review, with a verification step you can trust',
      ],
      realExample: 'A headless automation with unsafe permissions and no verification — how it quietly ships a bad change.',
      microBuild: 'Write one custom command and one hook, and run them on a real task.',
      designChoice: {
        kind: 'poll',
        q: 'Running Claude Code headless in CI. What must be true?',
        options: ['Full permissions, no checks', 'Scoped permissions + a verification step', 'It never fails', 'Nothing special'],
        reveal: 'Unattended = least-privilege permissions plus a verification gate. Automation without verification is a liability.',
      },
      trivia: {
        kind: 'trivia',
        q: 'What is a hook good for?',
        options: ['Formatting + guardrails around commands', 'Nothing', 'Only logging', 'Replacing tests'],
        answer: 0,
        reveal: 'Hooks enforce formatting and control which commands run — your automation guardrails.',
      },
      thursdayTrailer: 'Thursday we automate a real workflow — commands, hooks, headless, and CI code review.',
    },
    thursday: {
      resultPreview: 'An automated dev workflow: 2+ custom commands, a hook, a headless run completing a task unattended, and GitHub Actions code review on PRs.',
      readinessCheck: 'Your repo on GitHub with Actions enabled, and the Claude Code SDK available.',
      buildMap: ['CP0: repo + Actions', 'CP1: commands + hook', 'CP2: headless run', 'CP3: CI code review'],
      checkpoints: [
        { n: 0, label: 'Ready', detail: 'Repo on GitHub with Actions enabled.' },
        { n: 1, label: 'Automated locally', detail: '2 custom commands + 1 hook wired into a real workflow.' },
        { n: 2, label: 'Headless', detail: 'A routine/headless run completing a task unattended.' },
        { n: 3, label: 'CI review', detail: 'GitHub Actions running automated code review on PRs.' },
      ],
      prompts: [
        { label: 'Custom command', prompt: 'Create a custom command "/ship" that runs the tests, formats the code, and drafts a PR description.' },
        { label: 'Add a hook', prompt: 'Add a hook that blocks a commit if the tests fail, and formats staged files before commit.' },
        { label: 'CI code review', prompt: 'Add a GitHub Actions workflow that runs Claude Code review on every PR and comments findings. Redact any secrets.' },
      ],
      failureInjection: 'Run the headless automation with broad permissions and no verification — let it push an unverified change.',
      recovery: 'Add a verification step (tests must pass) and scope permissions; the automation now refuses to ship a red build.',
      trivia: {
        kind: 'trivia',
        q: 'Automation with no verification step is…',
        options: ['Efficient', 'A production defect waiting to happen', 'Best practice', 'Fine in prod'],
        answer: 1,
        reveal: 'No verification = unattended risk. Verify before you automate.',
      },
    },
    assignment: {
      title: 'Self-running dev workflow',
      deliverables: ['.claude/ commands + hooks', 'A GitHub Actions workflow for automated review'],
      proof: 'A demo of the automated workflow + a CI review comment.',
    },
    builderBroadcastFocus: 'a workflow that runs itself — commands, hooks, and CI review',
  },

  /* ------------------------------------------------------------------ Week 9 */
  {
    week: 9,
    title: 'Reliability Engineering + Quality Layer',
    intensive: 'Intensive 3 · Connect AI To The Real World',
    publicTitle: 'I Broke Our AI System on Purpose',
    monday: {
      tension:
        'A successful demo still fails in production. Reliability is designing the failure path before the happy path: timeouts, retries with backoff, circuit breakers, fallbacks, dead-letter handling, and idempotency so operations are safe to re-run.',
      payoffPreview: 'By Thursday your system wears a reliability + quality layer, and you prove idempotency by running the same operation twice to one end state.',
      architectureBeats: [
        'Failure-first design: enumerate failure modes for each external boundary',
        'Timeouts, capped retries with backoff, circuit breakers',
        'Fallbacks and dead-letter handling for exhausted retries',
        'Idempotency: same input → same end state, no duplicate side effects',
        'Quality gates: an eval threshold that blocks bad AI output',
      ],
      realExample: 'A retry loop with no cap and a non-idempotent write — how one blip becomes duplicate charges.',
      microBuild: 'Add a timeout and capped retry to one external call.',
      designChoice: {
        kind: 'poll',
        q: 'A webhook can fire twice. How do you stay correct?',
        options: ['Hope it does not', 'Idempotency key + unique constraint', 'Retry forever', 'Ignore duplicates'],
        reveal: 'Idempotency keys make replay safe. If a retry can duplicate a side effect, the operation is broken.',
      },
      trivia: {
        kind: 'trivia',
        q: 'A circuit breaker exists to…',
        options: ['Speed things up', 'Stop hammering a failing dependency and fail clearly', 'Add features', 'Log more'],
        answer: 1,
        reveal: 'When an upstream keeps failing, the breaker opens — you stop calling and surface a clear error.',
      },
      thursdayTrailer: 'Thursday we break the system on purpose — and make it recover.',
    },
    thursday: {
      resultPreview: 'A reliability layer (timeouts + retries + breaker + fallback), idempotency proven, and a quality gate blocking a bad output on camera.',
      readinessCheck: 'Your Intensive 1–3 system in the repo, ready to wrap.',
      buildMap: ['CP0: baseline system', 'CP1: timeouts + retries + breaker', 'CP2: idempotency proven', 'CP3: quality gate blocks bad output'],
      checkpoints: [
        { n: 0, label: 'Baseline', detail: 'The system runs on the happy path.' },
        { n: 1, label: 'Resilient', detail: 'Timeouts + capped retries + circuit breaker + fallback added.' },
        { n: 2, label: 'Idempotent', detail: 'Same operation run twice yields one end state.' },
        { n: 3, label: 'Gated', detail: 'An eval threshold blocks a deliberately bad output.' },
      ],
      prompts: [
        { label: 'Add resilience', prompt: 'Wrap this external call with a timeout, capped exponential-backoff retry, and a circuit breaker. Log the error class on failure.' },
        { label: 'Make it idempotent', prompt: 'Add an idempotency key to this side-effecting operation and a unique constraint so a replay does not duplicate the effect.' },
        { label: 'Quality gate', prompt: 'Add an eval gate that scores the AI output and blocks it below threshold, returning a clear rejection.' },
      ],
      failureInjection: 'Force the external dependency to 500, then fire the same operation twice — show the duplicate side effect before the fix.',
      recovery: 'Add the breaker + idempotency key; re-run the exact failure and watch it degrade gracefully with one clean end state.',
      trivia: {
        kind: 'trivia',
        q: 'try { … } catch (e) {} (empty catch) is…',
        options: ['Clean', 'A silent-failure production defect', 'Required', 'Faster'],
        answer: 1,
        reveal: 'Swallowing errors silently hides root cause. Classify, log, and handle.',
      },
    },
    assignment: {
      title: 'Reliability + quality layer',
      deliverables: ['Reliability module (timeouts/retries/breaker/DLQ) + eval gate + tests'],
      proof: 'A demo of a forced failure being handled and retried to one clean state.',
    },
    builderBroadcastFocus: 'a system that survives failure and refuses to duplicate work',
  },

  /* ----------------------------------------------------------------- Week 10 */
  {
    week: 10,
    title: 'Governance + Governance Engine',
    intensive: 'Intensive 4 · Design AI That Scales',
    publicTitle: 'This AI Tried to Act — Governance Stopped It',
    monday: {
      tension:
        'Autonomous AI needs authority limits. Governance is the trust layer that makes an agentic system safe in production: attribute-based access control, human-in-the-loop escalation, and an immutable audit trail that gate actions before side effects fire.',
      payoffPreview: 'By Thursday you have a Governance Engine that blocks a disallowed action, escalates a high-risk one to a human, and reconstructs any decision from a single correlation ID.',
      architectureBeats: [
        'Five-factor ABAC: user, resource, action, context, risk',
        'Human-in-the-loop: which action categories must escalate, and the path',
        'Immutable audit trail keyed on a correlation ID',
        'Fail-closed defaults: an ungoverned action is a denied action',
        'INPACT (Permitted & Transparent) and the GOALS Governance pillar',
      ],
      realExample: 'Governance bolted on after the fact vs governance-first — why "after" leaks actions.',
      microBuild: 'Write one ABAC rule that denies an action and returns a clear reason.',
      designChoice: {
        kind: 'poll',
        q: 'An agent requests a high-risk action (a refund > $500). Default behavior?',
        options: ['Allow it', 'Escalate to a human, then resume on approval', 'Deny silently', 'Log and allow'],
        reveal: 'High-risk actions escalate to a human and resume only after approval — fail-closed by default.',
      },
      trivia: {
        kind: 'trivia',
        q: 'What lets you reconstruct any decision later?',
        options: ['Guessing', 'An audit trail keyed on a correlation ID', 'Bigger logs', 'The model'],
        answer: 1,
        reveal: 'One correlation ID threads a decision through every log line and side effect.',
      },
      thursdayTrailer: 'Thursday we build the Governance Engine — block, escalate, approve, audit.',
    },
    thursday: {
      resultPreview: 'A Governance Engine over your system: an ABAC policy that blocks a disallowed action, a HITL gate that escalates and resumes, and audit reconstruction from one correlation ID.',
      readinessCheck: 'Your Intensive 1–3 system, with the reliability layer from Week 9.',
      buildMap: ['CP0: baseline system', 'CP1: ABAC blocks an action', 'CP2: HITL escalation + resume', 'CP3: audit reconstruction'],
      checkpoints: [
        { n: 0, label: 'Baseline', detail: 'The system runs without governance.' },
        { n: 1, label: 'Policy blocks', detail: 'An ABAC evaluator denies a disallowed action with a reason.' },
        { n: 2, label: 'Human gate', detail: 'A high-risk action escalates and resumes on approval.' },
        { n: 3, label: 'Auditable', detail: 'A decision reconstructed end to end from one correlation ID.' },
      ],
      prompts: [
        { label: 'ABAC policy', prompt: 'Add a 5-factor ABAC policy file (user, resource, action, context, risk) and an evaluator middleware that denies fail-closed with a reason.' },
        { label: 'HITL gate', prompt: 'Add a human-in-the-loop queue: high-risk actions pause, notify an approver, and resume on approval.' },
        { label: 'Audit trail', prompt: 'Generate a correlation ID at entry and thread it through every log line and side effect so any decision can be reconstructed. Never log secrets.' },
      ],
      failureInjection: 'Route a high-risk action straight through with governance disabled — show it firing unchecked.',
      recovery: 'Turn on fail-closed evaluation: the same action is now blocked, escalated, and fully audited.',
      trivia: {
        kind: 'trivia',
        q: 'Fail-closed means…',
        options: ['Allow when unsure', 'Deny when a governing decision is missing', 'Crash', 'Retry'],
        answer: 1,
        reveal: 'No explicit permission → denied. Ungoverned equals disallowed.',
      },
    },
    assignment: {
      title: 'Governance Engine',
      deliverables: ['governance module: ABAC policy file + evaluator middleware + HITL queue + audit log'],
      proof: 'A demo: one blocked action, one escalated action, one audit reconstruction.',
    },
    builderBroadcastFocus: 'a Governance Engine that blocks, escalates, and audits every action',
  },

  /* ----------------------------------------------------------------- Week 11 */
  {
    week: 11,
    title: 'Systems Architecture + Architecture Package',
    intensive: 'Intensive 4 · Design AI That Scales',
    publicTitle: 'How to Architect a Production AI System',
    monday: {
      tension:
        'Architects earn authority by explaining complex systems clearly. An architecture package is diagrams + decisions + evidence — not slides: the 7-layer map, trust boundaries, ADRs, and a Trust Band scorecard.',
      payoffPreview: 'By Thursday you have a Solution Architecture Package: your system mapped onto the 7-layer reference, 5+ ADRs, and an INPACT/Trust Band scorecard — the exhibit for the Expo.',
      architectureBeats: [
        'The 7-layer reference: Storage → Data Fabric → Semantic → Intelligence → Governance → Observability → Orchestration',
        'Trust boundaries, data flow, and failure/recovery per layer',
        'ADRs that justify — not just describe — the highest-stakes choices',
        'INPACT composite + Trust Band scorecard for the finished system',
        'Reliability (Wk9) and governance (Wk10) are layers here, not add-ons',
      ],
      realExample: 'A "pretty slides" architecture with no trust boundaries vs an evidence-backed package — which one survives a review.',
      microBuild: 'Map your system onto the 7-layer table and mark where each component lives.',
      designChoice: {
        kind: 'poll',
        q: 'What makes an ADR worth writing?',
        options: ['It describes what you did', 'It justifies the choice and the alternatives rejected', 'It is long', 'It has a diagram'],
        reveal: 'An ADR captures the decision, the alternatives, and why — so future-you can defend it.',
      },
      trivia: {
        kind: 'trivia',
        q: 'An architecture package is…',
        options: ['Slides', 'Diagrams + decisions + evidence', 'A README', 'A demo video'],
        answer: 1,
        reveal: 'Evidence, not slides. Diagrams, ADRs, and scorecards you can defend.',
      },
      thursdayTrailer: 'Thursday we assemble the package — 7-layer map, ADRs, and the Trust Band scorecard.',
    },
    thursday: {
      resultPreview: 'A Solution Architecture Package: system + data-flow diagrams, a 7-layer mapping table, 5+ ADRs, and an INPACT/Trust Band scorecard with the top 3 gaps.',
      readinessCheck: 'Your full system from Intensives 1–4 in the repo.',
      buildMap: ['CP0: system inventory', 'CP1: 7-layer map + diagrams', 'CP2: 5+ ADRs', 'CP3: scorecard + gaps'],
      checkpoints: [
        { n: 0, label: 'Inventory', detail: 'Every component of your system listed.' },
        { n: 1, label: 'Mapped', detail: 'A 7-layer table + system and data-flow diagrams.' },
        { n: 2, label: 'Justified', detail: '5+ ADRs for the highest-stakes decisions.' },
        { n: 3, label: 'Scored', detail: 'An INPACT composite + Trust Band scorecard with top 3 gaps.' },
      ],
      prompts: [
        { label: '7-layer map', prompt: 'Generate a table mapping each component of my system onto the 7 layers (Storage → Data Fabric → Semantic → Intelligence → Governance → Observability → Orchestration), noting trust boundaries.' },
        { label: 'Write ADRs', prompt: 'Draft 5 ADRs for my highest-stakes decisions: context, decision, alternatives considered, and consequences.' },
        { label: 'Scorecard', prompt: 'Produce an INPACT composite and a Trust Band scorecard for the system, and list the top 3 gaps between current and target.' },
      ],
      failureInjection: 'Present an architecture with no marked trust boundaries — ask where untrusted input enters and watch the gap appear.',
      recovery: 'Add explicit trust boundaries and data-flow arrows; the entry points and controls become obvious.',
      trivia: {
        kind: 'trivia',
        q: 'Where do reliability and governance live in the 7-layer model?',
        options: ['Bolted on at the end', 'As their own layers in the architecture', 'Nowhere', 'In the README'],
        answer: 1,
        reveal: 'They are architecture layers (Observability/Governance), not afterthoughts.',
      },
    },
    assignment: {
      title: 'Solution Architecture Package',
      deliverables: ['/architecture: system + data-flow diagrams, 7-layer table, ADRs, scorecard'],
      proof: 'The packaged architecture doc (PDF/site) for the Expo.',
    },
    builderBroadcastFocus: 'an architecture package that explains and defends your whole system',
  },

  /* ----------------------------------------------------------------- Week 12 */
  {
    week: 12,
    title: 'Capstone + Architect Expo',
    intensive: 'Intensive 4 · Design AI That Scales',
    publicTitle: '12 Weeks. One Working AI System. Here’s What We Built.',
    monday: {
      tension:
        'From idea to governed system: the capstone integrates the whole arc — foundation, team, integration, reliability, governance, architecture — into one system running end to end, governed and observable, ready to defend.',
      payoffPreview: 'Thursday is the Architect Expo: you present the build, defend the decisions, cite the evidence, and sit the CCA-F exam.',
      architectureBeats: [
        'Integrate all six threads into one capstone system',
        'Freeze and run it end to end with governance + observability on',
        'The executive story: problem → architecture → demo → evidence → roadmap',
        'CCA-F exam blueprint: the five domains and how to close the last gaps',
        'Defending a system to a panel with authority',
      ],
      realExample: 'A demo without a defense vs a demo that cites evidence for every claim — which one earns the credential.',
      microBuild: 'Draft your Expo throughline: the one sentence that states the problem and the outcome.',
      designChoice: {
        kind: 'poll',
        q: 'Your Expo talk should lead with…',
        options: ['The tech stack', 'The problem and the outcome', 'A tools tour', 'An apology for what is unfinished'],
        reveal: 'Lead with problem → outcome. Executives buy the outcome; the architecture backs it up.',
      },
      trivia: {
        kind: 'trivia',
        q: 'What are you graded on at the Expo?',
        options: ['A working demo only', 'Demo + defense: decisions justified and evidenced', 'Slide count', 'Attendance'],
        answer: 1,
        reveal: 'The defense is the point: can you justify the architecture and cite the evidence?',
      },
      thursdayTrailer: 'Thursday is the Expo — you present, you defend, you certify.',
    },
    thursday: {
      resultPreview: 'A frozen capstone running end to end (governance + observability on), a recorded Expo presentation, and a CCA-F exam attempt.',
      readinessCheck: 'Your integrated capstone system and your architecture package ready.',
      buildMap: ['CP0: integrated capstone', 'CP1: frozen end-to-end run', 'CP2: recorded Expo talk', 'CP3: CCA-F attempt'],
      checkpoints: [
        { n: 0, label: 'Integrated', detail: 'All threads integrated into one capstone.' },
        { n: 1, label: 'Frozen run', detail: 'End-to-end run with governance + observability on.' },
        { n: 2, label: 'Presented', detail: 'A recorded Expo talk: problem → architecture → demo → evidence → roadmap.' },
        { n: 3, label: 'Certified', detail: 'A CCA-F exam attempt and a submitted architecture package.' },
      ],
      prompts: [
        { label: 'Integrate', prompt: 'Wire my Intensive 1–4 components into one runnable capstone and produce a single command that runs it end to end.' },
        { label: 'Dry-run the defense', prompt: 'Play a skeptical panelist: ask me to justify my three highest-stakes architecture decisions and probe for the weakest one.' },
        { label: 'Expo cut', prompt: 'From my capstone, draft an Expo script: problem, architecture, live demo beats, evidence, and one honest limitation.' },
      ],
      failureInjection: 'Run the capstone and let one integration seam fail live — the classic "it worked in pieces" moment.',
      recovery: 'Diagnose the seam with the correlation ID and the reliability layer; recover on camera — the defense is stronger for it.',
      trivia: {
        kind: 'trivia',
        q: 'The credential is CCA-F. It stands for…',
        options: ['Claude Code Advanced', 'Claude Certified Architect — Foundations', 'Certified Cloud Admin', 'None'],
        answer: 1,
        reveal: 'Claude Certified Architect — Foundations: the external gate you sit this week.',
      },
    },
    assignment: {
      title: 'Capstone + Expo + CCA-F',
      deliverables: ['Capstone repo (integrated system) + the final architecture package', 'Recorded Expo presentation', 'CCA-F exam attempt'],
      proof: 'Your recorded Expo defense and your CCA-F attempt.',
    },
    builderBroadcastFocus: 'the working, governed AI system you built and defended in 12 weeks',
  },
];

/** Lookup by week number (1..12). */
export function weekClassContent(week: number): WeekClassContent | undefined {
  return WEEK_CLASS_CONTENT.find((w) => w.week === week);
}

/**
 * Mermaid architecture diagrams — one per week, shown on the Architecture Day
 * "architecture story" slide. Concise flowcharts of that week's system so the
 * instructor can teach the shape at a glance (and the student sees the picture).
 * Rendered client-side by mermaid; the raw source stays visible if the CDN is
 * unreachable.
 */
export const ARCHITECTURE_DIAGRAMS: Record<number, string> = {
  1: `flowchart LR
  U["You: a task"] --> CC["Claude Code"]
  subgraph LOOP["The agentic loop"]
    CTX["Context window"]
    T["Tools: read / edit / run"]
    P["Permissions"]
  end
  CC --> LOOP
  LOOP --> W["explore → plan → code → commit"]
  W --> R[("Your repo")]
  MD["CLAUDE.md — persistent standards"] -.-> CC`,
  2: `flowchart TD
  T["A task you repeat"] --> S["Agent Skill"]
  S --> D["Description = the trigger"]
  S --> B["Instruction body"]
  S --> F["Extra files + scoped tools"]
  D --> Q{"Claude matches the ask?"}
  Q -->|"sharp"| Y["Fires every time"]
  Q -->|"vague"| N["Never triggers"]`,
  3: `flowchart LR
  In["Business input"] --> API["Claude API"]
  API --> SYS["System prompt + streaming"]
  API --> TOOL["Tool use"]
  TOOL --> EXT["Real systems / data"]
  API --> OUT["Structured JSON output"]
  OUT --> APP["Workflow Assistant"]
  EVAL["Eval: dataset + grader"] -.measures.-> API`,
  4: `flowchart TD
  A["Ad-hoc prompt"] --> L["Technique ladder<br/>clear → specific → structured → examples"]
  L --> TPL["Versioned template + variables"]
  TPL --> G{"Passes eval?"}
  G -->|yes| LIB["Prompt Library<br/>versioned · tested · documented"]
  G -->|no| L
  LIB --> TEAM["The whole team reuses"]`,
  5: `flowchart LR
  Client["MCP client (Claude)"] <--> Server["Your MCP server"]
  Server --> Tools["Tools = actions"]
  Server --> Res["Resources = context"]
  Server --> Prompts["Prompts = templates"]
  Insp["MCP inspector"] -.tests.-> Server`,
  6: `flowchart LR
  Client["Client"] <--> Server["Production-shaped MCP server"]
  Server --> Samp["Sampling"]
  Server --> Notif["Progress + log notifications"]
  Server --> Roots["Roots = file-access limits"]
  Server --> Trans["Transport: STDIO ↔ StreamableHTTP"]
  Server --> Sys[("Real business system")]`,
  7: `flowchart TD
  Lead["Coordinator"] --> Ex["Explorer (read-only)"]
  Lead --> Rev["Reviewer"]
  Lead --> Ed["Editor"]
  Ex --> Sum["Structured summaries"]
  Rev --> Sum
  Ed --> Sum
  Sum --> Lead`,
  8: `flowchart LR
  Dev["Dev workflow"] --> Cmd["Custom commands"]
  Dev --> Hook["Hooks = guardrails"]
  Dev --> HL["Headless / SDK"]
  HL --> V{"Verification passes?"}
  V -->|yes| Ship["Auto-ship"]
  V -->|no| Stop["Blocked"]
  GH["GitHub Actions"] --> Rev["Automated code review"]`,
  9: `flowchart LR
  Call["External call"] --> TO["Timeout"]
  TO --> Retry["Capped retry + backoff"]
  Retry --> CB{"Circuit breaker"}
  CB -->|open| FB["Fallback / dead-letter"]
  CB -->|closed| OK["Success"]
  Idem["Idempotency key"] -.safe replay.-> Call
  Gate["Quality gate = eval"] --> Out["Trusted output"]`,
  10: `flowchart TD
  Act["Agent wants to act"] --> ABAC{"ABAC policy<br/>user·resource·action·context·risk"}
  ABAC -->|allow| Do["Execute"]
  ABAC -->|high risk| HITL["Human approval"]
  ABAC -->|deny| Block["Fail-closed"]
  HITL -->|approved| Do
  Do --> Audit[("Audit trail = correlation id")]`,
  11: `flowchart TD
  L7["7 · Orchestration"] --> L6["6 · Observability"]
  L6 --> L5["5 · Governance"]
  L5 --> L4["4 · Intelligence"]
  L4 --> L3["3 · Semantic"]
  L3 --> L2["2 · Data Fabric"]
  L2 --> L1[("1 · Storage")]`,
  12: `flowchart LR
  I1["Foundation"] --> Cap["Capstone system"]
  I2["AI team"] --> Cap
  I3["Integration + reliability"] --> Cap
  I4["Governance + architecture"] --> Cap
  Cap --> Expo["Architect Expo — demo + defense"]
  Cap --> Cert["CCA-F exam"]`,
};
