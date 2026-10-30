import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../../../config/env', () => ({
  // Present and OFF, which is production's posture for a dark-launched feature. Tests that
  // need it on turn it on explicitly, so the permissive state is never inherited by accident.
  env: {
    jwtSecret: 'test-secret',
    nodeEnv: 'test',
    explorerGrowth: { growthOsEnabled: false, draftRenderEnabled: false },
  },
}));

/**
 * Mocked for the same reason the sibling access tests mock it: `requireAdmin`'s 401 path
 * calls `logAuthFailure`, which does a DYNAMIC import of the ai-event service and pulls in
 * the model layer the first time a 401 occurs in the process. Unmocked it makes the first
 * wrong-secret assertion slow and intermittently flaky, and a flaky assertion in an AUTH
 * test is worth chasing to its cause rather than re-running.
 */
jest.mock('../../../services/aiEventService', () => ({
  emitAiEvent: jest.fn().mockResolvedValue(undefined),
}));

// The ingest path. Mocked so this file never touches Postgres or a parser, and so the
// flag-off and unauthenticated paths can be proven NOT to reach it at all.
const ingest = { ingestKnowledgeDocument: jest.fn(), MAX_INGEST_BYTES: 20 * 1024 * 1024 };
jest.mock('../../../services/explorerGrowth/explorerKnowledgeIngest', () => ingest);

const store = { explorerKnowledgeDocumentStore: { findBySha: jest.fn(), persist: jest.fn() } };
jest.mock('../../../services/explorerGrowth/explorerKnowledgeDocumentRepository', () => store);

import explorerKnowledgeRoutes from '../explorerKnowledgeRoutes';
import { env } from '../../../config/env';
import { MAX_INGEST_BYTES } from '../../../services/explorerGrowth/explorerKnowledgeIngest';
import { KNOWLEDGE_UPLOAD_MAX_BYTES } from '../../../controllers/explorerKnowledgeController';

/**
 * The upload surface.
 *
 * The guard is REAL — `requireAdmin` is not mocked, and neither is the router or multer, so
 * a 401 here is the actual middleware refusing an actual multipart request. Only the ingest
 * service behind it is a mock; mocking the guard would leave this file asserting that a mock
 * returns what it was told to.
 *
 * The claim this router makes is narrow and worth keeping narrow: ONE route, and it is a
 * POST that cannot make anything quotable.
 */

const BASE = '/api/admin/explorer-growth/knowledge';
const UPLOAD = `${BASE}/documents`;

const token = (role = 'admin') =>
  jwt.sign({ sub: 'staff-1', email: 'staff@colaberry.com', role }, 'test-secret');

