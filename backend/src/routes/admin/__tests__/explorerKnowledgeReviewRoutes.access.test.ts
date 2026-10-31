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
 * calls `logAuthFailure`, which dynamically imports the ai-event service and pulls in the
 * model layer the first time a 401 occurs in the process. Unmocked it makes the first
 * wrong-secret assertion slow and intermittently flaky.
 */
jest.mock('../../../services/aiEventService', () => ({
  emitAiEvent: jest.fn().mockResolvedValue(undefined),
}));

// The store. Mocked so this file never touches Postgres, and so the flag-off and
// unauthenticated paths can be proven NOT to reach it at all.
const store = {
  listDocuments: jest.fn(),
  getDocument: jest.fn(),
  listPassages: jest.fn(),
  decideDocument: jest.fn(),
  retireDocument: jest.fn(),
};
jest.mock('../../../services/explorerGrowth/explorerKnowledgeReviewRepository', () => store);

import explorerKnowledgeReviewRoutes from '../explorerKnowledgeReviewRoutes';
import { env } from '../../../config/env';

/**
 * The review surface — the only routes in the Explorer knowledge subsystem whose writes can
 * make a document's text reachable by a learner.
 *
 * The guard is REAL: `requireAdmin` is not mocked, and neither is the router, so a 401 here
 * is the actual middleware refusing an actual request. Only the store behind it is a mock;
 * mocking the guard would leave this file asserting that a mock returns what it was told to.
 *
 * The claim this router makes, and that these tests hold: FOUR routes, two of them reads,
 * and the two writes are reachable only by an authenticated admin with the master flag on.
 */

const BASE = '/api/admin/explorer-growth/knowledge';
const DOCS = `${BASE}/documents`;
const ID = '11111111-1111-4111-8111-111111111111';

const token = (role = 'admin') =>
  jwt.sign({ sub: 'staff-1', email: 'staff@colaberry.com', role }, 'test-secret');

