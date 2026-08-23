/**
 * buildArtifactService — the Build Artifact(s) Lab upload flow.
 *
 * A student builds a real document artifact in THEIR OWN Claude Code (from the
 * build prompt on the card), then uploads the FILE here. We store it as a
 * PortfolioArtifact linked to (enrollment, card) so it lands in the student's
 * portfolio / library and is available for instructor review. The file bytes live
 * on the persistent `uploads` volume (disk, survives deploys — see config/upload
 * strategyPrepUpload); the DB row records the reference + metadata.
 *
 * Idempotent: exactly one PortfolioArtifact per (enrollment, card). A re-upload
 * (the student builds a different artifact / runs on another project) REPLACES the
 * stored file, and the previously-stored file is removed from the volume so it is
 * never orphaned. Points are NOT awarded here — card completion awards builder_xp
 * once (idempotent); completeActivity then finds this existing artifact and does
 * not synthesise a placeholder over it.
 *
 * Failure-first: a missing file or a wrong extension is rejected with a
 * student-readable message and a typed { status } before any DB write.
 */
import fs from 'fs/promises';
import path from 'path';
import TimelineCard from '../../models/TimelineCard';
import PortfolioArtifact from '../../models/PortfolioArtifact';

export const BUILD_ARTIFACT_KIND = 'build_artifact';

/** Card types that render as the Build Artifact(s) Lab (render_band build_artifacts). */
const BUILD_STATION_TYPES = new Set(['implementation_task', 'artifact_submission']);

/** Accepted document extensions — mirrors config/upload strategyPrepUpload mimes. */
const ACCEPT_EXT = ['.pdf', '.docx', '.doc', '.pptx', '.ppt', '.xlsx', '.xls', '.rtf', '.txt', '.md', '.csv'];

interface UploadFile { originalname?: string; filename?: string; path?: string; size?: number; mimetype?: string }

export interface BuildArtifactStatus { uploaded: boolean; uploaded_at: string | null; filename: string | null; size_bytes: number | null; }

/** Pure: does a filename carry an accepted build-artifact extension? Unit-testable. */
export function isAcceptedBuildArtifact(filename: string | null | undefined): boolean {
  if (!filename) return false;
  return ACCEPT_EXT.includes(path.extname(filename).toLowerCase());
}

/** Read-only status of a student's uploaded build artifact for a card. */
export async function getBuildArtifactStatus(enrollmentId: string, cardId: string): Promise<BuildArtifactStatus> {
  const row: any = await PortfolioArtifact.findOne({ where: { enrollment_id: enrollmentId, card_id: cardId } });
  const c = row && row.content;
  if (!c || c.kind !== BUILD_ARTIFACT_KIND) return { uploaded: false, uploaded_at: null, filename: null, size_bytes: null };
  return {
    uploaded: true,
    uploaded_at: c.uploaded_at || (row.created_at ? new Date(row.created_at).toISOString() : null),
    filename: c.filename || null,
    size_bytes: typeof c.size_bytes === 'number' ? c.size_bytes : null,
  };
}

/**
 * Store the uploaded build artifact as a PortfolioArtifact. Idempotent replace
 * (one per enrollment+card). Throws typed { status } on bad input before any write.
 */
/**
 * What the student picked in the build station's project selector. The renderer
 * offers their own projects AND three sample projects, because in weeks 1-3
 * they have no project yet and must still be able to build.
 *
 * This has to reach the server. An artifact built against "the Retail Analytics
 * Dashboard (sample)" is real work and belongs in their portfolio, but it is
 * NOT work on their own system — and mirroring it into their repo unlabelled
 * would quietly present sample work as part of their capstone. Recorded here so
 * the repo index can say what each artifact was built on.
 */
export interface BuildArtifactContext {
  /** The selector's label, e.g. "the Retail Analytics Dashboard (sample)". */
  project_label?: string;
  /** True when that label is one of the built-in samples. */
  is_sample?: boolean;
}

/** Multipart fields arrive as strings; 'false' must not read as truthy. */
function parseBool(v: unknown): boolean {
  return v === true || v === 'true' || v === '1';
}

