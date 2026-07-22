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
  /** A copy-ready Claude Code prompt or code/config snippet. */
  code?: { label: string; code: string };
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
      body: 'Claude can only reason about what’s in its context window. It fills as you work — every file read, every command output. When it’s full, quality drops. You manage it deliberately: /context to see it, /compact to summarize and reclaim space, /clear to start fresh. Treating context as a budget is the habit that separates good sessions from bad ones.',
      code: { label: 'Context commands', code: '/context   # see what is loaded\n/compact   # summarize + reclaim space\n/clear     # start a fresh window' },
      script: 'Demo /context live if you can. “When quality drops mid-task, 9 times out of 10 the window is full — compact it.”',
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
      segment: 'deconstruct', eyebrow: '❌ What fails', title: 'The three habits that wreck a session',
      body: 'Now the anti-patterns: skipping Plan Mode so Claude edits the wrong file; never compacting so context bloats and quality tanks; a vague CLAUDE.md that Claude quietly ignores. Each is a habit — and each has a fix you’ll practice on Thursday.',
      bullets: ['Skipping Plan Mode → wrong edits', 'Never compacting → quality decay', 'Vague CLAUDE.md → ignored rules'],
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
      segment: 'build-map', eyebrow: '🗺️ Today’s build', title: 'By 8:30 you have a workspace that steers Claude',
      body: 'You leave with a committed Architect Workspace, a CLAUDE.md that actually steers Claude, and a real change authored entirely through Claude Code. Four checkpoints, a rescue branch, and nobody left behind.',
      script: 'Show the finished result first (the cold open). “This is where we all are by the end — let’s get there together.”',
    },
    {
      segment: 'guided-build', eyebrow: '0️⃣ CP0 — clean start', title: 'Everyone at the same starting line',
      body: 'Workspace open in VS Code, Claude Code running. This is Checkpoint 0 — we don’t move until everyone is here.',
      code: { label: 'Start', code: 'cd architect-workspace && claude' },
      script: 'Wait for the pulse rail to fill with “I’m here.” Call the number out loud: “18 of 22 — three more.”',
    },
    {
      segment: 'guided-build', eyebrow: '🔍 Explore first', title: 'Never let Claude edit blind',
      body: 'First have Claude read and summarize the repo. This loads the right context and surfaces surprises before they cost you an edit in the wrong place.',
      code: { label: 'Explore', code: 'Explore this repo and summarize its structure, entry points, and conventions. Do not change anything yet.' },
      script: 'Narrate why: “We’re spending context on understanding now so we don’t waste an edit later.”',
    },
    {
      segment: 'guided-build', eyebrow: '📄 CP1 — CLAUDE.md', title: 'Give Claude your standards',
      body: 'Author the CLAUDE.md — three specific, testable rules. This is Checkpoint 1: a file that will steer every change you make for the rest of the program.',
      code: { label: 'Author CLAUDE.md', code: 'Draft a CLAUDE.md with specific, testable rules for naming, file size, and how to run the tests. Keep only rules that change behavior.' },
      script: 'Have the room paste their three rules into the class chat. Read two out loud — one sharp, one vague — and compare.',
    },
    {
      segment: 'guided-build', eyebrow: '📝 CP2 — plan a real change', title: 'Plan Mode: propose, don’t touch',
      body: 'In Plan Mode, ask Claude to propose adding a health-check endpoint. Read the plan. Approve it. This is where you feel the difference from chat — it asks before it acts.',
      code: { label: 'Plan', code: 'In Plan Mode: propose how you would add a /health endpoint that returns status and version. Show the plan; do not edit yet.' },
      script: 'This is the main build footage. Zoom the terminal, increase font size, keep the cursor visible.',
    },
    {
      segment: 'guided-build', eyebrow: '⌨️ CP3 — code + commit', title: 'Ship it without hand-writing the code',
      body: 'Implement the approved plan, run the tests, and commit. You just shipped a real change through explore → plan → code → commit — the loop you’ll use every week.',
      code: { label: 'Ship', code: 'Implement the approved plan, run the tests, then commit with a clear message.' },
      script: 'Celebrate CP3 on the pulse rail. “Everyone who just committed — that’s a change you directed, not typed.”',
    },
    {
      segment: 'failure', eyebrow: '💥 Break it on purpose', title: 'The vague rule Claude quietly ignores',
      body: 'Add a CLAUDE.md rule that only says “write clean code,” then ask Claude for a change and watch it ignore the intent. This is the most common CLAUDE.md mistake in the wild — do not rescue it yet.',
      code: { label: 'The bad rule', code: '# CLAUDE.md\n- Write clean code.' },
      script: 'Let it fail visibly. This controlled failure is the highest-retention moment of the class — sit in it for a beat.',
    },
    {
      segment: 'failure', eyebrow: '🔧 Fix it like an architect', title: 'Specific + testable makes the rule bite',
      body: 'Replace the aspiration with a specific, testable instruction and re-run. Now Claude pushes back when a change would violate it. The lesson generalizes across the whole program: vague instructions produce vague behavior, everywhere.',
      code: { label: 'The rule that bites', code: '# CLAUDE.md\n- Functions ≤ 50 lines; split before adding code.\n- No `any` without a one-line justification comment.' },
      script: 'Land the generalization: “This is the entire program in miniature — precision in, reliability out.”',
    },
  ],
};

/** Deep teaching content per week (1..12). Weeks 2-12 come from the generated
 *  fan-out (classTeachWeeks.ts); the hand-authored Week 1 wins on conflict. */
export const WEEK_TEACH: Record<number, DayTeach> = {
  ...GENERATED_WEEK_TEACH,
  1: WEEK1,
};

/** Teach slides for a given week + day, or [] if none authored yet. */
export function teachSlidesFor(week: number | null, day: 'monday' | 'thursday'): TeachSlide[] {
  if (week == null) return [];
  const wk = WEEK_TEACH[week];
  return (wk && wk[day]) || [];
}