function app() {
  const a = express();
  a.use(express.json());
  a.use(explorerKnowledgeReviewRoutes);
  return a;
}

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token()}`);

/**
 * A mutable alias onto the mocked flags. `ExplorerGrowthFlags` declares its fields
 * `readonly` and the resolver freezes the object, so assigning directly is a TS2540 that
 * ts-jest cannot see and only the test-file typecheck catches. The sibling access tests
 * take the same alias for the same reason.
 */
const flags = env.explorerGrowth as { growthOsEnabled: boolean; draftRenderEnabled: boolean };

function doc(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    title: 'Admissions policy',
    confidence: 'unstated',
    source_kind: 'upload',
    source_ref: 'policy.pdf',
    mime: 'application/pdf',
    byte_size: 1024,
    chunk_count: 3,
    hard_cut_count: 0,
    brand_id: null,
    ingested_by: 'staff@colaberry.com',
    reviewed_by: null,
    reviewed_at: null,
    retired_at: null,
    created_at: '2026-10-31T00:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  Object.values(store).forEach((m) => m.mockReset());
  flags.growthOsEnabled = false;
});

describe('the router makes exactly four claims', () => {
  it('registers the two reads and the two writes, and nothing else', () => {
    const stack = (explorerKnowledgeReviewRoutes as unknown as {
      stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }>;
    }).stack;

    const routes = stack
      .filter((l) => l.route)
      .map((l) => `${Object.keys(l.route!.methods)[0].toUpperCase()} ${l.route!.path}`);

    // A fifth route appearing here fails this. The sibling upload router pins itself to one
    // route for the same reason, and loosening either pin protects less for every change after.
    expect(routes).toEqual([
      `GET ${DOCS}`,
      `GET ${DOCS}/:id`,
      `POST ${DOCS}/:id/decision`,
      `POST ${DOCS}/:id/retire`,
    ]);
  });

  it('scopes the guard to its own prefix rather than applying it globally', () => {
    const stack = (explorerKnowledgeReviewRoutes as unknown as {
      stack: Array<{ route?: unknown; regexp: RegExp; handle: { name?: string } }>;
    }).stack;

    const guards = stack.filter((l) => !l.route && l.handle?.name === 'requireAdmin');

    // A bare `router.use(requireAdmin)` would apply to every route registered AFTER this
    // router in adminRoutes, including public ones — the shape behind two outages here.
    expect(guards).toHaveLength(1);
    expect(guards[0].regexp.test(BASE)).toBe(true);
    expect(guards[0].regexp.test('/api/public/anything')).toBe(false);
  });
});

describe('the guard', () => {
  it('401s an unauthenticated read without reaching the store', async () => {
    const res = await request(app()).get(DOCS);

    expect(res.status).toBe(401);
    expect(store.listDocuments).not.toHaveBeenCalled();
  });

  it('401s a token signed with the wrong secret', async () => {
    const bad = jwt.sign({ sub: 's', email: 'e@x.com', role: 'admin' }, 'not-the-secret');
    const res = await request(app()).get(DOCS).set('Authorization', `Bearer ${bad}`);

    expect(res.status).toBe(401);
  });

  it('403s an authenticated NON-admin trying to approve', async () => {
    flags.growthOsEnabled = true;

    const res = await request(app())
      .post(`${DOCS}/${ID}/decision`)
      .set('Authorization', `Bearer ${token('student')}`)
      .send({ confidence: 'grounded' });

    // 403, not 401: the caller proved who they are and is not allowed.
    expect(res.status).toBe(403);
    expect(store.decideDocument).not.toHaveBeenCalled();
  });
});

describe('the feature gate', () => {
  it('403s with a DISTINGUISHABLE error_class when the master flag is off', async () => {
    const res = await auth(request(app()).get(DOCS));

    expect(res.status).toBe(403);
    // Both the guard and the gate answer 403. They must stay tellable apart, or "switched
    // off" and "not allowed" become the same message to whoever is debugging it.
    expect(res.body.error_class).toBe('FeatureDisabled');
    expect(store.listDocuments).not.toHaveBeenCalled();
  });

  it('reads an ABSENT explorerGrowth block as off rather than crashing', async () => {
    const saved = env.explorerGrowth;
    (env as { explorerGrowth?: unknown }).explorerGrowth = undefined;

    try {
      const res = await auth(request(app()).post(`${DOCS}/${ID}/decision`)).send({
        confidence: 'grounded',
      });

      // A TypeError inside the gate becomes a 500, which reads to the operator as "review
      // is broken" rather than "the feature is off".
      expect(res.status).toBe(403);
      expect(res.body.error_class).toBe('FeatureDisabled');
    } finally {
      (env as { explorerGrowth?: unknown }).explorerGrowth = saved;
    }
  });

  it('gates the WRITES too, not just the reads', async () => {
    const res = await auth(request(app()).post(`${DOCS}/${ID}/retire`));

    expect(res.status).toBe(403);
    expect(store.retireDocument).not.toHaveBeenCalled();
  });
});

describe('the queue', () => {
  beforeEach(() => {
    flags.growthOsEnabled = true;
  });

  it('returns the page, the total and the window that produced them', async () => {
    store.listDocuments.mockResolvedValue({ documents: [doc()], total: 7 });

    const res = await auth(request(app()).get(`${DOCS}?limit=1&offset=2`));

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(7);
    expect(res.body.limit).toBe(1);
    expect(res.body.offset).toBe(2);
  });

  it('400s an unknown query field rather than ignoring it', async () => {
    // `.strict()`. A typo'd `?confidenc=unstated` silently dropped would show every
    // document and read as "nothing is awaiting review".
    const res = await auth(request(app()).get(`${DOCS}?confidenc=unstated`));

    expect(res.status).toBe(400);
    expect(res.body.error_class).toBe('ValidationError');
    expect(store.listDocuments).not.toHaveBeenCalled();
  });

  it('400s a confidence filter that is not one of the three states', async () => {
    const res = await auth(request(app()).get(`${DOCS}?confidence=approved`));

    expect(res.status).toBe(400);
    expect(store.listDocuments).not.toHaveBeenCalled();
  });

  it('caps the page size instead of letting a caller ask for the whole corpus', async () => {
    const res = await auth(request(app()).get(`${DOCS}?limit=5000`));

    expect(res.status).toBe(400);
    expect(store.listDocuments).not.toHaveBeenCalled();
  });

  it('says plainly which documents are quotable, derived from confidence', async () => {
    store.listDocuments.mockResolvedValue({
      documents: [
        doc({ id: 'a', confidence: 'grounded' }),
        doc({ id: 'b', confidence: 'drafted-verify' }),
        doc({ id: 'c', confidence: 'unstated' }),
      ],
      total: 3,
    });

    const res = await auth(request(app()).get(DOCS));

    // The mapping is NOT the obvious one: `drafted-verify` sounds like a softer approval
    // and the quote gate refuses it exactly as hard as `unstated`. A UI left to work this
    // out itself would get it wrong in the direction of showing unapproved text as live.
    expect(res.body.documents.map((d: { quotable: boolean }) => d.quotable)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('never reports a retired document as quotable, whatever its confidence', async () => {
    store.listDocuments.mockResolvedValue({
      documents: [doc({ confidence: 'grounded', retired_at: '2026-10-30T00:00:00.000Z' })],
      total: 1,
    });

    const res = await auth(request(app()).get(DOCS));

    expect(res.body.documents[0].quotable).toBe(false);
  });
});

describe('the document detail', () => {
  beforeEach(() => {
    flags.growthOsEnabled = true;
  });

  it('400s a malformed id instead of letting Postgres throw on the cast', async () => {
    const res = await auth(request(app()).get(`${DOCS}/not-a-uuid`));

    // Without the Zod check this reaches `CAST(:id AS uuid)` and surfaces as a 500 reading
    // "the server broke", when the truth is "that is not an id".
    expect(res.status).toBe(400);
    expect(res.body.error_class).toBe('ValidationError');
    expect(store.getDocument).not.toHaveBeenCalled();
  });

  it('404s an id that does not exist', async () => {
    store.getDocument.mockResolvedValue(null);

    const res = await auth(request(app()).get(`${DOCS}/${ID}`));

    expect(res.status).toBe(404);
    expect(store.listPassages).not.toHaveBeenCalled();
  });

  it('returns a page of passages with the total', async () => {
    store.getDocument.mockResolvedValue(doc());
    store.listPassages.mockResolvedValue({
      passages: [{ chunk_index: 0, text: 'Refunds are issued within 30 days.', keywords: ['refund'], hard_cut: false }],
      total: 330,
    });

    const res = await auth(request(app()).get(`${DOCS}/${ID}?limit=1`));

    expect(res.status).toBe(200);
    expect(res.body.passage_total).toBe(330);
    expect(res.body.passages[0].text).toMatch(/Refunds/);
  });
});

describe('the decision', () => {
  beforeEach(() => {
    flags.growthOsEnabled = true;
  });

  it('REFUSES `unstated` as a verdict', async () => {
    const res = await auth(request(app()).post(`${DOCS}/${ID}/decision`)).send({
      confidence: 'unstated',
    });

    // The contract of the enum. `unstated` means "nobody ever said anything", which stops
    // being true the moment a human opens the document — so it is not reachable by review.
    // Admitting it would let a reviewed document be laundered back into the queue with no
    // trace that it was ever seen.
    expect(res.status).toBe(400);
    expect(res.body.error_class).toBe('ValidationError');
    expect(store.decideDocument).not.toHaveBeenCalled();
  });

  it('400s an unknown body field rather than ignoring it', async () => {
    const res = await auth(request(app()).post(`${DOCS}/${ID}/decision`)).send({
      confidence: 'grounded',
      retired: true,
    });

    expect(res.status).toBe(400);
    expect(store.decideDocument).not.toHaveBeenCalled();
  });

  it('records the actor EMAIL, not the token subject', async () => {
    store.decideDocument.mockResolvedValue({ status: 'decided', document: doc({ confidence: 'grounded' }) });

    await auth(request(app()).post(`${DOCS}/${ID}/decision`)).send({ confidence: 'grounded' });

    // A uuid passes this repo's non-human denylist unconditionally, which makes that guard
    // decorative. `sub` is 'staff-1' here; the email is the checkable identity.
    expect(store.decideDocument).toHaveBeenCalledWith(ID, 'grounded', 'staff@colaberry.com');
  });

  it('409s a retired document and names when it was withdrawn', async () => {
    store.decideDocument.mockResolvedValue({
      status: 'retired',
      retiredAt: '2026-10-30T00:00:00.000Z',
    });

    const res = await auth(request(app()).post(`${DOCS}/${ID}/decision`)).send({
      confidence: 'grounded',
    });

    // 409, not 400: the request was well-formed and the caller is allowed. The DOCUMENT is
    // in a state where the decision cannot apply.
    expect(res.status).toBe(409);
    expect(res.body.error_class).toBe('DocumentRetired');
    expect(res.body.retired_at).toBe('2026-10-30T00:00:00.000Z');
  });

  it('404s a decision on an id that does not exist', async () => {
    store.decideDocument.mockResolvedValue({ status: 'not_found' });

    const res = await auth(request(app()).post(`${DOCS}/${ID}/decision`)).send({
      confidence: 'grounded',
    });

    expect(res.status).toBe(404);
  });

  it('reports the document as quotable once it is grounded', async () => {
    store.decideDocument.mockResolvedValue({
      status: 'decided',
      document: doc({ confidence: 'grounded', reviewed_by: 'staff@colaberry.com' }),
    });

    const res = await auth(request(app()).post(`${DOCS}/${ID}/decision`)).send({
      confidence: 'grounded',
    });

    expect(res.status).toBe(200);
    expect(res.body.document.quotable).toBe(true);
    expect(res.body.document.reviewed_by).toBe('staff@colaberry.com');
  });

  it('does NOT report drafted-verify as quotable', async () => {
    store.decideDocument.mockResolvedValue({
      status: 'decided',
      document: doc({ confidence: 'drafted-verify' }),
    });

    const res = await auth(request(app()).post(`${DOCS}/${ID}/decision`)).send({
      confidence: 'drafted-verify',
    });

    // The gate refuses drafted-verify exactly as hard as unstated. A reviewer told
    // otherwise would believe they had published something they had not.
    expect(res.body.document.quotable).toBe(false);
  });

  it('500s without leaking the upstream message when the store throws', async () => {
    store.decideDocument.mockRejectedValue(new Error('relation "explorer_knowledge_documents" does not exist'));

    const res = await auth(request(app()).post(`${DOCS}/${ID}/decision`)).send({
      confidence: 'grounded',
    });

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('explorer_knowledge_documents');
  });
});

describe('retirement', () => {
  beforeEach(() => {
    flags.growthOsEnabled = true;
  });

  it('withdraws a document and reports it unquotable', async () => {
    store.retireDocument.mockResolvedValue({
      status: 'retired',
      document: doc({ confidence: 'grounded', retired_at: '2026-10-31T10:00:00.000Z' }),
    });

    const res = await auth(request(app()).post(`${DOCS}/${ID}/retire`));

    expect(res.status).toBe(200);
    expect(res.body.document.quotable).toBe(false);
  });

  it('200s a repeat rather than treating a retry as an error', async () => {
    store.retireDocument.mockResolvedValue({
      status: 'retired',
      document: doc({ retired_at: '2026-10-30T00:00:00.000Z' }),
    });

    const res = await auth(request(app()).post(`${DOCS}/${ID}/retire`));

    // The end state is what the caller asked for either way, and a retry that reads as an
    // error invites someone to "fix" it.
    expect(res.status).toBe(200);
    expect(res.body.document.retired_at).toBe('2026-10-30T00:00:00.000Z');
  });

  it('404s an unknown id', async () => {
    store.retireDocument.mockResolvedValue({ status: 'not_found' });

    const res = await auth(request(app()).post(`${DOCS}/${ID}/retire`));

    expect(res.status).toBe(404);
  });
});
