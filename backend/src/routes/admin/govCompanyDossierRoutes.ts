/**
 * govCompanyDossierRoutes — the "Gov Company Dossier" admin portal (Dossier Phase 2a). A tenant-wide view of the
 * reusable company library the Proposal Studio agent grounds on: facts, past-performance references, and key
 * personnel. One place to hunt, enter and approve the proof so the drafter stops asking a human for it on every bid.
 *
 * TENANT-WIDE, not per-project: the library rows are tenant-scoped and shared across every gov pursuit, so (like Our
 * Services) the tenant is resolved from `lookupGovContractsContainer()` rather than a `:projectId`. An unresolvable
 * workspace is a 503, never a cross-tenant read.
 *
 * Gated `requireSection('program')` — the same section the backend's mgmtSectionGate maps `/api/admin/factory/*` to,
 * so the sidebar entry and the API agree by construction. READS list; WRITES add/approve. Every input is Zod-validated
 * at the boundary (400 on bad input); the service layer stays tenant-scoped.
 */
import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import multer from 'multer';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { lookupGovContractsContainer } from '../../scripts/lib/factoryDemoContainer';
import {
  listCompanyLibrary, addCompanyFact, addCompanyReference, addCompanyPersonnel,
  approveCompanyFact, approveCompanyReference, approveCompanyPersonnel,
} from '../../services/factory/proposal/govCompanyLibrary';
import {
  ingestSourceDocument, listCompanyDocuments, approveSourceDocument, deleteSourceDocument,
} from '../../services/factory/proposal/govProposalSources';

const router = Router();

// Tenant-wide company documents (Phase 2b): same upload guard as the per-project source library.
const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXT = new Set(['.docx', '.pdf', '.txt', '.md']);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } });
function acceptDoc(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const tooLarge = (err as { code?: string })?.code === 'LIMIT_FILE_SIZE';
      res.status(tooLarge ? 413 : 400).json({ error: tooLarge ? `That file is over the ${MAX_BYTES}-byte limit.` : 'The upload was malformed. Attach one file in the "file" field.' });
      return;
    }
    next();
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The approving admin's platform identity when it is a UUID (the column is UUID), else null. Audit field only. */
function adminIdentity(req: Request): string | null {
  const admin = (req as unknown as { admin?: { sub?: string; email?: string } }).admin;
  const sub = String(admin?.sub ?? '');
  return UUID_RE.test(sub) ? sub : null;
}

function log(level: 'error' | 'warn' | 'info', event: string, context: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'backend', event, context }));
}

async function tenantId(): Promise<string | null> {
  try { const c = await lookupGovContractsContainer(); return c?.tenant?.id ?? null; }
  catch (err) { log('error', 'gov_dossier_scope_failed', { message: String((err as Error)?.message ?? err).slice(0, 200) }); return null; }
}

const factBody = z.object({
  key: z.string().trim().min(1).max(300),
  value: z.string().trim().min(1).max(8000),
  source: z.string().trim().max(300).optional(),
  category: z.string().trim().max(60).optional(),
  approved: z.boolean().optional(),
});
const referenceBody = z.object({
  client: z.string().trim().min(1).max(300),
  contact: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(60).optional(),
  email: z.string().trim().max(300).optional(),
  contractValue: z.string().trim().max(120).optional(),
  dates: z.string().trim().max(120).optional(),
  scope: z.string().trim().max(4000).optional(),
  approved: z.boolean().optional(),
});
const personnelBody = z.object({
  name: z.string().trim().min(1).max(200),
  role: z.string().trim().max(200).optional(),
  resumeHtml: z.string().max(40000).optional(),
  approved: z.boolean().optional(),
});

const KINDS = ['fact', 'reference', 'personnel'] as const;
type Kind = typeof KINDS[number];
const isKind = (k: string): k is Kind => (KINDS as readonly string[]).includes(k);

/** GET the whole dossier (facts, references, personnel) for the tenant. */
router.get('/api/admin/factory/dossier/library', requireSection('program'), async (_req: Request, res: Response) => {
  const tid = await tenantId();
  if (!tid) { res.status(503).json({ error: 'The government contracts workspace is not configured.' }); return; }
  try {
    const library = await listCompanyLibrary(tid);
    res.json(library);
  } catch (err) {
    log('error', 'gov_dossier_list_failed', { message: String((err as Error)?.message ?? err).slice(0, 200) });
    res.status(500).json({ error: 'Could not load the company dossier.' });
  }
});

