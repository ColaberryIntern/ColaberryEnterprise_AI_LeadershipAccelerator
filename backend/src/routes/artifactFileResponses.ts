import fs from 'fs';
import type { Request, Response } from 'express';
import type { InternArtifactFile, InternArtifactView } from '../services/internship/internArtifactViewer';
import { csvRowsToXlsx } from '../services/internship/internArtifactXlsx';
import { OfficeParseError, renderOfficeFile } from '../services/internship/officeToHtml';

/**
 * The HTTP half of the artifact viewers, shared by the admin viewer (/api/admin/internship/artifacts)
 * and the learner's own My work (/api/portal/career/work, C128). Each router decides WHO may read a
 * piece; once it has resolved the file or the view, the bytes go out the same way from both, so a
 * header fix (nosniff, attachment for anything but a PDF) cannot land on one side and miss the other.
 */

export function logFailure(event: string, err: unknown, context: Record<string, unknown> = {}): void {
  const e = err as Error;
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend', event,
    outcome: 'failure', error_class: e?.constructor?.name ?? 'UnknownError', context: { ...context, message: e?.message },
  }));
}

/** A filename safe for a Content-Disposition header: ASCII fallback plus the RFC 5987 UTF-8 form. */
export function disposition(type: 'inline' | 'attachment', name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * Stream an uploaded file. PDFs go inline so the browser's own viewer shows them; every other kind is
 * an attachment, so an upload never renders as a page on our origin. `?download=1` forces an
 * attachment for PDFs too.
 */
export function sendArtifactFile(req: Request, res: Response, file: InternArtifactFile, event: string, id: string): void {
  const inline = file.kind === 'pdf' && req.query.download !== '1';
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', disposition(inline ? 'inline' : 'attachment', file.name));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=300');
  const stream = fs.createReadStream(file.absPath);
  stream.on('error', (err) => {
    logFailure(event, err, { id });
    if (!res.headersSent) res.status(500).json({ error: 'Could not read this file.' }); else res.destroy();
  });
  stream.pipe(res);
}

/**
 * A Word or PowerPoint file as a self-contained HTML page, `{ html }`, which the page shows in a
 * script-less sandboxed iframe. 400 for any other kind; 422 when the file cannot be read (the page
 * then offers the download). Other errors are rethrown for the route's own 500.
 */
export async function sendOfficePreview(res: Response, file: InternArtifactFile): Promise<void> {
  if (file.kind !== 'word' && file.kind !== 'slides') { res.status(400).json({ error: 'Only Word and PowerPoint files have a preview.' }); return; }
  try {
    const html = await renderOfficeFile(file.absPath, file.name);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.json({ html });
  } catch (err) {
    if (err instanceof OfficeParseError) { res.status(422).json({ error: err.message }); return; }
    throw err;
  }
}

/** A CSV piece as a formatted Excel workbook. 400 when the piece is not a readable CSV. */
export async function sendCsvXlsx(res: Response, file: InternArtifactView['file']): Promise<void> {
  if (!file || file.kind !== 'csv' || !file.table) { res.status(400).json({ error: 'Only CSV files can be opened in Excel.' }); return; }
  const buf = await csvRowsToXlsx(file.table, file.name);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', disposition('attachment', file.name.replace(/\.[^.]+$/, '') + '.xlsx'));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(buf);
}
