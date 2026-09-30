import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import {
  normalizeSignupInput, guestEnrollmentDefaults, createFreeAccount,
} from '../freeSignupService';
import { Enrollment } from '../../models';

jest.mock('../../config/env', () => ({ env: { jwtSecret: 'test-secret' } }));
jest.mock('../emailService', () => ({ sendPortalMagicLink: jest.fn() }));
jest.mock('../../models', () => ({ Enrollment: { findOne: jest.fn(), create: jest.fn() } }));

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
      (Enrollment.findOne as jest.Mock).mockResolvedValue(null);
      (Enrollment.create as jest.Mock).mockImplementation(async (attrs: any) => ({ id: 'enr-1', ...attrs }));

      const res = await createFreeAccount({ full_name: 'Maya', email: 'Maya@Example.com' });

      expect(Enrollment.create).toHaveBeenCalledTimes(1);
      expect(res.created).toBe(true);
      expect(res.enrollment).toEqual({ id: 'enr-1', full_name: 'Maya', email: 'maya@example.com', tier: 'guest' });
      const decoded: any = jwt.verify(res.jwt, env.jwtSecret);
      expect(decoded.sub).toBe('enr-1');
      expect(decoded.role).toBe('participant');
    });

    it('is idempotent by email: reuses an existing enrollment, never creates or downgrades it', async () => {
      (Enrollment.findOne as jest.Mock).mockResolvedValue({
        id: 'enr-existing', full_name: 'Existing', email: 'dup@example.com', tier: 'member',
      });

      const res = await createFreeAccount({ full_name: 'Ignored', email: 'dup@example.com' });

      expect(Enrollment.create).not.toHaveBeenCalled();
      expect(res.created).toBe(false);
      expect(res.enrollment.id).toBe('enr-existing');
      expect(res.enrollment.tier).toBe('member'); // an existing member is NOT downgraded to guest
    });

    it('rejects missing email or name', async () => {
      await expect(createFreeAccount({ full_name: '', email: '' })).rejects.toThrow();
      await expect(createFreeAccount({ full_name: 'Maya', email: '' })).rejects.toThrow();
    });
  });
});
