/**
 * certificationRoutes — the student side of certification claims
 * (docs/POINTS_LADDER_DECISIONS.md, D4): upload the certificate, see the
 * claims filed, download a file back.
 *
 * Mounted on its own prefix rather than under /api/portal/cert-prep on
 * purpose: Cert Prep is the PRACTICE surface and is behind CERT_PREP_ENABLED
 * and a Week-7 fence, while uploading a certificate already earned must work
 * for any enrolled student regardless of either. Auth is requireParticipant
 * only; the file lands in CERT_DIR through the same multer config the Skills
 * Course certificate uses (PDF or image, 15MB).
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { certificateUpload } from '../config/upload';
import {
  submitCertification, listMyCertifications, getCertificationFile, CertificationError, CERTIFICATION_TRACKS,
} from '../services/certification/studentCertificationService';

const router = Router();

const SubmitSchema = z.object({
  track: z.enum(CERTIFICATION_TRACKS).optional(),
  credential_id: z.string().trim().max(120).optional().nullable(),
  passed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'passed_on must be YYYY-MM-DD').optional().nullable(),
  note: z.string().trim().max(2000).optional().nullable(),
});

function fail(res: Response, err: unknown, next: NextFunction): void {
  if (err instanceof CertificationError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }
  next(err);
}

router.post(
  '/api/portal/certifications',
  requireParticipant,
  (req, res, next) => {
    // multer errors (type, size) are 400s with its message, not 500s.
    certificateUpload.single('file')(req, res, (err: unknown) => {
      if (err) { res.status(400).json({ error: 'upload_rejected', message: (err as Error).message }); return; }
      next();
    });
  },
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = (req as any).file as { filename: string; mimetype: string; originalname?: string } | undefined;
      if (!file) { res.status(400).json({ error: 'file_required', message: 'Attach your certificate as a PDF or an image.' }); return; }
      const parsed = SubmitSchema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'invalid_body', message: parsed.error.issues[0]?.message ?? 'Invalid request' }); return; }
      const view = await submitCertification({
        enrollmentId: req.participant!.sub,
        track: parsed.data.track,
        file,
        credentialId: parsed.data.credential_id ?? null,
        passedOn: parsed.data.passed_on ?? null,
        note: parsed.data.note ?? null,
      });
      res.status(201).json(view);
    } catch (err) { fail(res, err, next); }
  },
);

router.get('/api/portal/certifications', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ certifications: await listMyCertifications(req.participant!.sub) });
  } catch (err) { fail(res, err, next); }
});

router.get('/api/portal/certifications/:id/file', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = await getCertificationFile(String(req.params.id), req.participant!.sub);
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Disposition', `inline; filename="${file.download}"`);
    res.sendFile(file.path);
  } catch (err) { fail(res, err, next); }
});

export default router;
