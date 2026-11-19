/**
 * intakeDocument - the text out of a scope document a student uploads at step 1
 * of the intake (L12.2), so a student who has already scoped their project does
 * not have to retype it.
 *
 * Stores NOTHING. The text goes back to the browser, which folds it into the
 * idea with whatever else the student wrote, so Sharpen it, the preview and the
 * build receive it by the same path as typed text. That keeps one source of
 * truth for "what the student said": the idea they confirm.
 *
 * PDF, DOCX and PPTX go through the case-study extractor (pdf-parse and the
 * existing officeparser path, bounded and never throwing). Plain text and
 * Markdown are decoded here. Messages are written for the student, not for an
 * operator.
 */
import { extractOutsideText, outsideExtension, type ExtractDeps } from '../caseStudy/caseStudyOutsideExtract';
import { INTAKE_IDEA_MAX } from './intakeLimits';

export type IntakeDocumentResult =
  | { ok: true; fileName: string; text: string; truncated: boolean; chars: number }
  | { ok: false; reason: 'unsupported' | 'unreadable' | 'empty' | 'timeout'; message: string };

const TEXT_EXT = /\.(txt|md|markdown)$/i;
const TEXT_MIME = new Set(['text/plain', 'text/markdown', 'text/x-markdown']);

/** True when this file is a type the intake can read, by name or MIME type. */
export function isIntakeDocument(fileName: string, mimeType?: string | null): boolean {
  return Boolean(outsideExtension(fileName, mimeType)) || TEXT_EXT.test(fileName || '') || TEXT_MIME.has(mimeType || '');
}

export const UNSUPPORTED_MESSAGE = 'That file type can\'t be read here. Upload a PDF, Word (.docx), PowerPoint (.pptx), .txt or .md file.';

/** Read one uploaded document. Never throws. */
export async function readIntakeDocument(
  bytes: Buffer, fileName: string, mimeType?: string | null, deps: Partial<ExtractDeps> = {},
): Promise<IntakeDocumentResult> {
  const name = (fileName || 'document').slice(0, 200);
  if (!isIntakeDocument(name, mimeType)) return { ok: false, reason: 'unsupported', message: UNSUPPORTED_MESSAGE };

  let text: string;
  let truncated = false;
  if (!outsideExtension(name, mimeType)) {
    text = bytes.toString('utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n').trim();
  } else {
    const out = await extractOutsideText(bytes, name, mimeType, deps);
    if (!out.ok) {
      if (out.errorClass === 'NoText') {
        return { ok: false, reason: 'empty', message: /\.pdf$/i.test(name) || mimeType === 'application/pdf'
          ? 'We couldn\'t find any text in that PDF. It may be a scan or a picture of a page. Try the original Word or PowerPoint file, or paste the text in.'
          : 'We couldn\'t find any text in that file. Try another copy, or paste the text in.' };
      }
      if (out.errorClass === 'ParseTimeout') {
        return { ok: false, reason: 'timeout', message: 'That file took too long to read. Try a smaller copy, or paste the text in.' };
      }
      return { ok: false, reason: 'unreadable', message: 'We couldn\'t open that file. It may be damaged or password-protected. Try another copy, or paste the text in.' };
    }
    text = out.text;
    truncated = out.truncated;
  }

  if (!text) return { ok: false, reason: 'empty', message: 'That file is empty.' };
  if (text.length > INTAKE_IDEA_MAX) { text = text.slice(0, INTAKE_IDEA_MAX); truncated = true; }
  return { ok: true, fileName: name, text, truncated, chars: text.length };
}
