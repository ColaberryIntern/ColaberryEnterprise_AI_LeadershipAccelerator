/**
 * Build-log -> social drafter (BC #9985689786): weekly AI-drafted "building
 * in public" content per completed Tier-A build week, per
 * TRAINING_INTEGRATION_PLAN.md §3.7 — 4 independently-generated,
 * independently-approved sections per week: linkedin_post, video_script,
 * architecture_update, demo_summary.
 *
 * Trust control (ticket AC): nothing is ever auto-posted. A student must
 * explicitly mark each section posted after publishing it themselves.
 */
import { Op } from 'sequelize';
import Project from '../models/Project';
import Artifact, { ArtifactStatus } from '../models/Artifact';
import BuildLogDraft from '../models/BuildLogDraft';
import { getInstrumentedOpenAI } from './openaiInstrumented';

const TOTAL_WEEKS = 12;
const COMPLETED_STATUSES: ArtifactStatus[] = ['submitted', 'reviewed'];
const LLM_TIMEOUT_MS = 30_000;
const REQUIRED_HASHTAG = '#Colaberry';

export type BuildLogSectionType = 'linkedin_post' | 'video_script' | 'architecture_update' | 'demo_summary';
export type BuildLogSectionStatus = 'draft' | 'posted' | 'skipped';

export const BUILD_LOG_SECTION_TYPES: BuildLogSectionType[] = [
  'linkedin_post',
  'video_script',
  'architecture_update',
  'demo_summary',
];

interface BuildLogSection {
  content: Record<string, unknown> | null;
  status: BuildLogSectionStatus;
  posted_at: string | null;
}

type BuildLogDraftContent = Record<BuildLogSectionType, BuildLogSection>;

const SECTION_LABELS: Record<BuildLogSectionType, string> = {
  linkedin_post: 'LinkedIn "building in public" post',
  video_script: '60-second video script (hook, what changed this week, demo callout)',
  architecture_update: 'One-paragraph architecture update for the project public page',
  demo_summary: '5-minute demo video script outline',
};

const SECTION_SHAPES: Record<BuildLogSectionType, string> = {
  linkedin_post: `json with keys: headline (string, <=12 words), body (string, ~120-160 words, first person), hashtags (string array, must include "${REQUIRED_HASHTAG}")`,
  video_script: 'json with keys: hook (string, attention-grabbing first line), scenes (array of { narration, on_screen_action }), duration_estimate_seconds (number, ~60)',
  architecture_update: 'json with keys: paragraph (string, one paragraph project-status summary suitable for a public project page)',
  demo_summary: 'json with keys: title (string), duration_estimate_minutes (number, ~5), outline (array of { heading, talking_points (string[]) })',
};

function notFoundError(message: string): Error {
  return Object.assign(new Error(message), { error_class: 'NotFoundError' });
}

function validationError(message: string): Error {
  return Object.assign(new Error(message), { error_class: 'ValidationError' });
}

function upstreamError(message: string, cause: unknown): Error {
  return Object.assign(new Error(message), { error_class: 'UpstreamUnavailable', cause });
}

function log(level: 'info' | 'warn' | 'error', event: string, ctx: Record<string, unknown>): void {
  console[level](JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'build_log_draft', event, ...ctx }));
}

async function requireProject(projectId: string): Promise<Project> {
  const project = await Project.findByPk(projectId);
  if (!project) throw notFoundError('Project not found');
  return project;
}

function emptySections(): BuildLogDraftContent {
  const sections = {} as BuildLogDraftContent;
  for (const type of BUILD_LOG_SECTION_TYPES) {
    sections[type] = { content: null, status: 'draft', posted_at: null };
  }
  return sections;
}

function buildSectionPrompt(
  type: BuildLogSectionType,
  project: Project,
  weekNumber: number,
  artifact: Artifact,
): { system: string; user: string } {
  const context = [
    project.name ? `Project: ${project.name}` : null,
    project.industry ? `Industry: ${project.industry}` : null,
    project.primary_business_problem ? `Business problem: ${project.primary_business_problem}` : null,
    project.selected_use_case ? `Use case: ${project.selected_use_case}` : null,
    project.automation_goal ? `Automation goal: ${project.automation_goal}` : null,
  ].filter(Boolean).join('\n') || 'No project details provided yet — draft a generic but plausible AI systems project update.';

  const system = `You draft a "${SECTION_LABELS[type]}" for a student in the AI Systems Architect Accelerator, summarizing one week of progress on their AI project. Tone: first-person, genuine, not salesy. Return STRICT ${SECTION_SHAPES[type]}.`;

  const user = `Project context:\n${context}\n\nThis is week ${weekNumber} of a 12-week program. The student just completed and submitted this week's build milestone (artifact reference: ${artifact.url || 'not provided'}). Draft the ${SECTION_LABELS[type]}.`;

  return { system, user };
}

