/**
 * renderDocs — a BuildPlan becomes the document set written into the student's
 * workspace repo. PURE: no I/O, no clock, no randomness. Same plan in, byte-
 * identical files out.
 *
 * This is what makes the prompts honest. Every generated story prompt opens with
 * "Read this first: ./docs/REQUIREMENTS.md, ./docs/stories/STORY-nnn.md" — and
 * for a student those paths currently resolve to nothing, because nothing writes
 * them (docs/BUILD_PIPELINE_AUDIT.md, and SBP-GH-v1 §1). These renderers produce
 * the files; repoWriter (T12) commits them; buildStoryPrompt (T13) asserts every
 * path it names appears in the manifest.
 *
 * Acceptance criteria render as UNTICKED checkboxes because that is the progress
 * signal: SBP-GH-v1 §8 derives "done" from the repo, and a ticked box in
 * docs/stories/STORY-nnn.md is one of the three checks that unlocks mark-done.
 */
import { createHash } from 'crypto';
import { BuildPlan, PlanRelease, PlanRequirement, PlanStory, isConstraint } from './planContract';

export interface RenderedFile {
  /** Repo-relative, forward slashes, inside the allowlist. */
  path: string;
  content: string;
}

export interface RenderContext {
  /** Clone URL, when a repo is provisioned. Omitted ⇒ prompts must not cite paths. */
  repoUrl?: string | null;
  /** Stamped into the manifest. Passed in, never read from a clock — purity. */
  generatedAt?: string;
  planVersion?: number;
  planSha256?: string;
  correlationId?: string;
}

/**
 * The ONLY paths the platform may write in a student's repo (SBP-GH-v1 FR-027).
 * Everything else in that repo is theirs. repoWriter re-checks this before any
 * network call; enforcing it here too means a bad path cannot even be produced.
 */
export const PATH_ALLOWLIST = [/^CLAUDE\.md$/, /^docs\/.+/, /^\.colaberry\/.+/];

export function isAllowedPath(path: string): boolean {
  return PATH_ALLOWLIST.some((re) => re.test(path));
}

export class RenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RenderError';
  }
}

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

/** Deterministic ordering so re-rendering an unchanged plan produces no diff. */
const byKey = <T>(items: T[], key: (t: T) => string): T[] =>
  [...items].sort((a, b) => key(a).localeCompare(key(b)));

const KIND_LABEL: Record<string, string> = {
  FUNC: 'Functional', SAFE: 'Safety', REL: 'Reliability',
  NFR: 'Non-functional', OBS: 'Observability', CONSTRAINT: 'Constraint',
};

// ── individual documents ────────────────────────────────────────────────────

function renderRequirements(plan: BuildPlan): string {
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

function renderStoryFile(plan: BuildPlan, story: PlanStory, release?: PlanRelease): string {
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
    '## Acceptance — your stop condition',
    '',
    'Tick each box as it genuinely passes. These boxes are how the platform knows',
    'this story is done — it reads them from this file, so ticking one you have not',
    'actually met only misleads you.',
    '',
    ...(story.acceptance ?? []).map((a) => `- [ ] ${a}`),
    '',
    'When every box above is ticked, stop and show the demo.',
    '',
  ].join('\n');
}

