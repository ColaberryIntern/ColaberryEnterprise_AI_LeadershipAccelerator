/**
 * caseStudySourceFile - find the ORIGINAL document behind an outside case study (the whitepaper PDF, DOCX or PPTX
 * imported through Intake), so an admin can read it on the Our Services page.
 *
 * READ-ONLY. Nothing is written. The file lives under CASE_STUDY_EXTERNAL_DIR, named by its content hash
 * (`<sha256>.<ext>`), which the intake wrote when it imported the document.
 *
 * SAFETY. `storage_key` comes from our own database, but it is still treated as untrusted: it must match the exact
 * hash-name shape, and the resolved path must stay inside the storage directory. Anything else is "no file", never a
 * read outside the directory.
 *
 * FAILURE MODES handled: no import row (an inside case study) -> null; a key in the wrong shape -> null; the file
 * missing on disk -> null. A database error is not caught here; the route logs it and answers 500.
 */
import fs from 'fs/promises';
import path from 'path';

export const SOURCE_KEY_PATTERN = /^[0-9a-f]{64}\.(pdf|docx|pptx)$/;

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export interface SourceFile {
  absPath: string;
  /** The filename the document was imported with, for the download name. */
  filename: string;
  mimeType: string;
  /** Only a PDF can be shown inside the page; DOCX and PPTX are offered as a download. */
  inline: boolean;
}

export interface ImportRow { storage_key: string | null; original_filename: string }

export interface SourceFileDeps {
  /** The newest import row for this case study, or null when it is not an outside record. */
  findImport: (caseStudyId: string) => Promise<ImportRow | null>;
  dir: string;
  exists: (absPath: string) => Promise<boolean>;
}

/** Resolve a stored key to a path inside `dir`, or null if the key is not one the intake could have written. */
export function resolveStorageKey(dir: string, key: string | null): string | null {
  if (!key || !SOURCE_KEY_PATTERN.test(key)) return null;
  const root = path.resolve(dir);
  const abs = path.resolve(root, key);
  return abs.startsWith(root + path.sep) ? abs : null;
}

export async function findSourceFile(caseStudyId: string, deps: SourceFileDeps): Promise<SourceFile | null> {
  const row = await deps.findImport(caseStudyId);
  if (!row) return null;
  const abs = resolveStorageKey(deps.dir, row.storage_key);
  if (!abs || !(await deps.exists(abs))) return null;
  const ext = path.extname(abs).slice(1);
  return { absPath: abs, filename: row.original_filename || path.basename(abs), mimeType: MIME[ext], inline: ext === 'pdf' };
}

export const fileExists = (absPath: string): Promise<boolean> =>
  fs.stat(absPath).then((s) => s.isFile()).catch(() => false);
