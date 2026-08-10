/**
 * classTeachContent.ts — the DEEP teaching content that fills a 2-hour class.
 *
 * classSessionPlan.ts carries the run-of-show skeleton (one beat per segment).
 * This file carries the substance the instructor actually TEACHES FROM: multiple
 * real slides per segment, each with a body (the explanation), optional bullets,
 * optional code (a copy-ready Claude Code prompt / snippet), an optional mermaid
 * diagram, and a `script` (what the instructor says/does — so Ali can learn,
 * review, and practice).
 *
 * Weeks 2-12 are generated into classTeachWeeks.ts by the fan-out integrator
 * (scripts/buildTeachWeeks.js) and merged below; Week 1 + Orientation are
 * hand-authored here.
 *
 * kitSpec inserts these slides into the matching run-of-show segment (by
 * `segment` id) right after that segment's header beat, so a segment budgeted for
 * 20 minutes now has 4-5 teaching slides instead of one.
 *
 * Weeks 1 + Orientation are hand-authored here (the imminent classes). Weeks 2-12
 * are authored by the parallel fan-out and merged in by segment id. Dependency-
 * free pure data, so it type-checks and renders in isolation.
 */

import { GENERATED_WEEK_TEACH } from './classTeachWeeks';
import { WEEK3_MONDAY } from './classTeachWeek3';
// Type-only import — classSessionPlan.ts is itself dependency-free and never
// imports this module, so there is no cycle and no runtime coupling.
import type { BuildBayMeta } from './classSessionPlan';

/** A sourced factual claim shown in a small footer + the readiness report. */
export interface EvidenceClaim {
  claim: string;
  publisher: string;
  sourceTitle?: string;
  publicationDate?: string;
  sourceType?: 'official-doc' | 'research' | 'company-report' | 'interview' | 'internal-verified' | 'secondary-reporting';
  /** e.g. "projection", "paraphrase" — surfaced as a qualifier. */
  note?: string;
}

export interface TeachSlide {
  /** Run-of-show segment id this slide belongs to. */
  segment: string;
  /** Emoji + short label. */
  eyebrow: string;
  title: string;
  /** 2-5 sentences of real teaching substance. */
  body?: string;
  bullets?: string[];
  /** A copy-ready prompt or code/config snippet, plus the same optional Build
   *  Bay metadata a run-of-show ClassPrompt carries — `kind` ('paste' vs
   *  'review'), `pasteWhere`, `ccMode`, `expectedResult`, `stopCondition`,
   *  `rescue`. Without this a teach slide's code block always rendered as
   *  "PASTE INTO Claude Code", which mislabels shell commands and read-along
   *  code. All fields stay optional, so every previously authored slide is
   *  unaffected. */
  code?: { label: string; code: string } & BuildBayMeta;
  /** Optional mermaid diagram source. */
  diagram?: string;
  /** Sourced factual claims (rendered as a source footer + readiness report). */
  evidence?: EvidenceClaim[];
  /** What the instructor says/does out loud (teaching script; goes to notes). */
  script?: string;
}

export interface DayTeach {
  monday?: TeachSlide[];   // Architecture Day
  thursday?: TeachSlide[]; // Build Day
}

/* ========================================================================== */
/*  ORIENTATION — Ali (big-picture, ~55m) · Taiwo (platform, 30m) · Swati (setup, 30m) */
/* ========================================================================== */

