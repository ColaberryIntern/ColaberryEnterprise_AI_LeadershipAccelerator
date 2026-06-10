// Curriculum build-tracker data — the 12-week structure for the AI Systems
// Architect Accelerator, plus the per-week build checklist and the build-ahead
// schedule. Pure data + pure functions, NO I/O — so it unit-tests without
// Basecamp and is the single source of truth for reconfigureCurriculumList.js.
//
// Week themes are verbatim from docs/training-program-2026-q3/launch-briefs/
// 11-swati-curriculum-twc.md (Track 1 table). Intensives map W1-3 / W4-6 /
// W7-9 / W10-12 per the TWC 4-seminar frame.
//
// "Lean 5-item per week" (Ali, 2026-06-10): Anthropic-section mapped /
// Lab+artifact spec / Assessment pack (quiz+survey) / NotebookLM video /
// Swati validation sign-off. Visual component dropped; social media is a
// program-wide optional student assignment, not a per-week build task.

// Cohort 1 kickoff — first Mon/Thu class (Mon Architecture Day + Thu Build Day).
const KICKOFF = '2026-07-13';

const INTENSIVE_NAMES = {
  1: 'Build Your AI Foundation',
  2: 'Create Your AI Team',
  3: 'Connect AI To The Real World',
  4: 'Design AI That Scales',
};

const WEEKS = [
  { week: 1, intensive: 1, theme: 'Claude Code Foundations + Architect Workspace setup' },
  { week: 2, intensive: 1, theme: 'Agent Skills (3 project-specific skills)' },
  { week: 3, intensive: 1, theme: 'Claude API + Business Workflow Assistant' },
  { week: 4, intensive: 2, theme: 'Prompt Engineering + Enterprise Prompt Library' },
  { week: 5, intensive: 2, theme: 'MCP Foundations + First MCP Server' },
  { week: 6, intensive: 2, theme: 'Advanced MCP + Business System Integration' },
  { week: 7, intensive: 3, theme: 'Subagents + Multi-Agent Team' },
  { week: 8, intensive: 3, theme: 'Claude Code Workflows + Development Automation' },
  { week: 9, intensive: 3, theme: 'Reliability Engineering + AI Quality Layer' },
  { week: 10, intensive: 4, theme: 'Governance + AI Governance Engine' },
  { week: 11, intensive: 4, theme: 'Systems Architecture + Solution Architecture Package' },
  { week: 12, intensive: 4, theme: 'Capstone (production-readiness polish) + Architect Expo' },
];

// The 5 priority Anthropic Skilljar courses (Appendix B, TRAINING_INTEGRATION_PLAN.md).
const ANTHROPIC_COURSES =
  'Claude 101 · Claude Code 101 · Intro to MCP · Intro to Subagents · Claude API';

// Per-week build checklist. `owner` is a launchPmoTeam handle; the orchestrator
// resolves it to a Basecamp person id (skips assignment if unprovisioned).
// `content` is stable across weeks so createTodo dedups correctly within each
// week-group. `description(w)` produces the rich-HTML body for week `w`.
const COMPONENTS = [
  {
    key: 'anthropic',
    content: 'Anthropic section mapped (enterprise.colaberry.com)',
    owner: 'kes',
    description: (w) =>
      `<div><p><strong>Map this week to the Anthropic course.</strong> Identify which Anthropic Skilljar course/section delivered on enterprise.colaberry.com covers <em>${w.theme}</em>, and record the section reference + URL.</p>` +
      `<p>Priority courses: ${ANTHROPIC_COURSES}.</p>` +
      `<p><strong>Done means:</strong> the exact Anthropic section for Week ${w.week} is named and linked in the LMS, and Kes has confirmed it is wired on enterprise.colaberry.com.</p></div>`,
  },
  {
    key: 'lab',
    content: 'Lab + artifact spec built',
    owner: 'swati',
    description: (w) =>
      `<div><p><strong>Define what the student builds this week and the artifact(s) it produces.</strong> Lego model: this layers onto their single project. Theme: <em>${w.theme}</em>.</p>` +
      `<p>Decide the build artifact (Tier A) for Week ${w.week} and which showcase artifacts (Tier B: demo/explainer/one-pager) it can feed. CB drafts the lab; Swati owns the spec.</p>` +
      `<p><strong>Done means:</strong> a written lab spec (objective, steps, the artifact produced, how it advances their project) exists and is build-ready.</p></div>`,
  },
  {
    key: 'assessment',
    content: 'Assessment pack — quiz + survey questions',
    owner: 'swati',
    description: (w) =>
      `<div><p><strong>Quiz + survey for Week ${w.week}.</strong> CB drafts a 5-question warmup + 10-question post quiz and the week feedback survey; <strong>Swati approves</strong>.</p>` +
      `<p><strong>Done means:</strong> quiz + survey questions are drafted by CB and approved by Swati, ready to load into the LMS.</p></div>`,
  },
  {
    key: 'notebooklm',
    content: 'NotebookLM video produced',
    owner: 'swati',
    description: (w) =>
      `<div><p><strong>Produce the NotebookLM video(s) for Week ${w.week}</strong> covering <em>${w.theme}</em>.</p>` +
      `<p><strong>Done means:</strong> the NotebookLM video is produced, reviewed, and linked for delivery on the platform.</p></div>`,
  },
  {
    key: 'signoff',
    content: 'Swati validation sign-off',
    owner: 'swati',
    description: (w) =>
      `<div><p><strong>Week ${w.week} validation gate.</strong> Swati confirms the Anthropic mapping, lab+artifact, assessment pack, and NotebookLM video for <em>${w.theme}</em> are complete, consistent, and ready to teach.</p>` +
      `<p><strong>Done means:</strong> Swati has signed off the full week as launch-ready.</p></div>`,
  },
];

// --- Schedule (build-ahead) ----------------------------------------------
// UTC-safe date math so it's deterministic regardless of host timezone.
function isoAddDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The week's teaching Monday (Architecture Day): kickoff + (week-1) weeks.
function weekTeachingMonday(week) {
  return isoAddDays(KICKOFF, (week - 1) * 7);
}

// Build tasks are due build-ahead: the Friday BEFORE that teaching week
// (teaching Monday - 3 days). Week 1 -> 2026-07-10; Week 12 -> 2026-09-25.
// BUILD_AHEAD_DAYS is the one-line tunable if you want a bigger buffer.
const BUILD_AHEAD_DAYS = 3;
function weekDueDate(week) {
  return isoAddDays(KICKOFF, (week - 1) * 7 - BUILD_AHEAD_DAYS);
}

function groupName(w) {
  const n = String(w.week).padStart(2, '0');
  return `Week ${n} · Intensive ${w.intensive} — ${w.theme}`;
}

module.exports = {
  KICKOFF,
  BUILD_AHEAD_DAYS,
  INTENSIVE_NAMES,
  ANTHROPIC_COURSES,
  WEEKS,
  COMPONENTS,
  isoAddDays,
  weekTeachingMonday,
  weekDueDate,
  groupName,
};