function normalizeSectionContent(type: BuildLogSectionType, raw: any): Record<string, unknown> {
  if (type === 'linkedin_post') {
    const headline = typeof raw?.headline === 'string' ? raw.headline.trim() : '';
    const body = typeof raw?.body === 'string' ? raw.body.trim() : '';
    if (!body) throw new Error('linkedin_post missing a non-empty body');
    const rawHashtags: string[] = Array.isArray(raw?.hashtags) ? raw.hashtags.filter((h: unknown) => typeof h === 'string') : [];
    const hashtags = rawHashtags.includes(REQUIRED_HASHTAG) ? rawHashtags : [...rawHashtags, REQUIRED_HASHTAG];
    return { headline, body, hashtags };
  }

  if (type === 'video_script') {
    const hook = typeof raw?.hook === 'string' ? raw.hook.trim() : '';
    if (!hook) throw new Error('video_script missing a non-empty hook');
    const scenes = Array.isArray(raw?.scenes) ? raw.scenes : [];
    const duration_estimate_seconds = typeof raw?.duration_estimate_seconds === 'number' ? raw.duration_estimate_seconds : 60;
    return { hook, scenes, duration_estimate_seconds };
  }

  if (type === 'architecture_update') {
    const paragraph = typeof raw?.paragraph === 'string' ? raw.paragraph.trim() : '';
    if (!paragraph) throw new Error('architecture_update missing a non-empty paragraph');
    return { paragraph };
  }

  // demo_summary
  const title = typeof raw?.title === 'string' ? raw.title.trim() : '';
  if (!title) throw new Error('demo_summary missing a non-empty title');
  const outline = Array.isArray(raw?.outline) ? raw.outline : [];
  const duration_estimate_minutes = typeof raw?.duration_estimate_minutes === 'number' ? raw.duration_estimate_minutes : 5;
  return { title, outline, duration_estimate_minutes };
}

export async function listBuildLogDrafts(projectId: string): Promise<BuildLogDraft[]> {
  await requireProject(projectId);
  return BuildLogDraft.findAll({ where: { project_id: projectId }, order: [['week_number', 'ASC']] });
}

/**
 * Generate (or fill in whatever's still missing from) all 4 sections for one
 * project/week. Idempotent per section: a section that already has content
 * is never regenerated/re-billed. Requires the week's Tier-A build artifact
 * to be submitted/reviewed first ("a completed build-log entry" per the
 * ticket's acceptance criteria). One section's LLM failure doesn't block the
 * others — it's simply left ungenerated and retried on the next call/cron
 * run. Only throws if this call generated nothing new at all.
 */
