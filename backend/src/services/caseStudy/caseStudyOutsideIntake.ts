/**
 * caseStudyOutsideIntake - turn ONE outside document into a draft case study waiting in Intake (package spec 1B).
 *
 *   bytes -> sha256 -> already imported? (return it, write nothing)
 *         -> store the original at <dir>/<sha256><ext>          (idempotent: same bytes, same path)
 *         -> extract text -> AI analysis                         (both fail SOFT)
 *         -> one transaction: case study + artifact + provenance + pending metrics + import row
 *         -> suggestLinksForCaseStudy                            (fail soft; the record still lands in Intake)
 *
 * IDEMPOTENT. The content hash is the key: a second import of the same bytes returns `alreadyImported: true` and
 * creates no row - checked before any work, and enforced by the UNIQUE index for the concurrent case
 * (`caseStudyOutsideRecord.ts`).
 *
 * FAIL-SOFT, PER FILE (root CLAUDE.md Failure-First):
 *   1. If parsing or the LLM fails, the draft is STILL created with the original attached and `analysisError` set,
 *      so it lands in Intake as "needs manual details" instead of vanishing.
 *   2. Retry: only at the LLM client (one). Parsing is deterministic and is not retried.
 *   3. Recovery: re-run the import - it is idempotent - or fill the fields by hand in Case Study Studio.
 *   4. Handled: unsupported type, empty file, parse failure/timeout, LLM failure, a concurrent duplicate import,
 *      a failed suggestion pass. Not handled here: storage or database being down - that file's result is
 *      `failed` with its error class, and nothing partial is written; the batch continues.
 * This function NEVER throws; every outcome is an `OutsideImportResult`.
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { extractOutsideText, outsideExtension } from './caseStudyOutsideExtract';
import { analyzeOutsideDocument } from './caseStudyOutsideAnalysis';
import { createOutsideRecord, findExistingImport } from './caseStudyOutsideRecord';
import type { OutsideSourceType } from './caseStudySourceKind';
import { isUniqueViolation } from '../../utils/uniqueViolation';

export const CASE_STUDY_EXTERNAL_DIR = process.env.CASE_STUDY_EXTERNAL_DIR || path.resolve('/app/uploads/case-study-external');

export interface OutsideImportFile {
  bytes: Buffer;
  fileName: string;
  mimeType?: string | null;
  sourceKind: OutsideSourceType;
  driveFileId?: string | null;
  driveModifiedTime?: string | null;
}

export interface OutsideImportContext {
  /** The gov tenant whose services the suggestion pass proposes. */
  tenantId: string;
  actor: string;
  correlationId: string;
}

export type OutsideImportStatus = 'created' | 'already_imported' | 'failed';

export interface OutsideImportResult {
  fileName: string;
  status: OutsideImportStatus;
  alreadyImported: boolean;
  caseStudyId: string | null;
  title: string | null;
  /** Set when the draft was created but parsing/analysis failed: it needs manual details. */
  analysisError: string | null;
  suggestionsInserted: number | null;
  /** Set only when status is 'failed'. A plain sentence; never an upstream response body. */
  error: string | null;
  errorClass: string | null;
}

/** Seams for tests; the real implementations by default. */
export interface OutsideIntakeDeps {
  extract: typeof extractOutsideText;
  analyze: typeof analyzeOutsideDocument;
  storeOriginal: (key: string, bytes: Buffer) => Promise<void>;
  suggest: (input: { caseStudyId: string; tenantId: string; suggestedBy: string }) => Promise<{ inserted: number }>;
}

async function storeOnDisk(absPath: string, bytes: Buffer): Promise<void> {
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  try {
    // 'wx' = create only. Same hash means same bytes, so an existing file is already the right file.
    await fs.writeFile(absPath, bytes, { flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== 'EEXIST') throw err;
  }
}

async function realSuggest(input: { caseStudyId: string; tenantId: string; suggestedBy: string }): Promise<{ inserted: number }> {
  const { suggestLinksForCaseStudy } = await import('./caseStudyServiceLinkStore');
  return suggestLinksForCaseStudy(input);
}

function defaultDeps(): OutsideIntakeDeps {
  return {
    extract: extractOutsideText,
    analyze: analyzeOutsideDocument,
    storeOriginal: (key, bytes) => storeOnDisk(path.join(CASE_STUDY_EXTERNAL_DIR, key), bytes),
    suggest: realSuggest,
  };
}

function log(outcome: 'success' | 'partial' | 'failure', ctx: OutsideImportContext, started: number, extra: Record<string, unknown>): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(), level: outcome === 'failure' ? 'error' : outcome === 'partial' ? 'warn' : 'info',
    service: 'backend', event: 'case_study_outside_import', correlation_id: ctx.correlationId,
    duration_ms: Date.now() - started, outcome, ...(extra.error_class ? { error_class: extra.error_class } : {}),
    context: { ...extra, error_class: undefined },
  });
  if (outcome === 'failure') console.error(line);
  else if (outcome === 'partial') console.warn(line);
  else console.log(line);
}