function renderStories(plan: BuildPlan): string {
  const releases = byKey(plan.releases, (r) => r.key);
  const lines: string[] = [
    `# ${plan.project_name} — Stories`,
    '',
    `${plan.stories.length} stories across ${plan.releases.length} releases, walking-skeleton first:`,
    'the earliest release proves the thinnest end-to-end path including the trust',
    'spine, and later releases stack features on top of something already working.',
    '',
  ];
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

function renderTraceability(plan: BuildPlan): string {
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

function renderClaudeMd(plan: BuildPlan, ctx: RenderContext): string {
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
    'A story is done when every acceptance box in its story file genuinely passes:',
    '',
    '1. Tests cover the happy path **and** at least one failure path.',
    '2. No secrets in code, commits, or logs.',
    '3. The commit message names the story, e.g. `STORY-001: add the roster endpoint`.',
    '   The platform reads that to track your progress — without it your work is invisible.',
    '4. You tick the acceptance boxes in `docs/stories/STORY-nnn.md` only for what actually passes.',
    '',
    ...(ctx.repoUrl ? ['## This repo', '', ctx.repoUrl, ''] : []),
    '## What not to edit',
    '',
    '`.colaberry/` is platform bookkeeping and is overwritten on every sync. Everything',
    'else — including the docs above — is yours to change.',
    '',
  ].join('\n');
}

// ── the file set ────────────────────────────────────────────────────────────

/**
 * Render the complete document set. Throws rather than emitting a path outside
 * the allowlist — a bad path must fail loudly here, not be warned about later.
 */
export function renderDocs(plan: BuildPlan, ctx: RenderContext = {}): RenderedFile[] {
  if (!plan?.stories?.length) throw new RenderError('cannot render documents for a plan with no stories');

  const releaseByKey = new Map(plan.releases.map((r) => [r.key, r]));
  const files: RenderedFile[] = [
    { path: 'docs/REQUIREMENTS.md', content: renderRequirements(plan) },
    { path: 'docs/STORIES.md', content: renderStories(plan) },
    { path: 'docs/TRACEABILITY.md', content: renderTraceability(plan) },
    { path: 'CLAUDE.md', content: renderClaudeMd(plan, ctx) },
  ];

  for (const story of byKey(plan.stories, (s) => s.id)) {
    files.push({
      path: `docs/stories/${story.id}.md`,
      content: renderStoryFile(plan, story, releaseByKey.get(story.release)),
    });
  }

  // Machine-readable bookkeeping. The manifest is what conflict detection and
  // prompt-path assertion both read, so it is built from the files above rather
  // than restated — it cannot describe a file that was not rendered.
  // Serialize a canonically ORDERED plan, not the plan as handed to us. Two
  // structurally identical plans whose arrays arrived in a different order must
  // produce byte-identical output, or repoWriter sees a changed hash and makes a
  // commit that changes nothing — breaking the "unchanged ⇒ no commit" guarantee
  // (FR-026) and churning the student's history.
  files.push({
    path: '.colaberry/plan.json',
    content: `${JSON.stringify({
      ...plan,
      requirements: byKey(plan.requirements, (r) => r.id),
      releases: byKey(plan.releases, (r) => r.key),
      stories: byKey(plan.stories, (s) => s.id),
    }, null, 2)}\n`,
  });
  files.push({
    path: '.colaberry/progress.json',
    content: `${JSON.stringify({
      stories: byKey(plan.stories, (s) => s.id).map((s) => ({
        id: s.id, release: s.release, acceptance_total: (s.acceptance ?? []).length,
      })),
    }, null, 2)}\n`,
  });
  files.push({
    path: '.colaberry/manifest.json',
    content: `${JSON.stringify({
      generated_at: ctx.generatedAt ?? null,
      plan_version: ctx.planVersion ?? null,
      plan_sha256: ctx.planSha256 ?? null,
      correlation_id: ctx.correlationId ?? null,
      files: files.map((f) => ({ path: f.path, sha256: sha256(f.content) })),
    }, null, 2)}\n`,
  });

  for (const f of files) {
    if (!isAllowedPath(f.path)) {
      throw new RenderError(`refusing to render "${f.path}" — outside the platform write allowlist`);
    }
  }
  return files;
}

/** The paths a manifest declares — what prompt assembly checks against (FR-032). */
export function manifestPaths(files: RenderedFile[]): string[] {
  const manifest = files.find((f) => f.path === '.colaberry/manifest.json');
  if (!manifest) return [];
  const parsed = JSON.parse(manifest.content) as { files: Array<{ path: string }> };
  return parsed.files.map((f) => f.path);
}
