import fs from 'fs';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { getInternArtifact, getInternArtifactFile } from '../../services/internship/internArtifactViewer';
import { csvRowsToXlsx } from '../../services/internship/internArtifactXlsx';
import { OfficeParseError, renderOfficeFile } from '../../services/internship/officeToHtml';

/**
 * Read one published intern artifact, for /admin/internship/artifact/:id, which the Internship
 * Report links so Ali can open an artifact straight from the email.
 *
 * Its own router rather than another handler in `internshipRoutes.ts`: that file is 991 lines,
 * past the 500-line ceiling, and CLAUDE.md says the next change to an oversize file splits rather
 * than adds.
 *
 * Section `internship`, the same as the console that lists these interns. The service only
 * answers for ACTIVE interns, so the id cannot be used to read any other student's portfolio;
 * every other id is a 404, which also does not confirm the artifact exists.
 */
const router = Router();
const Params = z.object({ id: z.string().uuid() });

router.get('/api/admin/internship/artifacts/:id', requireSection('internship'), async (req: Request, res: Response) => {
  const parsed = Params.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: 'Artifact id must be a UUID.' }); return; }
  try {
    const artifact = await getInternArtifact(parsed.data.id);
    if (!artifact) { res.status(404).json({ error: 'No published artifact with that id for an active intern.' }); return; }
    res.json(artifact);
  } catch (err) {
    logFailure('intern_artifact_read_failed', err);
    res.status(500).json({ error: 'Could not load this artifact.' });
  }
});

function logFailure(event: string, err: unknown, context: Record<string, unknown> = {}): void {
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
 * The uploaded file itself, for the PDF viewer and the download buttons (Ali, 10 Nov 2026: "I also
 * need to have a pdf viewer in the platform"). PDFs are served inline so the browser's own viewer
 * shows them; every other kind is an attachment, so an intern's upload never renders as a page on
 * our origin. `?download=1` forces an attachment for PDFs too.
 */
router.get('/api/admin/internship/artifacts/:id/file', requireSection('internship'), async (req: Request, res: Response) => {
  const parsed = Params.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: 'Artifact id must be a UUID.' }); return; }
  try {
    const file = await getInternArtifactFile(parsed.data.id);
    if (!file) { res.status(404).json({ error: 'No uploaded file for that artifact.' }); return; }
    const inline = file.kind === 'pdf' && req.query.download !== '1';
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', disposition(inline ? 'inline' : 'attachment', file.name));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');
    const stream = fs.createReadStream(file.absPath);
    stream.on('error', (err) => {
      logFailure('intern_artifact_file_stream_failed', err, { id: parsed.data.id });
      if (!res.headersSent) res.status(500).json({ error: 'Could not read this file.' }); else res.destroy();
    });
    stream.pipe(res);
  } catch (err) {
    logFailure('intern_artifact_file_failed', err, { id: parsed.data.id });
    res.status(500).json({ error: 'Could not load this file.' });
  }
});

/**
 * A Word or PowerPoint artifact rendered as a self-contained HTML page (Ali, 10 Nov 2026: "We also
 * need a MS word viewer"). JSON `{ html }`, which the page shows in a script-less sandboxed iframe.
 * 400 for any other kind; 422 when the file cannot be read (the page then offers the download).
 */
router.get('/api/admin/internship/artifacts/:id/preview', requireSection('internship'), async (req: Request, res: Response) => {
  const parsed = Params.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: 'Artifact id must be a UUID.' }); return; }
  try {
    const file = await getInternArtifactFile(parsed.data.id);
    if (!file) { res.status(404).json({ error: 'No uploaded file for that artifact.' }); return; }
    if (file.kind !== 'word' && file.kind !== 'slides') { res.status(400).json({ error: 'Only Word and PowerPoint files have a preview.' }); return; }
    const html = await renderOfficeFile(file.absPath, file.name);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.json({ html });
  } catch (err) {
    if (err instanceof OfficeParseError) { res.status(422).json({ error: err.message }); return; }
    logFailure('intern_artifact_preview_failed', err, { id: parsed.data.id });
    res.status(500).json({ error: 'Could not preview this document.' });
  }
});

/** A CSV artifact as a formatted Excel workbook ("a csv viewer where I can view in excel"). */
router.get('/api/admin/internship/artifacts/:id/xlsx', requireSection('internship'), async (req: Request, res: Response) => {
  const parsed = Params.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: 'Artifact id must be a UUID.' }); return; }
  try {
    const artifact = await getInternArtifact(parsed.data.id);
    if (!artifact?.file) { res.status(404).json({ error: 'No uploaded file for that artifact.' }); return; }
    if (artifact.file.kind !== 'csv' || !artifact.file.table) { res.status(400).json({ error: 'Only CSV artifacts can be opened in Excel.' }); return; }
    const buf = await csvRowsToXlsx(artifact.file.table, artifact.file.name);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', disposition('attachment', artifact.file.name.replace(/\.[^.]+$/, '') + '.xlsx'));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buf);
  } catch (err) {
    logFailure('intern_artifact_xlsx_failed', err, { id: parsed.data.id });
    res.status(500).json({ error: 'Could not build the Excel file.' });
  }
});

export default router;
