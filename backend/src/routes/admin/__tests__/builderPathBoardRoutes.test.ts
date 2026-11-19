/**
 * The owner's board route: one read, `requireAdmin`, and a classified prefix.
 *
 * ## Why the door is what matters here
 *
 * The self-scoped candidate routes are safe because of their HANDLER: they resolve the caller's
 * identity and filter to the domains they own, so a builder who reaches one learns nothing about
 * anybody else. This route returns all ten domains by design, so its handler cannot protect it and
 * the gate has to. That is the same split `/api/admin/agent-domains` already makes, and
 * `agent-domains-mine` states it in its own header: *"Section access decides whether you may ask;
 * ownership decides what comes back."*
 *
 * ## And why the PATH_SECTION row is tested separately
 *
 * `mgmtSectionGate` runs before the router and is deny-by-default for a scoped role. An unmapped
 * prefix 403s with nothing explaining why — AF8.3, where six correctly-scoped interns got 403 on
 * the page built for them and it was found only by walking all six through production.
 */

const mockBoard = jest.fn();
jest.mock('../../../services/agentDomain/builderPathBoard', () => ({
  builderPathBoard: (...a: unknown[]) => mockBoard(...a),
}));
jest.mock('../../../config/database', () => ({ sequelize: { fake: true } }));

import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import { pathToSection } from '../../../middlewares/mgmtSectionGate';
import boardRoutes from '../builderPathBoardRoutes';
import { env } from '../../../config/env';

const ROUTE = '/api/admin/builder-path-board';
const ROUTER_SRC = path.join(__dirname, '..', 'builderPathBoardRoutes.ts');

function token(role: string, over: Record<string, unknown> = {}): string {
  return jwt.sign(
    { id: 'test', email: 'test@example.test', role, ...over },
    env.jwtSecret,
    { expiresIn: '5m' },
  );
}

function app(): Express {
  const a = express();
  a.use(express.json());
  a.use(boardRoutes);
  return a;
}

function registeredRoutes(): Array<{ path: string; methods: string[]; handlerCount: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Express does not type its stack
  const stack = (boardRoutes as any).stack as Array<any>;
  return stack
    .filter((l) => l.route)
    .map((l) => ({
      path: l.route.path as string,
      methods: Object.keys(l.route.methods),
      handlerCount: l.route.stack.length as number,
    }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBoard.mockResolvedValue({
    builders: [], gap_board: [], reason: 'nothing yet',
    summary: { domains: 0, candidates: 0, waiting_on_you: 0, screens_owed: 0, scope_sheets_owed: 0 },
  });
});

describe('the prefix is classified', () => {
  it('resolves to program BY NAME, not to null', () => {
    expect(pathToSection(ROUTE)).toBe('program');
  });

  it('POSITIVE CONTROL: an unmapped sibling really does return null', () => {
    expect(pathToSection('/api/admin/builder-path-invented')).toBeNull();
  });

  it('does not displace the self-scoped candidate row', () => {
    expect(pathToSection('/api/admin/agent-domain-candidates-mine')).toBe('dashboard');
  });
});

describe('the door', () => {
  it('is requireAdmin, not a section guard, and that is asserted in the source', () => {
    const src = fs.readFileSync(ROUTER_SRC, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const guards = [...src.matchAll(/\b(requireAdmin|requireSection)\b/g)].map((m) => m[1]);
    expect(guards).toEqual(['requireAdmin', 'requireAdmin']);
    expect(src).not.toMatch(/requireSection/);
  });

  it('every route has a middleware before its handler', () => {
    const routes = registeredRoutes();
    expect(routes).toHaveLength(1);
    expect(routes[0].methods).toEqual(['get']);
    expect(routes[0].handlerCount).toBeGreaterThanOrEqual(2);
  });

  it('refuses an unauthenticated caller and never reaches the service', async () => {
    const res = await request(app()).get(ROUTE);
    expect([401, 403]).toContain(res.status);
    expect(mockBoard).not.toHaveBeenCalled();
  });

  it('refuses a non-admin role', async () => {
    const res = await request(app()).get(ROUTE)
      .set('Authorization', `Bearer ${token('student')}`);
    expect([401, 403]).toContain(res.status);
    expect(mockBoard).not.toHaveBeenCalled();
  });

  it('lets an admin through', async () => {
    const res = await request(app()).get(ROUTE)
      .set('Authorization', `Bearer ${token('admin')}`);
    expect(res.status).toBe(200);
    expect(mockBoard).toHaveBeenCalled();
  });
});

describe('it is read-only', () => {
  it('registers no write route at all', () => {
    const writes = registeredRoutes().filter(
      (r) => !r.methods.every((m) => m === 'get' || m === 'head'),
    );
    expect(writes).toEqual([]);
  });

  it('the source contains no write verb', () => {
    const src = fs.readFileSync(ROUTER_SRC, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/router\.(post|patch|put|delete)\(/);
  });
});

describe('a rejected promise becomes a 500, not nothing at all', () => {
  it('returns a body and an error class when the service throws', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockBoard.mockRejectedValue(new TypeError('boom'));
    const res = await request(app()).get(ROUTE)
      .set('Authorization', `Bearer ${token('admin')}`);
    expect(res.status).toBe(500);
    expect(res.body.error_class).toBe('TypeError');
    err.mockRestore();
  });
});

describe('it passes the service response through unchanged', () => {
  it('returns exactly what the service gave it', async () => {
    const board = {
      builders: [{ domain_key: 'x', candidates: [], waiting_on_you: 0, theirs_to_move: 0, cleared_the_gate: 0, gate_size: 1, note: 'n' }],
      gap_board: [],
      summary: { domains: 1, candidates: 0, waiting_on_you: 0, screens_owed: 0, scope_sheets_owed: 0 },
      reason: 'a specific reason',
    };
    mockBoard.mockResolvedValue(board);
    const res = await request(app()).get(ROUTE)
      .set('Authorization', `Bearer ${token('admin')}`);
    expect(res.body).toEqual(board);
  });
});
