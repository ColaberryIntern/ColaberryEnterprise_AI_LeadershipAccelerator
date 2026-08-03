/**
 * fieldGuideService — the Week-1+ Deep Dive "Field Guide" upload flow.
 *
 * A student builds a rich, self-contained HTML Field Guide in THEIR OWN Claude
 * Code (from the build prompt inside the Deep Dive), then uploads it here. We:
 *   1. store it as a PortfolioArtifact (kind 'field_guide') so it lands in the
 *      student's portfolio / library and survives restarts (DB, not disk);
 *   2. award a one-time 100-point bonus (idempotent — re-upload never re-awards);
 *   3. gate card completion on the upload existing (assertFieldGuideRequirement,
 *      mirrors assertWatchRequirement — the single choke point in onCardCompleted).
 *
 * Failure-first: oversized / empty / non-HTML uploads are rejected with a
 * student-readable message and a typed status before any DB write. Re-upload is
 * a safe replace (one artifact per (enrollment, card)); points stay banked once.
 */
import TimelineCard from '../../models/TimelineCard';
import TimelineCardProgress from '../../models/TimelineCardProgress';
import PortfolioArtifact from '../../models/PortfolioArtifact';
import { award } from '../pointsService';
import { MAX_FIELD_GUIDE_SIZE } from '../../config/upload';

export const FIELD_GUIDE_KIND = 'field_guide';
export const FIELD_GUIDE_POINTS = 100;

export interface FieldGuideStatus { uploaded: boolean; uploaded_at: string | null; filename: string | null; size_bytes: number | null; }
interface UploadFile { originalname?: string; mimetype?: string; size?: number; buffer?: Buffer }
export interface ParsedFieldGuide { html: string; filename: string; size_bytes: number; }

/** A card requires a Field Guide upload before completion iff its metadata says so
 *  (set by the seed on Week 1+; Week 0 is read-only). Pure. */
export function requiresFieldGuideUpload(card: { metadata?: any } | null | undefined): boolean {
  return !!(card && card.metadata && card.metadata.requires_field_guide_upload === true);
}

export function fieldGuidePointsKey(cardId: string): string {
  return `deep_dive_field_guide:${cardId}`;
}

/**
 * Validate + decode an uploaded Field Guide file. Pure (no I/O) so the failure
 * and boundary paths are unit-tested without a DB. Throws typed { status } errors.
 */
export function parseFieldGuideUpload(file: UploadFile | null | undefined, maxBytes = MAX_FIELD_GUIDE_SIZE): ParsedFieldGuide {
  if (!file || !file.buffer || !Buffer.isBuffer(file.buffer)) {
    throw Object.assign(new Error('No file uploaded.'), { status: 400 });
  }
  const size_bytes = file.buffer.length;
  if (size_bytes === 0) throw Object.assign(new Error('The uploaded file is empty.'), { status: 400 });
  if (size_bytes > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    throw Object.assign(new Error(`Your Field Guide is larger than ${mb} MB. Trim embedded images and upload again.`), { status: 413 });
  }
  const html = file.buffer.toString('utf8');
  if (!html.trim()) throw Object.assign(new Error('The uploaded file is empty.'), { status: 400 });
  if (!/<!doctype html/i.test(html) && !/<html[\s>]/i.test(html)) {
    throw Object.assign(new Error('That does not look like an HTML Field Guide. Upload the .html file Claude Code built for you.'), { status: 400 });
  }
  const filename = (file.originalname || 'field-guide.html').slice(0, 200);
  return { html, filename, size_bytes };
}

/** Read-only status of a student's uploaded guide for a card (for the open payload). */
export async function getFieldGuideStatus(enrollmentId: string, cardId: string): Promise<FieldGuideStatus> {
  const row: any = await PortfolioArtifact.findOne({ where: { enrollment_id: enrollmentId, card_id: cardId } });
  const c = row && row.content;
  if (!c || c.kind !== FIELD_GUIDE_KIND) return { uploaded: false, uploaded_at: null, filename: null, size_bytes: null };
  return {
    uploaded: true,
    uploaded_at: c.uploaded_at || (row.created_at ? new Date(row.created_at).toISOString() : null),
    filename: c.filename || null,
    size_bytes: typeof c.size_bytes === 'number' ? c.size_bytes : null,
  };
}

/**
 * Store the uploaded Field Guide and award the one-time 100-point bonus.
 * Idempotent: one PortfolioArtifact per (enrollment, card) — re-upload replaces
 * the stored HTML; the 100-point award is keyed so it fires at most once.
 */
export async function uploadFieldGuide(enrollmentId: string, cardId: string, file: UploadFile) {
  const card: any = await TimelineCard.findByPk(cardId);
  if (!card || card.visibility !== 'published') throw Object.assign(new Error('Card not available'), { status: 404 });
  if (card.type !== 'deep_dive') throw Object.assign(new Error('This activity does not accept a Field Guide upload.'), { status: 400 });

  const { html, filename, size_bytes } = parseFieldGuideUpload(file);
  const uploaded_at = new Date().toISOString();
  const title = `Field Guide — ${card.title}`.slice(0, 400);
  const summary = `The Field Guide this student built in Claude Code for "${card.title}".`;
  const competencies = Array.isArray(card.competencies) ? card.competencies.map((x: any) => x.domain_id || x) : [];
  const content = { kind: FIELD_GUIDE_KIND, body_html: html, filename, size_bytes, uploaded_at, week: card.week ?? null };

  const existing: any = await PortfolioArtifact.findOne({ where: { enrollment_id: enrollmentId, card_id: cardId } });
  let artifact: any;
  if (existing) {
    await existing.update({ kind: FIELD_GUIDE_KIND, title, summary, content, competencies });
    artifact = existing;
  } else {
    artifact = await PortfolioArtifact.create({ enrollment_id: enrollmentId, card_id: cardId, kind: FIELD_GUIDE_KIND, title, summary, content, competencies });
  }

  // One-time 100-point bonus. Idempotent per (enrollment, event_key): re-upload → 0.
  const res = await award(enrollmentId, {
    eventType: 'deep_dive_field_guide',
    eventKey: fieldGuidePointsKey(cardId),
    points: FIELD_GUIDE_POINTS,
    metadata: { card_id: cardId, filename },
  });

  return {
    uploaded: true,
    filename,
    size_bytes,
    uploaded_at,
    points_awarded: res.points,
    already_awarded: !res.awarded,
    artifact: { id: artifact.id, kind: FIELD_GUIDE_KIND, title, summary },
  };
}

/**
 * Completion gate — called by onCardCompleted BEFORE the status flip (single choke
 * point covering the runtime + classroom complete paths). A card that requires a
 * Field Guide upload can't be completed until the artifact exists. Idempotent
 * completions (already completed) never re-gate. Throws { status: 422 }.
 */
export async function assertFieldGuideRequirement(enrollmentId: string, card: TimelineCard): Promise<void> {
  if (!requiresFieldGuideUpload(card as any)) return;
  const progress: any = await TimelineCardProgress.findOne({ where: { card_id: (card as any).id, enrollment_id: enrollmentId } });
  if (progress?.status === 'completed') return;   // already done — never re-gate
  const status = await getFieldGuideStatus(enrollmentId, (card as any).id);
  if (status.uploaded) return;
  throw Object.assign(
    new Error('Upload the Field Guide you built in Claude Code (copy the build prompt, run it, then upload the .html) to complete this Deep Dive.'),
    { status: 422, code: 'field_guide_required' },
  );
}
