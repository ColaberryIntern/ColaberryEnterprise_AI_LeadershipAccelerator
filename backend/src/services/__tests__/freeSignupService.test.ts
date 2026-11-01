import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import {
  normalizeSignupInput, guestEnrollmentDefaults, createFreeAccount,
} from '../freeSignupService';
import { Enrollment } from '../../models';

jest.mock('../../config/env', () => ({ env: { jwtSecret: 'test-secret' } }));
jest.mock('../emailService', () => ({ sendPortalMagicLink: jest.fn() }));
// `findAll` because the account decision now lives in `freeAccountRegistration`,
// which queries ACTIVE rows only — the fix for a returning person whose single
// row was `status: 'withdrawn'` being logged into that dead row forever.
jest.mock('../../models', () => ({ Enrollment: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn() } }));

describe('freeSignupService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('normalizeSignupInput (pure)', () => {
    it('lowercases + trims email and trims name', () => {
      expect(normalizeSignupInput({ full_name: '  Maya Chen ', email: '  Maya@Example.COM ' }))
        .toEqual({ full_name: 'Maya Chen', email: 'maya@example.com' });
    });
  });

  describe('guestEnrollmentDefaults (pure)', () => {
    it('is a free guest with immediate portal access, no cohort, 0 maturity', () => {
      const d = guestEnrollmentDefaults({ full_name: 'Maya', email: 'maya@example.com' });
      expect(d.tier).toBe('guest');
      expect(d.portal_enabled).toBe(true);
      expect(d.cohort_id).toBeNull();
      expect(d.company).toBe('');
      expect(d.maturity_level).toBe(0);
      expect(d.status).toBe('active');
    });
  });

  describe('createFreeAccount', () => {
    it('creates a new guest when no enrollment exists + issues a verifiable participant JWT', async () => {
      (Enrollment.findAll as jest.Mock).mockResolvedValue([]);
      (Enrollment.create as jest.Mock).mockImplementation(async (attrs: any) => ({ id: 'enr-1', ...attrs }));

      const res = await createFreeAccount({ full_name: 'Maya', email: 'Maya@Example.com', programme: 'standard' });

      expect(Enrollment.create).toHaveBeenCalledTimes(1);
      expect(res.created).toBe(true);
      expect(res.enrollment).toEqual({ id: 'enr-1', full_name: 'Maya', email: 'maya@example.com', tier: 'guest' });
      // C103: `jwt` is null for an existing account, so a created one must carry it.
      expect(res.jwt).not.toBeNull();
      const decoded: any = jwt.verify(res.jwt as string, env.jwtSecret);
      expect(decoded.sub).toBe('enr-1');
      expect(decoded.role).toBe('participant');
    });

    it('is idempotent by email: reuses an existing enrollment, never creates or downgrades it', async () => {
      const existing = {
        id: 'enr-existing', full_name: 'Existing', email: 'dup@example.com', tier: 'member',
        payment_status: 'pending', enrollment_type: 'standard', update: jest.fn(),
      };
      (Enrollment.findAll as jest.Mock).mockResolvedValue([existing]);

      const res = await createFreeAccount({ full_name: 'Ignored', email: 'dup@example.com', programme: 'learner' });

      expect(Enrollment.create).not.toHaveBeenCalled();
      expect(res.created).toBe(false);
      expect(res.enrollment.id).toBe('enr-existing');
      expect(res.enrollment.tier).toBe('member'); // an existing member is NOT downgraded to guest
      // And not upgraded either: an unpaid `tier: 'member'` row is an enrolled
      // member awaiting payment, not a free account, so asking for the learner
      // programme must not move them onto it and gate them to Week 0.
      expect(existing.update).not.toHaveBeenCalled();
      expect(res.disposition).toBe('reused');
      // C103: typing someone's email must not sign you in as them.
      expect(res.jwt).toBeNull();
    });

    it('C103: an account that only gained the learner programme gets no session either', async () => {
      const existing = {
        id: 'enr-org', full_name: 'Owner', email: 'owner@example.com', tier: 'guest',
        payment_status: null, enrollment_type: 'standard', update: jest.fn(),
      };
      (Enrollment.findAll as jest.Mock).mockResolvedValue([existing]);

      const res = await createFreeAccount({ full_name: 'Anyone', email: 'owner@example.com', programme: 'learner' });

      expect(res.created).toBe(false);
      expect(res.jwt).toBeNull();
    });

    it('rejects missing email or name', async () => {
      (Enrollment.findAll as jest.Mock).mockResolvedValue([]);
      await expect(createFreeAccount({ full_name: '', email: '', programme: 'standard' })).rejects.toThrow();
      await expect(createFreeAccount({ full_name: 'Maya', email: '', programme: 'standard' })).rejects.toThrow();
    });
  });
});
