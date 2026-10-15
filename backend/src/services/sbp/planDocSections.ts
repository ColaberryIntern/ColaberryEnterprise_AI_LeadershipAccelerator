/**
 * The individual documents a BuildPlan renders into — extracted from `renderDocs.ts`.
 *
 * WHY THIS FILE EXISTS. `renderDocs.ts` reached 554 lines, past CLAUDE.md's 500-line hard
 * ceiling, and the rule there is explicit: "When a file or function exceeds the hard ceiling, the
 * next change to it MUST split it before adding new code." P6-T3 adds per-story blueprint,
 * workspace, task and design references to the story document, so the split came first rather
 * than after. Phase 5 of this programme already honoured the same rule by splitting a test file
 * at 504 lines, which removed the "tests are exempt" argument — a production renderer never had
 * one.
 *
 * THE SEAM, chosen by measurement rather than by taste. `renderDocs.ts` keeps three things: the
 * public types, the path policy (`PATH_ALLOWLIST`, `isAllowedPath`, `RenderError`) and the
 * orchestrator that assembles the file set. This file holds the per-document renderers. They were
 * separable because the dependency runs ONE WAY: `renderClaudeMd` reads exactly one field of the
 * render context — `repoUrl` — so this module declares that single field itself instead of
 * importing `RenderContext` back from `renderDocs.ts`. `RenderContext` satisfies it structurally.
 * That is what keeps this out of the circular-import smell CLAUDE.md names, with no third module
 * invented to hold one interface.
 *
 * Still PURE: no I/O, no clock, no randomness. Same plan in, byte-identical strings out. The
 * orchestrator hashes the output, so any impurity here would show up as a repo commit whose only
 * change is that it was rendered again.
 */
import { BuildPlan, PlanRelease, PlanRequirement, PlanStory, isConstraint } from './planContract';
import { STUDENT_DATA_CONTRACT_PATH } from './studentDataContract';
import { COMMAND_CENTER_STORY_ID } from './commandCenterStory';

/**
 * The only part of the render context these renderers read.
 *
 * Declared here rather than imported so the dependency between this module and `renderDocs.ts`
 * runs in one direction only. `RenderContext` has ~12 fields; `renderClaudeMd` reads one.
 */
export interface SectionContext {
  /** Clone URL, when a repo is provisioned. Omitted means prompts must not cite paths. */
  repoUrl?: string | null;
}

/** Deterministic ordering so re-rendering an unchanged plan produces no diff. */
export const byKey = <T>(items: T[], key: (t: T) => string): T[] =>
  [...items].sort((a, b) => key(a).localeCompare(key(b)));

const KIND_LABEL: Record<string, string> = {
  FUNC: 'Functional', SAFE: 'Safety', REL: 'Reliability',
  NFR: 'Non-functional', OBS: 'Observability', CONSTRAINT: 'Constraint',
};

// ── individual documents ────────────────────────────────────────────────────

export function renderRequirements(plan: BuildPlan): string {
  const clusters = byKey([...new Set(plan.requirements.map((r) => r.cluster))], (c) => c);
  const lines: string[] = [
    `# ${plan.project_name} — Requirements`,
    '',
    plan.descriptor,
    '',
    'This is the source of truth for what you are building. Your Claude Code prompts',
    'point here. If you sharpen a requirement, edit it — your version is the real one.',
    '',
    '| Kind | Meaning |',
    '|---|---|',
    '| Functional | something the system does |',
    '| Safety | a guardrail, with a check that enforces it |',
    '| Reliability | how it behaves when something fails |',
    '| Constraint | a technology or vendor you must use — context, not a task |',
    '',
  ];
  for (const cluster of clusters) {
    lines.push(`## ${cluster}`, '');
    const inCluster = byKey(plan.requirements.filter((r) => r.cluster === cluster), (r) => r.id);
    for (const r of inCluster) {
      const tag = isConstraint(r) ? 'Constraint' : `${KIND_LABEL[r.kind] ?? r.kind} · ${r.priority}`;
      lines.push(`### ${r.id} — ${tag}`, '', r.statement, '');
      const stories = plan.stories.filter((s) => (s.fulfills ?? []).includes(r.id));
      lines.push(stories.length
        ? `Fulfilled by: ${byKey(stories, (s) => s.id).map((s) => s.id).join(', ')}`
        : isConstraint(r)
          ? 'Context for the stories that use it — constraints do not get their own story.'
          : '_Not yet fulfilled by any story._');
      lines.push('');
    }
  }
  return lines.join('\n');
}

