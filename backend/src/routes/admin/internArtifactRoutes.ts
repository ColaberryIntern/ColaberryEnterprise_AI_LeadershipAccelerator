import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { getInternArtifact, getInternArtifactFile } from '../../services/internship/internArtifactViewer';
import { logFailure, sendArtifactFile, sendCsvXlsx, sendOfficePreview } from '../artifactFileResponses';

export { disposition } from '../artifactFileResponses';

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
 *
 * How the bytes go out (headers, inline vs attachment, the Word preview, the Excel build) lives in
 * `artifactFileResponses.ts`, shared with the learner's own My work routes (C128).
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

/** The uploaded file itself, for the PDF viewer and the download buttons. */
router.get('/api/admin/internship/artifacts/:id/file', requireSection('internship'), async (req: Request, res: Response) => {
  const parsed = Params.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: 'Artifact id must be a UUID.' }); return; }
  try {
    const file = await getInternArtifactFile(parsed.data.id);
    if (!file) { res.status(404).json({ error: 'No uploaded file for that artifact.' }); return; }
    sendArtifactFile(req, res, file, 'intern_artifact_file_stream_failed', parsed.data.id);
  } catch (err) {
    logFailure('intern_artifact_file_failed', err, { id: parsed.data.id });
    res.status(500).json({ error: 'Could not load this file.' });
  }
});

/** A Word or PowerPoint artifact rendered as a self-contained HTML page (Ali, 10 Nov 2026: "We also need a MS word viewer"). */
router.get('/api/admin/internship/artifacts/:id/preview', requireSection('internship'), async (req: Request, res: Response) => {
  const parsed = Params.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: 'Artifact id must be a UUID.' }); return; }
  try {
    const file = await getInternArtifactFile(parsed.data.id);
    if (!file) { res.status(404).json({ error: 'No uploaded file for that artifact.' }); return; }
    await sendOfficePreview(res, file);
  } catch (err) {
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
    await sendCsvXlsx(res, artifact.file);
  } catch (err) {
    logFailure('intern_artifact_xlsx_failed', err, { id: parsed.data.id });
    res.status(500).json({ error: 'Could not build the Excel file.' });
  }
});

export default router;
