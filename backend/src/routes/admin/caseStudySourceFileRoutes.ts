/**
 * caseStudySourceFileRoutes - serve the ORIGINAL document of an outside case study, so the Our Services page can
 * show the whitepaper itself, not only its extracted summary.
 *
 *   GET /api/admin/factory/case-studies/:caseStudyId/source-file[?download=1]
 *     200 the file (a PDF is sent `inline` so it can be shown in the page; DOCX/PPTX and ?download=1 as attachment)
 *     400 malformed id - 404 no original document (an inside case study, or the file is gone) - 500 read failure
 *
 * READ-ONLY. Under /api/admin/factory, so mgmtSectionGate's 'program' prefix row covers it, and the route also
 * carries requireSection('program') like its siblings. Outside case studies are internal evidence and are never
 * served on a public route.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import CaseStudyExternalImport from '../../models/CaseStudyExternalImport';
import { CASE_STUDY_EXTERNAL_DIR } from '../../services/caseStudy/caseStudyOutsideIntake';
import { fileExists, findSourceFile } from '../../services/caseStudy/caseStudySourceFile';

const router = Router();
const params = z.object({ caseStudyId: z.string().uuid() });

/** RFC 6266: an ASCII `filename=` for old clients and a UTF-8 `filename*=` that modern browsers prefer. */
export function disposition(kind: 'inline' | 'attachment', rawName: string): string {
  const name = rawName.replace(/[\r\n]/g, '');
  const ascii = name.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

router.get(
  '/api/admin/factory/case-studies/:caseStudyId/source-file',
  requireSection('program'),
  async (req: Request, res: Response) => {
    const p = params.safeParse(req.params);
    if (!p.success) { res.status(400).json({ error: 'Invalid case study id.' }); return; }
    try {
      const file = await findSourceFile(p.data.caseStudyId, {
        findImport: async (id) => {
          const row = await CaseStudyExternalImport.findOne({ where: { case_study_id: id }, order: [['created_at', 'DESC']] });
          return row ? { storage_key: row.storage_key, original_filename: row.original_filename } : null;
        },
        dir: CASE_STUDY_EXTERNAL_DIR,
        exists: fileExists,
      });
      if (!file) { res.status(404).json({ error: 'This case study has no original document on file.' }); return; }
      const asDownload = req.query.download === '1' || !file.inline;
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', disposition(asDownload ? 'attachment' : 'inline', file.filename));
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.sendFile(file.absPath);
    } catch (err) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'error', service: 'backend', event: 'case_study_source_file_failed',
        outcome: 'failure', error_class: (err as Error)?.name ?? 'UnknownError',
        context: { caseStudyId: p.data.caseStudyId, message: String((err as Error)?.message ?? err).slice(0, 200) },
      }));
      res.status(500).json({ error: 'The document could not be read.' });
    }
  },
);

export default router;
