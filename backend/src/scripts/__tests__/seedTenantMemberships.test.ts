import * as fs from 'fs';
import * as path from 'path';

/**
 * T413 - the membership seed tool: dry run by default, a write refused unless
 * the lock-out count is acknowledged exactly, platform super-admins granted
 * first, a link conflict never reassigned, and only the identity service's
 * three functions and the models imported. The models and the service are
 * mocked at their boundary; the source scan is the other half.
 */

const m = {
  adminFindAll: jest.fn(),
  tenantFindAll: jest.fn(),
  brandFindAll: jest.fn(),
  membershipCount: jest.fn(),
  membershipFindAll: jest.fn(),
  linkFindAll: jest.fn(),
  identityFindAll: jest.fn(),
  ensurePlatformIdentity: jest.fn(),
  linkIdentity: jest.fn(),
  grantTenantMembership: jest.fn(),
};
jest.mock('../../models', () => ({
  AdminUser: { findAll: (...a: unknown[]) => m.adminFindAll(...a) },
  Tenant: { findAll: (...a: unknown[]) => m.tenantFindAll(...a) },
  Brand: { findAll: (...a: unknown[]) => m.brandFindAll(...a) },
  TenantMembership: { count: (...a: unknown[]) => m.membershipCount(...a), findAll: (...a: unknown[]) => m.membershipFindAll(...a) },
  PlatformIdentityLink: { findAll: (...a: unknown[]) => m.linkFindAll(...a) },
  PlatformIdentity: { findAll: (...a: unknown[]) => m.identityFindAll(...a) },
}));
jest.mock('../../modules/identity/platformIdentityService', () => ({
  ensurePlatformIdentity: (...a: unknown[]) => m.ensurePlatformIdentity(...a),
  linkIdentity: (...a: unknown[]) => m.linkIdentity(...a),
  grantTenantMembership: (...a: unknown[]) => m.grantTenantMembership(...a),
}));

import { applyPlan, assertLockoutAcknowledged, assertSafeTarget, parseArgs, run, writeOrder } from '../seedTenantMemberships';
import { buildMembershipPlan } from '../../services/growthJourney/access/membershipPlan';

const src = fs.readFileSync(path.join(__dirname, '..', 'seedTenantMemberships.ts'), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ADMINS = [
  { id: 'u-1', email: 'ali@colaberry.com', is_ai_operated: false },
  { id: 'u-2', email: 'ops.lead@colaberry.com', is_ai_operated: false },
  { id: 'u-3', email: 'viewer@colaberry.com', is_ai_operated: false },
  { id: 'u-4', email: 'intern.one@colaberry.com', is_ai_operated: false },
  { id: 'u-5', email: 'intern.two@colaberry.com', is_ai_operated: false },
  { id: 'u-6', email: 'cory.agent@colaberry.com', is_ai_operated: true },
  { id: 'u-7', email: 'maya.agent@colaberry.com', is_ai_operated: true },
];
// Deliberately NOT super-admin first, so the write order is the tool's, not the roster's.
const ROSTER = [
  { email: 'viewer@colaberry.com', tenant_slug: 'colaberry', brand_slug: null, role: 'tenant_viewer' },
  { email: 'ops.lead@colaberry.com', tenant_slug: 'colaberry', brand_slug: 'colaberry-training', role: 'brand_admin' },
  { email: 'ops.lead@colaberry.com', tenant_slug: 'colaberry', brand_slug: 'colaberry-enterprise', role: 'brand_admin' },
  { email: 'ali@colaberry.com', tenant_slug: 'colaberry', brand_slug: null, role: 'platform_super_admin' },
];
const readRoster = () => JSON.stringify(ROSTER);

function world(opts: { membershipCount?: number } = {}) {
  m.adminFindAll.mockResolvedValue(ADMINS);
  m.tenantFindAll.mockResolvedValue([{ id: 't-colaberry', slug: 'colaberry' }]);
  m.brandFindAll.mockResolvedValue([{ id: 'b-training', slug: 'colaberry-training', tenant_id: 't-colaberry' }, { id: 'b-ent', slug: 'colaberry-enterprise', tenant_id: 't-colaberry' }]);
  m.membershipCount.mockResolvedValue(opts.membershipCount ?? 0);
  m.membershipFindAll.mockResolvedValue([]);
  m.linkFindAll.mockResolvedValue([]);
  m.identityFindAll.mockResolvedValue([]);
  const ids = new Map<string, string>();
  m.ensurePlatformIdentity.mockImplementation(async ({ email }: { email: string }) => {
    const created = !ids.has(email);
    if (created) ids.set(email, `pid-${ids.size + 1}`);
    return { identity: { id: ids.get(email) }, created };
  });
  m.linkIdentity.mockResolvedValue({ created: true });
  m.grantTenantMembership.mockResolvedValue({ membership: { id: 'm' }, created: true });
}

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  delete process.env.DATABASE_URL;
  world();
});

