/**
 * caseStudyOutsideRecord - write ONE outside case study, all-or-nothing.
 *
 * One transaction creates five things, so a failure can never leave half a record (root CLAUDE.md: partial commits
 * are forbidden):
 *   1. `case_studies`               - status draft, visibility private, organization ANONYMIZED, source_type
 *                                     external_document | external_drive.
 *   2. `case_study_artifacts`       - the original file (source_type 'file', source_ref = Drive id or storage key).
 *   3. `case_study_evidence`        - the PROVENANCE row: every claim on this record came from an outside document
 *                                     and none is verified repo evidence (verification_class 'pending').
 *   4. `case_study_metrics`         - one row per figure the document states, verification_class 'pending',
 *                                     method 'self' (the document is the claimant reporting on itself),
 *                                     publishable FALSE - so the existing publish gate keeps protecting them.
 *   5. `case_study_external_imports`- the idempotency key (UNIQUE content_hash) and the analysis.
 *
 * The import row is written LAST inside the transaction, so when two admins import the same file at once the loser
 * hits the unique index and its whole transaction - including its case study - rolls back. The caller reads that
 * as "already imported".
 *
 * Models and the connection are lazy-loaded, so importing this module never initializes the ORM.
 */
import type { OutsideCaseStudyAnalysis } from './caseStudyOutsideAnalysis';
import type { OutsideSourceType } from './caseStudySourceKind';
import { slugifyCaseStudyTitle } from './caseStudyAdminStore';

export interface OutsideRecordInput {
  contentHash: string;
  sourceKind: OutsideSourceType;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  storageKey: string;
  driveFileId: string | null;
  driveModifiedTime: string | null;
  analysis: OutsideCaseStudyAnalysis | null;
  analysisError: string | null;
  actor: string;
}

export interface OutsideRecordCreated { caseStudyId: string; slug: string; title: string }

const cap = (s: string, n: number): string => (s.length > n ? s.slice(0, n) : s);

/** A readable title from a file name when the analysis gave none: "AgTech_-_Pricing.pdf" -> "AgTech - Pricing". */
export function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return cap(base || 'Outside case study', 300);
}

/** Deterministic: the same document always gets the same slug, and two documents with one title do not collide. */
export function outsideSlug(title: string, contentHash: string): string {
  return `${cap(slugifyCaseStudyTitle(title), 150).replace(/-+$/, '')}-${contentHash.slice(0, 8)}`;
}

export async function createOutsideRecord(input: OutsideRecordInput): Promise<OutsideRecordCreated> {
  const { sequelize } = await import('../../config/database');
  const { default: CaseStudy } = await import('../../models/CaseStudy');
  const { default: CaseStudyArtifact } = await import('../../models/CaseStudyArtifact');
  const { default: CaseStudyEvidence } = await import('../../models/CaseStudyEvidence');
  const { default: CaseStudyMetric } = await import('../../models/CaseStudyMetric');
  const { default: CaseStudyExternalImport } = await import('../../models/CaseStudyExternalImport');

  const a = input.analysis;
  const title = cap(a?.title || titleFromFileName(input.fileName), 300);
  const slug = outsideSlug(title, input.contentHash);

  return sequelize.transaction(async (transaction) => {
    const record = await CaseStudy.create({
      slug, title, status: 'draft', source_type: input.sourceKind,
      canonical_summary: a?.summary ?? null,
      industry: a?.industry ? cap(a.industry, 120) : null,
      primary_capability: a?.capabilities[0] ? cap(a.capabilities[0], 120) : null,
      visibility: 'private',
      organization_display_name: a?.clientDescriptor ?? null,
      organization_is_anonymized: true,
      organization_identity_mode: 'anonymized',
      organization_naming_consent: false,
      created_by: input.actor,
    }, { transaction });

    const artifact = await CaseStudyArtifact.create({
      case_study_id: record.id, artifact_type: 'document', title: cap(input.fileName, 300),
      description: `Original outside document (sha256 ${input.contentHash}).`,
      source_type: 'file', source_ref: cap(input.driveFileId ?? input.storageKey, 512),
      visibility: 'private', status: 'candidate',
    }, { transaction });

    await CaseStudyEvidence.create({
      case_study_id: record.id, source_type: 'artifact', source_ref: artifact.id,
      title: cap(`Outside document: ${input.fileName}`, 300),
      description: 'Every claim on this case study was extracted by AI from an outside document. None of it is verified repo evidence until a person confirms it.',
      verification_class: 'pending', is_publicly_openable: false,
      metadata: {
        provenance: 'outside_document', content_hash: input.contentHash, source_kind: input.sourceKind,
        drive_file_id: input.driveFileId, storage_key: input.storageKey,
        analysis_status: a ? 'analyzed' : 'failed',
      },
    }, { transaction });

    if (a && a.metrics.length) {
      await CaseStudyMetric.bulkCreate(a.metrics.map((m, i) => ({
        case_study_id: record.id, metric_key: `outside-claim-${i + 1}`, label: cap(m.label, 300),
        value_display: cap(m.value, 300), verification_class: 'pending', verification_method: 'self',
        evidence_description: `Stated in the outside document "${cap(input.fileName, 200)}"; not verified.`,
        publishable: false, is_headline: false,
      })), { transaction });
    }

    await CaseStudyExternalImport.create({
      case_study_id: record.id, content_hash: input.contentHash, source_kind: input.sourceKind,
      drive_file_id: input.driveFileId,
      drive_modified_time: input.driveModifiedTime ? new Date(input.driveModifiedTime) : null,
      original_filename: input.fileName, mime_type: input.mimeType, size_bytes: input.sizeBytes,
      storage_key: input.storageKey, analysis_status: a ? 'analyzed' : 'failed', analysis_error: input.analysisError,
      analysis: a as unknown as Record<string, unknown> | null, imported_by: input.actor,
    }, { transaction });

    return { caseStudyId: record.id, slug, title };
  });
}

/** The existing import for a content hash, or for an unchanged Drive file (same id AND same modifiedTime). */
export async function findExistingImport(
  by: { contentHash: string } | { driveFileId: string; driveModifiedTime: string },
): Promise<{ caseStudyId: string; contentHash: string } | null> {
  const { default: CaseStudyExternalImport } = await import('../../models/CaseStudyExternalImport');
  const where = 'contentHash' in by
    ? { content_hash: by.contentHash }
    : { drive_file_id: by.driveFileId, drive_modified_time: new Date(by.driveModifiedTime) };
  const row = await CaseStudyExternalImport.findOne({ where });
  return row ? { caseStudyId: row.case_study_id, contentHash: row.content_hash } : null;
}
