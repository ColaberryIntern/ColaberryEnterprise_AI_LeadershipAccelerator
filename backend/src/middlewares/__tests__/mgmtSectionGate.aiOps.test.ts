/**
 * `/api/admin/ai-ops` gets a section, and granting it does not grant the kill switch.
 *
 * Quincy Ninying's L1 run ended on a request for read access to these surfaces that nobody could
 * grant: all 33 routes carried `requireAdmin` and the prefix was UNMAPPED here, so a scoped
 * identity was refused by this gate before any route was reached.
 *
 * The prefix is now `intelligence`, matching the page that consumes it. Two properties have to
 * hold together, and each is useless without the other:
 *
 *   1. The classification ADMITS NOBODY NEW on its own, because no scoped role holds
 *      `intelligence`. Nobody silently gains a surface the day this merges.
 *   2. When the section IS granted, the holder can READ and cannot ACT — which this gate cannot
 *      do by itself, since it maps a path and `POST /ai-ops/emergency-stop` shares its prefix
 *      with `GET /ai-ops/overview`. `requireFullAdmin` is the other half.
 */

jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../../config/env', () => require('../../__tests__/testSupport/configMocks')
  .envModuleMock({ jwtSecret: 'test-secret' }));

import jwt from 'jsonwebtoken';
import { mgmtSectionGate, pathToSection, SECTION_DENIED_CODE } from '../mgmtSectionGate';
import { requireFullAdmin } from '../authMiddleware';
import { MGMT_ROLES, MGMT_ROLE_DEFS } from '../../services/access/mgmtRoles';

const verify = jwt.verify as unknown as jest.Mock;

function ctx(payload: any, path: string, method = 'GET') {
  const req: any = { method, path, headers: { authorization: 'Bearer t' } };
  const res: any = {
    statusCode: 0, body: null as any,
    status(c: number) { this.statusCode = c; return this; },
    json(b: any) { this.body = b; return this; },
  };
  const next = jest.fn();
  verify.mockReturnValue(payload);
  return { req, res, next };
}

const minted = (mgmt_role: string, extras?: string[]) => ({
  sub: 'e1',
  email: `${mgmt_role}@colaberry.com`,
  role: mgmt_role === 'owner' ? 'super_admin' : 'admin',
  mgmt_role,
  ...(extras ? { mgmt_extra_sections: extras } : {}),
});

/** The read and the two most consequential actions. Named, not sampled. */
const READ = '/api/admin/ai-ops/overview';
const STOP = '/api/admin/ai-ops/emergency-stop';

beforeEach(() => { jest.clearAllMocks(); });

describe('the classification itself', () => {
  it('maps the prefix to intelligence, the section of the page that consumes it', () => {
    expect(pathToSection('/api/admin/ai-ops')).toBe('intelligence');
  });

  it('maps every sub-path, so no detail or action route falls off the map', () => {
    for (const p of [
      '/api/admin/ai-ops/overview',
      '/api/admin/ai-ops/agents',
      '/api/admin/ai-ops/agents/abc-123',
      '/api/admin/ai-ops/registry/abc/control',
      '/api/admin/ai-ops/trace/t-1',
      '/api/admin/ai-ops/emergency-stop',
    ]) {
      expect({ p, section: pathToSection(p) }).toEqual({ p, section: 'intelligence' });
    }
  });

  it('does not claim a neighbour that merely shares the characters', () => {
    // The matcher is '/'-delimited, so this must not swallow an unrelated prefix.
    expect(pathToSection('/api/admin/ai-opsomething')).not.toBe('intelligence');
  });

  it('leaves the system, launch and system-health prefixes UNMAPPED, deliberately', () => {
    // Those four routes live in the same file and are the most consequential in it. They stay
    // deny-by-default for every scoped role rather than riding along with this change, because
    // classifying them is a separate decision about who may see the kill switch at all.
    expect(pathToSection('/api/admin/system/kill-switch')).toBeNull();
    expect(pathToSection('/api/admin/system/safe-mode')).toBeNull();
    expect(pathToSection('/api/admin/launch/war-room')).toBeNull();
    expect(pathToSection('/api/admin/system-health')).toBeNull();
  });
});