describe('the flags', () => {
  it('no write flag is a dry run; --roster is required; the acknowledgement is a whole number', () => {
    expect(parseArgs(['--roster', 'r.json'])).toEqual({ rosterPath: 'r.json', dryRun: true, confirmProduction: false, acknowledgeLockout: null });
    expect(parseArgs(['--roster', 'r.json', '--confirm-production', '--acknowledge-lockout', '4'])).toMatchObject({ dryRun: false, confirmProduction: true, acknowledgeLockout: 4 });
    expect(() => parseArgs([])).toThrow(/--roster/);
    expect(() => parseArgs(['--roster', 'r.json', '--acknowledge-lockout', 'four'])).toThrow(/whole number/);
    expect(() => parseArgs(['--roster', 'r.json', '--wat'])).toThrow(/unknown flag/);
  });

  it('a production-looking DATABASE_URL without --confirm-production is refused; a dry run is always allowed', () => {
    process.env.DATABASE_URL = 'postgres://u:p@h:5432/accelerator_prod';
    expect(() => assertSafeTarget({ rosterPath: 'r', dryRun: false, confirmProduction: false, acknowledgeLockout: null })).toThrow(/Refusing to write/);
    expect(() => assertSafeTarget({ rosterPath: 'r', dryRun: true, confirmProduction: false, acknowledgeLockout: null })).not.toThrow();
  });
});

describe('the lock-out acknowledgement', () => {
  const plan = () => buildMembershipPlan({ roster: ROSTER, admins: ADMINS, tenants: [{ id: 't-colaberry', slug: 'colaberry' }], brands: [{ id: 'b-training', slug: 'colaberry-training', tenant_id: 't-colaberry' }, { id: 'b-ent', slug: 'colaberry-enterprise', tenant_id: 't-colaberry' }], membershipTableEmpty: true });

  it('--confirm-production without --acknowledge-lockout refuses, naming the count to acknowledge', () => {
    expect(() => assertLockoutAcknowledged({ rosterPath: 'r', dryRun: false, confirmProduction: true, acknowledgeLockout: null }, plan())).toThrow(/4 admin\(s\) will hold no membership.*--acknowledge-lockout 4/);
  });

  it('a WRONG number refuses too - a stale count from an older roster is not an acknowledgement', () => {
    expect(() => assertLockoutAcknowledged({ rosterPath: 'r', dryRun: false, confirmProduction: true, acknowledgeLockout: 3 }, plan())).toThrow(/refusing to write/);
    expect(() => assertLockoutAcknowledged({ rosterPath: 'r', dryRun: false, confirmProduction: true, acknowledgeLockout: 4 }, plan())).not.toThrow();
  });

  it('through run(): the refusal happens before ANY identity, link or membership call', async () => {
    const lines: string[] = [];
    await expect(run(parseArgs(['--roster', 'r.json', '--confirm-production']), (l) => lines.push(l), readRoster)).rejects.toThrow(/--acknowledge-lockout 4/);
    expect(m.ensurePlatformIdentity).not.toHaveBeenCalled();
    expect(m.linkIdentity).not.toHaveBeenCalled();
    expect(m.grantTenantMembership).not.toHaveBeenCalled();
    // The operator still saw the plan, lock-out line included.
    expect(lines.join('\n')).toContain('LOCK-OUT: 4');
  });
});

describe('the dry run', () => {
  it('prints the plan and the exact flags to write, writes nothing, and prints no email', async () => {
    const lines: string[] = [];
    expect(await run(parseArgs(['--roster', 'r.json']), (l) => lines.push(l), readRoster)).toBe(0);
    const text = lines.join('\n');
    expect(text).toContain('identities: 3');
    expect(text).toContain('memberships: 4');
    expect(text).toContain('LOCK-OUT: 4 admin(s)');
    expect(text).toContain('[dry-run] nothing written. To write: --confirm-production --acknowledge-lockout 4');
    expect(m.ensurePlatformIdentity).not.toHaveBeenCalled();
    expect(m.grantTenantMembership).not.toHaveBeenCalled();
    expect(text).not.toContain('@');
  });

  it('an unreadable roster is exit 2 with no plan; an invalid one throws the validation error before any write', async () => {
    const lines: string[] = [];
    expect(await run(parseArgs(['--roster', 'r.json']), (l) => lines.push(l), () => '{not json')).toBe(2);
    expect(lines).toEqual(['the roster is not readable JSON']);
    await expect(run(parseArgs(['--roster', 'r.json']), () => undefined, () => JSON.stringify([{ ...ROSTER[0], role: 'god_mode' }]))).rejects.toThrow(/unknown role/);
    expect(m.ensurePlatformIdentity).not.toHaveBeenCalled();
  });
});