export async function draftBuildLogPost(projectId: string, weekNumber: number): Promise<BuildLogDraft> {
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > TOTAL_WEEKS) {
    throw validationError(`week_number must be an integer between 1 and ${TOTAL_WEEKS}`);
  }

  const project = await requireProject(projectId);

  const sourceArtifact = await Artifact.findOne({
    where: { project_id: projectId, type: 'build', week_number: weekNumber },
  });
  if (!sourceArtifact || !COMPLETED_STATUSES.includes(sourceArtifact.status)) {
    throw validationError(`Week ${weekNumber} build-log entry is not completed yet`);
  }

  const [draftRow] = await BuildLogDraft.findOrCreate({
    where: { project_id: projectId, week_number: weekNumber },
    defaults: { project_id: projectId, week_number: weekNumber, source_artifact_id: sourceArtifact.id, draft_content: emptySections() },
  });

  // Deep-clone rather than mutate draftRow.draft_content directly: Sequelize's
  // change detection compares the incoming value against its own in-memory
  // snapshot, and mutating that same object in place makes them
  // reference-identical, so .update() silently no-ops and the JSONB column
  // never actually persists (confirmed live — this exact bug shipped once).
  const sections: BuildLogDraftContent = JSON.parse(JSON.stringify(draftRow.draft_content || emptySections()));
  const toGenerate = BUILD_LOG_SECTION_TYPES.filter((type) => !sections[type]?.content);

  if (toGenerate.length === 0) {
    log('info', 'draft_skip_existing', { project_id: projectId, week_number: weekNumber, outcome: 'success' });
    return draftRow;
  }

  const client = getInstrumentedOpenAI({ workflow_id: 'build_log_draft' }, { timeout: LLM_TIMEOUT_MS, maxRetries: 2 });
  let generatedCount = 0;

  for (const type of toGenerate) {
    try {
      const { system, user } = buildSectionPrompt(type, project, weekNumber, sourceArtifact);
      const res = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 700,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
      const content = normalizeSectionContent(type, JSON.parse(res.choices?.[0]?.message?.content || '{}'));
      sections[type] = { content, status: 'draft', posted_at: null };
      generatedCount++;
    } catch (err) {
      log('error', 'section_draft_failed', { project_id: projectId, week_number: weekNumber, section: type, outcome: 'failure', error_class: 'UpstreamUnavailable' });
    }
  }

  if (generatedCount === 0) {
    throw upstreamError(`Failed to draft any build-log section for week ${weekNumber}`, undefined);
  }

  await draftRow.update({ draft_content: sections, source_artifact_id: sourceArtifact.id, generated_at: new Date() });

  log('info', 'draft_created', { project_id: projectId, week_number: weekNumber, sections_generated: generatedCount, outcome: 'success' });
  return draftRow;
}

/**
 * Weekly cron entry point: scans every project with a completed build week
 * and generates any still-missing sections. Failures are isolated per
 * project — one student's LLM error never blocks the rest. Safe to re-run
 * (idempotent per-section via draftBuildLogPost).
 */
export async function generateBuildLogDraftsForCompletedWeeks(): Promise<{ scanned: number; drafted: number; skipped: number; failed: number }> {
  const completedArtifacts = await Artifact.findAll({
    where: { type: 'build', status: { [Op.in]: COMPLETED_STATUSES } },
  });

  let drafted = 0;
  let skipped = 0;
  let failed = 0;

  for (const artifact of completedArtifacts) {
    const weekNumber = artifact.week_number;
    if (weekNumber === null) continue; // 'build' artifacts always carry a week_number; guard for the shared column's nullable type

    try {
      const existing = await BuildLogDraft.findOne({
        where: { project_id: artifact.project_id, week_number: weekNumber },
      });
      const existingSections = existing?.draft_content as BuildLogDraftContent | undefined;
      const allSectionsDone = existingSections && BUILD_LOG_SECTION_TYPES.every((type) => existingSections[type]?.content);
      if (allSectionsDone) {
        skipped++;
        continue;
      }
      await draftBuildLogPost(artifact.project_id, weekNumber);
      drafted++;
    } catch (err: any) {
      failed++;
      log('error', 'batch_draft_failed', {
        project_id: artifact.project_id,
        week_number: artifact.week_number,
        outcome: 'failure',
        error_class: err?.error_class || 'UnknownError',
      });
    }
  }

  return { scanned: completedArtifacts.length, drafted, skipped, failed };
}

/**
 * Student marks one section posted (after publishing it themselves) or
 * skipped. Idempotent — marking an already-posted section posted again
 * leaves posted_at unchanged rather than bumping it.
 */
export async function markBuildLogSectionStatus(
  projectId: string,
  draftId: string,
  section: BuildLogSectionType,
  status: Extract<BuildLogSectionStatus, 'posted' | 'skipped'>,
): Promise<BuildLogDraft> {
  await requireProject(projectId);

  if (!BUILD_LOG_SECTION_TYPES.includes(section)) {
    throw validationError(`Unknown section: ${section}`);
  }

  const draft = await BuildLogDraft.findOne({ where: { id: draftId, project_id: projectId } });
  if (!draft) throw notFoundError('Build-log draft not found');

  const sections: BuildLogDraftContent = (draft.draft_content as BuildLogDraftContent) || emptySections();
  const current = sections[section];
  if (!current?.content) throw validationError(`Section "${section}" has not been generated yet`);

  const posted_at = status === 'posted' && current.status !== 'posted' ? new Date().toISOString() : current.posted_at;
  const updatedSections: BuildLogDraftContent = { ...sections, [section]: { ...current, status, posted_at } };

  await draft.update({ draft_content: updatedSections });
  return draft;
}