/**
 * The lifecycle references, when a story has them.
 *
 * RETURNS AN EMPTY ARRAY WHEN ABSENT, and that is the load-bearing behaviour rather than a
 * convenience. Every plan generated before 2026-10-09 has no `references`, as does any plan whose
 * project has no approved blueprint — so the common case is absence, and absence must render
 * NOTHING. Emitting a heading with "unknown" underneath would put a claim in the student's repo
 * that the platform cannot support, and `renderDocs` hashes its output, so an empty section would
 * also churn a commit into every repo that has one.
 *
 * The inverse matters too, for the rollback direction: a plan that HAS references must stay
 * renderable by code that does not know about them. It is, because this reads one optional key and
 * everything else ignores extra keys — asserted in both directions in `renderDocs.test.ts`.
 */
function renderStoryReferences(story: PlanStory): string[] {
  const refs = story.references;
  const ws = story.workspace;
  // Two INDEPENDENT sources now, which is why neither gates the other: `workspace` is
  // model-emitted and present on any plan generated after 2026-10-10, while `references` is
  // server-resolved and present only once a blueprint exists. A story can legitimately have
  // one and not the other, and rendering nothing because the other half is missing would
  // hide the half that IS known.
  if (!refs && !ws) return [];

  const lines = ['## Where this fits', ''];
  if (ws) {
    lines.push(ws.kind === 'headless'
      ? `**Runs headless:** ${ws.ref} — no page shows this; it is background work.`
      : `**Workspace:** ${ws.ref}${ws.action ? ` · ${ws.action}` : ''}`);
  }
  if (refs) {
    lines.push(`**Blueprint:** revision ${refs.blueprint.revision} (\`${refs.blueprint.content_sha256.slice(0, 12)}\`)`);
  }
  if (refs?.business_task_ids.length) lines.push(`**Business tasks:** ${refs.business_task_ids.join(', ')}`);
  if (refs?.design_refs.length) lines.push(`**Design decisions:** ${refs.design_refs.join(', ')}`);
  if (refs?.builder_agent) lines.push(`**Built by:** ${refs.builder_agent}`);
  lines.push('');

  if (refs?.acceptance_evidence.length) {
    lines.push(
      '### Evidence this story needs',
      '',
      'Separate from the acceptance boxes below: those are what you check, these are what has to be',
      'observable afterwards for the work to count as delivered.',
      '',
      ...refs.acceptance_evidence.map((e) => `- ${e}`),
      '',
    );
  }
  return lines;
}

export function renderStoryFile(plan: BuildPlan, story: PlanStory, release?: PlanRelease): string {
  const reqs = (story.fulfills ?? [])
    .map((id) => plan.requirements.find((r) => r.id === id))
    .filter((r): r is PlanRequirement => !!r);

  return [
    `# ${story.id} — ${story.title}`,
    '',
    story.narrative,
    '',
    release ? `**Release:** ${release.key} · ${release.name} (weeks ${release.week_start}–${release.week_end})` : `**Release:** ${story.release}`,
    `**Owner:** ${story.owner_agent}`,
    (story.blocked_by ?? []).length ? `**Blocked by:** ${story.blocked_by!.join(', ')}` : '**Blocked by:** nothing — you can start this now',
    '',
    '## The requirement this satisfies',
    '',
    ...(reqs.length
      ? reqs.map((r) => `- **${r.id}** (${KIND_LABEL[r.kind] ?? r.kind}, ${r.priority}) — ${r.statement}`)
      : ['_No requirement linked._']),
    '',
    '## How to build it',
    '',
    story.task_guidance,
    '',
    '## Failure paths you must handle',
    '',
    ...(story.failure_paths ?? []).map((f) => `- ${f}`),
    '',
    ...renderStoryReferences(story),
    '## Acceptance — your stop condition',
    '',
    'Tick each box as it genuinely passes. This file is yours — the platform reads',
    'the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in',
    'step (see the managed block in CLAUDE.md). Ticking something you have not',
    'actually met only misleads you.',
    '',
    ...(story.acceptance ?? []).map((a) => `- [ ] ${a}`),
    '',
    'When every box above is ticked, stop and show the demo.',
    '',
  ].join('\n');
}

