/**
 * Tier-B showcase-artifact slots (BC #9985689928): flexible, non-week-bound
 * artifacts per student project — demo video, explainer/podcast, one-pager/
 * infographic, PPT. The system scaffolds one slot per type; AI drafts each
 * on demand. Distinct from Tier-A (week-bound, blocked on a separate data-
 * model decision — see BC #9985689899); this hangs directly off the real,
 * already-wired `Project` model, not the legacy ArtifactDefinition catalog.
 */
import Project from '../models/Project';
import ShowcaseArtifact, { ShowcaseArtifactType } from '../models/ShowcaseArtifact';
import { getInstrumentedOpenAI } from './openaiInstrumented';

export const SHOWCASE_ARTIFACT_TYPES: ShowcaseArtifactType[] = [
  'demo_video',
  'explainer_podcast',
  'one_pager_infographic',
  'ppt',
];

const ARTIFACT_LABELS: Record<ShowcaseArtifactType, string> = {
  demo_video: 'Demo video script',
  explainer_podcast: 'Explainer / podcast script',
  one_pager_infographic: 'One-pager / infographic copy',
  ppt: 'Slide deck outline',
};

const LLM_TIMEOUT_MS = 30_000;

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
  console[level](JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'showcase_artifact', event, ...ctx }));
}

async function requireProject(projectId: string): Promise<Project> {
  const project = await Project.findByPk(projectId);
  if (!project) throw notFoundError('Project not found');
  return project;
}

/**
 * Idempotent — findOrCreate all 4 showcase slots for a project. Safe to call
 * repeatedly (e.g. every time the student opens the Portfolio tab); existing
 * slots are returned untouched, never duplicated or reset.
 */
export async function scaffoldShowcaseSlots(projectId: string): Promise<ShowcaseArtifact[]> {
  await requireProject(projectId);

  const slots: ShowcaseArtifact[] = [];
  for (const artifactType of SHOWCASE_ARTIFACT_TYPES) {
    const [slot] = await ShowcaseArtifact.findOrCreate({
      where: { project_id: projectId, artifact_type: artifactType },
      defaults: { project_id: projectId, artifact_type: artifactType },
    });
    slots.push(slot);
  }

  log('info', 'slots_scaffolded', { project_id: projectId, count: slots.length, outcome: 'success' });
  return slots;
}

export async function listShowcaseArtifacts(projectId: string): Promise<ShowcaseArtifact[]> {
  await requireProject(projectId);
  const rows = await ShowcaseArtifact.findAll({ where: { project_id: projectId } });
  const byType = new Map(rows.map((r) => [r.artifact_type, r]));
  // Stable, always-4-item order regardless of DB row order or which slots exist yet.
  return SHOWCASE_ARTIFACT_TYPES.map((t) => byType.get(t)).filter((r): r is ShowcaseArtifact => !!r);
}

function buildPrompt(artifactType: ShowcaseArtifactType, project: Project): { system: string; user: string } {
  const context = [
    project.name ? `Project: ${project.name}` : null,
    project.industry ? `Industry: ${project.industry}` : null,
    project.primary_business_problem ? `Business problem: ${project.primary_business_problem}` : null,
    project.selected_use_case ? `Use case: ${project.selected_use_case}` : null,
    project.automation_goal ? `Automation goal: ${project.automation_goal}` : null,
  ].filter(Boolean).join('\n') || 'No project details provided yet — draft a generic but plausible AI systems project showcase.';

  const system = `You draft a "${ARTIFACT_LABELS[artifactType]}" showcase artifact for a student's AI Systems Architect Accelerator project. Return STRICT json.`;

  const shapes: Record<ShowcaseArtifactType, string> = {
    demo_video: 'json with keys: title, duration_estimate_seconds (number), scenes (array of { narration, on_screen_action })',
    explainer_podcast: 'json with keys: title, duration_estimate_minutes (number), segments (array of { speaker_note, talking_points (string[]) })',
    one_pager_infographic: 'json with keys: title, headline, stat_callouts (array of { label, value }), body_sections (array of { heading, copy })',
    ppt: 'json with keys: title, slides (array of { heading, bullets (string[]) })',
  };

  const user = `Project context:\n${context}\n\nDraft the ${ARTIFACT_LABELS[artifactType]} as ${shapes[artifactType]}.`;
  return { system, user };
}

/**
 * AI-draft one showcase artifact type for a project. Idempotent by design —
 * re-running regenerates and overwrites draft_content on the same row (a
 * deliberate "regenerate" action, not a duplicate-creating side effect).
 * Never partially writes: draft_content/status only update after a
 * successful, fully-parsed generation.
 */
export async function draftShowcaseArtifact(
  projectId: string,
  artifactType: ShowcaseArtifactType,
): Promise<ShowcaseArtifact> {
  if (!SHOWCASE_ARTIFACT_TYPES.includes(artifactType)) {
    throw validationError(`Unknown showcase artifact type: ${artifactType}`);
  }

  const project = await requireProject(projectId);

  const [slot] = await ShowcaseArtifact.findOrCreate({
    where: { project_id: projectId, artifact_type: artifactType },
    defaults: { project_id: projectId, artifact_type: artifactType },
  });

  const { system, user } = buildPrompt(artifactType, project);
  const client = getInstrumentedOpenAI({ workflow_id: 'showcase_artifact_draft' }, { timeout: LLM_TIMEOUT_MS, maxRetries: 2 });

  let parsed: Record<string, unknown>;
  try {
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.6,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}');
  } catch (err) {
    log('error', 'draft_failed', { project_id: projectId, artifact_type: artifactType, outcome: 'failure', error_class: 'UpstreamUnavailable' });
    throw upstreamError(`Failed to draft ${artifactType}`, err);
  }

  await slot.update({ draft_content: parsed, status: 'drafted', generated_at: new Date() });

  log('info', 'draft_created', { project_id: projectId, artifact_type: artifactType, outcome: 'success' });
  return slot;
}