const failed = (fileName: string, errorClass: string, error: string): OutsideImportResult => ({
  fileName, status: 'failed', alreadyImported: false, caseStudyId: null, title: null,
  analysisError: null, suggestionsInserted: null, error, errorClass,
});

const already = (fileName: string, caseStudyId: string): OutsideImportResult => ({
  fileName, status: 'already_imported', alreadyImported: true, caseStudyId, title: null,
  analysisError: null, suggestionsInserted: null, error: null, errorClass: null,
});

export const sha256 = (bytes: Buffer): string => crypto.createHash('sha256').update(bytes).digest('hex');

/** Import one document. Never throws. */
export async function importOutsideFile(
  file: OutsideImportFile, ctx: OutsideImportContext, deps: Partial<OutsideIntakeDeps> = {},
): Promise<OutsideImportResult> {
  const d: OutsideIntakeDeps = { ...defaultDeps(), ...deps };
  const started = Date.now();
  const fileName = (file.fileName || 'document').slice(0, 255);
  const ext = outsideExtension(fileName, file.mimeType);
  if (!ext) {
    log('failure', ctx, started, { error_class: 'UnsupportedType', file_ext: path.extname(fileName).slice(0, 10) });
    return failed(fileName, 'UnsupportedType', 'Only PDF, DOCX and PPTX files can be imported as outside case studies.');
  }
  if (!file.bytes || file.bytes.length === 0) {
    log('failure', ctx, started, { error_class: 'EmptyFile' });
    return failed(fileName, 'EmptyFile', 'The file is empty.');
  }
  const contentHash = sha256(file.bytes);
  const storageKey = `${contentHash}${ext}`;

  try {
    const existing = await findExistingImport({ contentHash });
    if (existing) {
      log('success', ctx, started, { content_hash: contentHash.slice(0, 16), already_imported: true });
      return already(fileName, existing.caseStudyId);
    }
    await d.storeOriginal(storageKey, file.bytes);
  } catch (err) {
    log('failure', ctx, started, { error_class: 'StorageError', message: String((err as Error)?.message ?? err).slice(0, 200) });
    return failed(fileName, 'StorageError', 'The file could not be stored, so nothing was imported. Try again.');
  }

  const extracted = await d.extract(file.bytes, fileName, file.mimeType);
  const analyzed = extracted.ok
    ? await d.analyze({ text: extracted.text, fileName, contentHash })
    : { analysis: null, error: extracted.error, errorClass: extracted.errorClass };
  const analysisError = analyzed.analysis ? null : (analyzed.error || 'The document could not be analyzed.');

  let created: { caseStudyId: string; title: string };
  try {
    created = await createOutsideRecord({
      contentHash, sourceKind: file.sourceKind, fileName, mimeType: file.mimeType ?? null, sizeBytes: file.bytes.length,
      storageKey, driveFileId: file.driveFileId ?? null, driveModifiedTime: file.driveModifiedTime ?? null,
      analysis: analyzed.analysis, analysisError, actor: ctx.actor,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // A concurrent import of the same bytes won the unique index; this transaction rolled back whole.
      const winner = await findExistingImport({ contentHash }).catch(() => null);
      if (winner) {
        log('success', ctx, started, { content_hash: contentHash.slice(0, 16), already_imported: true, raced: true });
        return already(fileName, winner.caseStudyId);
      }
    }
    log('failure', ctx, started, { error_class: isUniqueViolation(err) ? 'UniqueViolation' : 'DatabaseError',
      message: String((err as Error)?.message ?? err).slice(0, 200) });
    return failed(fileName, 'DatabaseError', 'The case study could not be saved, so nothing was imported. Try again.');
  }

  let suggestionsInserted: number | null = null;
  try {
    suggestionsInserted = (await d.suggest({
      caseStudyId: created.caseStudyId, tenantId: ctx.tenantId, suggestedBy: `outside-intake:${ctx.actor}`,
    })).inserted;
  } catch (err) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event: 'case_study_outside_suggest_failed',
      correlation_id: ctx.correlationId, outcome: 'partial', error_class: (err as Error)?.name || 'SuggestionError',
      context: { case_study_id: created.caseStudyId, message: String((err as Error)?.message ?? err).slice(0, 200) },
    }));
  }

  log(analysisError ? 'partial' : 'success', ctx, started, {
    case_study_id: created.caseStudyId, content_hash: contentHash.slice(0, 16), source_kind: file.sourceKind,
    analysis_error_class: analyzed.analysis ? null : analyzed.errorClass, suggestions_inserted: suggestionsInserted,
  });
  return {
    fileName, status: 'created', alreadyImported: false, caseStudyId: created.caseStudyId, title: created.title,
    analysisError, suggestionsInserted, error: null, errorClass: null,
  };
}
