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
export async function uploadBuildArtifact(enrollmentId: string, cardId: string, file: UploadFile) {
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

  return { uploaded: true, filename, size_bytes, uploaded_at, artifact: { id: artifact.id, kind: BUILD_ARTIFACT_KIND, title } };
}
