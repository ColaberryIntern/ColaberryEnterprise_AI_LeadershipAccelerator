/**
 * Tier-A build-artifact slots (BC #9985689899): one gradeable slot per week
 * of the 12-week Lego model. Decision (Ali, 2026-07-13): build the unified
 * Artifact model (STUDENT_PLATFORM_BUILD_SPEC.md §7) hung off the real
 * Project model, not the legacy ArtifactDefinition catalog (that catalog is
 * a separate, still-active system for session/lesson unlock gating — see
 * services/artifactService.ts — and is untouched by this work). Tier-B
 * showcase artifacts (BC #9985689928) remain on the separate ShowcaseArtifact
 * table for now — folding them into this model is a tracked follow-up, not
 * done here (see PROGRESS.md).
 */
import Project from '../models/Project';
import Artifact, { ArtifactStatus } from '../models/Artifact';

const TOTAL_WEEKS = 12;
const BUILD_STATUSES: ArtifactStatus[] = ['not_started', 'in_progress', 'submitted', 'reviewed'];

function notFoundError(message: string): Error {
  return Object.assign(new Error(message), { error_class: 'NotFoundError' });
}

function validationError(message: string): Error {
  return Object.assign(new Error(message), { error_class: 'ValidationError' });
}

function log(level: 'info' | 'warn' | 'error', event: string, ctx: Record<string, unknown>): void {
  console[level](JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'build_artifact', event, ...ctx }));
}

async function requireProject(projectId: string): Promise<Project> {
  const project = await Project.findByPk(projectId);
  if (!project) throw notFoundError('Project not found');
  return project;
}

/**
 * Idempotent — findOrCreate all 12 weekly build-artifact slots for a project.
 * Safe to call repeatedly; existing slots are returned untouched, never
 * duplicated or reset.
 */
export async function scaffoldBuildArtifactSlots(projectId: string): Promise<Artifact[]> {
  await requireProject(projectId);

  const slots: Artifact[] = [];
  for (let week = 1; week <= TOTAL_WEEKS; week++) {
    const [slot] = await Artifact.findOrCreate({
      where: { project_id: projectId, type: 'build', week_number: week },
      defaults: { project_id: projectId, type: 'build', week_number: week },
    });
    slots.push(slot);
  }

  log('info', 'slots_scaffolded', { project_id: projectId, count: slots.length, outcome: 'success' });
  return slots;
}

export async function listBuildArtifacts(projectId: string): Promise<Artifact[]> {
  await requireProject(projectId);
  const rows = await Artifact.findAll({ where: { project_id: projectId, type: 'build' } });
  const byWeek = new Map(rows.map((r) => [r.week_number, r]));
  // Stable week-1..12 order regardless of DB row order or which slots exist yet.
  const ordered: Artifact[] = [];
  for (let week = 1; week <= TOTAL_WEEKS; week++) {
    const row = byWeek.get(week);
    if (row) ordered.push(row);
  }
  return ordered;
}

/**
 * Update a single week's slot (student submission url and/or status).
 * Idempotent — repeated calls with the same values leave the same end state.
 */
export async function updateBuildArtifact(
  projectId: string,
  weekNumber: number,
  updates: { url?: string | null; status?: ArtifactStatus },
): Promise<Artifact> {
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > TOTAL_WEEKS) {
    throw validationError(`week_number must be an integer between 1 and ${TOTAL_WEEKS}`);
  }
  if (updates.status !== undefined && !BUILD_STATUSES.includes(updates.status)) {
    throw validationError(`Unknown status: ${updates.status}`);
  }

  await requireProject(projectId);

  const slot = await Artifact.findOne({ where: { project_id: projectId, type: 'build', week_number: weekNumber } });
  if (!slot) throw notFoundError(`No build-artifact slot for week ${weekNumber}`);

  const patch: { url?: string | null; status?: ArtifactStatus } = {};
  if (updates.url !== undefined) patch.url = updates.url;
  if (updates.status !== undefined) patch.status = updates.status;

  await slot.update(patch);

  log('info', 'slot_updated', { project_id: projectId, week_number: weekNumber, outcome: 'success' });
  return slot;
}