export async function uploadBuildArtifact(
  enrollmentId: string,
  cardId: string,
  file: UploadFile,
  context: BuildArtifactContext = {},
) {
  const card: any = await TimelineCard.findByPk(cardId);
  if (!card || card.visibility !== 'published') throw Object.assign(new Error('Card not available'), { status: 404 });
  if (!BUILD_STATION_TYPES.has(card.type)) {
    if (file?.path) await fs.unlink(file.path).catch(() => {});
    throw Object.assign(new Error('This activity does not accept a build artifact upload.'), { status: 400 });
  }
  if (!file || !file.path) {
    throw Object.assign(new Error('No file uploaded — pick the artifact file Claude Code built for you.'), { status: 400 });
  }

  const filename = (file.originalname || 'artifact').slice(0, 200);
  if (!isAcceptedBuildArtifact(filename)) {
    await fs.unlink(file.path).catch(() => {});
    throw Object.assign(new Error('Accepted file types: PDF, Word, PowerPoint, Excel, RTF, Text, Markdown, CSV.'), { status: 400 });
  }

  const size_bytes = typeof file.size === 'number' ? file.size : 0;
  const uploaded_at = new Date().toISOString();
  const title = `${card.title} — ${filename}`.slice(0, 400);
  const summary = `Build artifact "${filename}" this student built in Claude Code for "${card.title}".`;
  const competencies = Array.isArray(card.competencies) ? card.competencies.map((x: any) => x.domain_id || x) : [];
  const content = {
    kind: BUILD_ARTIFACT_KIND,
    filename,
    stored_name: file.filename || path.basename(file.path),
    stored_path: file.path,
    size_bytes,
    mimetype: file.mimetype || null,
    uploaded_at,
    week: card.week ?? null,
    project_label: (context.project_label || '').slice(0, 200) || null,
    built_on_sample: parseBool(context.is_sample),
  };

  const existing: any = await PortfolioArtifact.findOne({ where: { enrollment_id: enrollmentId, card_id: cardId } });
  let artifact: any;
  if (existing) {
    // Remove the previously-stored file (if any) so re-uploads never orphan disk.
    const prev = existing.content && existing.content.stored_path;
    if (typeof prev === 'string' && prev && prev !== file.path) await fs.unlink(prev).catch(() => {});
    await existing.update({ kind: BUILD_ARTIFACT_KIND, title, summary, content, competencies });
    artifact = existing;
  } else {
    artifact = await PortfolioArtifact.create({ enrollment_id: enrollmentId, card_id: cardId, kind: BUILD_ARTIFACT_KIND, title, summary, content, competencies });
  }

  // Mirror the artifact into the student's repo. Deliberately AFTER the row is
  // saved and deliberately incapable of throwing: their artifact is already
  // stored by this point, and a GitHub outage, a missing repo, or lost push
  // access must never turn a successful upload into an error they see.
  //
  // Idempotent by construction (pure clock-free rendering + repoWriter's
  // content-hash check), so running it on every upload costs one API read when
  // nothing changed. The whole artifact set is written, not just this one, so a
  // student whose repo was disconnected for three weeks repairs on the next
  // successful sync instead of staying permanently short.
  const repo_sync = await syncArtifactsForEnrollment(enrollmentId);

  return { uploaded: true, filename, size_bytes, uploaded_at, artifact: { id: artifact.id, kind: BUILD_ARTIFACT_KIND, title }, repo_sync };
}

/**
 * Resolve the enrollment's project and mirror its artifacts. Returns a
 * classified outcome; never throws.
 */
async function syncArtifactsForEnrollment(
  enrollmentId: string,
): Promise<{ outcome: string; reason?: string; repo?: { owner: string; name: string } }> {
  try {
    const { default: Project } = await import('../../models/Project');
    const project: any = await Project.findOne({ where: { enrollment_id: enrollmentId } });
    if (!project) return { outcome: 'no_repo', reason: 'No project yet.' };

    const { syncArtifactsToRepo } = await import('../artifacts/artifactRepoSync');
    const result = await syncArtifactsToRepo(project.id);
    // `repo` rides along so the upload confirmation can offer the actual fix
    // (a link to THIS repo's collaborator settings) rather than only the
    // diagnosis. See ArtifactSyncResult.repo.
    return { outcome: result.outcome, reason: result.reason, repo: result.repo };
  } catch (err: any) {
    // syncArtifactsToRepo does not throw, so reaching here means the lookup
    // itself failed. Still not the student's problem.
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'build_artifact',
      event: 'artifact_repo_sync_lookup_failed', outcome: 'failure',
      error_class: err?.name ?? 'Error', context: { enrollment_id: enrollmentId },
    }));
    return { outcome: 'failed' };
  }
}
