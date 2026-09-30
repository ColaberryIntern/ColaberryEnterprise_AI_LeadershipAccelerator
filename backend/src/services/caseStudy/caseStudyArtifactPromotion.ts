/**
 * Case Study OS — the artifact promotion path (D-0).
 *
 * THIS CLOSES A GAP, NOT A FEATURE REQUEST. `STORY_ASSET_MODEL.md` §2.6 and
 * finding A-3 record it: the complete set of application writes to
 * `case_study_artifacts` was two `findAll` and one `create`, and the create
 * hardcodes `status: 'candidate'`, `visibility: 'private'`. There was no
 * `update`, no `destroy` and no artifact route — so since `projectArtifacts`
 * drops anything not `approved`, THE ENTIRE HERO, CAROUSEL AND FIGURE SURFACE
 * COULD NOT POPULATE THROUGH THE APPLICATION AT ALL. The pilot record's three
 * approved artifacts were promoted by direct SQL.
 *
 * Every image-bearing thing in the Studio depends on this file existing.
 *
 * THE ONE CONSTRAINT ON ITS SHAPE, from the same document: this exposes
 * `status` and `visibility` and NEVER `presentation`. `presentation` is derived
 * from `artifact_type` (`caseStudyArtifactPresentation.ts:38-40`) precisely so
 * that "is this evidence?" is not an editorial field. An author-set flag there
 * would make the one decision that must not be editable into a dropdown, and no
 * amount of later review recovers that.
 *
 * `artifact_type` is likewise NOT settable here. It is set at creation from the
 * source, and letting a reviewer retype a `photo` as a `screenshot` would be
 * the same bypass wearing a different hat.
 */

import { CaseStudyArtifact as ArtifactModel } from '../../models';
import type {
  CaseStudyArtifactStatus, CaseStudyArtifactVisibility,
} from '../../types/caseStudy';
import { CaseStudyAdminError } from './caseStudyAdminStore';

export const ARTIFACT_STATUSES: readonly CaseStudyArtifactStatus[] =
  ['candidate', 'approved', 'rejected'];

export const ARTIFACT_VISIBILITIES: readonly CaseStudyArtifactVisibility[] =
  ['public', 'request_only', 'private'];

export interface PromoteArtifactInput {
  readonly caseStudyId: string;
  readonly artifactId: string;
  readonly status: CaseStudyArtifactStatus;
  readonly visibility: CaseStudyArtifactVisibility;
  readonly actor: string;
}

export interface ArtifactPromotionRecord {
  readonly id: string;
  readonly artifactType: string;
  readonly title: string;
  readonly status: CaseStudyArtifactStatus;
  readonly visibility: CaseStudyArtifactVisibility;
  /** Derived from the type. Reported so the Studio can SHOW it, never set it. */
  readonly presentationIsEvidence: boolean;
}

/**
 * `presentation` mirrors `caseStudyArtifactPresentation.ts`'s derivation. It is
 * recomputed rather than imported-and-stored so that this module cannot become
 * a second place the answer is written down and disagree with the first.
 */
const EVIDENCE_TYPES = new Set(['screenshot', 'architecture', 'demo', 'report', 'evaluation', 'code']);

const toRecord = (row: ArtifactModel): ArtifactPromotionRecord => ({
  id: row.id,
  artifactType: row.artifact_type,
  title: row.title,
  status: row.status as CaseStudyArtifactStatus,
  visibility: row.visibility as CaseStudyArtifactVisibility,
  presentationIsEvidence: EVIDENCE_TYPES.has(row.artifact_type),
});

/** Every artifact on a record, candidates included — the Studio must show what it refuses. */
export async function listArtifacts(
  caseStudyId: string,
): Promise<readonly ArtifactPromotionRecord[]> {
  const rows = await ArtifactModel.findAll({
    where: { case_study_id: caseStudyId },
    order: [['created_at', 'ASC']],
  });
  return rows.map(toRecord);
}

/**
 * Promote, demote or reject one artifact.
 *
 * IDEMPOTENT, AND THE TEST PLAN CALLS THIS OUT AS THE HIGHEST-RISK ITEM IN THE
 * WORKSTREAM. Promoting the same artifact twice with the same status and
 * visibility produces one approved artifact and no second side effect: the
 * function reads the row, compares, and returns `outcome: 'unchanged'` without
 * writing. A retry is therefore always safe, which is the required behaviour
 * for every side-effecting write in this repository.
 *
 * FAILS CLOSED ON A CONTRADICTION. `status: 'approved'` with
 * `visibility: 'private'` is refused rather than silently stored, because the
 * pair reads as "approved" in the admin list while rendering nothing on the
 * page — an operator would reasonably conclude the publish path is broken.
 */
export async function setArtifactStatus(input: PromoteArtifactInput): Promise<{
  readonly outcome: 'unchanged' | 'updated';
  readonly artifact: ArtifactPromotionRecord;
}> {
  if (!ARTIFACT_STATUSES.includes(input.status)) {
    throw new CaseStudyAdminError('ValidationError', 'Unknown artifact status.', {
      field: 'status', allowed: ARTIFACT_STATUSES,
    });
  }
  if (!ARTIFACT_VISIBILITIES.includes(input.visibility)) {
    throw new CaseStudyAdminError('ValidationError', 'Unknown artifact visibility.', {
      field: 'visibility', allowed: ARTIFACT_VISIBILITIES,
    });
  }
  if (input.status === 'approved' && input.visibility === 'private') {
    throw new CaseStudyAdminError(
      'ValidationError',
      'An approved artifact cannot be private: it would read as approved in the admin list and '
        + 'render nothing on the page. Choose public or request_only, or leave it a candidate.',
      { field: 'visibility' },
    );
  }

  const row = await ArtifactModel.findOne({
    where: { id: input.artifactId, case_study_id: input.caseStudyId },
  });
  if (!row) {
    throw new CaseStudyAdminError('CaseStudyNotFound', 'That artifact does not exist on this record.', {
      artifactId: input.artifactId,
    });
  }

  if (row.status === input.status && row.visibility === input.visibility) {
    return { outcome: 'unchanged', artifact: toRecord(row) };
  }

  row.status = input.status;
  row.visibility = input.visibility;
  await row.save();

  return { outcome: 'updated', artifact: toRecord(row) };
}
