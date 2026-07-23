import {
  normalizeEmails, displayNameFromEmail, registerManager, inviteMembers, getRoster,
} from '../orgService';
import { Organization, OrgMember, Enrollment } from '../../models';
import { createFreeAccount } from '../freeSignupService';
import { sendOrgInviteEmail } from '../emailService';
import { sequelize } from '../../config/database';

// Hermetic: no DB, no real email, no real Sequelize instance.
jest.mock('../../config/env', () => ({ env: { jwtSecret: 'test-secret', frontendUrl: 'http://localhost:3000' } }));
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../emailService', () => ({ sendOrgInviteEmail: jest.fn() }));
jest.mock('../freeSignupService', () => ({ createFreeAccount: jest.fn() }));
jest.mock('../../models', () => ({
  Organization: { findOrCreate: jest.fn(), findByPk: jest.fn(), findOne: jest.fn() },
  OrgMember: { findOrCreate: jest.fn(), findAll: jest.fn(), findOne: jest.fn() },
  Enrollment: { findByPk: jest.fn() },
}));

describe('orgService', () => {
  // In-memory stand-ins so findOrCreate enforces the same (key) idempotency the
  // DB unique indexes give us in prod.
  let orgs: Map<string, any>;
  let members: Map<string, any>;

  beforeEach(() => {
    jest.clearAllMocks();
    orgs = new Map();
    members = new Map();

    (createFreeAccount as jest.Mock).mockImplementation(async ({ full_name, email }: any) => ({
      jwt: 'jwt-' + email,
      created: true,
      enrollment: { id: 'enr-' + email, full_name, email: String(email).toLowerCase(), tier: 'guest' },
    }));

    (Organization.findOrCreate as jest.Mock).mockImplementation(async ({ where, defaults }: any) => {
      const key = where.owner_enrollment_id;
      if (orgs.has(key)) return [orgs.get(key), false];
      const row = { id: 'org-' + (orgs.size + 1), ...defaults };
      orgs.set(key, row);
      return [row, true];
    });
    (Organization.findByPk as jest.Mock).mockResolvedValue({ id: 'org-1', name: 'Acme' });

    (OrgMember.findOrCreate as jest.Mock).mockImplementation(async ({ where, defaults }: any) => {
      const key = where.org_id + '|' + where.email;
      if (members.has(key)) return [members.get(key), false];
      const row = { id: 'm-' + (members.size + 1), ...defaults, update: jest.fn() };
      members.set(key, row);
      return [row, true];
    });

    (Enrollment.findByPk as jest.Mock).mockImplementation(async (id: string) => ({
      id, full_name: 'Teammate', update: jest.fn(),
    }));
  });

  describe('normalizeEmails (pure)', () => {
    it('lowercases, trims, de-dupes, drops invalid', () => {
      expect(normalizeEmails(['A@x.com', ' a@x.com ', 'B@x.com', 'nope', '']))
        .toEqual(['a@x.com', 'b@x.com']);
    });
    it('returns [] for non-arrays', () => {
      expect(normalizeEmails(undefined)).toEqual([]);
      expect(normalizeEmails('a@x.com')).toEqual([]);
    });
  });

  describe('displayNameFromEmail (pure)', () => {
    it('title-cases the local-part', () => {
      expect(displayNameFromEmail('jane.doe@acme.com')).toBe('Jane Doe');
      expect(displayNameFromEmail('bob@acme.com')).toBe('Bob');
    });
  });

  describe('registerManager idempotency', () => {
    it('re-registering the same email yields ONE org + ONE manager member', async () => {
      const r1 = await registerManager({ name: 'Ali', company: 'Acme', email: 'Ali@Acme.com' });
      const r2 = await registerManager({ name: 'Ali', company: 'Acme', email: 'ali@acme.com' });

      expect(r1.organization.id).toBe(r2.organization.id);
      expect(orgs.size).toBe(1);          // one org for the owner enrollment
      expect(members.size).toBe(1);       // one manager roster row
      // The manager row is active with role manager.
      const managerRow = Array.from(members.values())[0];
      expect(managerRow.role).toBe('manager');
      expect(managerRow.invite_status).toBe('active');
      // A fresh JWT is always returned (login on every register).
      expect(r2.jwt).toBe('jwt-ali@acme.com');
    });

    it('rejects missing name or email', async () => {
      await expect(registerManager({ name: '', email: 'a@x.com' })).rejects.toThrow();
      await expect(registerManager({ name: 'Ali', email: '' })).rejects.toThrow();
    });
  });

  describe('inviteMembers idempotency', () => {
    it('inviting the same email twice yields ONE member and ONE invite email', async () => {
      await inviteMembers('org-1', 'enr-mgr', { emails: ['bob@x.com'], team: 'Data' });
      // Second call includes a case-variant dup of the same address.
      const out = await inviteMembers('org-1', 'enr-mgr', { emails: ['bob@x.com', 'BOB@x.com'], team: 'Data' });

      expect(members.size).toBe(1);                       // one roster row for bob
      expect(out).toHaveLength(1);
      expect(out[0].role).toBe('member');
      expect(out[0].team).toBe('Data');
      // Invite email fires only on first creation — no re-send storm on re-invite.
      expect(sendOrgInviteEmail as jest.Mock).toHaveBeenCalledTimes(1);
    });

    it('de-dupes a batch and never sends real email inline', async () => {
      const out = await inviteMembers('org-1', 'enr-mgr', { emails: ['x@a.com', 'X@a.com', 'y@a.com'], team: null });
      expect(out).toHaveLength(2);                        // x@a.com + y@a.com
      expect(sendOrgInviteEmail as jest.Mock).toHaveBeenCalledTimes(2);
    });
  });

  describe('getRoster', () => {
    it('attaches each member\'s canonical total points alongside readiness and builder XP', async () => {
      (OrgMember.findAll as jest.Mock).mockResolvedValue([
        { enrollment_id: 'enr-1', email: 'jordan@acme.com', team: 'Finance', enrollment: { full_name: 'Jordan Park' } },
      ]);
      (sequelize.query as jest.Mock).mockImplementation(async (sql: string) => {
        if (sql.includes('student_level')) return [{ enrollment_id: 'enr-1', level_slug: 'developer', rank: 3, architect_readiness: 44 }];
        if (sql.includes("stream='builder'")) return [{ enrollment_id: 'enr-1', xp: 160 }];
        if (sql.includes("event_type='daily_streak'")) return [{ enrollment_id: 'enr-1', streak: 6 }];
        if (sql.includes('student_points_events')) return [{ enrollment_id: 'enr-1', total: 530 }];
        return [];
      });

      const roster = await getRoster('org-1');

      expect(roster).toEqual([{
        enrollment_id: 'enr-1',
        name: 'Jordan Park',
        team: 'Finance',
        level: 'developer',
        rank: 3,
        readiness: 44,
        builder_xp_week: 160,
        streak: 6,
        total_points: 530,
      }]);
    });

    it('defaults total_points to 0 for members with no enrollment yet', async () => {
      (OrgMember.findAll as jest.Mock).mockResolvedValue([
        { enrollment_id: null, email: 'pending@acme.com', team: null, enrollment: null },
      ]);

      const roster = await getRoster('org-1');

      expect(roster).toEqual([{
        enrollment_id: '',
        name: 'pending@acme.com',
        team: null,
        level: 'builder',
        rank: 0,
        readiness: 0,
        builder_xp_week: 0,
        streak: 0,
        total_points: 0,
      }]);
    });
  });
});
