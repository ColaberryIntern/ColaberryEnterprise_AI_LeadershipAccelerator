import CaseStudyEvidence from '../../models/CaseStudyEvidence';
import CaseStudySnapshot from '../../models/CaseStudySnapshot';
import type { CaseStudySnapshotContent } from '../../types/caseStudy';
import { CASE_STUDY_VISUAL_LIMITS, type CaseStudyVisualStorySection } from '../../types/caseStudyVisual';
import { CaseStudyAdminError, loadCaseStudyRow } from './caseStudyAdminStore';
import { generateVisualStory, isVisualStoryStale } from './caseStudyVisualStoryGenerate';
import {
  validateVisualStory,
  visualStoryContextFromContent,
  type VisualStoryValidationError,
} from './caseStudyVisualStoryValidate';

/**
 * caseStudyVisualStoryService - what the Studio's Visual Story panel reads.
 *
 * READ ONLY. Neither function writes a snapshot. The panel saves through the
 * one write path every section uses, `applyHumanOverride` with path
 * `visualStory`, which validates on the way in. This module answers the two
 * questions the panel asks before that: "what is on the record now, and is it
 * stale" and "what would the generator propose from the current evidence".
 * A draft is returned to the person, never persisted behind their back.
 */

export interface VisualStoryState {
  readonly snapshotId: string;
  readonly version: number;
  readonly current: CaseStudyVisualStorySection | null;
  /** True when a section exists and the sections it was drawn from changed since. */
  readonly stale: boolean;
  /** Validation of the stored section against the record as it is now. */
  readonly validation: { readonly ok: boolean; readonly errors: readonly VisualStoryValidationError[] };
  readonly limits: typeof CASE_STUDY_VISUAL_LIMITS;
}

export interface VisualStoryDraft extends VisualStoryState {
  readonly draft: CaseStudyVisualStorySection | null;
  readonly reasons: readonly string[];
  readonly draftValidation: { readonly ok: boolean; readonly errors: readonly VisualStoryValidationError[] };
}

async function latest(caseStudyId: string): Promise<{ id: string; version: number; content: CaseStudySnapshotContent }> {
  await loadCaseStudyRow(caseStudyId);
  const row = await CaseStudySnapshot.findOne({ where: { case_study_id: caseStudyId }, order: [['version', 'DESC']] });
  if (!row) {
    throw new CaseStudyAdminError('SnapshotNotFound',
      'This Case Study has no snapshot yet. Run a sync before drawing its story.', { case_study_id: caseStudyId });
  }
  return { id: String(row.id), version: Number(row.version), content: (row.content ?? {}) as unknown as CaseStudySnapshotContent };
}

async function evidenceIds(caseStudyId: string): Promise<string[]> {
  const rows = await CaseStudyEvidence.findAll({ where: { case_study_id: caseStudyId }, attributes: ['id'] });
  return rows.map((r) => String(r.id));
}

type Latest = Awaited<ReturnType<typeof latest>>;

/** One read of the record, the snapshot and the evidence ids, shared by both entry points. */
async function load(caseStudyId: string): Promise<{ snap: Latest; evidence: string[] }> {
  const snap = await latest(caseStudyId);
  return { snap, evidence: await evidenceIds(caseStudyId) };
}

function stateOf(snap: Latest, evidence: readonly string[]): VisualStoryState {
  const raw = (snap.content as { visualStory?: unknown }).visualStory;
  if (!raw) {
    return { snapshotId: snap.id, version: snap.version, current: null, stale: false, validation: { ok: true, errors: [] }, limits: CASE_STUDY_VISUAL_LIMITS };
  }
  const ctx = visualStoryContextFromContent(snap.content, evidence);
  const validation = validateVisualStory(raw, ctx);
  const current = validation.ok ? validation.section : (raw as CaseStudyVisualStorySection);
  const stale = current?.provenance?.sourceContentHash ? isVisualStoryStale(current, snap.content) : false;
  return {
    snapshotId: snap.id,
    version: snap.version,
    current,
    stale,
    validation: { ok: validation.ok, errors: validation.errors },
    limits: CASE_STUDY_VISUAL_LIMITS,
  };
}

export async function readVisualStoryState(caseStudyId: string): Promise<VisualStoryState> {
  const { snap, evidence } = await load(caseStudyId);
  return stateOf(snap, evidence);
}

/** State and draft come from ONE read, so `snapshotId` and the draft's `sourceSnapshotId` cannot disagree. */
export async function draftVisualStory(caseStudyId: string, now: () => Date = () => new Date()): Promise<VisualStoryDraft> {
  const { snap, evidence } = await load(caseStudyId);
  const state = stateOf(snap, evidence);
  const { section, reasons } = generateVisualStory(snap.content, {
    generatedAt: now().toISOString(),
    sourceSnapshotId: snap.id,
  });
  const ctx = visualStoryContextFromContent(snap.content, evidence);
  const draftValidation = section ? validateVisualStory(section, ctx) : { ok: false as const, errors: [] as VisualStoryValidationError[] };
  return {
    ...state,
    draft: section,
    reasons,
    draftValidation: { ok: draftValidation.ok, errors: draftValidation.errors },
  };
}