export function renderStories(plan: BuildPlan): string {
  const releases = byKey(plan.releases, (r) => r.key);
  const lines: string[] = [
    `# ${plan.project_name} — Stories`,
    '',
    `${plan.stories.length} stories across ${plan.releases.length} releases, walking-skeleton first:`,
    'the earliest release proves the thinnest end-to-end path including the trust',
    'spine, and later releases stack features on top of something already working.',
    '',
  ];

  // STORY-000 leads the index rather than sitting in a release, because it comes
  // before all of them. Listing it here matters as much as rendering its doc: an
  // agent that scans STORIES.md to find the work would otherwise never learn the
  // first story exists.
  if (!plan.stories.some((s) => s.id === COMMAND_CENTER_STORY_ID)) {
    lines.push(
      '## Before the releases — start here',
      '',
      `- **[${COMMAND_CENTER_STORY_ID}](stories/${COMMAND_CENTER_STORY_ID}.md)** — Build your Command Center`,
      '',
      'The first thing you build, on day one, before any part of the system itself. It is',
      'the page you keep open for the rest of the programme and demo from. It belongs to no',
      'release and fulfils none of your requirements, because it is the window onto your',
      'system rather than a part of it.',
      '',
    );
  }
  for (const rel of releases) {
    const inRel = byKey(plan.stories.filter((s) => s.release === rel.key), (s) => s.id);
    lines.push(
      `## ${rel.key} · ${rel.name} — weeks ${rel.week_start}–${rel.week_end}`,
      '',
      `**Goal:** ${rel.goal}`,
      `**Done when you can show:** ${rel.demo}`,
      '',
    );
    for (const s of inRel) {
      const gate = (s.blocked_by ?? []).length ? ` _(waits on ${s.blocked_by!.join(', ')})_` : '';
      lines.push(`- **[${s.id}](stories/${s.id}.md)** — ${s.title}${gate}`);
    }
    if (!inRel.length) lines.push('_No stories in this release._');
    lines.push('');
  }
  return lines.join('\n');
}

export function renderTraceability(plan: BuildPlan): string {
  const lines: string[] = [
    `# ${plan.project_name} — Traceability`,
    '',
    'Every requirement, and the stories that fulfil it. A `must` requirement with no',
    'story is a gap the plan gate refuses to publish; a constraint legitimately has',
    'none, because it is context rather than work.',
    '',
    '| Requirement | Kind | Priority | Fulfilled by |',
    '|---|---|---|---|',
  ];
  for (const r of byKey(plan.requirements, (x) => x.id)) {
    const stories = byKey(plan.stories.filter((s) => (s.fulfills ?? []).includes(r.id)), (s) => s.id);
    const cell = stories.length
      ? stories.map((s) => s.id).join(', ')
      : isConstraint(r) ? '_(constraint — no story)_' : '**none**';
    lines.push(`| ${r.id} | ${KIND_LABEL[r.kind] ?? r.kind} | ${r.priority} | ${cell} |`);
  }
  const uncovered = plan.requirements.filter(
    (r) => r.priority === 'must' && !isConstraint(r) && !plan.stories.some((s) => (s.fulfills ?? []).includes(r.id)),
  );
  lines.push('', uncovered.length
    ? `⚠️ ${uncovered.length} must-have requirement(s) have no story: ${uncovered.map((r) => r.id).join(', ')}`
    : '✅ Every must-have requirement is fulfilled by at least one story.');
  lines.push('');
  return lines.join('\n');
}

