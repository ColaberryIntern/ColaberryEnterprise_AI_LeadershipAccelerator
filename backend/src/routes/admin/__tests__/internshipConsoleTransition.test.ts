/**
 * POST /api/admin/internship/applications/:id/transition — the console's five status actions.
 *
 * Three things are pinned here, and all three are security or safety properties rather than features:
 *
 *   1. **The action is an allowlist, not a state.** A route that took any `InternshipState` would let a
 *      caller move an application straight to `documents_verified` or `active` and skip approval and
 *      document checks entirely. There is no code path from this route to any state outside the five.
 *   2. **The actor comes from the verified session, never the body.** A body-supplied actor would let
 *      someone attribute their own decision to a colleague in a permanent audit trail.
 *   3. **`complete`, `withdraw` and `remove` are one-way** — the state machine gives them no outbound
 *      edges, and reapplying opens a NEW application. They require a typed confirmation, and a terminal
 *      application refuses every further change with its state named.
 */
let guard: (req: any, res: any, next: any) => void;
const requireSection = jest.fn((_s: string) => (req: any, res: any, next: any) => guard(req, res, next));
jest.mock('../../../middlewares/authMiddleware', () => ({ requireSection: (...a: any[]) => requireSection(...a) }));
const PASS = (req: any, _res: any, next: any) => { req.admin = { email: 'manager@colaberry.com' }; next(); };
guard = PASS;

const findByPk = jest.fn();
jest.mock('../../../models/InternshipApplication', () => ({
  __esModule: true, default: { findByPk: (...a: any[]) => findByPk(...a) },
}));

const mockTransition = jest.fn();
jest.mock('../../../services/internship/internshipApplicationService', () => ({
  transition: (...a: any[]) => mockTransition(...a),
}));

import express from 'express';
import request from 'supertest';
import router from '../internshipRoutes';
import { InvalidInternshipTransitionError } from '../../../services/internship/internshipStateMachine';

const app = express();
app.use(express.json());
app.use(router);

const URL = '/api/admin/internship/applications/app-1/transition';

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  guard = PASS;
  findByPk.mockResolvedValue({ id: 'app-1', state: 'active' });
  mockTransition.mockImplementation(async (_id: string, to: string) => ({ id: 'app-1', state: to }));
});
afterEach(() => (console.error as jest.Mock).mockRestore?.());

describe('the gate', () => {
  it('refuses an unauthenticated caller and never touches the writer', async () => {
    guard = (_req: any, res: any) => res.status(401).json({ error: 'Unauthorized' });

    await request(app).post(URL).send({ action: 'pause' }).expect(401);

    expect(mockTransition).not.toHaveBeenCalled();
  });

  it('is section-gated at the source', () => {
    // eslint-disable-next-line global-require
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'internshipRoutes.ts'), 'utf8');
    const at = src.indexOf("router.post('/api/admin/internship/applications/:id/transition'");

    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, at + 160)).toContain("requireSection('internship')");
  });
});

describe('the reversible pair', () => {
  it('pauses an active intern', async () => {
    const res = await request(app).post(URL).send({ action: 'pause', reason: 'exam week' }).expect(200);

    expect(res.body).toEqual({ application_id: 'app-1', state: 'paused', action: 'pause' });
    expect(mockTransition).toHaveBeenCalledWith('app-1', 'paused', expect.objectContaining({
      actor: 'reviewer', reason: 'exam week', evidenceSource: 'intern_console',
    }));
  });

  it('resumes a paused intern', async () => {
    findByPk.mockResolvedValue({ id: 'app-1', state: 'paused' });

    await request(app).post(URL).send({ action: 'resume' }).expect(200);

    expect(mockTransition).toHaveBeenCalledWith('app-1', 'active', expect.anything());
  });

  it('needs no confirmation for pause or resume', async () => {
    // They have a reverse edge, so a misclick costs one more click to undo.
    await request(app).post(URL).send({ action: 'pause' }).expect(200);
    await request(app).post(URL).send({ action: 'resume' }).expect(200);
  });
});

