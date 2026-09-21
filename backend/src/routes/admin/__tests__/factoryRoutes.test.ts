/**
 * The Command Center read API. The sample endpoint serves the day-one fixture (no DB); the contract
 * endpoint reconstructs a FactoryProject from the persisted doc_json subset + the track/requirement
 * rows, 404s when nothing is generated yet, and 400s a bad id. Every route is section-gated — asserted
 * both behaviourally (mocked guard) and at the source, since the route-auth lint is a required CI check.
 */
import fs from 'fs';
import path from 'path';

const requireSection = jest.fn(() => (_req: any, _res: any, next: any) => next());
jest.mock('../../../middlewares/authMiddleware', () => ({ requireSection: (...a: any[]) => requireSection(...a) }));

const docFindAll = jest.fn();
const trackFindAll = jest.fn();
const reqFindAll = jest.fn();
jest.mock('../../../models/ContractProcessDocument', () => ({ __esModule: true, default: { findAll: (...a: any[]) => docFindAll(...a) } }));
jest.mock('../../../models/ContractTrack', () => ({ __esModule: true, default: { findAll: (...a: any[]) => trackFindAll(...a) } }));
jest.mock('../../../models/ContractRequirement', () => ({ __esModule: true, default: { findAll: (...a: any[]) => reqFindAll(...a) } }));

import express from 'express';
import request from 'supertest';
import factoryRoutes from '../factoryRoutes';
import { buildSampleContractProject } from '../../../services/factory/sample/sampleContractProject';

const app = express();
app.use(factoryRoutes);

const s = buildSampleContractProject();
const UUID = '11111111-1111-4111-a111-111111111111'; // a valid RFC-4122 v4 uuid

beforeEach(() => jest.clearAllMocks());

describe('GET /api/admin/factory/sample — the day-one fixture', () => {
  it('serves the sample view, flagged isSample, gate clean, no persisted approval, without touching the DB', async () => {
    const res = await request(app).get('/api/admin/factory/sample');
    expect(res.status).toBe(200);
    expect(res.body.isSample).toBe(true);
    expect(res.body.contractName).toBe('AI Government Contract Finder');
    expect(res.body.gate.ok).toBe(true);
    expect(res.body.approval).toBeNull();
    expect(docFindAll).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/factory/contract/:deliveryProjectId', () => {
  it('404s when no decomposition has been generated for the contract', async () => {
    docFindAll.mockResolvedValue([]);
    const res = await request(app).get(`/api/admin/factory/contract/${UUID}`);
    expect(res.status).toBe(404);
    expect(reqFindAll).not.toHaveBeenCalled(); // short-circuits before loading siblings
  });

  it('400s an invalid (non-uuid) delivery project id', async () => {
    const res = await request(app).get('/api/admin/factory/contract/not-a-uuid');
    expect(res.status).toBe(400);
    expect(docFindAll).not.toHaveBeenCalled();
  });

  it('reconstructs a full FactoryProject from doc_json + tracks + requirements, with the approval state', async () => {
    docFindAll.mockResolvedValue([
      {
        track_type: 'solution_build', version: 2,
        doc_json: {
          processes: s.processes, roles: s.roles, tasks: s.tasks, assignments: s.assignments,
          transitions: s.transitions, allocation: s.allocation, role_map: s.role_map, source_blocks: s.source_blocks,
        },
        status: 'documented', approval_level: 'documented', enrichment_status: 'partial', content_sha256: 'hash123',
      },
    ]);
    trackFindAll.mockResolvedValue(s.tracks); // already track-shaped
    reqFindAll.mockResolvedValue(s.requirements.map((r) => ({ ...r, canonical_req_id: r.id }))); // DB row uses canonical_req_id

    const res = await request(app).get(`/api/admin/factory/contract/${UUID}`);
    expect(res.status).toBe(200);
    expect(res.body.isSample).toBe(false);
    expect(res.body.deliveryProjectId).toBe(UUID);
    expect(res.body.gate.ok).toBe(true);                 // the sample subset is gate-clean
    expect(res.body.compliance).toHaveLength(4);          // requirements reconstructed from the rows
    expect(res.body.allocation).toHaveLength(4);
    expect(res.body.approval).toEqual({
      status: 'documented', level: 'documented', version: 2, enrichmentStatus: 'partial', contentHash: 'hash123',
    });
  });
});

describe('route-auth — both routes are section-gated (required CI lint)', () => {
  it('the source guards every route with requireSection(\'program\')', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'factoryRoutes.ts'), 'utf8');
    const guards = src.match(/requireSection\('program'\)/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(2); // /sample and /contract/:id
  });
});
