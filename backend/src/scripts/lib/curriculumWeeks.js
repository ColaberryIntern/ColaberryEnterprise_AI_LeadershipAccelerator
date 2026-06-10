// Curriculum build-tracker data — the 12-week structure for the AI Systems
// Architect Accelerator, plus the per-week build checklist and schedule.
// Pure data + pure functions, NO I/O — unit-tests without Basecamp and is the
// single source of truth for reconfigureCurriculumList.js.
//
// Week themes are verbatim from docs/training-program-2026-q3/launch-briefs/
// 11-swati-curriculum-twc.md (Track 1). Intensives map W1-3 / W4-6 / W7-9 /
// W10-12 per the TWC 4-seminar frame.
//
// Each week is pre-mapped to its specific Anthropic Skilljar course (validated
// against the live catalog at anthropic.skilljar.com, 2026-06-10). Weeks 4/9/
// 10/11 have NO Anthropic course — they are Colaberry-original architecture
// content (the "AI Systems Architect" differentiator).
//
// "Lean 5-item per week" (Ali, 2026-06-10): Anthropic course confirmed+wired /
// Lab+artifact spec / Assessment pack (quiz+survey) / NotebookLM video / Swati
// sign-off. Visual dropped; social media is a program-wide optional student
// assignment, not a per-week build task.

// Cohort 1 kickoff — first Mon/Thu class (Mon Architecture Day + Thu Build Day).
const KICKOFF = '2026-07-13';

// Build-deadline model (Ali, 2026-06-10): staggered build-ahead. Each week's
// content is due the Friday BEFORE that week is taught (teaching Monday minus
// BUILD_AHEAD_DAYS). Week 1 -> 2026-07-10 (before launch); Week 12 -> 2026-09-25.
const BUILD_AHEAD_DAYS = 3;

const SKILLJAR = 'https://anthropic.skilljar.com';
const CCA_F = 'https://claudecertifications.com/claude-certified-architect/exam-guide';

const INTENSIVE_NAMES = {
  1: 'Build Your AI Foundation',
  2: 'Create Your AI Team',
  3: 'Connect AI To The Real World',
  4: 'Design AI That Scales',
};

// anthropic: { course, url } for a real Skilljar course, or { course, url:null }
// when the week is Colaberry-original (no Anthropic course exists).
const WEEKS = [
  { week: 1, intensive: 1, theme: 'Claude Code Foundations + Architect Workspace setup',
    anthropic: { course: 'Claude Code 101 (+ Claude Code in Action)', url: `${SKILLJAR}/claude-code-101` } },
  { week: 2, intensive: 1, theme: 'Agent Skills (3 project-specific skills)',
    anthropic: { course: 'Introduction to agent skills', url: `${SKILLJAR}/introduction-to-agent-skills` } },
  { week: 3, intensive: 1, theme: 'Claude API + Business Workflow Assistant',
    anthropic: { course: 'Building with the Claude API', url: `${SKILLJAR}/claude-with-the-anthropic-api` } },
  { week: 4, intensive: 2, theme: 'Prompt Engineering + Enterprise Prompt Library',
    anthropic: { course: 'Colaberry-original (no dedicated Anthropic course; draw from Claude 101)', url: null } },
  { week: 5, intensive: 2, theme: 'MCP Foundations + First MCP Server',
    anthropic: { course: 'Introduction to Model Context Protocol', url: `${SKILLJAR}/introduction-to-model-context-protocol` } },
  { week: 6, intensive: 2, theme: 'Advanced MCP + Business System Integration',
    anthropic: { course: 'Model Context Protocol: Advanced Topics', url: `${SKILLJAR}/model-context-protocol-advanced-topics` } },
  { week: 7, intensive: 3, theme: 'Subagents + Multi-Agent Team',
    anthropic: { course: 'Introduction to subagents', url: `${SKILLJAR}/introduction-to-subagents` } },
  { week: 8, intensive: 3, theme: 'Claude Code Workflows + Development Automation',
    anthropic: { course: 'Claude Code in Action (workflows section)', url: `${SKILLJAR}/claude-code-in-action` } },
  { week: 9, intensive: 3, theme: 'Reliability Engineering + AI Quality Layer',
    anthropic: { course: 'Colaberry-original (no Anthropic course — architecture layer)', url: null } },
  { week: 10, intensive: 4, theme: 'Governance + AI Governance Engine',
    anthropic: { course: 'Colaberry-original (no Anthropic course — architecture layer)', url: null } },
  { week: 11, intensive: 4, theme: 'Systems Architecture + Solution Architecture Package',
    anthropic: { course: 'Colaberry-original (no Anthropic course — architecture layer)', url: null } },
  { week: 12, intensive: 4, theme: 'Capstone (production-readiness polish) + Architect Expo',
    anthropic: { course: 'Claude Certified Architect – Foundations (CCA-F exam)', url: CCA_F } },
];