describe('the one-way three', () => {
  it.each(['complete', 'withdraw', 'remove'])('refuses %s without a typed confirmation', async (action) => {
    const res = await request(app).post(URL).send({ action }).expect(400);

    expect(res.body.one_way).toBe(true);
    expect(res.body.error).toContain('cannot be undone');
    expect(mockTransition).not.toHaveBeenCalled();
  });

  it('refuses a confirmation for a different action', async () => {
    // Echoing the wrong word is a misclick, not a confirmation.
    await request(app).post(URL).send({ action: 'remove', confirm: 'withdraw' }).expect(400);

    expect(mockTransition).not.toHaveBeenCalled();
  });

  it.each([['complete', 'completed'], ['withdraw', 'withdrawn'], ['remove', 'removed']])(
    'performs %s once confirmed', async (action, state) => {
      await request(app).post(URL).send({ action, confirm: action }).expect(200);

      expect(mockTransition).toHaveBeenCalledWith('app-1', state, expect.anything());
    },
  );
});

describe('a terminal application', () => {
  it.each(['completed', 'withdrawn', 'removed', 'rejected'])('refuses every change once %s', async (state) => {
    // Reapplying opens a NEW application; this record keeps its decision and its date.
    findByPk.mockResolvedValue({ id: 'app-1', state });

    const res = await request(app).post(URL).send({ action: 'resume' }).expect(409);

    expect(res.body.terminal).toBe(true);
    expect(res.body.error).toContain(state);
    expect(mockTransition).not.toHaveBeenCalled();
  });
});

describe('what cannot be asked for', () => {
  it.each(['documents_verified', 'active_', 'approved', 'rejected'])('rejects %s as an action', async (action) => {
    // The allowlist is the point: no request may name a state directly.
    const res = await request(app).post(URL).send({ action }).expect(400);

    expect(res.body.error).toBe('Invalid transition request.');
    expect(mockTransition).not.toHaveBeenCalled();
  });

  it('rejects unknown fields rather than ignoring them', async () => {
    // `.strict()`: a body carrying `state` or `actor` must fail loudly, not be silently dropped.
    await request(app).post(URL).send({ action: 'pause', state: 'approved' }).expect(400);
    await request(app).post(URL).send({ action: 'pause', actor: 'system' }).expect(400);

    expect(mockTransition).not.toHaveBeenCalled();
  });

  it('records the SESSION identity as the actor', async () => {
    await request(app).post(URL).send({ action: 'pause', reason: 'x' }).expect(200);

    const opts = mockTransition.mock.calls[0][2];
    expect(opts.actor).toBe('reviewer');
    expect(opts.actorId).toBe('manager@colaberry.com');
  });

  it('REFUSES a body that tries to supply its own actor, before the writer is reached', async () => {
    // This pair replaces a single test that claimed to prove the actor could not be spoofed and did
    // not: it never put an `actor` in the body, so a handler reading `req.body.actor` passed it
    // happily. Mutation M46 found that on 2026-10-02.
    //
    // `.strict()` is the guard that actually holds here — an unknown field is a 400 before the
    // handler runs, so a spoofed actor never reaches the audit trail. The test below removes any
    // doubt about which rule is doing the work.
    for (const body of [
      { action: 'pause', actor: 'system' },
      { action: 'pause', actorId: 'someone.else@colaberry.com' },
      { action: 'pause', actor_id: 'someone.else@colaberry.com' },
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).post(URL).send(body).expect(400);
      expect(res.body.error).toBe('Invalid transition request.');
    }

    expect(mockTransition).not.toHaveBeenCalled();
  });

  it('rejects an empty reason rather than storing a blank', async () => {
    await request(app).post(URL).send({ action: 'pause', reason: '   ' }).expect(400);
  });
});

describe('failures', () => {
  it('404s an application that does not exist', async () => {
    findByPk.mockResolvedValue(null);

    await request(app).post(URL).send({ action: 'pause' }).expect(404);
    expect(mockTransition).not.toHaveBeenCalled();
  });

  it('passes the state machine\'s own refusal through as 409, with its reason', async () => {
    // The rule that refused it is more useful than a generic failure.
    mockTransition.mockRejectedValue(new InvalidInternshipTransitionError('paused', 'completed', 'reviewer'));

    const res = await request(app).post(URL).send({ action: 'complete', confirm: 'complete' }).expect(409);

    expect(res.body.refused_by).toBe('state_machine');
    expect(res.body.error).toBeTruthy();
  });

  it('500s without leaking internals', async () => {
    mockTransition.mockRejectedValue(new Error('deadlock detected on internship_applications'));

    const res = await request(app).post(URL).send({ action: 'pause' }).expect(500);

    expect(JSON.stringify(res.body)).not.toContain('deadlock');
  });
});