export const ORIENTATION_TEACH: TeachSlide[] = [
  // --- Ali · big-picture ---
  {
    segment: 'big-picture', eyebrow: '🌍 The moment', title: 'The people building AI are telling us what’s coming',
    body: 'This isn’t hype from the sidelines — the people building the frontier models are saying it out loud. AI agents already write production code, resolve support tickets, and draft contracts. The question is no longer IF your work changes; it’s which side of that change you’re on.',
    bullets: ['Anthropic’s CEO has warned AI could wipe out up to half of entry-level white-collar jobs within five years (Dario Amodei, reported by Axios, 2025)', '“You’re not going to lose your job to an AI, but you’re going to lose your job to somebody who uses AI.” — Jensen Huang, NVIDIA', 'Already happening today, not just a forecast'],
    evidence: [
      { claim: 'AI could eliminate up to half of entry-level white-collar jobs within 5 years', publisher: 'Axios', sourceTitle: 'Interview with Dario Amodei (Anthropic)', publicationDate: '2025', sourceType: 'secondary-reporting', note: 'reported paraphrase' },
      { claim: '“…lose your job to somebody who uses AI.”', publisher: 'Jensen Huang, NVIDIA', sourceType: 'interview' },
    ],
    script: 'Open with energy. Read the Huang quote, pause, let it land. Note the Amodei line is his reported warning, not a fixed forecast. “Tonight isn’t about fear — it’s about getting you on the right side of this.”',
  },
  {
    segment: 'big-picture', eyebrow: '📊 The gap', title: 'Most people USE AI. Very few learn to BUILD with it.',
    body: 'The AI user prompts a chatbot and copies the answer — productivity that stops at their own keyboard, a skill every peer already has. The AI builder ships agents and systems that multiply a whole team. That gap is the difference between riding the wave and owning it.',
    bullets: ['User: prompts, copies, done', 'Builder: designs systems that execute work', 'This program moves you across that line'],
    script: 'Point to the two columns. “By the end of tonight you’ll know exactly what the builder side looks like — and in 12 weeks you’ll be standing on it.”',
  },
  {
    segment: 'big-picture', eyebrow: '💰 The premium', title: 'Knowing AI vs. not knowing it is now a compensation line',
    body: 'This isn’t abstract. PwC’s 2026 Global AI Jobs Barometer found a 62% wage premium for workers with AI skills, and it’s widening every year. The World Economic Forum projects 170 million new roles by 2030 against 92 million displaced — a net gain, but one that goes to people who can direct AI. The bridge between the two columns is one skill: learning to build.',
    bullets: ['+62% wage premium for AI-skilled workers (PwC, 2026 Global AI Jobs Barometer)', 'WEF projection by 2030: +170M created / −92M displaced / net +78M; 39% of core skills change', 'The bridge is learning to build'],
    evidence: [
      { claim: '62% wage premium for workers with AI skills', publisher: 'PwC', sourceTitle: 'Global AI Jobs Barometer', publicationDate: '2026', sourceType: 'company-report' },
      { claim: '170M created / 92M displaced / net +78M; 39% of core skills change by 2030', publisher: 'World Economic Forum', sourceTitle: 'Future of Jobs Report 2025', publicationDate: '2025', sourceType: 'research', note: 'projection' },
    ],
    script: 'Keep it factual and calm. Say the WEF numbers are projections, not certainties. The PwC premium is measured. These numbers do the persuading — don’t oversell.',
  },
  {
    segment: 'big-picture', eyebrow: '🏆 The proof', title: 'Fourteen years of turning careers around',
    body: 'Colaberry has been launching careers since 2012 — over 5,000 careers, 10,000+ professionals trained, $100M+ in wage impact. We’re an Anthropic / Claude Code partner, so you build on the real, current AI stack, not a sandbox. You are never building alone: live instructors and mentors through all 12 weeks.',
    bullets: ['Since 2012 · 5,000+ careers · $100M+ wage impact', 'Anthropic / Claude Code partner', 'Live instructors + mentors the whole way'],
    script: 'This earns you the right to teach the rest of the night. Say it with quiet confidence, then move.',
  },
  {
    segment: 'big-picture', eyebrow: '🗺️ How it works', title: 'Learn it Monday. Build it Thursday. Prove it by Friday.',
    body: 'This is one continuous 12-week journey, not 12 disconnected classes. Monday is Architecture Day — the business problem, the design, the decisions. Thursday is Build Day — you follow along in Claude Code, something breaks, we fix it, and a working artifact is revealed. By Friday you’ve proven it with real evidence.',
    bullets: ['Mon — Architecture Day: the plan', 'Thu — Build Day: the build + the reveal', 'Fri — Prove it: your artifact', 'Four parallel lanes: your project · internship · certification · portfolio'],
    script: 'This is the spine of the whole program. Say the formula out loud and have them say it back once.',
  },
  {
    segment: 'big-picture', eyebrow: '🎓 What you leave with', title: 'A working system, a credential, and public proof',
    body: 'You don’t finish with a certificate of attendance. You finish with a deployed AI system you built from your own idea, the Claude Certified Architect — Foundations credential (defended before a panel at the Expo), a public portfolio recruiters can see, and real internship experience with actual clients.',
    bullets: ['A deployed AI system — your idea, not ours', 'CCA-F credential + defended capstone', 'Public portfolio + résumé-ready internship'],
    script: 'This is the payoff. Land each of the four things slowly — this is what they’re buying.',
  },
  {
    segment: 'big-picture', eyebrow: '🤝 The deal', title: 'Bring your idea. Leave with a system.',
    body: 'Nobody quits their day job for this. Classes are Mon & Thu, 6:30–8:30 PM CST, live. You bring an idea you care about; the platform turns it into releases, steps, and scheduled tasks; and over 12 weeks you build it into something governed, observable, and real enough to defend.',
    script: 'Close your hour here, then hand to Taiwo: “Now let me show you the platform that runs all of this.”',
  },
  // --- Taiwo · platform ---
  {
    segment: 'platform', eyebrow: '🏠 Today', title: 'Your one feed for the whole program',
    body: 'Today is your command center — lessons, your project, your schedule, and your cohort in one never-ending feed. You come here every day; it greets you, tells you exactly what to do next, and pays you points for showing up.',
    bullets: ['One feed: lessons · project · schedule · community', 'Daily streaks + points you claim', 'It tells you your next action'],
    script: 'Screen-share the live Today feed. Scroll it. “This is Monday morning for the next 12 weeks.”',
  },
  {
    segment: 'platform', eyebrow: '🛤️ The Path', title: 'Your real position on the 12-week road',
    body: 'The Path draws where you actually are on the journey — Apprentice → Builder → Architect → Principal Architect. It’s not a syllabus PDF; it’s a live map that moves as you complete work.',
    script: 'Show the Path. Point at the “you are here” marker. Keep it quick.',
  },
  {
    segment: 'platform', eyebrow: '📅 Classroom + Schedule', title: 'Live classes, one-click join, everything counted',
    body: 'Every live session has a one-click Join, a countdown to the next class, and a recording after. Your attendance and every point you earn show up on one calendar. Scored submissions come back with written reviewer feedback.',
    bullets: ['One-click Join + countdowns', 'Recordings after every class', 'Written reviewer feedback on your work'],
    script: 'Show the schedule + the next-class card. “You’ll never wonder when or where class is.”',
  },
  {
    segment: 'platform', eyebrow: '🚀 Your Project + Portfolio', title: 'Your idea becomes a build plan — and public proof',
    body: 'Describe any idea and the platform decomposes it into releases, steps, and scheduled tasks, each with a copy-ready Claude Code prompt, a real GitHub repo, and a live preview URL. Everything you build becomes a graded, public portfolio page — readiness score, projects, GitHub links, a résumé PDF.',
    bullets: ['Idea → releases → steps → tasks (with prompts)', 'Real GitHub repo + live preview URL', 'A public, recruiter-facing portfolio'],
    script: 'Show a project breakdown + a portfolio page, then hand to Swati: “Let’s get your environment live so you can start.”',
  },
  // --- Swati · setup ---
  {
    segment: 'setup', eyebrow: '🧰 Get set up', title: 'Everyone leaves tonight ready to build',
    body: 'For the next 30 minutes we get your build environment live: VS Code, Claude Code, your workspace repo, and a first prompt so you’ve seen the agentic loop before Week 1. Anyone who gets stuck — we have troubleshooting stations; nobody leaves un-set-up.',
    script: 'Set expectations: “Follow along on YOUR machine. Tap ‘I’m stuck’ on your phone the moment something doesn’t work and we’ll come to you.”',
  },
  {
    segment: 'setup', eyebrow: '1️⃣ VS Code', title: 'Install VS Code + open the terminal',
    body: 'VS Code is where you’ll live. Install it, then open the integrated terminal (Ctrl+`) — that’s where Claude Code runs.',
    code: { label: 'Verify VS Code', code: 'code --version   # confirm the CLI is on your PATH' },
    script: 'Walk the room. Confirm everyone has the terminal open before moving on.',
  },
  {
    segment: 'setup', eyebrow: '2️⃣ Claude Code', title: 'Install Claude Code + sign in',
    body: 'Install Claude Code, sign in, and run one prompt to confirm it works. This is the tool the entire program is built on.',
    code: { label: 'Install + verify', code: 'npm install -g @anthropic-ai/claude-code\nclaude --version\nclaude   # start a session and say hello' },
    script: 'This is the checkpoint that matters most tonight. Wait for the pulse rail — don’t advance until most are green.',
  },
  {
    segment: 'setup', eyebrow: '3️⃣ Workspace + first prompt', title: 'Clone your workspace and run your first prompt',
    body: 'Clone your Architect Workspace starter repo, open it in VS Code, and run one Plan-Mode prompt so you SEE the agentic loop — explore, plan, wait — before Week 1.',
    code: { label: 'Clone + first run', code: 'git clone <your-workspace-url> architect-workspace\ncd architect-workspace && code .\n# then in Claude Code:\nExplore this repo and summarize it. In Plan Mode, propose a tiny first change. Do not edit yet.' },
    script: 'Celebrate the first response. “That’s it — you just directed an AI engineer. Week 1 Monday we go deep on this.”',
  },
];