describe('the write', () => {
  it('acknowledged: 3 identities, 3 links, 4 memberships through the service, active, and the counts printed', async () => {
    const lines: string[] = [];
    expect(await run(parseArgs(['--roster', 'r.json', '--confirm-production', '--acknowledge-lockout', '4']), (l) => lines.push(l), readRoster)).toBe(0);
    expect(m.ensurePlatformIdentity).toHaveBeenCalledTimes(3);
    expect(m.linkIdentity).toHaveBeenCalledTimes(3);
    expect(m.grantTenantMembership).toHaveBeenCalledTimes(4);
    for (const call of m.grantTenantMembership.mock.calls) expect(call[0]).toMatchObject({ status: 'active' });
    expect(m.linkIdentity).toHaveBeenCalledWith({ platformIdentityId: 'pid-1', linkType: 'admin_user', linkedEntityId: 'u-1', linkSource: 'manual' });
    const text = lines.join('\n');
    expect(lines[0]).toBe('membership seed (writing)');
    expect(text).toContain('written: identities created=3 existing=0; links created=3 existing=0 conflicts=0; memberships created=4 existing=0');
    expect(text).not.toContain('@');
  });

  it('the platform super-admin is granted FIRST whatever the roster order - the first row closes the ramp, and the operator must not be behind it', async () => {
    await run(parseArgs(['--roster', 'r.json', '--confirm-production', '--acknowledge-lockout', '4']), () => undefined, readRoster);
    expect(m.grantTenantMembership.mock.calls[0][0]).toMatchObject({ role: 'platform_super_admin', brandId: null });
    expect(m.ensurePlatformIdentity.mock.calls[0][0]).toEqual({ email: 'ali@colaberry.com' });
  });

  it('a second run grants nothing new: every call answers existing and the counts say so', async () => {
    m.ensurePlatformIdentity.mockResolvedValue({ identity: { id: 'pid-x' }, created: false });
    m.linkIdentity.mockResolvedValue({ created: false });
    m.grantTenantMembership.mockResolvedValue({ membership: { id: 'm' }, created: false });
    const lines: string[] = [];
    await run(parseArgs(['--roster', 'r.json', '--confirm-production', '--acknowledge-lockout', '4']), (l) => lines.push(l), readRoster);
    expect(lines.join('\n')).toContain('written: identities created=0 existing=3; links created=0 existing=3 conflicts=0; memberships created=0 existing=4');
  });

  it('an admin already linked to ANOTHER identity is reported and never reassigned - and gets no membership, since their token resolves to the other identity', async () => {
    m.linkIdentity.mockImplementation(async ({ linkedEntityId }: { linkedEntityId: string }) => (linkedEntityId === 'u-2' ? { created: false, conflictWithIdentityId: 'pid-other' } : { created: true }));
    const lines: string[] = [];
    await run(parseArgs(['--roster', 'r.json', '--confirm-production', '--acknowledge-lockout', '4']), (l) => lines.push(l), readRoster);
    expect(m.grantTenantMembership).toHaveBeenCalledTimes(2);
    expect(m.grantTenantMembership.mock.calls.some((c) => c[0].role === 'brand_admin')).toBe(false);
    expect(lines.join('\n')).toContain('conflicts=1');
    expect(lines.join('\n')).toContain('1 admin(s) are linked to a different identity: their memberships were NOT granted');
  });

  it('writeOrder puts every super-admin first and keeps the rest in roster order', () => {
    const people = [
      { admin_id: 'a', email: 'a', memberships: [{ tenant_id: 't', brand_id: null, role: 'tenant_viewer' }] },
      { admin_id: 'b', email: 'b', memberships: [{ tenant_id: 't', brand_id: null, role: 'platform_super_admin' }] },
      { admin_id: 'c', email: 'c', memberships: [{ tenant_id: 't', brand_id: 'x', role: 'brand_admin' }] },
    ];
    expect(writeOrder(people).map((p) => p.admin_id)).toEqual(['b', 'a', 'c']);
  });

  it('applyPlan on an empty plan calls nothing', async () => {
    const r = await applyPlan({ people: [], closes_ramp: false, counts: { identities: 0, links: 0, memberships: 0, lockouts: 0, lockouts_human: 0, lockouts_ai_operated: 0 }, lockout_admin_ids: [], link_conflict_admin_ids: [] });
    expect(r.memberships_created).toBe(0);
    expect(m.ensurePlatformIdentity).not.toHaveBeenCalled();
  });
});

