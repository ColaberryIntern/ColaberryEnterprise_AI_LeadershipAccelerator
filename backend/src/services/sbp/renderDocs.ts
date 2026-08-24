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
import {
  PROGRESS_FILE_PATH, PlanStorySeed, StoryProgressInput, renderProgressFile, serialiseProgressFile,
} from './verification/progressContract';
import { PLAN_FILE_PATH, buildPlanDocument, serialisePlanDocument } from './planDocument';
import { PROFILE_FILE_PATH, renderProfileSeed, serialiseProfileFile } from './profileContract';
import { STUDENT_DATA_CONTRACT_PATH, renderStudentDataContract } from './studentDataContract';
import type { Schedule } from './buildSchedule';
import {
  COMMAND_CENTER_STORY_ID,
  commandCenterStoryDoc,
  commandCenterStorySeed,
} from './commandCenterStory';
import type { RepoWriteAccess } from './repoConnect/connectionAccess';

export interface RenderedFile {
  /** Repo-relative, forward slashes, inside the allowlist. */
  path: string;
  content: string;
}

export interface RenderContext {
  /** Clone URL, when a repo is provisioned. Omitted ⇒ prompts must not cite paths. */
  repoUrl?: string | null;
  /**
   * Stamped into the MANIFEST ONLY, never into plan.json or progress.json.
   *
   * This is the freshness signal the Command Center reads, and it lives in the
   * manifest because the manifest is excluded from the change comparison in
   * `changedFiles`. Put a clock in either of the other two files and every sync
   * commits a file whose only difference is the time it was written — churning
   * the student's git history to say nothing. Passed in, never read from a
   * clock here, so rendering stays pure.
   */
  generatedAt?: string;
  planVersion?: number;
  planSha256?: string;
  correlationId?: string;
  /** Real cohort dates. Null ⇒ the plan renders without due dates, as before. */
  schedule?: Schedule | null;
  /**
   * Server-side build progress, mirrored into progress.json so a static page
   * can show what is verified with no API call. Omitted ⇒ the plan side only.
   */
  progress?: StoryProgressInput[] | null;
  /** story_id ⇒ `YYYY-MM-DD` from `student_tasks.due_baseline_on` (write-once). */
  baselineByStory?: Record<string, string | null> | null;
  /** Where the student's Command Center is published, when it is. */
  commandCenterUrl?: string | null;
  /**
   * What the PLATFORM can do with this student's repo — `writeAccessOf(connection)`.
   *
   * Read by STORY-000's doc and by nothing else, because STORY-000's doc is the
   * only document that makes a claim about what is in the repo: it told every
   * student their criteria were "already seeded" in `.colaberry/progress.json`,
   * which is true only where we hold `push` — one repo in thirteen.
   *
   * OMITTED MEANS "NOT ESTABLISHED", and the renderer treats that as not-seeded.
   * That is the safe direction: the not-seeded text is true either way, the
   * seeded text is false the moment we are wrong, and the cost of being wrong is
   * an agent that invents criteria no verifier can match. Callers that know the
   * answer pass it; callers that do not, do not have to.
   */
  repoWriteAccess?: RepoWriteAccess | null;
}

/**
 * The ONLY paths the platform may write in a student's repo (SBP-GH-v1 FR-027).
 * Everything else in that repo is theirs. repoWriter re-checks this before any
 * network call; enforcing it here too means a bad path cannot even be produced.
 *
 * `artifacts/**` was added 2026-08-20 so the weekly curriculum artifacts a
 * student builds in Claude Code land in their repo instead of only on the
 * platform's uploads volume. It is deliberately a THIRD root rather than a
 * subfolder of `docs/`: `docs/` is the generated plan, rewritten wholesale on
 * every sync, and an artifact must never be at risk of being rewritten by a
 * plan republish.
 */
export const PATH_ALLOWLIST = [/^CLAUDE\.md$/, /^docs\/.+/, /^\.colaberry\/.+/, /^artifacts\/.+/];

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

// ── the file set ────────────────────────────────────────────────────────────

/**
 * Render the complete document set. Throws rather than emitting a path outside
 * the allowlist — a bad path must fail loudly here, not be warned about later.
 */
