import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';

import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  postKnowledgeDocumentHandler,
  KNOWLEDGE_UPLOAD_MAX_BYTES,
} from '../../controllers/explorerKnowledgeController';

/**
 * Explorer knowledge ingestion — the upload surface.
 *
 * ## Why this is its own router rather than two more lines in explorerGrowthRoutes
 *
 * That file carries a pinned contract — a test counting its POST routes and asserting
 * exactly which paths are mutating. The pin is not bureaucracy: six of the writes §27
 * specifies change what the system WILL DO to real learners, and the test is what stops a
 * seventh appearing by accident. An upload route added there would have to loosen that
 * count, and a loosened pin protects less for every change after this one.
 *
 * A separate router keeps the original claim exactly as strong as it was, and this file
 * gets its own, narrower one.
 *
 * ## PATH PREFIX
 *
 * Every route declares the FULL path including `/api/admin`, because `adminRoutes` mounts
 * its children with `router.use(child)` and NO prefix. Every sibling file does the same.
 *
 * ## PATH-SCOPED GUARD, NEVER A BARE router.use(requireAdmin)
 *
 * `router.use(BASE, requireAdmin)` binds the guard to this prefix only. A bare
 * `router.use(requireAdmin)` applies to every route registered AFTER this router in
 * `adminRoutes`, including public ones — which has caused two production outages in this
 * repo. It also satisfies `scripts/lint-route-auth.js`.
 */

const router = Router();

const BASE = '/api/admin/explorer-growth/knowledge';

/** Path-scoped, mounted before any route below it. */
router.use(BASE, requireAdmin);

/**
 * In memory, never on disk.
 *
 * The bytes are hashed and parsed in memory and only the extracted chunks are persisted.
 * Writing the upload to disk first would leave a copy of someone's document on the volume
 * for every request, including the ones that are refused — and the refused ones are exactly
 * where a stray copy is least likely to be noticed. The same choice `govQualificationRoutes`
 * makes for source bundles.
 *
 * The limit is the ingest service's own, so the ceiling is one number rather than two that
 * can disagree about what "too large" means.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: KNOWLEDGE_UPLOAD_MAX_BYTES, files: 1 },
});

/**
 * Answers multer's own errors here rather than letting them reach the global handler.
 *
 * An oversized file otherwise surfaces as a 500, which reads as "the server broke" when the
 * truth is "that file is too big" — and the person holding the file is the only one who can
 * act on the difference.
 */
function acceptDocument(req: Request, res: Response, next: NextFunction): void {
  upload.single('document')(req, res, (err: unknown) => {
    if (err) {
      const code = (err as { code?: string })?.code;
      const tooLarge = code === 'LIMIT_FILE_SIZE';
      res.status(tooLarge ? 413 : 400).json({
        error: tooLarge
          ? `That file is over the ${KNOWLEDGE_UPLOAD_MAX_BYTES}-byte limit. Upload the section that answers questions.`
          : 'The upload was malformed. Attach one file in the "document" field.',
        error_class: tooLarge ? 'PayloadTooLarge' : 'ValidationError',
      });
      return;
    }
    next();
  });
}

/**
 * ONE WRITE, and it cannot reach a learner.
 *
 * A stored document lands at `confidence: 'unstated'`, which the quote gate refuses, so
 * nothing this route writes is quotable until a human marks it grounded. That is the whole
 * reason an upload is a safe write to add: the worst outcome is an unhelpful row waiting
 * for a reviewer who will not approve it.
 */
router.post(`${BASE}/documents`, acceptDocument, postKnowledgeDocumentHandler);

export default router;
