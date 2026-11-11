import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import multer from 'multer';
import { requireSection } from '../../middlewares/authMiddleware';
import {
  ingestSourceDocument, listSourceDocuments, approveSourceDocument, deleteSourceDocument,
} from '../../services/factory/proposal/govProposalSources';
import GovQualification from '../../models/GovQualification';

/**
 * Admin routes for a gov project's proposal SOURCE library (P-SRC, P3). A human with the `gov_contracts` section
 * uploads a reference document; it is ingested (P1), and once APPROVED here its excerpts can ground the proposal (P2).
 *
 * Security (CLAUDE.md Security layer): every route is gated `requireSection('gov_contracts')`, and the upload is
 * validated at the boundary — one file, a 20MB ceiling (multer), and an extension allowlist (.docx/.pdf/.txt/.md) —
 * BEFORE any bytes reach extraction/storage. The upload stores at `approved = false`, so nothing an upload writes can
 * ground a proposal until a human approves it.
 */
const router = express.Router();

const MAX_BYTES = 20 * 1024 * 1024; // 20MB
const ALLOWED_EXT = new Set(['.docx', '.pdf', '.txt', '.md']);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } });

/** Resolve the tenant from the project's latest qualification (same derivation the grounding loader uses). */
async function tenantForProject(projectId: string): Promise<string | null> {
  const q: any = await GovQualification.findOne({ where: { delivery_project_id: projectId }, order: [['version', 'DESC']] });
  return q?.tenant_id ?? null;
}

/** Best-effort acting identity for uploaded_by / approved_by (nullable columns, so a miss is harmless). */
function actingIdentity(req: Request): string | null {
  const a = ((req as any).admin ?? (req as any).user ?? {}) as Record<string, unknown>;
  return (a.identityId as string) ?? (a.identity_id as string) ?? (a.id as string) ?? null;
}

/** Answer multer's own errors here (oversize → 413, malformed → 400) instead of letting them reach the 500 handler. */
function acceptSource(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const tooLarge = (err as { code?: string })?.code === 'LIMIT_FILE_SIZE';
      res.status(tooLarge ? 413 : 400).json({
        error: tooLarge ? `That file is over the ${MAX_BYTES}-byte limit.` : 'The upload was malformed. Attach one file in the "file" field.',
        error_class: tooLarge ? 'PayloadTooLarge' : 'ValidationError',
      });
      return;
    }
    next();
  });
}

const BASE = '/api/admin/gov-contracts/:projectId/sources';

// Upload a source document: validate type at the boundary, then ingest (stored unapproved).
router.post(BASE, requireSection('gov_contracts'), acceptSource, async (req: Request, res: Response) => {
  const file = (req as any).file as { originalname: string; mimetype: string; buffer: Buffer; size: number } | undefined;
  if (!file) { res.status(400).json({ error: 'Attach one file in the "file" field.', error_class: 'ValidationError' }); return; }
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    res.status(400).json({ error: `Unsupported file type "${ext || '(none)'}". Allowed: .docx, .pdf, .txt, .md.`, error_class: 'ValidationError' });
    return;
  }
  const tenantId = await tenantForProject(String(req.params.projectId));
  if (!tenantId) { res.status(404).json({ error: 'No tenant resolved for this project.', error_class: 'NotFound' }); return; }
  try {
    const result = await ingestSourceDocument(
      String(req.params.projectId), tenantId,
      { name: file.originalname, mimeType: file.mimetype, buffer: file.buffer, source: 'admin upload' },
      actingIdentity(req),
    );
    res.json({ ok: true, ...result });
  } catch (err: any) {
    console.warn('[gov-proposal-sources] ingest failed:', err?.message);
    res.status(500).json({ error: 'Ingestion failed.', error_class: 'IngestError' });
  }
});

// List the project's source documents.
router.get(BASE, requireSection('gov_contracts'), async (req: Request, res: Response) => {
  const docs = await listSourceDocuments(String(req.params.projectId));
  res.json({
    documents: docs.map((d: any) => ({
      id: d.id, name: d.name, status: d.status, approved: d.approved,
      chunkCount: d.chunk_count, embeddedCount: d.embedded_count, truncated: d.truncated, createdAt: d.created_at,
    })),
  });
});

// Approve (or un-approve) a source document for grounding.
router.post(`${BASE}/:id/approve`, requireSection('gov_contracts'), async (req: Request, res: Response) => {
  const approved = req.body?.approved !== false; // default true
  const doc = await approveSourceDocument(String(req.params.id), actingIdentity(req), approved);
  if (!doc) { res.status(404).json({ error: 'Source document not found.', error_class: 'NotFound' }); return; }
  res.json({ ok: true, id: doc.id, approved: doc.approved });
});

// Delete a source document (its chunks cascade).
router.delete(`${BASE}/:id`, requireSection('gov_contracts'), async (req: Request, res: Response) => {
  const ok = await deleteSourceDocument(String(req.params.id));
  res.status(ok ? 200 : 404).json({ ok });
});

export default router;