export function renderDocs(plan: BuildPlan, ctx: RenderContext = {}): RenderedFile[] {
  if (!plan?.stories?.length) throw new RenderError('cannot render documents for a plan with no stories');

  // The plan in canonical order — arrays sorted by their natural key. Two
  // structurally identical plans whose arrays arrived in a different order must
  // render byte-identically, or repoWriter sees a changed hash and commits a
  // change that is not one (FR-026). `.colaberry/plan.json` has always been
  // serialised from this; STORY-000's doc needs it too, because
  // `commandCenterPrompt` walks `requirements` and `stories` in the order it is
  // handed them and would otherwise leak the caller's array order into the file.
  const orderedPlan: BuildPlan = {
    ...plan,
    requirements: byKey(plan.requirements, (r) => r.id),
    releases: byKey(plan.releases, (r) => r.key),
    stories: byKey(plan.stories, (s) => s.id),
  };

  const releaseByKey = new Map(plan.releases.map((r) => [r.key, r]));
  const files: RenderedFile[] = [
    { path: 'docs/REQUIREMENTS.md', content: renderRequirements(plan) },
    { path: 'docs/STORIES.md', content: renderStories(plan) },
    { path: 'docs/TRACEABILITY.md', content: renderTraceability(plan) },
    // The field-by-field spec of `.colaberry/plan.json` and `.colaberry/progress.json`.
    // Plan-independent by design (see studentDataContract), so it costs one
    // constant-content file per repo and never churns a sync. It is here rather
    // than only in the platform repo because a student writing a Command Center
    // against a schema they cannot read guesses — and three of them have.
    { path: STUDENT_DATA_CONTRACT_PATH, content: renderStudentDataContract() },
    { path: 'CLAUDE.md', content: renderClaudeMd(plan, ctx) },
  ];

  for (const story of byKey(plan.stories, (s) => s.id)) {
    files.push({
      path: `docs/stories/${story.id}.md`,
      content: renderStoryFile(plan, story, releaseByKey.get(story.release)),
    });
  }

  // STORY-000 — appended at the RENDER layer, never inserted into plan.stories.
  //
  // The Command Center is scaffolding the platform authors, so it is kept out of
  // the plan on purpose: the traceability gate, the XP divisor and materialize
  // ordering all read `plan.stories`, and moving it there would change all three.
  // But the loop above iterates `plan.stories`, so the consequence was that
  // STORY-000 — the one story EVERY student builds first — was the only story
  // with no doc in the repo and no entry in progress.json. Its prompt existed
  // solely on `student_tasks.build`, so a fresh Claude Code session had nothing
  // local to read and had to author its claims from memory of a prompt it had
  // never seen. It made none, and verification reported 0 of 3 with an empty
  // `rejected_claims`. Confirmed in production on 2026-08-15, one build before a
  // cohort of ~30 would have hit the same wall.
  //
  // Appending here is the same move `buildVerificationService` already makes
  // when it appends STORY-000's spec, with the same defensive dedup: if a plan
  // ever carries its own STORY-000, the PLAN wins, because the plan is the
  // authority on every story it actually contains.
  const planHasCommandCenter = plan.stories.some((s) => s.id === COMMAND_CENTER_STORY_ID);
  if (!planHasCommandCenter) {
    files.push({
      path: `docs/stories/${COMMAND_CENTER_STORY_ID}.md`,
      // Ordered plan, so array order cannot reach the bytes. No schedule:
      // renderDocs is pure and has no access to one, and the due dates it would
      // add live on the portal task row anyway. The build brief is the same.
      //
      // `repoWriteAccess` is what decides whether this doc may claim the
      // criteria are seeded. Threaded rather than assumed: this same renderer
      // produces the repo write AND the downloadable bundle, and the bundle goes
      // to students whose repos the platform cannot touch.
      content: commandCenterStoryDoc(orderedPlan, null, { writeAccess: ctx.repoWriteAccess ?? null }),
    });
  }

  // Machine-readable bookkeeping, and the data half of the Command Center. The
  // manifest is what conflict detection and prompt-path assertion both read, so
  // it is built from the files above rather than restated — it cannot describe a
  // file that was not rendered.
  //
  // Array order must not reach the bytes: two structurally identical plans whose
  // arrays arrived in a different order must produce byte-identical output, or
  // repoWriter sees a changed hash and makes a commit that changes nothing —
  // breaking the "unchanged ⇒ no commit" guarantee (FR-026) and churning the
  // student's history. This file no longer serialises `orderedPlan` directly;
  // `buildPlanDocument` re-sorts every collection it emits for exactly that
  // reason, so the guarantee holds through the wider v2 document.
  //
  // STORY-000 is deliberately NOT in it: this file mirrors the plan, and the
  // plan does not contain the Command Center.
  files.push({
    path: PLAN_FILE_PATH,
    content: serialisePlanDocument(buildPlanDocument(plan, {
      repoUrl: ctx.repoUrl ?? null,
      planVersion: ctx.planVersion ?? null,
      planSha256: ctx.planSha256 ?? null,
      schedule: ctx.schedule ?? null,
      baselineByStory: ctx.baselineByStory ?? null,
    })),
  });
  // The two-way contract. The platform writes the plan side — every story, every
  // acceptance criterion, all `passed: false`; Claude Code writes the completion
  // side back. Seeding the criterion TEXT here is what makes the reader strict
  // without being hostile: the agent flips a boolean rather than retyping a
  // sentence, so honest claims match the plan exactly and only invented ones get
  // rejected. repoWriter merges this over whatever is already in the repo so a
  // republish does not wipe the student's ticks.
  //
  // STORY-000 is seeded here too, for the same reason its doc is rendered above:
  // without an entry, the agent had to AUTHOR the story block and every one of its
  // criterion sentences from scratch, which is precisely the retyping this file
  // exists to remove. Seeded, it flips booleans like every other story.
  // `renderProgressFile` sorts by id, so STORY-000 lands first and the output
  // stays byte-identical across renders — repoWriter's content-hash idempotency
  // depends on that. repoWriter then MERGES this over the file already in the
  // repo, so adding the skeleton cannot reset a flag the student has set.
  const progressSeeds: PlanStorySeed[] = [
    ...byKey(plan.stories, (s) => s.id),
    ...(planHasCommandCenter ? [] : [commandCenterStorySeed()]),
  ];
  files.push({
    path: PROGRESS_FILE_PATH,
    content: serialiseProgressFile(
      renderProgressFile(progressSeeds, plan.project_name, {
        progress: ctx.progress ?? null,
        repoUrl: ctx.repoUrl ?? null,
      }),
    ),
  });
  // The portfolio layer. SEEDED ONLY — repoWriter replaces this with whatever
  // the student already has, so the bytes below are what a repo gets exactly
  // once and never again. Emitted here rather than at the writer so it appears
  // in the manifest and in the downloadable bundle like every other file.
  files.push({
    path: PROFILE_FILE_PATH,
    content: serialiseProfileFile(renderProfileSeed({
      repoUrl: ctx.repoUrl ?? null,
      commandCenterUrl: ctx.commandCenterUrl ?? null,
    })),
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