// The 5 priority Anthropic Skilljar courses (reference, Appendix B).
const ANTHROPIC_COURSES =
  'Claude 101 · Claude Code 101 · Intro to MCP · Intro to Subagents · Claude API';

// Per-week build checklist. `owner` is a launchPmoTeam handle; the orchestrator
// resolves it to a Basecamp person id (skips assignment if unprovisioned).
// `content` is stable across weeks so the upsert keys correctly within each
// week-group. `description(w)` produces the rich-HTML body for week `w`.
const COMPONENTS = [
  {
    key: 'anthropic',
    content: 'Anthropic section mapped (enterprise.colaberry.com)',
    owner: 'kes',
    description: (w) => {
      const a = w.anthropic;
      if (a.url) {
        return `<div><p><strong>Confirm + wire the Anthropic course for this week.</strong> Week ${w.week} (<em>${w.theme}</em>) maps to <a href="${a.url}">${a.course}</a> on Anthropic Skilljar.</p>` +
          `<p>Kes confirms the exact section and wires the link / SSO so it is delivered on enterprise.colaberry.com.</p>` +
          `<p><strong>Done means:</strong> ${a.course} is linked for Week ${w.week} and confirmed live on enterprise.colaberry.com.</p></div>`;
      }
      return `<div><p><strong>Build the Colaberry-original module for this week.</strong> Week ${w.week} (<em>${w.theme}</em>) has <strong>no dedicated Anthropic Skilljar course</strong> — this is Colaberry's architecture-layer content (${a.course}).</p>` +
        `<p>Define + source the teaching material; reference any Anthropic foundation course (e.g. Claude 101) as background.</p>` +
        `<p><strong>Done means:</strong> the Colaberry-original module for Week ${w.week} is specced and ready on enterprise.colaberry.com.</p></div>`;
    },
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
    // Intensive 1 (Weeks 1-3): Ali co-signs to set the standard. Weeks 4-12:
    // Swati signs solo.
    owners: (w) => (w.intensive === 1 ? ['swati', 'ali'] : ['swati']),
    description: (w) => {
      const aliCoSign = w.intensive === 1;
      const who = aliCoSign ? 'Swati + Ali co-sign' : 'Swati confirms';
      const note = aliCoSign
        ? '<p><strong>Ali co-signs Intensive 1 (Weeks 1-3) to set the quality standard the rest of the program follows.</strong></p>'
        : '';
      return `<div><p><strong>Week ${w.week} validation gate.</strong> ${who} that the Anthropic mapping, lab+artifact, assessment pack, and NotebookLM video for <em>${w.theme}</em> are complete, consistent, and ready to teach.</p>` +
        note +
        `<p><strong>Done means:</strong> ${aliCoSign ? 'Swati and Ali have' : 'Swati has'} signed off the full week as launch-ready.</p></div>`;
    },
  },
];

// --- Schedule -------------------------------------------------------------
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

// Build deadline (staggered): the Friday before the week is taught.
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