function app() {
  const a = express();
  a.use(express.json());
  a.use(explorerKnowledgeRoutes);
  return a;
}

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token()}`);

function storedResult(over: Record<string, unknown> = {}) {
  return {
    status: 'stored',
    documentId: 'doc-1',
    sha256: 'a'.repeat(64),
    chunkCount: 12,
    hardCutCount: 0,
    truncated: false,
    extractedChars: 8000,
    ...over,
  };
}

beforeEach(() => {
  ingest.ingestKnowledgeDocument.mockReset();
  env.explorerGrowth.growthOsEnabled = false;
});

describe('the router makes exactly one claim', () => {
  it('registers ONE route, and it is a POST', () => {
    const stack = (explorerKnowledgeRoutes as unknown as {
      stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }>;
    }).stack;

    const routes = stack.filter((l) => l.route).map((l) => l.route!);

    // A second write appearing here fails this, which is the whole reason the upload did not
    // go into explorerGrowthRoutes and loosen ITS count.
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe(UPLOAD);
    expect(routes[0].methods.post).toBe(true);
  });

  it('scopes the guard to its own prefix rather than applying it globally', () => {
    const stack = (explorerKnowledgeRoutes as unknown as {
      stack: Array<{ route?: unknown; regexp: RegExp; handle: { name?: string } }>;
    }).stack;

    const guards = stack.filter((l) => !l.route && l.handle?.name === 'requireAdmin');

    // A bare `router.use(requireAdmin)` would apply to every route registered AFTER this
    // router in adminRoutes, including public ones — the shape behind two outages here.
    expect(guards).toHaveLength(1);
    expect(guards[0].regexp.test('/api/admin/explorer-growth/knowledge')).toBe(true);
    expect(guards[0].regexp.test('/api/public/anything')).toBe(false);
  });

  it('uses ONE byte ceiling, not two that can disagree', () => {
    expect(KNOWLEDGE_UPLOAD_MAX_BYTES).toBe(MAX_INGEST_BYTES);
  });
});

describe('the guard', () => {
  it('401s an unauthenticated upload without reaching the ingest path', async () => {
    const res = await request(app()).post(UPLOAD).attach('document', Buffer.from('hi'), 'a.txt');

    expect(res.status).toBe(401);
    expect(ingest.ingestKnowledgeDocument).not.toHaveBeenCalled();
  });

  it('401s a token signed with the wrong secret', async () => {
    const bad = jwt.sign({ sub: 's', email: 'e@x.com', role: 'admin' }, 'not-the-secret');

    const res = await request(app())
      .post(UPLOAD)
      .set('Authorization', `Bearer ${bad}`)
      .attach('document', Buffer.from('hi'), 'a.txt');

    expect(res.status).toBe(401);
  });

  it('403s an authenticated NON-admin', async () => {
    env.explorerGrowth.growthOsEnabled = true;

    const res = await request(app())
      .post(UPLOAD)
      .set('Authorization', `Bearer ${token('student')}`)
      .attach('document', Buffer.from('hi'), 'a.txt');

    // 403, not 401: the caller proved who they are and is not allowed. Conflating the two
    // sends someone to re-authenticate over a permission problem.
    expect(res.status).toBe(403);
    expect(ingest.ingestKnowledgeDocument).not.toHaveBeenCalled();
  });
});

describe('the feature gate', () => {
  it('403s with a DISTINGUISHABLE error_class when the master flag is off', async () => {
    const res = await auth(request(app()).post(UPLOAD)).attach(
      'document',
      Buffer.from('hi'),
      'a.txt',
    );

    expect(res.status).toBe(403);
    // Both the guard and the gate answer 403. They must stay tellable apart, or "switched
    // off" and "not allowed" become the same message to whoever is debugging it.
    expect(res.body.error_class).toBe('FeatureDisabled');
    expect(ingest.ingestKnowledgeDocument).not.toHaveBeenCalled();
  });

  it('reads an ABSENT explorerGrowth block as off rather than crashing', async () => {
    const saved = env.explorerGrowth;
    (env as { explorerGrowth?: unknown }).explorerGrowth = undefined;

    try {
      const res = await auth(request(app()).post(UPLOAD)).attach(
        'document',
        Buffer.from('hi'),
        'a.txt',
      );

      // A TypeError inside the gate becomes a 500, which reads to the operator as "upload
      // is broken" rather than "the feature is off".
      expect(res.status).toBe(403);
      expect(res.body.error_class).toBe('FeatureDisabled');
    } finally {
      (env as { explorerGrowth?: unknown }).explorerGrowth = saved;
    }
  });
});

describe('the upload', () => {
  beforeEach(() => {
    env.explorerGrowth.growthOsEnabled = true;
  });

  it('400s when no file was attached', async () => {
    const res = await auth(request(app()).post(UPLOAD)).field('title', 'Policy');

    expect(res.status).toBe(400);
    expect(res.body.error_class).toBe('ValidationError');
    expect(ingest.ingestKnowledgeDocument).not.toHaveBeenCalled();
  });

  it('400s on an unknown form field rather than ignoring it', async () => {
    // `.strict()` on the schema. A typo'd `brandId` silently dropped would store the
    // document unscoped and look like it worked.
    const res = await auth(request(app()).post(UPLOAD))
      .field('brandId', '11111111-2222-3333-4444-555555555555')
      .attach('document', Buffer.from('hi'), 'a.txt');

    expect(res.status).toBe(400);
    expect(res.body.error_class).toBe('ValidationError');
  });

  it('201s a stored document and says plainly that it is not quotable yet', async () => {
    ingest.ingestKnowledgeDocument.mockResolvedValue(storedResult());

    const res = await auth(request(app()).post(UPLOAD))
      .field('title', 'Admissions policy')
      .attach('document', Buffer.from('some text'), 'policy.pdf');

    expect(res.status).toBe(201);
    expect(res.body.document_id).toBe('doc-1');
    expect(res.body.chunk_count).toBe(12);
    // "It uploaded" reads as "it is in use". Said out loud on every success.
    expect(res.body.quotable).toBe(false);
    expect(res.body.review_required).toMatch(/grounded/);
  });

  it('NEVER echoes the document text back', async () => {
    ingest.ingestKnowledgeDocument.mockResolvedValue(storedResult());

    const res = await auth(request(app()).post(UPLOAD)).attach(
      'document',
      Buffer.from('CONFIDENTIAL BODY TEXT'),
      'policy.pdf',
    );

    // An echo would put a copy of the document in every proxy log between here and the
    // browser, for no benefit — the reviewer reads it on the review screen.
    expect(JSON.stringify(res.body)).not.toContain('CONFIDENTIAL');
  });

  it('records the actor EMAIL, not the token subject', async () => {
    ingest.ingestKnowledgeDocument.mockResolvedValue(storedResult());

    await auth(request(app()).post(UPLOAD)).attach('document', Buffer.from('x'), 'a.txt');

    // A uuid passes this repo's non-human denylist unconditionally, which makes the guard
    // decorative. `sub` is 'staff-1' here; the email is the checkable identity.
    expect(ingest.ingestKnowledgeDocument.mock.calls[0][0].ingestedBy).toBe('staff@colaberry.com');
  });

  it('falls back to the filename when no title was given', async () => {
    ingest.ingestKnowledgeDocument.mockResolvedValue(storedResult());

    await auth(request(app()).post(UPLOAD)).attach('document', Buffer.from('x'), 'refunds.pdf');

    expect(ingest.ingestKnowledgeDocument.mock.calls[0][0].title).toBe('refunds.pdf');
  });

  it('200s a duplicate, because re-uploading a file is not an error', async () => {
    ingest.ingestKnowledgeDocument.mockResolvedValue({
      status: 'duplicate',
      documentId: 'doc-existing',
      sha256: 'b'.repeat(64),
      chunkCount: 7,
    });

    const res = await auth(request(app()).post(UPLOAD)).attach(
      'document',
      Buffer.from('x'),
      'a.txt',
    );

    // The end state is exactly what the caller asked for. That is a 200, not a conflict.
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('duplicate');
    expect(res.body.document_id).toBe('doc-existing');
  });

  it('422s a refusal and names the reason', async () => {
    ingest.ingestKnowledgeDocument.mockResolvedValue({
      status: 'refused',
      reason: 'no_text',
      detail: 'the file was read but contains no text. A scanned document needs OCR first.',
    });

    const res = await auth(request(app()).post(UPLOAD)).attach(
      'document',
      Buffer.from('scan'),
      'scan.pdf',
    );

    // 422, not 400: the request was well-formed, the FILE could not be used. A 400 sends
    // someone to check their form fields.
    expect(res.status).toBe(422);
    expect(res.body.reason).toBe('no_text');
    expect(res.body.error).toMatch(/OCR/);
  });

  it('reports a truncated document rather than letting the dropped half go unnoticed', async () => {
    ingest.ingestKnowledgeDocument.mockResolvedValue(
      storedResult({ truncated: true, extractedChars: 900_000 }),
    );

    const res = await auth(request(app()).post(UPLOAD)).attach(
      'document',
      Buffer.from('x'),
      'long.pdf',
    );

    expect(res.body.truncated).toBe(true);
    expect(res.body.extracted_chars).toBe(900_000);
  });

  it('500s without claiming anything was stored when ingestion throws', async () => {
    ingest.ingestKnowledgeDocument.mockRejectedValue(new Error('connection lost'));

    const res = await auth(request(app()).post(UPLOAD)).attach(
      'document',
      Buffer.from('x'),
      'a.txt',
    );

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Nothing was stored/);
    // The upstream message must not reach the caller.
    expect(JSON.stringify(res.body)).not.toContain('connection lost');
  });
});