/** POST a new dossier item of the given kind. Stored unapproved unless the body opts in. */
router.post('/api/admin/factory/dossier/library/:kind', requireSection('program'), async (req: Request, res: Response) => {
  const kind = String(req.params.kind);
  if (!isKind(kind)) { res.status(400).json({ error: 'kind must be fact, reference or personnel.' }); return; }
  const tid = await tenantId();
  if (!tid) { res.status(503).json({ error: 'The government contracts workspace is not configured.' }); return; }
  const identity = adminIdentity(req);
  try {
    let id: string;
    if (kind === 'fact') {
      const b = factBody.safeParse(req.body ?? {});
      if (!b.success) { res.status(400).json({ error: 'A fact needs a key and a value.' }); return; }
      id = await addCompanyFact(tid, b.data, identity);
    } else if (kind === 'reference') {
      const b = referenceBody.safeParse(req.body ?? {});
      if (!b.success) { res.status(400).json({ error: 'A reference needs at least a client name.' }); return; }
      id = await addCompanyReference(tid, b.data, identity);
    } else {
      const b = personnelBody.safeParse(req.body ?? {});
      if (!b.success) { res.status(400).json({ error: 'A person needs at least a name.' }); return; }
      id = await addCompanyPersonnel(tid, b.data, identity);
    }
    log('info', 'gov_dossier_add', { kind });
    res.json({ ok: true, id });
  } catch (err) {
    log('error', 'gov_dossier_add_failed', { kind, message: String((err as Error)?.message ?? err).slice(0, 200) });
    res.status(500).json({ error: 'Could not save the dossier item.' });
  }
});

/** POST approve a dossier item of the given kind. Only approved rows reach the agent's grounding. */
router.post('/api/admin/factory/dossier/library/:kind/:id/approve', requireSection('program'), async (req: Request, res: Response) => {
  const kind = String(req.params.kind);
  const id = String(req.params.id);
  if (!isKind(kind)) { res.status(400).json({ error: 'kind must be fact, reference or personnel.' }); return; }
  if (!id) { res.status(400).json({ error: 'An item id is required.' }); return; }
  const tid = await tenantId();
  if (!tid) { res.status(503).json({ error: 'The government contracts workspace is not configured.' }); return; }
  const identity = adminIdentity(req);
  try {
    if (kind === 'fact') await approveCompanyFact(tid, id, identity);
    else if (kind === 'reference') await approveCompanyReference(tid, id, identity);
    else await approveCompanyPersonnel(tid, id, identity);
    log('info', 'gov_dossier_approve', { kind });
    res.json({ ok: true, id, approved: true });
  } catch (err) {
    log('error', 'gov_dossier_approve_failed', { kind, message: String((err as Error)?.message ?? err).slice(0, 200) });
    res.status(500).json({ error: 'Could not approve the dossier item.' });
  }
});

/** GET the tenant-wide company documents (the reusable upload library the agent also grounds on). */
router.get('/api/admin/factory/dossier/documents', requireSection('program'), async (_req: Request, res: Response) => {
  const tid = await tenantId();
  if (!tid) { res.status(503).json({ error: 'The government contracts workspace is not configured.' }); return; }
  try {
    const docs = await listCompanyDocuments(tid);
    res.json({ documents: docs.map((d: any) => ({ id: d.id, name: d.name, status: d.status, approved: d.approved, chunkCount: d.chunk_count, embeddedCount: d.embedded_count, truncated: d.truncated, createdAt: d.created_at })) });
  } catch (err) {
    log('error', 'gov_dossier_docs_list_failed', { message: String((err as Error)?.message ?? err).slice(0, 200) });
    res.status(500).json({ error: 'Could not load the company documents.' });
  }
});

/** POST upload a tenant-wide company document. Validated at the boundary, ingested unapproved (project_id NULL). */
router.post('/api/admin/factory/dossier/documents', requireSection('program'), acceptDoc, async (req: Request, res: Response) => {
  const file = (req as unknown as { file?: { originalname: string; mimetype: string; buffer: Buffer } }).file;
  if (!file) { res.status(400).json({ error: 'Attach one file in the "file" field.' }); return; }
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_EXT.has(ext)) { res.status(400).json({ error: `Unsupported file type "${ext || '(none)'}". Allowed: .docx, .pdf, .txt, .md.` }); return; }
  const tid = await tenantId();
  if (!tid) { res.status(503).json({ error: 'The government contracts workspace is not configured.' }); return; }
  try {
    const result = await ingestSourceDocument(null, tid, { name: file.originalname, mimeType: file.mimetype, buffer: file.buffer, source: 'dossier upload' }, adminIdentity(req));
    log('info', 'gov_dossier_doc_upload', { chunks: result.chunkCount });
    res.json({ ok: true, ...result });
  } catch (err) {
    log('error', 'gov_dossier_doc_upload_failed', { message: String((err as Error)?.message ?? err).slice(0, 200) });
    res.status(500).json({ error: 'Could not ingest that document.' });
  }
});

/** POST approve (or un-approve) a company document. Only approved documents reach the agent. */
router.post('/api/admin/factory/dossier/documents/:id/approve', requireSection('program'), async (req: Request, res: Response) => {
  const tid = await tenantId();
  if (!tid) { res.status(503).json({ error: 'The government contracts workspace is not configured.' }); return; }
  const approved = (req.body?.approved !== false);
  const doc = await approveSourceDocument(String(req.params.id), adminIdentity(req), approved);
  if (!doc) { res.status(404).json({ error: 'Document not found.' }); return; }
  res.json({ ok: true, id: doc.id, approved: doc.approved });
});

/** DELETE a company document (its chunks cascade). */
router.delete('/api/admin/factory/dossier/documents/:id', requireSection('program'), async (req: Request, res: Response) => {
  const tid = await tenantId();
  if (!tid) { res.status(503).json({ error: 'The government contracts workspace is not configured.' }); return; }
  const ok = await deleteSourceDocument(String(req.params.id));
  res.status(ok ? 200 : 404).json({ ok });
});

export default router;
