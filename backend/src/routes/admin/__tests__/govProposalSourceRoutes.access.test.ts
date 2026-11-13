const mockIngest = jest.fn();
const mockList = jest.fn();
const mockApprove = jest.fn();
const mockDelete = jest.fn();
const mockFindOne = jest.fn();

jest.mock('../../../config/database', () => ({ sequelize: { fake: true } }));
jest.mock('../../../models/GovQualification', () => ({ __esModule: true, default: { findOne: (...a: unknown[]) => mockFindOne(...a) } }));
jest.mock('../../../services/factory/proposal/govProposalSources', () => ({
  ingestSourceDocument: (...a: unknown[]) => mockIngest(...a),
  listSourceDocuments: (...a: unknown[]) => mockList(...a),
  approveSourceDocument: (...a: unknown[]) => mockApprove(...a),
  deleteSourceDocument: (...a: unknown[]) => mockDelete(...a),
}));

import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import govProposalSourceRoutes from '../govProposalSourceRoutes';
import { env } from '../../../config/env';

const ROUTER_SRC = path.join(__dirname, '..', 'govProposalSourceRoutes.ts');
const PID = '3867b241-0761-4f1f-9a32-ffe3b47bf186';
const BASE = `/api/admin/gov-contracts/${PID}/sources`;

function tokenFor(role = 'admin', mgmtRole: string | null = null): string {
  const payload: Record<string, unknown> = { id: 'admin-1', email: 'a@example.test', role };
  if (mgmtRole) payload.mgmt_role = mgmtRole;
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '5m' });
}
function app(): Express { const a = express(); a.use(express.json()); a.use(govProposalSourceRoutes); return a; }
function registeredRoutes(): Array<{ path: string; methods: string[]; handlerCount: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Express does not type its stack
  const stack = (govProposalSourceRoutes as any).stack as Array<any>;
  return stack.filter((l) => l.route).map((l) => ({ path: l.route.path, methods: Object.keys(l.route.methods), handlerCount: l.route.stack.length }));
}
function routerCode(): string {
  return fs.readFileSync(ROUTER_SRC, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFindOne.mockResolvedValue({ tenant_id: 'tenant-1' });
  mockIngest.mockResolvedValue({ documentId: 'doc-1', chunkCount: 2, embeddedCount: 2, truncated: false, status: 'ready' });
  mockList.mockResolvedValue([]);
  mockApprove.mockResolvedValue({ id: 'doc-1', approved: true });
  mockDelete.mockResolvedValue(true);
});

describe('gov proposal source routes — every route is guarded', () => {
  it('POSITIVE CONTROL: registers the four routes', () => {
    expect(registeredRoutes()).toHaveLength(4);
  });
  it('every route has a guard middleware before its handler', () => {
    expect(registeredRoutes().filter((r) => r.handlerCount < 2).map((r) => r.path)).toEqual([]);
  });
  it('MUTATION PROOF: every route is gated requireSection(gov_contracts)', () => {
    const sections = [...routerCode().matchAll(/requireSection\(\s*'([a-z_]+)'\s*\)/g)].map((m) => m[1]);
    expect(sections).toEqual(['gov_contracts', 'gov_contracts', 'gov_contracts', 'gov_contracts']);
    expect(sections.length).toBe(registeredRoutes().length);
  });
});

describe('gov proposal source routes — the door (auth path)', () => {
  it('refuses an unauthenticated upload and never ingests', async () => {
    const res = await request(app()).post(BASE).attach('file', Buffer.from('hi'), 'notes.txt');
    expect([401, 403]).toContain(res.status);
    expect(mockIngest).not.toHaveBeenCalled();
  });
  it('refuses a non-admin (student) and never ingests', async () => {
    const res = await request(app()).post(BASE).set('Authorization', `Bearer ${tokenFor('student')}`).attach('file', Buffer.from('hi'), 'notes.txt');
    expect([401, 403]).toContain(res.status);
    expect(mockIngest).not.toHaveBeenCalled();
  });
});

describe('gov proposal source routes — upload validation (boundary)', () => {
  it('rejects a disallowed file type with 400 before ingesting', async () => {
    const res = await request(app()).post(BASE).set('Authorization', `Bearer ${tokenFor('admin')}`).attach('file', Buffer.from('x'), 'evil.exe');
    expect(res.status).toBe(400);
    expect(res.body.error_class).toBe('ValidationError');
    expect(mockIngest).not.toHaveBeenCalled();
  });
  it('accepts an allowed file for an admin and ingests (stored unapproved)', async () => {
    const res = await request(app()).post(BASE).set('Authorization', `Bearer ${tokenFor('admin')}`).attach('file', Buffer.from('hello world'), 'briefing.txt');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockIngest).toHaveBeenCalled();
  });
});