describe('PROPERTY 1 — the classification admits nobody new', () => {
  it('no scoped role holds intelligence, so no existing role gains AI Ops', () => {
    // The condition `brandPaths.test.ts` names for adding a classification safely. If a future
    // role is given `intelligence`, this fails and whoever does it has to read the comment in
    // the gate and decide knowingly rather than inherit a surface.
    const scopedWithIntelligence = MGMT_ROLES.filter(
      (r) => r !== 'owner' && r !== 'admin' && MGMT_ROLE_DEFS[r].sections.includes('intelligence'),
    );
    expect(scopedWithIntelligence).toEqual([]);
  });

  it('REFUSES every scoped role the read, exactly as the unmapped prefix did', () => {
    for (const role of MGMT_ROLES) {
      if (role === 'owner' || role === 'admin') continue;
      const { req, res, next } = ctx(minted(role), READ);
      mgmtSectionGate(req, res, next);
      expect({ role, status: res.statusCode }).toEqual({ role, status: 403 });
      jest.clearAllMocks();
    }
  });

  it('still ADMITS owner and the near-full admin, who reach it today', () => {
    for (const role of ['owner', 'admin']) {
      const { req, res, next } = ctx(minted(role), READ);
      mgmtSectionGate(req, res, next);
      expect({ role, admitted: next.mock.calls.length === 1 })
        .toEqual({ role, admitted: true });
      jest.clearAllMocks();
    }
  });

  it('still ADMITS a legacy admin, who skips this gate entirely', () => {
    const { req, res, next } = ctx({ sub: 'a', email: 'ali@colaberry.com', role: 'admin' }, READ);
    mgmtSectionGate(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('refuses with the CODE a client can branch on, not just the sentence', () => {
    const { req, res, next } = ctx(minted('mentor'), READ);
    mgmtSectionGate(req, res, next);
    expect(res.body.code).toBe(SECTION_DENIED_CODE);
  });
});

describe('PROPERTY 2 — a granted reader reads, and cannot act', () => {
  // This is the shape Quincy's grant takes: the section arrives as a per-person extra on top of
  // whatever role he holds, which is the narrowest way to hand it over.
  const GRANTED = minted('curriculum', ['intelligence']);

  it('the gate ADMITS the granted reader to the read', () => {
    const { req, res, next } = ctx(GRANTED, READ);
    mgmtSectionGate(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
  });

  it('the gate also admits them to the emergency stop, BECAUSE IT IS PATH-BASED', () => {
    // Not a defect — a demonstration of why the second guard exists. This gate cannot tell the
    // two apart, so if it were the only thing standing there, the grant would include the stop.
    const { req, res, next } = ctx(GRANTED, STOP, 'POST');
    mgmtSectionGate(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('and requireFullAdmin REFUSES them, which is what makes the grant safe', () => {
    const { req, res, next } = ctx(GRANTED, STOP, 'POST');
    requireFullAdmin(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('full_admin_required');
    expect(next).not.toHaveBeenCalled();
  });

  it('BOTH GATES TOGETHER: read passes, act is refused', () => {
    // The end-to-end property, asserted as one statement so it cannot be half-true.
    const read = ctx(GRANTED, READ);
    mgmtSectionGate(read.req, read.res, read.next);
    const readPassed = read.next.mock.calls.length === 1;

    jest.clearAllMocks();
    const act = ctx(GRANTED, STOP, 'POST');
    mgmtSectionGate(act.req, act.res, act.next);
    const actPassedGate = act.next.mock.calls.length === 1;
    jest.clearAllMocks();
    const act2 = ctx(GRANTED, STOP, 'POST');
    requireFullAdmin(act2.req, act2.res, act2.next);
    const actPassedGuard = act2.next.mock.calls.length === 1;

    expect({ readPassed, actPassedGate, actPassedGuard })
      .toEqual({ readPassed: true, actPassedGate: true, actPassedGuard: false });
  });

  it('a granted reader cannot act even holding EVERY section as an extra', () => {
    // Sections grant reading. There is no quantity of them that adds up to acting.
    const everything = minted('curriculum', [...MGMT_ROLE_DEFS.owner.sections]);
    const { req, res, next } = ctx(everything, STOP, 'POST');
    requireFullAdmin(req, res, next);
    expect(res.statusCode).toBe(403);
  });
});
