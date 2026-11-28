jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../../config/env', () => require('../../__tests__/testSupport/configMocks')
  .envModuleMock({ jwtSecret: 'test-secret' }));

import jwt from 'jsonwebtoken';
import { mgmtSectionGate, pathToSection } from '../mgmtSectionGate';
import { MGMT_ROLES, roleCanAccessSection, sectionsForRole } from '../../services/access/mgmtRoles';

/**
 * AO1.3 Admissions & Ops Command Center access (kit SPEC section 3). Owner and admin derive admissions_ops; the
 * admissions role (Dhee) does not; Taiwo (prod: lead_intake + {agents}) gets it as an extra section. Every scoped
 * identity without it gets 403 on every path under /api/admin/admissions-ops.
 */
const verify = jwt.verify as unknown as jest.Mock;

function gate(payload: Record<string, unknown>, path: string, method = 'GET') {
  const req: any = { method, path, headers: { authorization: 'Bearer t' } };
  const res: any = {
    statusCode: 0, body: null as unknown,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
  const next = jest.fn();
  verify.mockReturnValue(payload);
  mgmtSectionGate(req, res, next);
  return { passed: next.mock.calls.length === 1, status: res.statusCode };
}

const PROBES = ['/api/admin/admissions-ops/today', '/api/admin/admissions-ops/agent/manifest', '/api/admin/admissions-ops/agent/intents'];
const TAIWO = { role: 'admin', mgmt_role: 'lead_intake', mgmt_extra_sections: ['agents', 'admissions_ops'] };

describe('AO1.3 the admissions-ops prefix maps to its own section', () => {
  beforeEach(() => jest.clearAllMocks());

  it('maps the prefix and its children to admissions_ops', () => {
    expect(pathToSection('/api/admin/admissions-ops')).toBe('admissions_ops');
    for (const p of PROBES) expect(pathToSection(p)).toBe('admissions_ops');
  });

  it('is segment-bounded: Dhee\'s /api/admin/admissions stays lead_ingestion and lookalikes are not captured', () => {
    expect(pathToSection('/api/admin/admissions')).toBe('lead_ingestion');
    expect(pathToSection('/api/admin/admissions/stats')).toBe('lead_ingestion');
    expect(pathToSection('/api/admin/admissions/ops')).toBe('lead_ingestion');
    expect(pathToSection('/api/admin/admissions-opsx')).not.toBe('admissions_ops');
  });

  it('owner and admin hold it; the admissions role does not', () => {
    expect(roleCanAccessSection('owner', 'admissions_ops')).toBe(true);
    expect(roleCanAccessSection('admin', 'admissions_ops')).toBe(true);
    expect(sectionsForRole('admissions')).not.toContain('admissions_ops');
  });

  it('Taiwo with the extra section passes every probe and keeps lead ingestion; without it she is refused', () => {
    for (const p of PROBES) expect(gate(TAIWO, p).passed).toBe(true);
    expect(gate(TAIWO, '/api/admin/sources/list').passed).toBe(true);
    const without = { role: 'admin', mgmt_role: 'lead_intake', mgmt_extra_sections: ['agents'] };
    for (const p of PROBES) expect(gate(without, p).status).toBe(403);
  });

  it('every management role that does not hold the section gets 403 on every probe, POST included', () => {
    const denied = MGMT_ROLES.filter((r) => !roleCanAccessSection(r, 'admissions_ops'));
    expect(denied).toContain('admissions');
    for (const role of denied) {
      for (const p of PROBES) {
        expect({ role, p, status: gate({ role: 'admin', mgmt_role: role }, p).status }).toEqual({ role, p, status: 403 });
      }
      expect(gate({ role: 'admin', mgmt_role: role }, PROBES[2], 'POST').status).toBe(403);
    }
  });

  it('the roles that hold it pass', () => {
    for (const role of MGMT_ROLES.filter((r) => roleCanAccessSection(r, 'admissions_ops'))) {
      expect(gate({ role: 'admin', mgmt_role: role }, PROBES[0]).passed).toBe(true);
    }
  });
});
