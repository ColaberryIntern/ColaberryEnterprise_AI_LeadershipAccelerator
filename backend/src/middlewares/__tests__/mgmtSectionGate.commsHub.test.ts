jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../../config/env', () => require('../../__tests__/testSupport/configMocks')
  .envModuleMock({ jwtSecret: 'test-secret' }));

import jwt from 'jsonwebtoken';
import { mgmtSectionGate, pathToSection } from '../mgmtSectionGate';
import { MGMT_ROLES, roleCanAccessSection, effectiveSections, normalizeExtraSections } from '../../services/access/mgmtRoles';

/**
 * CH1.1 Communications Hub access. Jackie holds community_organizer; Taiwo (prod, 2026-11-20: lead_intake
 * + {agents}) gets the comms_hub extra section from CH1.2; owner and admin derive it. Everyone else is 403.
 */
const verify = jwt.verify as unknown as jest.Mock;

function gate(payload: Record<string, unknown>, path: string) {
  const req: any = { method: 'GET', path, headers: { authorization: 'Bearer t' } };
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

const PROBE = '/api/admin/comms-hub/summary';

describe('CH1.1 the comms-hub prefix maps to its own section', () => {
  it('maps the prefix and its children to comms_hub', () => {
    expect(pathToSection('/api/admin/comms-hub')).toBe('comms_hub');
    expect(pathToSection(PROBE)).toBe('comms_hub');
    expect(pathToSection('/api/admin/comms-hub/events/abc/live/prepare')).toBe('comms_hub');
  });

  it('CH9.1 Report a problem sits under the hub prefix (comms_hub), not Marketing (campaigns)', () => {
    expect(pathToSection('/api/admin/comms-hub/bug-report')).toBe('comms_hub');
    expect(pathToSection('/api/admin/marketing/bug-report')).toBe('campaigns');
  });

  it('CH9.1 the hub report path reaches the people the hub is for, by role, and nobody else', () => {
    const p = '/api/admin/comms-hub/bug-report';
    expect(gate({ role: 'admin', mgmt_role: 'community_organizer' }, p).passed).toBe(true);
    expect(gate({ role: 'admin', mgmt_role: 'lead_intake', mgmt_extra_sections: ['agents', 'comms_hub'] }, p).passed).toBe(true);
    // The trap this route avoids: neither of them reaches Marketing's report endpoint.
    expect(gate({ role: 'admin', mgmt_role: 'community_organizer' }, '/api/admin/marketing/bug-report').status).toBe(403);
    expect(gate({ role: 'admin', mgmt_role: 'lead_intake', mgmt_extra_sections: ['agents', 'comms_hub'] }, '/api/admin/marketing/bug-report').status).toBe(403);
    for (const role of MGMT_ROLES.filter((r) => !roleCanAccessSection(r, 'comms_hub'))) {
      expect(gate({ role: 'admin', mgmt_role: role }, p).status).toBe(403);
    }
  });

  it('is segment-bounded both ways: neighbours keep their sections and lookalikes are unmapped', () => {
    expect(pathToSection('/api/admin/communications/log')).toBe('campaigns');
    expect(pathToSection('/api/admin/community/members')).toBe('program');
    expect(pathToSection('/api/admin/comms-hubx')).toBeNull();
    expect(pathToSection('/api/admin/comms')).toBeNull();
  });
});

describe('CH1.1 who reaches the hub', () => {
  beforeEach(() => jest.clearAllMocks());

  it('community_organizer (Jackie) passes', () => {
    expect(gate({ role: 'admin', mgmt_role: 'community_organizer' }, PROBE).passed).toBe(true);
  });

  it('Taiwo as she is on prod (lead_intake + {agents}) plus comms_hub passes, and keeps lead ingestion', () => {
    const taiwo = { role: 'admin', mgmt_role: 'lead_intake', mgmt_extra_sections: ['agents', 'comms_hub'] };
    expect(gate(taiwo, PROBE).passed).toBe(true);
    expect(gate(taiwo, '/api/admin/sources/list').passed).toBe(true);
    expect(gate({ role: 'admin', mgmt_role: 'lead_intake', mgmt_extra_sections: ['agents'] }, PROBE).status).toBe(403);
  });

  it('revenue with the comms_hub extra section passes, and still keeps revenue', () => {
    const r = { role: 'admin', mgmt_role: 'revenue', mgmt_extra_sections: ['comms_hub'] };
    expect(gate(r, PROBE).passed).toBe(true);
    expect(gate(r, '/api/admin/refunds/list').passed).toBe(true);
  });

  it('revenue WITHOUT the extra section is 403 with the section_not_permitted code', () => {
    const r = gate({ role: 'admin', mgmt_role: 'revenue' }, PROBE);
    expect(r.passed).toBe(false);
    expect(r.status).toBe(403);
  });

  it('owner and admin pass', () => {
    expect(gate({ role: 'super_admin', mgmt_role: 'owner' }, PROBE).passed).toBe(true);
    expect(gate({ role: 'admin', mgmt_role: 'admin' }, PROBE).passed).toBe(true);
  });

  it('no other scoped role reaches it (deny-by-default)', () => {
    const others = MGMT_ROLES.filter((r) => !['owner', 'admin', 'community_organizer'].includes(r));
    expect(others.length).toBeGreaterThan(5);
    for (const role of others) {
      expect(roleCanAccessSection(role, 'comms_hub')).toBe(false);
      expect(gate({ role: 'admin', mgmt_role: role }, PROBE).status).toBe(403);
    }
  });

  it('the organizer gained the hub and nothing else: still 403 on program and campaigns', () => {
    const jackie = { role: 'admin', mgmt_role: 'community_organizer' };
    expect(gate(jackie, '/api/admin/community/members').status).toBe(403);
    expect(gate(jackie, '/api/admin/communications/log').status).toBe(403);
    expect(gate(jackie, '/api/admin/accelerator/live/sessions').status).toBe(403);
  });

  it('comms_hub is a storable extra section for a role without it, and redundant for the organizer', () => {
    expect(normalizeExtraSections('revenue', ['comms_hub'])).toEqual(['comms_hub']);
    expect(normalizeExtraSections('community_organizer', ['comms_hub'])).toEqual([]);
    expect(effectiveSections('revenue', ['comms_hub'])).toContain('comms_hub');
  });
});