describe('the reads and the source', () => {
  it('an admin already holding an active membership (linked identity) is not counted as locked out', async () => {
    m.membershipCount.mockResolvedValue(2);
    m.linkFindAll.mockResolvedValue([{ platform_identity_id: 'pid-u4', linked_entity_id: 'u-4' }]);
    m.membershipFindAll.mockResolvedValue([{ platform_identity_id: 'pid-u4' }]);
    const lines: string[] = [];
    await run(parseArgs(['--roster', 'r.json']), (l) => lines.push(l), readRoster);
    const text = lines.join('\n');
    expect(text).toContain('LOCK-OUT: 3 admin(s)');
    expect(text).toContain('already has rows: the ramp is closed');
    expect(m.membershipFindAll).toHaveBeenCalledWith({ where: { status: 'active' }, attributes: ['platform_identity_id'], raw: true });
  });

  it('a link to a DIFFERENT identity is a plan-time conflict: the identity emails are read only for the linked ids, the dry run names the admin id, and the lock-out count includes them', async () => {
    await run(parseArgs(['--roster', 'r.json']), () => undefined, readRoster);
    expect(m.identityFindAll).not.toHaveBeenCalled();
    m.linkFindAll.mockResolvedValue([{ platform_identity_id: 'pid-z', linked_entity_id: 'u-2' }]);
    m.identityFindAll.mockResolvedValue([{ id: 'pid-z', primary_email: 'someone.else@colaberry.com' }]);
    const lines: string[] = [];
    await run(parseArgs(['--roster', 'r.json']), (l) => lines.push(l), readRoster);
    expect(m.identityFindAll).toHaveBeenCalledWith({ where: { id: ['pid-z'] }, attributes: ['id', 'primary_email'], raw: true });
    const text = lines.join('\n');
    expect(text).toContain('LINK CONFLICT: 1 admin(s) already linked to a different identity - the link stays, and their memberships above will NOT be granted: u-2');
    expect(text).toContain('LOCK-OUT: 5 admin(s)');
    expect(text).toContain('--acknowledge-lockout 5');
    expect(text).not.toContain('@');
  });

  it('a platform super-admin linked to a DIFFERENT identity refuses the write before any service call, naming the id and never the address', async () => {
    m.linkFindAll.mockResolvedValue([{ platform_identity_id: 'pid-z', linked_entity_id: 'u-1' }]);
    m.identityFindAll.mockResolvedValue([{ id: 'pid-z', primary_email: 'other@colaberry.com' }]);
    let err: Error | null = null;
    try {
      await run(parseArgs(['--roster', 'r.json', '--confirm-production', '--acknowledge-lockout', '5']), () => undefined, readRoster);
    } catch (e) {
      err = e as Error;
    }
    expect(err?.message).toMatch(/refusing to write: platform super-admin u-1 is linked to a different identity/);
    expect(err?.message).not.toContain('@');
    expect(m.ensurePlatformIdentity).not.toHaveBeenCalled();
    expect(m.linkIdentity).not.toHaveBeenCalled();
    expect(m.grantTenantMembership).not.toHaveBeenCalled();
    // A conflicted NON-super-admin does not refuse: the write proceeds and the service reports the conflict.
    m.linkFindAll.mockResolvedValue([{ platform_identity_id: 'pid-z', linked_entity_id: 'u-3' }]);
    m.linkIdentity.mockImplementation(async ({ linkedEntityId }: { linkedEntityId: string }) => (linkedEntityId === 'u-3' ? { created: false, conflictWithIdentityId: 'pid-z' } : { created: true }));
    const lines: string[] = [];
    expect(await run(parseArgs(['--roster', 'r.json', '--confirm-production', '--acknowledge-lockout', '5']), (l) => lines.push(l), readRoster)).toBe(0);
    expect(lines.join('\n')).toContain('conflicts=1');
  });

  it('imports only the identity service\'s three functions, the models, fs and the planner - and writes through nothing else', () => {
    const imports = Array.from(code.matchAll(/from '([^']+)';/g)).map((x) => x[1]);
    expect(imports.sort()).toEqual(['../models', '../modules/identity/platformIdentityService', '../services/growthJourney/access/membershipPlan', 'fs']);
    expect(code).toContain('import { ensurePlatformIdentity, grantTenantMembership, linkIdentity } from ');
    expect(code).not.toMatch(/\.create\(|\.update\(|\.destroy\(|\.upsert\(|bulkCreate|sequelize\.query/);
    expect(code).not.toMatch(/emailService|mandrill|notify|sendNewLeadAlert|isGrowthJourneyCapabilityEnabled|growthJourneyEnabled/);
    // An email is never printed - through the out() sink, the console or stdout: the only output of an admin is its id.
    expect(code).not.toMatch(/(out|console\.\w+|stdout\.write)\([^)]*email/);
  });
});