export function renderClaudeMd(plan: BuildPlan, ctx: SectionContext): string {
  return [
    `# CLAUDE.md — ${plan.project_name}`,
    '',
    'Conventions for this build. Claude Code reads this automatically.',
    '',
    '## What this is',
    '',
    plan.descriptor,
    '',
    '## Where the truth lives',
    '',
    '- `docs/REQUIREMENTS.md` — what the system must do',
    '- `docs/STORIES.md` — the work, by release',
    '- `docs/stories/STORY-nnn.md` — one story in full, with its acceptance criteria',
    '- `docs/TRACEABILITY.md` — which story covers which requirement',
    '',
    'Read the requirement before writing code for a story. If the requirement is wrong,',
    'fix the requirement — you are the architect here, not a typist.',
    '',
    '## How we build',
    '',
    '- **Walking skeleton first.** Get the thinnest end-to-end path working, including the',
    '  audit trail and whatever correctness guarantee this system promises, before stacking features.',
    '- **Small, reversible steps.** A change you cannot undo in one command is too big.',
    '- **Every external call gets an explicit timeout and capped retries.** No unbounded waits.',
    '- **Every side effect is idempotent.** Running it twice must not double-charge, double-email,',
    '  or double-create. If a retry can produce a duplicate, it is broken.',
    '- **Never swallow an error.** An empty `catch` block is a defect, not tidiness.',
    '',
    '## Definition of done',
    '',
    'A story is done when **every** acceptance criterion on it passes **and** a commit',
    'names it. Both halves. All of the criteria, not the important ones; and the work in',
    'git, not just ticked off.',
    '',
    '1. Tests cover the happy path **and** at least one failure path.',
    '2. No secrets in code, commits, or logs.',
    '3. Every acceptance criterion in `docs/stories/STORY-nnn.md` genuinely passes.',
    '',
    '## When you finish a story',
    '',
    'Two steps, in this order. The platform reads both — skip either and the story stays',
    'unverified, and it will tell you which half is missing.',
    '',
    '1. Update `.colaberry/progress.json`: find the story by `id`, set `passed` on each',
    '   criterion to what is actually true, and fill in `files_touched` and `tests_added`.',
    '   Leave the ones that do not pass as `false` — a partly finished story is a real,',
    '   expected state and reports honestly. Do not add criteria of your own: only the ones',
    '   from the plan are counted, and invented ones are discarded.',
    '2. Commit, naming the story in a trailer, e.g. `STORY-001: add the roster endpoint`',
    '   with `Story: STORY-001` on its own line below. The commit must change at least one',
    '   file. Then push — the platform reads pushed commits, not your working tree.',
    '',
    ...(ctx.repoUrl ? ['## This repo', '', ctx.repoUrl, ''] : []),
    '## The `.colaberry/` files',
    '',
    // WHY THIS SECTION WAS REWRITTEN. It used to be headed "What not to edit"
    // and said plan.json and manifest.json "are platform bookkeeping and are
    // overwritten on every sync". Two of STORY-000's acceptance criteria ask the
    // student to attest to those very files, so we were asking them to vouch for
    // files we had told them were ours and none of their business. 8 of 9
    // students created manifest.json themselves regardless; one read our sentence
    // the way it was written and did not, and both readings were defensible.
    //
    // The honest statement is that the platform SEEDS these files where it can
    // push, and cannot where it cannot — and on a pull-only repo (a legitimate
    // choice, not an error) they are the student's to create and keep. Ownership
    // now matches what the criteria ask for.
    'These three files are what your Command Center reads, so they have to be in your repo.',
    '',
    '- `.colaberry/plan.json` — your requirements, stories and releases. **The plan only.**',
    '  It carries no completion state: there is no `built` on a requirement and no',
    '  `status` on a story, in any version.',
    '- `.colaberry/progress.json` — the criteria, which of them you have confirmed, and',
    '  the story state. **Completion comes from here**, via `stories[].verification.state`.',
    '- `.colaberry/manifest.json` — when the data above was last refreshed.',
    '',
    `See \`${STUDENT_DATA_CONTRACT_PATH}\` for the field-by-field spec of all three, the`,
    'join on story id, and a worked example. Read it before you write anything that',
    'renders them — guessing at these shapes is the single most common way a Command',
    'Center ends up showing numbers that are not true.',
    '',
    'Where the platform has push access to this repo it writes all three for you on every',
    'sync. It always refreshes `manifest.json`. It refreshes `plan.json` only while that file',
    'is still exactly as the platform last wrote it: **edit `plan.json` by hand and the',
    'platform will notice and stop overwriting it** — your version stays, and later plan',
    'changes stop arriving in it, so from then on it is yours to maintain. (It compares your',
    'copy against the hash in `manifest.json`, and it leaves the file alone whenever it cannot',
    'prove the copy is one it wrote.) **Where it does not have push access it',
    'cannot put them there at all**, and they are yours to add: download them from the',
    'workspace panel in the portal and commit them like any other file. Either way, a',
    'criterion that names one of these files is not satisfied until the file is really in',
    'your repo.',
    '',
    '`.colaberry/progress.json` is shared in both cases: the platform owns the story and',
    'criterion list in it, you own the `passed` flags and the notes, and a sync keeps your',
    'side. Everything else — including the docs above — is yours to change.',
    '',
  ].join('\n');
}