/* ========================================================================== */
/*  WEEK 1 — Claude Code Foundations + Workspace                               */
/* ========================================================================== */

const WEEK1: DayTeach = {
  monday: [
    // business-problem (~15 min)
    {
      segment: 'business-problem', eyebrow: '💼 The gap', title: 'Most people use Claude like a smarter search box',
      body: 'The average professional opens a chat window, asks a question, copies the answer, and closes it. Useful — but the productivity gain stops at their own keyboard, and it’s a skill every peer already has. Companies don’t automate work by chatting faster; they automate it by giving an AI the ability to act inside their systems.',
      bullets: ['User: prompts, copies, closes', 'Builder: gives AI the ability to act', 'The gap is the story of your career'],
      script: 'Ask the room: “Has AI ever done something FOR you while you weren’t watching?” Most hands drop. That’s the gap we close today.',
    },
    {
      segment: 'business-problem', eyebrow: '⚙️ What changes', title: 'When Claude can act, the unit of work changes',
      body: 'Claude Code isn’t a chat box — it reads your repository, plans a change, edits files, runs commands, and commits, in a loop it drives itself. You stop typing code and start directing an engineer. The unit of work goes from “a sentence” to “a shipped change.”',
      bullets: ['Reads → plans → edits → runs → commits', 'You direct; it executes', 'Output = a shipped change, not a paragraph'],
      script: 'This is the reframe of the whole program. Say it plainly, then promise the payoff: “By Thursday you’ll have done this yourself.”',
    },
    {
      segment: 'business-problem', eyebrow: '📈 The business case', title: 'Chatters plateau. Builders multiply.',
      body: 'A team that only chats plateaus at individual productivity. A team that builds multiplies — one architect can direct ten agents at once. That’s why the wage premium for AI builders is real and widening. Today we lay the foundation everything else in the program stands on.',
      script: 'Tie it to their goals: “Whatever you want to build or earn, it runs through the skill we start today.”',
    },
    // architecture (~20 min) — the diagram lives on classSessionPlan's architecture beat
    {
      segment: 'architecture', eyebrow: '🧠 Working memory', title: 'The context window is Claude’s working memory',
      body: 'Claude can only reason about what’s in its context window. It fills as you work — every file read, every command output. Claude Code now manages this for you automatically: it compacts the conversation as it approaches the limit, so a long session keeps going without you babysitting it or losing the thread. Your job is direction, not memory management — if you’re ever curious what’s loaded, `/context` still shows you.',
      code: { label: 'See what is loaded (rarely needed)', code: '/context   # inspect the current context window — auto-compaction handles the rest' },
      script: '“Older tools made you manage this by hand. Claude Code now does it in the background — you focus on the work, not the window.”',
    },
    {
      segment: 'architecture', eyebrow: '🔧 Tools + permissions', title: 'Tools are what Claude can DO — permissions gate them',
      body: 'Tools let Claude read files, edit them, run shell commands, and search. Permissions decide what fires without asking. Manual mode asks before every action; Plan mode proposes a plan and waits for you; Auto mode runs freely. The mode you choose is a trust decision — high trust for a scratch repo, low trust for production. (Product terms can shift — teach the behavior, not the label.)',
      bullets: ['Tools: read · edit · run · search', 'Manual (approve each) · Plan (propose, wait) · Auto (run freely)', 'The mode is a trust decision'],
      script: 'Frame it as safety, not friction: “The permission mode is how you sleep at night when an agent is editing your code.”',
    },
    {
      segment: 'architecture', eyebrow: '🔁 The workflow', title: 'explore → plan → code → commit',
      body: 'The workflow that scales. Explore: let Claude read the code first. Plan: in Plan Mode it proposes the approach and waits. Code: it implements the approved plan. Commit: it writes the change with a clear message. Skipping explore and plan is the single biggest cause of Claude editing the wrong thing.',
      code: { label: 'The loop, as a prompt', code: 'Explore this repo, then in Plan Mode propose how you would add a /health endpoint. Show the plan; do not edit yet.' },
      script: 'The one-liner to repeat all program: “Plan Mode is your seatbelt. The best builders plan more, not less.”',
    },
    {
      segment: 'architecture', eyebrow: '📄 Persistent standards', title: 'CLAUDE.md gives Claude your standards once',
      body: 'CLAUDE.md is a file Claude reads at the start of every session — how you give it your conventions once instead of repeating them. The rule for what goes in it: only rules that CHANGE behavior, and make them specific and testable. “Write clean code” does nothing; “functions ≤ 50 lines, no any without a comment” bites.',
      code: { label: 'A rule that bites', code: '# CLAUDE.md\n- Functions ≤ 50 lines. Split before adding new code.\n- No `any` without a one-line justification comment.\n- Run tests with `npm test` before every commit.' },
      script: 'Contrast a vague rule and a sharp one on screen. “Aspirational prose is context bloat. Specific + testable is the standard.”',
    },
    // deconstruct (~15 min)
    {
      segment: 'deconstruct', eyebrow: '✅ What works', title: 'A clean explore → plan → code → commit',
      body: 'Watch one real change go through the loop. Claude reads before it writes, shows a plan you approve, makes exactly that change, runs the tests, and commits. Every step is visible and reversible — that’s what “directing an engineer” feels like.',
      script: 'Do this LIVE if you can. Narrate the DECISIONS, not the keystrokes. Change your visual mode every ~30 seconds.',
    },
    {
      segment: 'deconstruct', eyebrow: '❌ What fails', title: 'The two habits that wreck a session',
      body: 'Now the anti-patterns: skipping Plan Mode so Claude edits the wrong file, and a vague CLAUDE.md that Claude quietly ignores. Each is a habit — and each has a fix you’ll practice on Thursday.',
      bullets: ['Skipping Plan Mode → wrong edits', 'Vague CLAUDE.md → ignored rules'],
      script: 'This is the breakdown clip. Show the failure honestly; the recovery is Thursday’s payoff.',
    },
    // micro-build (~30 min)
    {
      segment: 'micro-build', eyebrow: '🛠️ Stand it up', title: 'Your Architect Workspace — built once, used all program',
      body: 'For the next 30 minutes you install Claude Code, open your Architect Workspace, and run your first Plan-Mode change. This repo is the home for your Skills, subagents, MCP servers, and your capstone — everything you build lives here.',
      script: 'Watch the pulse rail. If people go “stuck,” slow down — nobody moves past CP0 until their prompt runs.',
    },
    {
      segment: 'micro-build', eyebrow: '1️⃣ Install + verify', title: 'Get Claude Code running',
      body: 'Install Claude Code, confirm the version, and start a session. If this works, you’re ready to build.',
      code: { label: 'Verify', code: 'npm install -g @anthropic-ai/claude-code\nclaude --version\nclaude   # start a session, say hello' },
      script: 'Everyone taps “I’m here” when Claude replies. Anyone stuck goes to a mentor now, not later.',
    },
    {
      segment: 'micro-build', eyebrow: '2️⃣ First Plan-Mode prompt', title: 'See the plan before anything changes',
      body: 'Run one Plan-Mode prompt and read the plan before a single file changes. This is the muscle memory the whole program is built on — you approve the approach, then Claude executes it.',
      code: { label: 'Plan Mode', code: 'Explore this repo and summarize its structure. Then, in Plan Mode, propose a small first change. Do not edit yet.' },
      script: 'Have a few students read their plan out loud. “Notice it didn’t touch anything — it asked first.”',
    },
    {
      segment: 'micro-build', eyebrow: '3️⃣ Draft your CLAUDE.md', title: 'Three rules that actually change behavior',
      body: 'Write a CLAUDE.md with three specific, testable rules. On Thursday you’ll prove they bite by asking Claude to break one and watching it push back.',
      code: { label: 'Author it', code: 'Draft a CLAUDE.md for this project with 3 specific, testable rules for naming, file size, and how to run the tests. Keep only rules that change behavior.' },
      script: 'This is the bridge to Build Day. “Thursday we make Claude follow these — and we break one on purpose.”',
    },
  ],
  thursday: [
    {
      segment: 'build-map', eyebrow: '🗺️ Today’s build', title: 'By 8:30 you have a governed foundation, ready for Week 3',
      body: 'You leave with a project foundation whose structure and docs trace back to your own CLAUDE.md and your requirements — proposed by Claude, challenged by you, approved before anything was created, and validated at the end. Five checkpoints, a rescue branch, and nobody left behind. (Building a Personal Assistant of your own? This is exactly the flow you\'ll use for it too.)',
      script: 'Show the finished result first (the cold open). “This is where we all are by the end — let’s get there together.”',
    },
    {
      segment: 'guided-build', eyebrow: '0️⃣ CP0 — CLAUDE.md ready', title: 'Confirm your constitution is sharp before Claude reads it',
      body: 'Before Claude treats your CLAUDE.md as governance, make sure every rule in it actually changes behavior. This is Checkpoint 0 — we don\'t move until everyone\'s file is ready.',
      code: { label: 'Ready-check', code: 'Show me the CLAUDE.md at the root of this repository. Confirm every rule in it is specific and testable, not aspirational. If any rule is vague, propose a sharper version — but do not edit the file yet, just show me the diff.' },
      script: 'Wait for the pulse rail to fill with “I’m here.” Call the number out loud: “18 of 22 — three more.”',
    },
    {
      segment: 'guided-build', eyebrow: '🔍 CP1 — governance gate', title: 'Claude reads before it writes',
      body: 'Claude reads your CLAUDE.md in full, inspects the repo without touching it, then goes and finds what you\'re actually building — a requirements doc, a Project Builder output, a README. It does not invent your product. This loads the right context before a single folder is proposed.',
      code: { label: 'Governance gate', code: 'Read the entire root CLAUDE.md and follow any session-start or verification protocol it requires. Inspect this repository without modifying anything. Then locate my project\'s definition — a requirements doc, Project Builder output, README, or brief describing what I\'m building (if you can\'t find one, stop and ask me where it is — do not invent the product). Summarize: what the project is, who it serves, the primary problem it solves, the tech stack, the CLAUDE.md rules that affect structure, and any protected, legacy, generated, or read-only locations. Do not create or modify any files.' },
      script: 'Narrate why: “We’re spending context on governance now so Claude can\'t wander later.”',
    },
    {
      segment: 'guided-build', eyebrow: '📐 CP2 — architecture proposal', title: 'A folder tree, traced back to your rules — then you challenge it',
      body: 'Claude proposes a personalized architecture: every folder justified by a rule or requirement, tagged NOW/LATER/PROTECTED/etc., with a traceability table and the recommended home for your first Week 3 component. It stops and waits — ARCHITECTURE APPROVAL REQUIRED. As a class: what belongs in this folder? What must never go here? Which folder is protected? Only once you\'re satisfied do you type the approval.',
      code: { label: 'Propose + approve', code: 'Propose a personalized folder-tree architecture for this project. For every top-level folder, give: its purpose, what belongs there, what must never go there, the CLAUDE.md rule or requirement that supports it, whether it\'s needed NOW/LATER/EXISTING/GENERATED/LEGACY/DO-NOT-TOUCH, and how it will be verified. Only include a folder if my requirements, my stack, an existing convention, or a CLAUDE.md rule supports it. Include a traceability table, your assumptions, and the recommended home for my first Week 3 component. Do not create anything yet. End with: ARCHITECTURE APPROVAL REQUIRED.' },
      script: 'This is the main build footage. Zoom in on the traceability table. Read one folder\'s justification out loud, then have the room shout APPROVE FOUNDATION together before anyone types it.',
    },
    {
      segment: 'guided-build', eyebrow: '🏗️ CP3 — approved foundation', title: 'Structure and docs only — never product code',
      body: 'Once approved, Claude creates ONLY what was approved: the folders, a short README in each explaining its purpose, the full architecture doc, and updated progress tracking. No feature code. No installed dependencies. This is the discipline that keeps 20+ different personalized repos all trustworthy.',
      code: { label: 'Build the foundation', code: 'APPROVE FOUNDATION. Create only the approved structure — preserve all existing work, and do not touch protected, generated, legacy, or read-only locations. Do not build product features and do not install any dependencies. Add a short README to each new major folder. Then write the full architecture documentation and update progress tracking exactly as CLAUDE.md requires.' },
      script: 'Celebrate the folders landing on the pulse rail. “Notice what\'s NOT here — no app code yet. That\'s next week, on a foundation that\'s actually yours.”',
    },
    {
      segment: 'guided-build', eyebrow: '✅ CP4 — validate + report', title: 'Claude audits its own work against your rules',
      body: 'The last step: Claude checks itself — CLAUDE.md unchanged, every folder justified, nothing protected touched, no stray dependencies — and reports a single status line. FOUNDATION VERIFIED means Week 3 starts on solid ground. FOUNDATION BLOCKED is just as valuable — it means governance caught something before it became a real problem.',
      code: { label: 'Validate + report', code: 'Audit the foundation you just created. Verify: CLAUDE.md is unchanged, every new folder has a documented responsibility, no implementation code or dependencies were added, no protected or generated location was touched, and progress tracking was updated. Show the final folder tree and the recommended first Week 3 implementation task. End with exactly one line: FOUNDATION VERIFIED — READY FOR WEEK 3, or FOUNDATION BLOCKED — ACTION REQUIRED.' },
      script: 'Celebrate CP4 on the pulse rail. “Everyone who just got VERIFIED — that\'s a foundation you can build Week 3 on with zero cleanup.”',
    },
    {
      segment: 'failure', eyebrow: '💥 Break it on purpose', title: 'The proposal that reaches into a protected folder',
      body: 'Ask Claude to scaffold before it has fully read CLAUDE.md\'s protected and legacy areas. Watch it propose writing into a DO-NOT-TOUCH or legacy folder anyway — confidently, with a plausible-sounding reason. This is the most common governance mistake in the wild — do not rescue it yet.',
      code: { label: 'The unchecked proposal', code: 'Propose a folder structure for this project. (Deliberately skip telling it to check CLAUDE.md\'s protected/legacy areas first.)' },
      script: 'Let it fail visibly. This controlled failure is the highest-retention moment of the class — sit in it for a beat.',
    },
    {
      segment: 'failure', eyebrow: '🔧 Fix it like an architect', title: 'Point back to the rule it missed',
      body: 'An architect never approves a plan without checking it against governance first: point Claude back to the exact CLAUDE.md rule it missed — the protected path, the legacy boundary — and have it re-propose. This is exactly what CP4 validation exists to catch before real damage is done. The lesson generalizes: a proposal is a plan, not permission to act.',
      code: { label: 'The governed re-proposal', code: 'You missed the CLAUDE.md rule marking that folder DO-NOT-TOUCH. Re-read CLAUDE.md\'s protected/legacy list, then re-propose the architecture respecting it.' },
      script: 'Land the generalization: “This is the entire program in miniature — governance in, trustworthy foundation out.”',
    },
  ],
};

/** Deep teaching content per week (1..12). Weeks 2-12 come from the generated
 *  fan-out (classTeachWeeks.ts); hand-authored days win on conflict.
 *
 *  Week 3 is merged per-DAY, not per-week: Monday is hand-authored (the
 *  project-build launch + Claude API / billing class) while Thursday still
 *  comes from the generated set, so replacing the whole `3` key would silently
 *  drop Build Day's content. */
export const WEEK_TEACH: Record<number, DayTeach> = {
  ...GENERATED_WEEK_TEACH,
  1: WEEK1,
  3: { ...GENERATED_WEEK_TEACH[3], monday: WEEK3_MONDAY },
};

/** Teach slides for a given week + day, or [] if none authored yet. */
export function teachSlidesFor(week: number | null, day: 'monday' | 'thursday'): TeachSlide[] {
  if (week == null) return [];
  const wk = WEEK_TEACH[week];
  return (wk && wk[day]) || [];
}
